import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

/**
 * Balancer V2 — Ethereum mainnet DEX skill.
 *
 * Balancer V2 routes every pool through a single Vault contract. A swap is
 * identified by the pool's bytes32 poolId plus the in/out token addresses.
 *
 * Query: get_pool_tokens (on-chain reserves), get_swap_quote (simulated output
 *        via the BalancerQueries helper — no state change).
 * Build: build_swap_tx (approve assetIn to the Vault + Vault.swap, with a
 *        slippage-protected minimum-out derived from a live quote).
 *
 * Skill UUID: c8b3e6a1-4d7f-4a2e-9c50-6f1b8d3a92e7
 */

const VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8' as `0x${string}`;
const QUERIES = '0xE39B5e3B6D74016b2F6A9673D7d7493B6DF549d5' as `0x${string}`;

// SwapKind.GIVEN_IN — caller supplies an exact input amount.
const GIVEN_IN = 0;

const VAULT_ABI = parseAbi([
  'function getPoolTokens(bytes32 poolId) view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)',
  'function swap((bytes32 poolId, uint8 kind, address assetIn, address assetOut, uint256 amount, bytes userData) singleSwap, (address sender, bool fromInternalBalance, address recipient, bool toInternalBalance) funds, uint256 limit, uint256 deadline) payable returns (uint256 amountCalculated)',
]);
const QUERIES_ABI = parseAbi([
  'function querySwap((bytes32 poolId, uint8 kind, address assetIn, address assetOut, uint256 amount, bytes userData) singleSwap, (address sender, bool fromInternalBalance, address recipient, bool toInternalBalance) funds) returns (uint256)',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);

export const BALANCER_V2_MAINNET_SKILL_METADATA = {
  name: 'Balancer V2 Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Balancer V2 on Ethereum mainnet — direct on-chain DEX skill. ' +
    'All pools share one Vault, so a swap is identified by the pool\'s bytes32 poolId plus the in/out token addresses. ' +
    'Read pool reserves, get a live simulated swap quote via the BalancerQueries helper, and build a slippage-protected ' +
    'approve+swap transaction against the Vault. Returns properly encoded unsigned EVM transactions. No API key required. ' +
    'Pool ids can be sourced from the Balancer app / subgraph.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['balancer', 'balancer-v2', 'dex', 'swap', 'amm', 'weighted-pool', 'defi', 'ethereum', 'mainnet', 'clarity-act'],
  external_url: 'https://app.balancer.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/balancer?w=48&h=48',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_pool_tokens', 'get_swap_quote', 'build_swap_tx'],
        description:
          'get_pool_tokens: on-chain token addresses + balances for a pool (requires pool_id). ' +
          'get_swap_quote: simulated output amount for an exact-input swap, no state change (requires pool_id, token_in, token_out, amount_in). ' +
          'build_swap_tx: approve token_in to the Vault + Vault.swap, with min-out derived from a live quote minus slippage (requires pool_id, token_in, token_out, amount_in, sender; optional recipient, slippage_bps, deadline_seconds).',
      },
      pool_id:    { type: 'string', description: 'Balancer pool id (bytes32, 0x + 64 hex).' },
      token_in:   { type: 'string', description: 'Input token address (0x...).' },
      token_out:  { type: 'string', description: 'Output token address (0x...).' },
      amount_in:  { type: 'string', description: 'Exact input amount in the token\'s smallest unit (wei).' },
      sender:     { type: 'string', description: 'Transaction sender address (0x...). Funds source.' },
      recipient:  { type: 'string', description: 'Address to receive output. Defaults to sender.' },
      slippage_bps:     { type: 'number', description: 'Max slippage in basis points for the min-out floor. Default 50 (0.5%).' },
      deadline_seconds: { type: 'number', description: 'Seconds from now until the swap deadline. Default 1200 (20 min).' },
    },
  },
  usage_examples: [
    { title: 'Quote a swap', input: { action: 'get_swap_quote', pool_id: '0x...', token_in: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token_out: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount_in: '1000000000000000000' } },
  ],
};

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}
function isPoolId(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{64}$/.test(v);
}

/** Run BalancerQueries.querySwap to simulate an exact-input single swap. */
async function quoteExactIn(c: ReturnType<typeof getClient>, poolId: `0x${string}`, tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint, sender: `0x${string}`): Promise<bigint> {
  return await c.readContract({
    address: QUERIES,
    abi: QUERIES_ABI,
    functionName: 'querySwap',
    args: [
      { poolId, kind: GIVEN_IN, assetIn: tokenIn, assetOut: tokenOut, amount: amountIn, userData: '0x' },
      { sender, fromInternalBalance: false, recipient: sender, toInternalBalance: false },
    ],
  }) as bigint;
}

export async function executeBalancerV2MainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_pool_tokens': {
        const poolId = input.pool_id;
        if (!isPoolId(poolId)) return { success: false, error: 'pool_id is required (bytes32, 0x + 64 hex)' };
        const c = getClient();
        const [tokens, balances, lastChangeBlock] = await c.readContract({ address: VAULT, abi: VAULT_ABI, functionName: 'getPoolTokens', args: [poolId] });
        return {
          success: true,
          output: {
            pool_id: poolId,
            tokens,
            balances: (balances as readonly bigint[]).map(String),
            last_change_block: (lastChangeBlock as bigint).toString(),
          },
        };
      }

      case 'get_swap_quote': {
        const poolId = input.pool_id; const tokenIn = input.token_in; const tokenOut = input.token_out;
        const amountIn = BigInt(input.amount_in ?? '0');
        const sender = isAddress(input.sender) ? input.sender : VAULT; // sender only matters for internal-balance; VAULT is a safe default for a pure query
        if (!isPoolId(poolId) || !isAddress(tokenIn) || !isAddress(tokenOut) || amountIn === 0n) {
          return { success: false, error: 'pool_id, token_in, token_out, and amount_in are required' };
        }
        const c = getClient();
        const out = await quoteExactIn(c, poolId, tokenIn, tokenOut, amountIn, sender);
        return {
          success: true,
          output: {
            pool_id: poolId, token_in: tokenIn, token_out: tokenOut,
            amount_in: amountIn.toString(),
            amount_out: out.toString(),
            price: amountIn > 0n ? Number(out) / Number(amountIn) : null,
          },
        };
      }

      case 'build_swap_tx': {
        const poolId = input.pool_id; const tokenIn = input.token_in; const tokenOut = input.token_out;
        const amountIn = BigInt(input.amount_in ?? '0');
        const sender = input.sender;
        if (!isPoolId(poolId) || !isAddress(tokenIn) || !isAddress(tokenOut) || amountIn === 0n || !isAddress(sender)) {
          return { success: false, error: 'pool_id, token_in, token_out, amount_in, and sender are required' };
        }
        const recipient = isAddress(input.recipient) ? input.recipient : sender;
        const slippageBps = BigInt(Math.max(0, Math.floor(input.slippage_bps ?? 50)));
        const deadlineSeconds = Math.max(1, Math.floor(input.deadline_seconds ?? 1200));
        const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

        const c = getClient();
        const quoted = await quoteExactIn(c, poolId, tokenIn, tokenOut, amountIn, sender);
        const minOut = quoted - (quoted * slippageBps) / 10_000n; // limit floor for GIVEN_IN

        const singleSwap = { poolId, kind: GIVEN_IN, assetIn: tokenIn, assetOut: tokenOut, amount: amountIn, userData: '0x' as `0x${string}` };
        const funds = { sender, fromInternalBalance: false, recipient, toInternalBalance: false };

        return {
          success: true,
          output: {
            transactions: [
              { to: tokenIn, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [VAULT, amountIn] }), value: '0x0', chain_id: 1, description: `Approve ${amountIn} of ${tokenIn} to Balancer Vault` },
              { to: VAULT, data: encodeFunctionData({ abi: VAULT_ABI, functionName: 'swap', args: [singleSwap, funds, minOut, deadline] }), value: '0x0', chain_id: 1, description: `Balancer swap ${amountIn} ${tokenIn} → ${tokenOut} (min ${minOut})` },
            ],
            approvals: [{ token: tokenIn, spender: VAULT, amount: amountIn.toString() }],
            pool_id: poolId, token_in: tokenIn, token_out: tokenOut,
            amount_in: amountIn.toString(),
            quoted_out: quoted.toString(),
            min_out: minOut.toString(),
            slippage_bps: Number(slippageBps),
            recipient,
            deadline: deadline.toString(),
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_pool_tokens, get_swap_quote, build_swap_tx` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Balancer V2 Mainnet skill error' };
  }
}
