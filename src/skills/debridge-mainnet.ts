import { parseAbi, encodeFunctionData } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';

export const DEBRIDGE_MAINNET_SKILL_METADATA = {
  name: 'deBridge DLN',
  description:
    '[ARSENAL-HOSTED ✓] deBridge Decentralized Liquidity Network (DLN) — order-book cross-chain bridge with no slippage. ' +
    'Create cross-chain orders for ANY token pair including native-to-native (e.g. native ETH on Ethereum → native MNT on Mantle, so the destination wallet can pay gas). ' +
    'Get real-time fee quotes, check order fill status. ' +
    'Supports Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche, BSC, Linea, Mantle, Monad, HyperEVM, Solana. ' +
    'No API key required.',
  category: 'Bridge',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['debridge', 'dln', 'bridge', 'cross-chain', 'ethereum', 'arbitrum', 'solana', 'no-slippage'],
  external_url: 'https://app.debridge.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/debridge?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_supported_chains', 'get_quote', 'build_tx', 'create_order', 'get_order_status'],
        description:
          'get_supported_chains: list supported chains with their EVM chain IDs and native token addresses. ' +
          'get_quote: READ-ONLY fee/output estimation for a cross-chain route (no recipient/authority needed). Requires src_chain_id, src_token, src_amount, dst_chain_id, dst_token. ' +
          'build_tx: build a signable cross-chain bridge transaction (returns transactions[] + fee estimation + orderId). Requires src_chain_id, src_token, src_amount, dst_chain_id, dst_token, recipient, authority. ' +
          'create_order: alias of build_tx (kept for backward compatibility). ' +
          'get_order_status: check fill status of a deBridge order (requires order_id).',
      },
      src_chain_id:  { type: 'number', description: 'Source chain EVM ID (1=ETH, 42161=Arb, 10=Opt, 8453=Base, 137=Polygon, 43114=Avax, 56=BSC, 59144=Linea, 5000=Mantle, 143=Monad, 999=HyperEVM, 7565164=Solana).' },
      src_token:     { type: 'string', description: 'Input token address on source chain. Use 0x0000000000000000000000000000000000000000 for native (ETH/BNB/MATIC).' },
      src_amount:    { type: 'string', description: 'Input amount in token smallest unit (wei).' },
      dst_chain_id:  { type: 'number', description: 'Destination chain EVM ID (same set as src_chain_id).' },
      dst_token:     { type: 'string', description: 'Output token address on destination chain. Use 0x0000000000000000000000000000000000000000 for native.' },
      recipient:     { type: 'string', description: 'Recipient address on destination chain (0x... for EVM; base58 for Solana).' },
      authority:     { type: 'string', description: 'Order authority address on source chain (0x...). Controls refunds if unfilled.' },
      order_id:      { type: 'string', description: 'deBridge order ID (from create_order response) for status check.' },
    },
  },
  usage_examples: [
    { title: 'Get supported chains', input: { action: 'get_supported_chains' } },
    { title: 'Bridge USDC ETH → Arb', input: { action: 'create_order', src_chain_id: 1, src_token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', src_amount: '10000000', dst_chain_id: 42161, dst_token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', recipient: '0xYourAddress', authority: '0xYourAddress' } },
    { title: 'Check order status', input: { action: 'get_order_status', order_id: '0x...' } },
  ],
};

// `dln` = deBridge's INTERNAL chain id (its own namespace). For the legacy chains it
// equals the EVM chain id, but newer chains (Mantle, Monad, HyperEVM, …) get a synthetic
// 1000000xx id. The DLN API rejects the raw EVM id for those, so we always map before calling.
// Users pass the normal EVM chain id (1, 5000, …); the mapping is internal.
const SUPPORTED_CHAINS: Record<number, { name: string; native: string; dln: number }> = {
  1:       { name: 'Ethereum',  native: '0x0000000000000000000000000000000000000000', dln: 1 },
  42161:   { name: 'Arbitrum',  native: '0x0000000000000000000000000000000000000000', dln: 42161 },
  10:      { name: 'Optimism',  native: '0x0000000000000000000000000000000000000000', dln: 10 },
  8453:    { name: 'Base',      native: '0x0000000000000000000000000000000000000000', dln: 8453 },
  137:     { name: 'Polygon',   native: '0x0000000000000000000000000000000000000000', dln: 137 },
  43114:   { name: 'Avalanche', native: '0x0000000000000000000000000000000000000000', dln: 43114 },
  56:      { name: 'BSC',       native: '0x0000000000000000000000000000000000000000', dln: 56 },
  59144:   { name: 'Linea',     native: '0x0000000000000000000000000000000000000000', dln: 59144 },
  5000:    { name: 'Mantle',    native: '0x0000000000000000000000000000000000000000', dln: 100000023 },
  143:     { name: 'Monad',     native: '0x0000000000000000000000000000000000000000', dln: 100000030 },
  999:     { name: 'HyperEVM',  native: '0x0000000000000000000000000000000000000000', dln: 100000022 },
  7565164: { name: 'Solana',    native: '11111111111111111111111111111111', dln: 7565164 },
};

// Map a user-supplied EVM chain id to deBridge's internal DLN chain id.
function toDlnChainId(evmChainId: number): number | null {
  const c = SUPPORTED_CHAINS[evmChainId];
  return c ? c.dln : null;
}

// DLN source contract (same address on all EVM chains). For native-token orders no approval is
// needed; for ERC-20 orders we approve the API-returned tx.to (route-specific) when present.
const DLN_SOURCE = '0xeF4fB24aD0916217251F553c0596F8Edc630EB66' as `0x${string}`;
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

const DEBRIDGE_API = 'https://api.dln.trade/v1.0';

function isNativeToken(addr: string): boolean {
  return addr === '0x0000000000000000000000000000000000000000' || addr === '0x' || addr === '';
}

function isEvmAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

export async function executeDeBridgeMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_supported_chains': {
        return {
          success: true,
          output: {
            chains: Object.entries(SUPPORTED_CHAINS).map(([id, c]) => ({
              chain_id: Number(id),
              name: c.name,
              native_token: c.native,
            })),
            note: 'Use chain_id in src_chain_id and dst_chain_id. For native token bridging, use the native_token address. ERC-20 approvals are included in create_order response.',
          },
        };
      }

      case 'get_quote': {
        const { src_chain_id, src_token, src_amount, dst_chain_id, dst_token } = input;

        if (!src_chain_id) return { success: false, error: 'src_chain_id is required' };
        if (!src_token) return { success: false, error: 'src_token is required (use 0x000...000 for native)' };
        if (!src_amount) return { success: false, error: 'src_amount is required (in wei)' };
        if (!dst_chain_id) return { success: false, error: 'dst_chain_id is required' };
        if (!dst_token) return { success: false, error: 'dst_token is required (use 0x000...000 for native)' };

        const srcDln = toDlnChainId(Number(src_chain_id));
        const dstDln = toDlnChainId(Number(dst_chain_id));
        if (srcDln === null) return { success: false, error: `Unsupported src_chain_id ${src_chain_id}. See get_supported_chains.` };
        if (dstDln === null) return { success: false, error: `Unsupported dst_chain_id ${dst_chain_id}. See get_supported_chains.` };

        const params = new URLSearchParams({
          srcChainId: String(srcDln),
          srcChainTokenIn: src_token,
          srcChainTokenInAmount: String(src_amount),
          dstChainId: String(dstDln),
          dstChainTokenOut: dst_token,
          prependOperatingExpenses: 'true',
        });

        const r = await fetch(`${DEBRIDGE_API}/dln/order/quote?${params}`, { headers: { 'Accept': 'application/json' } });
        const data = await r.json();
        if (!r.ok || data.errorId) {
          return { success: false, error: `deBridge API error ${r.status}: ${data.errorMessage ?? data.errorId ?? JSON.stringify(data)}` };
        }

        const est = data.estimation ?? {};
        const tokenIn = est.srcChainTokenIn ?? {};
        const tokenOut = est.dstChainTokenOut ?? {};
        return {
          success: true,
          output: {
            src_chain_id, dst_chain_id,
            amount_in: tokenIn.amount ?? src_amount,
            amount_in_includes_operating_expense: tokenIn.mutatedWithOperatingExpense ?? false,
            token_in: { symbol: tokenIn.symbol, address: tokenIn.address, decimals: tokenIn.decimals, usd_value: tokenIn.approximateUsdValue },
            estimated_amount_out: tokenOut.recommendedAmount ?? tokenOut.amount,
            max_theoretical_amount_out: tokenOut.maxTheoreticalAmount,
            token_out: { symbol: tokenOut.symbol, address: tokenOut.address, decimals: tokenOut.decimals, usd_value: tokenOut.recommendedApproximateUsdValue ?? tokenOut.approximateUsdValue },
            fix_fee_wei: data.fixFee,
            protocol_fee: data.protocolFee,
            recommended_slippage_percent: est.recommendedSlippage,
            estimated_fulfillment_delay_sec: data.order?.approximateFulfillmentDelay,
            usd_price_impact: data.usdPriceImpact,
            note: 'READ-ONLY estimate. fix_fee_wei is the deBridge protocol fee in native gas token, added on top of the input amount in the build_tx value. Call build_tx with recipient + authority to get the signable tx.',
          },
        };
      }

      case 'build_tx':
      case 'create_order': {
        const { src_chain_id, src_token, src_amount, dst_chain_id, dst_token, recipient, authority } = input;

        if (!src_chain_id) return { success: false, error: 'src_chain_id is required' };
        if (!src_token) return { success: false, error: 'src_token is required (use 0x000...000 for native)' };
        if (!src_amount) return { success: false, error: 'src_amount is required (in wei)' };
        if (!dst_chain_id) return { success: false, error: 'dst_chain_id is required' };
        if (!dst_token) return { success: false, error: 'dst_token is required (use 0x000...000 for native)' };
        if (!recipient) return { success: false, error: 'recipient is required' };
        if (!authority) return { success: false, error: 'authority is required (your address, controls order refunds)' };

        const srcDln = toDlnChainId(Number(src_chain_id));
        const dstDln = toDlnChainId(Number(dst_chain_id));
        if (srcDln === null) return { success: false, error: `Unsupported src_chain_id ${src_chain_id}. See get_supported_chains.` };
        if (dstDln === null) return { success: false, error: `Unsupported dst_chain_id ${dst_chain_id}. See get_supported_chains.` };

        const params = new URLSearchParams({
          srcChainId: String(srcDln),
          srcChainTokenIn: src_token,
          srcChainTokenInAmount: String(src_amount),
          dstChainId: String(dstDln),
          dstChainTokenOut: dst_token,
          dstChainTokenOutRecipient: recipient,
          srcChainOrderAuthorityAddress: authority,
          dstChainOrderAuthorityAddress: recipient,
          prependOperatingExpenses: 'true',
        });

        const r = await fetch(`${DEBRIDGE_API}/dln/order/create-tx?${params}`, {
          headers: { 'Accept': 'application/json' },
        });
        const data = await r.json();

        if (!r.ok || data.error || data.errorId) {
          return { success: false, error: `deBridge API error ${r.status}: ${data.errorMessage ?? data.error ?? data.errorId ?? JSON.stringify(data)}` };
        }

        const { tx, estimation, orderId } = data;
        const transactions: any[] = [];

        // For ERC-20 source tokens, prepend approval to the route's allowance target (tx.to from API,
        // falls back to the canonical DLN source if absent).
        if (!isNativeToken(src_token) && isEvmAddress(src_token)) {
          const spender = (tx?.to && isEvmAddress(tx.to)) ? tx.to : DLN_SOURCE;
          transactions.push({
            to: src_token,
            data: encodeFunctionData({
              abi: ERC20_APPROVE_ABI,
              functionName: 'approve',
              args: [spender as `0x${string}`, BigInt(src_amount)],
            }),
            value: '0x0',
            chain_id: src_chain_id,
            description: `Approve ${src_amount} tokens to deBridge DLN`,
          });
        }

        // Main DLN transaction (tx.to and tx.data come from the API). For native input, tx.value
        // already bundles input amount + operating expense + fixFee.
        if (tx) {
          transactions.push({
            to: tx.to,
            data: tx.data,
            value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : '0x0',
            chain_id: src_chain_id,
            description: `Create deBridge DLN order: ${estimation?.srcChainTokenIn?.symbol ?? src_token} (chain ${src_chain_id}) → ${estimation?.dstChainTokenOut?.symbol ?? dst_token} (chain ${dst_chain_id})`,
          });
        }

        return {
          success: true,
          output: {
            transactions,
            order_id: orderId,
            estimated_amount_out: estimation?.dstChainTokenOut?.recommendedAmount ?? estimation?.dstChainTokenOut?.amount,
            fix_fee_wei: data.fixFee,
            estimation,
            note: 'After broadcast, poll get_order_status with order_id. Orders are typically filled in 1-30 seconds. For native-token source, the tx value already includes the deBridge fix fee on top of the bridged amount.',
          },
        };
      }

      case 'get_order_status': {
        const orderId = input.order_id;
        if (!orderId) return { success: false, error: 'order_id is required (from create_order response)' };

        const r = await fetch(`${DEBRIDGE_API}/dln/order/${orderId}/status`, {
          headers: { 'Accept': 'application/json' },
        });
        const data = await r.json();
        if (!r.ok) return { success: false, error: `deBridge API error ${r.status}: ${JSON.stringify(data)}` };
        return { success: true, output: data };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_supported_chains, get_quote, build_tx, create_order, get_order_status` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'deBridge skill error' };
  }
}
