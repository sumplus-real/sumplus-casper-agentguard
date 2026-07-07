import { createPublicClient, http, encodeFunctionData, encodePacked, parseAbi, type Hex } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const UNISWAP_V3_MAINNET_SKILL_METADATA = {
  name: 'Uniswap v3 Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Uniswap v3 on Ethereum mainnet — swap quotes and transaction building. ' +
    'Get exact-input and exact-output quotes via QuoterV2, build swap transactions via UniversalRouter, ' +
    'wrap/unwrap ETH⟷WETH. Returns unsigned EVM transactions ready for wallet signing. ' +
    'No API key required.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['uniswap', 'swap', 'dex', 'ethereum', 'mainnet', 'v3', 'quote', 'amm', 'clarity-act'],
  external_url: 'https://app.uniswap.org',
  logo_url: 'https://icons.llamao.fi/icons/protocols/uniswap?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['quote_exact_input', 'quote_exact_output', 'swap_exact_input', 'swap_exact_output', 'wrap_eth', 'unwrap_weth'],
        description:
          'quote_exact_input: get amountOut for exact amountIn. ' +
          'quote_exact_output: get amountIn for exact amountOut. ' +
          'swap_exact_input: build swap tx (exact tokenIn → min tokenOut). ' +
          'swap_exact_output: build swap tx (max tokenIn → exact tokenOut). ' +
          'wrap_eth: build ETH → WETH tx. ' +
          'unwrap_weth: build WETH → ETH tx.',
      },
      token_in:      { type: 'string', description: 'Input token address (0x...).' },
      token_out:     { type: 'string', description: 'Output token address (0x...).' },
      fee_tier:      { type: 'number', enum: [100, 500, 3000, 10000], description: 'Pool fee tier in bps (100=0.01%, 500=0.05%, 3000=0.3%, 10000=1%).' },
      amount_in:     { type: 'string', description: 'Exact input amount in wei (for exact_input actions).' },
      amount_out:    { type: 'string', description: 'Exact output amount in wei (for exact_output actions).' },
      min_amount_out: { type: 'string', description: 'Minimum output amount (slippage bound) for swap_exact_input.' },
      max_amount_in:  { type: 'string', description: 'Maximum input amount (slippage bound) for swap_exact_output.' },
      recipient:     { type: 'string', description: 'Swap recipient address (0x...). Required for swap actions.' },
      tx_deadline:   { type: 'number', description: 'Unix timestamp deadline. Required for swap actions.' },
      amount:        { type: 'string', description: 'ETH/WETH amount in wei for wrap/unwrap.' },
    },
  },
  usage_examples: [
    { title: 'Quote 1 ETH → USDC', input: { action: 'quote_exact_input', token_in: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token_out: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', fee_tier: 500, amount_in: '1000000000000000000' } },
    { title: 'Wrap 1 ETH', input: { action: 'wrap_eth', amount: '1000000000000000000' } },
  ],
};

const UNIVERSAL_ROUTER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af' as `0x${string}`;
const QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e' as `0x${string}`;
const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as `0x${string}`;

const QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
  'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);
const ROUTER_ABI = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);
const WETH_ABI = parseAbi(['function deposit() payable', 'function withdraw(uint256 wad)']);

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function normalize(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) out[k] = normalize(vv);
    return out;
  }
  return v;
}

export async function executeUniswapV3MainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'quote_exact_input':
      case 'quote_exact_output': {
        const tokenIn = input.token_in; const tokenOut = input.token_out; const fee = input.fee_tier;
        if (!isAddress(tokenIn) || !isAddress(tokenOut) || fee == null) return { success: false, error: 'token_in, token_out, and fee_tier are required' };
        const qty = BigInt(input.amount_in ?? input.amount_out ?? '0');
        if (qty === 0n) return { success: false, error: action === 'quote_exact_input' ? 'amount_in is required' : 'amount_out is required' };
        const c = getClient();
        if (action === 'quote_exact_input') {
          const result = await c.readContract({
            address: QUOTER_V2, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
            args: [{ tokenIn, tokenOut, amountIn: qty, fee, sqrtPriceLimitX96: 0n }],
          });
          return { success: true, output: normalize({ amount_out: result[0], gas_estimate: result[3] }) as Record<string, any> };
        } else {
          const result = await c.readContract({
            address: QUOTER_V2, abi: QUOTER_ABI, functionName: 'quoteExactOutputSingle',
            args: [{ tokenIn, tokenOut, amount: qty, fee, sqrtPriceLimitX96: 0n }],
          });
          return { success: true, output: normalize({ amount_in: result[0], gas_estimate: result[3] }) as Record<string, any> };
        }
      }

      case 'swap_exact_input':
      case 'swap_exact_output': {
        const tokenIn = input.token_in; const tokenOut = input.token_out; const recipient = input.recipient;
        const fee = input.fee_tier; const deadline = input.tx_deadline;
        if (!isAddress(tokenIn) || !isAddress(tokenOut) || !isAddress(recipient) || fee == null || deadline == null) {
          return { success: false, error: 'token_in, token_out, recipient, fee_tier, and tx_deadline are required' };
        }
        if (deadline < Math.floor(Date.now() / 1000) + 60) return { success: false, error: 'tx_deadline must be at least 60 seconds in the future' };
        const exactIn = action === 'swap_exact_input';
        const amountIn = BigInt(exactIn ? input.amount_in ?? '0' : input.max_amount_in ?? '0');
        const amountOut = BigInt(exactIn ? input.min_amount_out ?? '0' : input.amount_out ?? '0');
        if (amountIn === 0n || amountOut === 0n) return { success: false, error: exactIn ? 'amount_in and min_amount_out are required' : 'amount_out and max_amount_in are required' };

        const path = exactIn
          ? encodePacked(['address', 'uint24', 'address'], [tokenIn, fee, tokenOut])
          : encodePacked(['address', 'uint24', 'address'], [tokenOut, fee, tokenIn]);
        const commands = (exactIn ? '0x00' : '0x01') as Hex;
        const inputAbi = exactIn
          ? parseAbi(['function x(address recipient,uint256 amountIn,uint256 amountOutMin,bytes path,bool payerIsUser)'])
          : parseAbi(['function x(address recipient,uint256 amountOut,uint256 amountInMax,bytes path,bool payerIsUser)']);
        const encoded = encodeFunctionData({
          abi: inputAbi, functionName: 'x',
          args: exactIn ? [recipient, amountIn, amountOut, path, true] : [recipient, amountOut, amountIn, path, true],
        }).replace(/^0x[0-9a-fA-F]{8}/, '0x') as Hex;
        const data = encodeFunctionData({ abi: ROUTER_ABI, functionName: 'execute', args: [commands, [encoded], BigInt(deadline)] });

        return {
          success: true,
          output: {
            transactions: [{ to: UNIVERSAL_ROUTER, data, value: '0x0', chain_id: 1, description: `Uniswap v3 ${action}: ${tokenIn} → ${tokenOut}` }],
            approvals: [{ token: tokenIn, spender: UNIVERSAL_ROUTER, amount: amountIn.toString() }],
            token_in: tokenIn, token_out: tokenOut, fee_tier: fee, recipient,
            amount_in: amountIn.toString(), amount_out: amountOut.toString(),
            router: UNIVERSAL_ROUTER,
          },
        };
      }

      case 'wrap_eth': {
        const amount = BigInt(input.amount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount is required' };
        return {
          success: true,
          output: {
            transactions: [{ to: WETH9, data: encodeFunctionData({ abi: WETH_ABI, functionName: 'deposit' }), value: `0x${amount.toString(16)}`, chain_id: 1, description: `Wrap ${amount} ETH to WETH` }],
            amount: amount.toString(), weth: WETH9,
          },
        };
      }

      case 'unwrap_weth': {
        const amount = BigInt(input.amount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount is required' };
        return {
          success: true,
          output: {
            transactions: [{ to: WETH9, data: encodeFunctionData({ abi: WETH_ABI, functionName: 'withdraw', args: [amount] }), value: '0x0', chain_id: 1, description: `Unwrap ${amount} WETH to ETH` }],
            amount: amount.toString(), weth: WETH9,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: quote_exact_input, quote_exact_output, swap_exact_input, swap_exact_output, wrap_eth, unwrap_weth` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Uniswap v3 Mainnet skill error' };
  }
}
