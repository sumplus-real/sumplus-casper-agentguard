/**
 * Turbos Finance — CLMM DEX on Sui
 *
 * Turbos is a concentrated liquidity DEX on Sui backed by Jump Trading.
 * Features capital-efficient CLMM pools across multiple fee tiers.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: turbos.finance
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';

// Common Sui coin types
const COIN_TYPES: Record<string, { type: string; decimals: number }> = {
  SUI:   { type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI', decimals: 9 },
  USDC:  { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6 },
  USDT:  { type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', decimals: 6 },
  WETH:  { type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN', decimals: 8 },
  WBTC:  { type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN', decimals: 8 },
  TURBOS:{ type: '0x5d1f47ea69bb0de31c313d7acf89b890dbb8991ea8e03c6c355171f84bb1ba4a::turbos::TURBOS', decimals: 9 },
  DEEP:  { type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP', decimals: 6 },
};

function resolveCoin(symbol: string): { type: string; decimals: number } {
  const entry = COIN_TYPES[symbol.toUpperCase()];
  if (!entry) throw new Error(`Unknown token "${symbol}". Supported: ${Object.keys(COIN_TYPES).join(', ')}`);
  return entry;
}

async function getTurbosSdk() {
  const { TurbosSdk, Network } = await import('turbos-clmm-sdk');
  const sdk = new TurbosSdk(Network.mainnet);
  return sdk;
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:     'Turbos Finance',
      chain:    'sui',
      type:     'Concentrated Liquidity DEX (CLMM)',
      website:  'https://turbos.finance',
      backed_by: 'Jump Trading',
      highlights: [
        'CLMM pools with multiple fee tiers (0.01%, 0.1%, 0.3%, 0.5%, 1%, 2%)',
        'Capital-efficient concentrated liquidity positions',
        'TURBOS token for governance and incentives',
        'On-chain price feeds and tick-based AMM',
      ],
      fee_tiers: ['0.01%', '0.1%', '0.3%', '0.5%', '1%', '2%'],
      supported_tokens: Object.keys(COIN_TYPES),
    },
  };
}

// Well-known Turbos CLMM pools (mainnet). Use turbos.finance to find more pool IDs.
const KNOWN_TURBOS_POOLS = [
  { pool_id: '0x5eb2dfcdd1b15d2021328258f6d5ec081e9a0cdcfa9e13a0eaeb9b5f7505ca78', coin_type_a: '0x2::sui::SUI', coin_type_b: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', fee: '500', label: 'SUI/USDC 0.05%' },
  { pool_id: '0xe01243f37f712ef87e556afb9b1d03d0fae13f96d324ec8f6374c4c56b0b5a7b', coin_type_a: '0x2::sui::SUI', coin_type_b: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', fee: '2500', label: 'SUI/USDC 0.25%' },
  { pool_id: '0x0b6370f2f5e24f0d5c1b04c5433dd1c14f1c1ebcee1e5c12a87a6c4b4fe78ab2', coin_type_a: '0x2::sui::SUI', coin_type_b: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', fee: '2500', label: 'SUI/USDT 0.25%' },
  { pool_id: '0x4e2ca3988246e1d50b9bf209abb9c1cbfec65bd96ece0cc9d8bf76e3b0ac22c0', coin_type_a: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP', coin_type_b: '0x2::sui::SUI', fee: '10000', label: 'DEEP/SUI 1%' },
  { pool_id: '0x40d2bc4d88a26c97ef98ddb1e0ab9d7fa1f7090c76428f0455a3d0e01f4a36de', coin_type_a: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', coin_type_b: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', fee: '100', label: 'USDC/USDT 0.01%' },
  { pool_id: '0xd47778d8b74bdf55b0f08fa5ed9bfa83eb44de3e5f08b0fc29a0c08bbd0c2e0b', coin_type_a: '0x2::sui::SUI', coin_type_b: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN', fee: '2500', label: 'SUI/WETH 0.25%' },
  { pool_id: '0x5d56a4e32d2e5b6c5d49af79d7898bd5614caa3f68de8ac7b87a4afcee6f7e42', coin_type_a: '0x5d1f47ea69bb0de31c313d7acf89b890dbb8991ea8e03c6c355171f84bb1ba4a::turbos::TURBOS', coin_type_b: '0x2::sui::SUI', fee: '10000', label: 'TURBOS/SUI 1%' },
];

async function actionGetPools(_input: any): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      protocol: 'Turbos Finance',
      chain:    'sui',
      count:    KNOWN_TURBOS_POOLS.length,
      pools:    KNOWN_TURBOS_POOLS,
      _note:    'Static list of well-known Turbos CLMM pools. Browse all pools at turbos.finance. Use pool_id in get_quote and build_swap_tx.',
    },
  };
}

async function actionGetPool(input: any): Promise<SkillExecutionResult> {
  const { pool_id } = input;
  if (!pool_id) return { success: false, error: 'pool_id is required' };

  try {
    const sdk = await getTurbosSdk();
    const pool = await sdk.pool.getPool(pool_id);

    return {
      success: true,
      output: {
        protocol:    'Turbos Finance',
        pool_id,
        coin_type_a: (pool as any).coinTypeA ?? (pool as any).types?.[0],
        coin_type_b: (pool as any).coinTypeB ?? (pool as any).types?.[1],
        fee:         (pool as any).fee ?? (pool as any).fee_rate,
        liquidity:   (pool as any).liquidity,
        sqrt_price:  (pool as any).sqrt_price,
        tick_current:(pool as any).tick_current_index,
        raw:         pool,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_pool failed: ${err.message}` };
  }
}

async function actionGetQuote(input: any): Promise<SkillExecutionResult> {
  const { pool_id, token_in, token_out, amount_in } = input;
  if (!pool_id)   return { success: false, error: 'pool_id is required' };
  if (!token_in)  return { success: false, error: 'token_in is required (symbol or full type)' };
  if (!amount_in) return { success: false, error: 'amount_in is required (human-readable)' };

  let coinInType: string;
  let coinInDecimals: number;
  try {
    const resolved = resolveCoin(token_in);
    coinInType     = resolved.type;
    coinInDecimals = resolved.decimals;
  } catch {
    coinInType     = token_in;
    coinInDecimals = 9;
  }

  const parsedAmount = parseFloat(String(amount_in));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount_in must be a positive number' };
  }
  const amountStr = String(Math.round(parsedAmount * 10 ** coinInDecimals));

  try {
    const sdk = await getTurbosSdk();
    const pool = await sdk.pool.getPool(pool_id);
    const types = (pool as any).coinTypeA !== undefined
      ? [(pool as any).coinTypeA, (pool as any).coinTypeB]
      : (pool as any).types ?? [];

    const a2b = coinInType === types[0] ||
      coinInType.toLowerCase() === types[0]?.toLowerCase();

    const DUMMY_ADDR = '0x0000000000000000000000000000000000000000000000000000000000000001';
    const preSwap = await sdk.trade.computeSwapResultV2({
      pools: [{ pool: pool_id, a2b, amountSpecified: amountStr }],
      amountSpecifiedIsInput: true,
      tickStep: 100,
      address: DUMMY_ADDR,
    });

    const result = preSwap[0];
    const coinOutType = a2b ? types[1] : types[0];
    let coinOutDecimals = 9;
    try {
      const sym = Object.entries(COIN_TYPES).find(([, v]) => v.type === coinOutType);
      if (sym) coinOutDecimals = sym[1].decimals;
    } catch {}

    // amount_b is output when a2b=true, amount_a is output when a2b=false
    const amountOut = a2b ? result?.amount_b : result?.amount_a;

    return {
      success: true,
      output: {
        protocol:      'Turbos Finance',
        pool_id,
        token_in:      coinInType,
        token_out:     coinOutType,
        amount_in:     parsedAmount,
        amount_out:    amountOut ? (Number(amountOut) / 10 ** coinOutDecimals) : null,
        amount_out_raw:String(amountOut ?? ''),
        a2b,
        tick_current:  result?.tick_current_index,
        _note:         'Pass amount_out_raw and tick_current to build_swap_tx for accurate execution.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_quote failed: ${err.message}` };
  }
}

async function actionBuildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { pool_id, sender, token_in, token_out, amount_in, amount_out_raw, slippage = '0.5', a2b } = input;
  if (!pool_id)   return { success: false, error: 'pool_id is required' };
  if (!sender)    return { success: false, error: 'sender is required' };
  if (!token_in)  return { success: false, error: 'token_in is required' };
  if (!amount_in) return { success: false, error: 'amount_in is required' };

  let coinInType: string;
  let coinInDecimals: number;
  try {
    const resolved = resolveCoin(token_in);
    coinInType     = resolved.type;
    coinInDecimals = resolved.decimals;
  } catch {
    coinInType     = token_in;
    coinInDecimals = 9;
  }

  const parsedAmount = parseFloat(String(amount_in));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount_in must be a positive number' };
  }
  const amountStr = String(Math.round(parsedAmount * 10 ** coinInDecimals));

  try {
    const sdk = await getTurbosSdk();
    const pool = await sdk.pool.getPool(pool_id);
    const types = (pool as any).coinTypeA !== undefined
      ? [(pool as any).coinTypeA, (pool as any).coinTypeB]
      : (pool as any).types ?? [];

    const direction = a2b !== undefined
      ? Boolean(a2b)
      : coinInType === types[0] || coinInType.toLowerCase() === types[0]?.toLowerCase();

    const DUMMY_ADDR = '0x0000000000000000000000000000000000000000000000000000000000000001';

    let amountOut = amount_out_raw;
    let tickIndex: number | undefined;

    if (!amountOut) {
      const preSwap = await sdk.trade.computeSwapResultV2({
        pools: [{ pool: pool_id, a2b: direction, amountSpecified: amountStr }],
        amountSpecifiedIsInput: true,
        tickStep: 100,
        address: DUMMY_ADDR,
      });
      const result = preSwap[0];
      amountOut = String(direction ? (result?.amount_b ?? '0') : (result?.amount_a ?? '0'));
      if (result?.tick_current_index !== undefined) {
        tickIndex = (sdk as any).math?.bitsToNumber?.(result.tick_current_index.bits) ??
          Number(result.tick_current_index);
      }
    }

    const txb = await sdk.trade.swap({
      routes: [{
        pool: pool_id,
        a2b: direction,
        nextTickIndex: tickIndex ?? 0,
      }],
      coinTypeA: types[0],
      coinTypeB: types[1],
      address: sender,
      amountA: amountStr,
      amountB: String(amountOut),
      amountSpecifiedIsInput: true,
      slippage: String(slippage),
    });

    const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
    txb.setSender(sender);
    txb.setGasBudget(150_000_000);
    const txBytes = await txb.build({ client });

    return {
      success: true,
      output: {
        tx_bytes:    Buffer.from(txBytes).toString('base64'),
        sender,
        pool_id,
        token_in:    coinInType,
        token_out:   direction ? types[1] : types[0],
        amount_in:   parsedAmount,
        slippage_pct:slippage,
        gas_budget:  '150000000',
        description: `Swap ${parsedAmount} ${token_in.toUpperCase()} on Turbos Finance`,
        usage:       'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_swap_tx failed: ${err.message}` };
  }
}

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const TURBOS_SKILL_METADATA = {
  name: 'Turbos Finance',
  description:
    'Turbos Finance is a concentrated liquidity DEX on Sui backed by Jump Trading. ' +
    'Query CLMM pools, get swap quotes, and build real Sui PTBs for token swaps. ' +
    'Supports SUI, USDC, USDT, WETH, WBTC, TURBOS, DEEP and any Sui token pair. ' +
    'Returns base64 tx_bytes ready for signing.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  tags: ['turbos', 'sui', 'dex', 'clmm', 'swap', 'defi', 'jump-trading'],
  external_url: 'https://turbos.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/turbos?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_pools', 'get_pool', 'get_quote', 'build_swap_tx'],
        description:
          'get_protocol_info: Turbos overview, fee tiers, and supported tokens. ' +
          'get_pools: list CLMM pools (optional limit). ' +
          'get_pool: get details for a specific pool (requires pool_id). ' +
          'get_quote: compute swap output amount (requires pool_id, token_in, amount_in). ' +
          'build_swap_tx: build PTB for token swap (requires pool_id, sender, token_in, amount_in).',
      },
      pool_id:       { type: 'string', description: 'Turbos CLMM pool object ID (0x...).' },
      sender:        { type: 'string', description: 'Sui wallet address. Required for build_swap_tx.' },
      token_in:      { type: 'string', description: 'Input token symbol (SUI, USDC, etc.) or full coin type.' },
      token_out:     { type: 'string', description: 'Output token symbol or full coin type (informational).' },
      amount_in:     { type: 'string', description: 'Human-readable amount of token_in (e.g. "10").' },
      amount_out_raw:{ type: 'string', description: 'Raw output amount from get_quote (base units). Pass to build_swap_tx to skip re-querying.' },
      slippage:      { type: 'string', description: 'Slippage tolerance in percent (default "0.5" = 0.5%).' },
      a2b:           { type: 'boolean', description: 'Swap direction: true = coinTypeA→coinTypeB. Auto-detected if omitted.' },
      limit:         { type: 'number', description: 'Max pools to return in get_pools (default 20, max 50).' },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'List pools', input: { action: 'get_pools', limit: 10 } },
    { title: 'Get quote SUI→USDC', input: { action: 'get_quote', pool_id: '0xPOOL_ID', token_in: 'SUI', amount_in: '10' } },
    { title: 'Build swap tx', input: { action: 'build_swap_tx', pool_id: '0xPOOL_ID', sender: '0xYOUR_ADDRESS', token_in: 'SUI', amount_in: '10' } },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeTurbosSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return await actionGetProtocolInfo();
      case 'get_pools':         return await actionGetPools(input);
      case 'get_pool':          return await actionGetPool(input);
      case 'get_quote':         return await actionGetQuote(input);
      case 'build_swap_tx':     return await actionBuildSwapTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_pools, get_pool, get_quote, build_swap_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Turbos skill' };
  }
}
