/**
 * Aftermath Finance — Sui DEX Aggregator + Liquid Staking
 *
 * Aftermath is the "Jupiter of Sui" — a DEX aggregator, AMM, and liquid
 * staking platform. Routes swaps across all Sui DEXes for best price.
 *
 * Features:
 * - DEX aggregation (best swap routes across Sui)
 * - afSUI liquid staking
 * - Perpetuals (coming soon)
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: aftermath.finance
 */

import type { SkillExecutionResult } from '@/types/skill';
import { Aftermath } from 'aftermath-ts-sdk';

const AF_API = 'https://aftermath.finance/api';

async function apiFetch(path: string): Promise<any> {
  const res = await fetch(`${AF_API}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Aftermath API ${res.status} for ${path}`);
  return res.json();
}

// Well-known Sui token types for Aftermath
// USDC: Circle native USDC (same as used by Cetus)
const COIN_TYPES: Record<string, { type: string; decimals: number }> = {
  SUI:   { type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI', decimals: 9 },
  USDC:  { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6 },
  USDT:  { type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', decimals: 6 },
  WETH:  { type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN', decimals: 8 },
  WBTC:  { type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN', decimals: 8 },
  AFSUI: { type: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI', decimals: 9 },
  SCA:   { type: '0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA', decimals: 9 },
};

function resolveCoin(symbol: string): { type: string; decimals: number } {
  const upper = symbol.toUpperCase();
  const entry = COIN_TYPES[upper];
  if (entry) return entry;
  // If already a full coin type, assume 9 decimals as fallback
  return { type: symbol, decimals: 9 };
}

function resolveCoinType(symbol: string): string {
  return resolveCoin(symbol).type;
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actionGetQuote(input: any): Promise<SkillExecutionResult> {
  const { coinIn, coinOut, amountIn } = input;
  if (!coinIn || !coinOut) return { success: false, error: 'coinIn and coinOut are required' };
  if (!amountIn) return { success: false, error: 'amountIn is required' };

  const coinInInfo  = resolveCoin(coinIn);
  const coinOutInfo = resolveCoin(coinOut);

  const parsedAmount = parseFloat(String(amountIn));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amountIn must be a positive number' };
  }
  const amountBaseUnits = BigInt(Math.round(parsedAmount * 10 ** coinInInfo.decimals));

  try {
    const af = new Aftermath('MAINNET');
    await af.init();
    const router = af.Router();

    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: coinInInfo.type,
      coinOutType: coinOutInfo.type,
      coinInAmount: amountBaseUnits,
    });

    const amountOutHuman = Number(route.coinOut.amount) / 10 ** coinOutInfo.decimals;
    const spotPrice = amountOutHuman / parsedAmount;

    return {
      success: true,
      output: {
        protocol:     'Aftermath Finance',
        coinIn:       coinIn.toUpperCase(),
        coinOut:      coinOut.toUpperCase(),
        amountIn:     parsedAmount,
        amountOut:    amountOutHuman,
        spotPrice,
        price_impact: (route as any).priceImpact ?? null,
        routes:       (route as any).routes ?? null,
        chain:        'sui',
        _source:      'aftermath-ts-sdk (live)',
      },
    };
  } catch (err: any) {
    return { success: false, error: `Aftermath quote failed: ${err.message}` };
  }
}

async function actionBuildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { sender, token_in, token_out, amount_in, slippage = 0.01 } = input;
  if (!sender)    return { success: false, error: 'sender is required' };
  if (!token_in)  return { success: false, error: 'token_in is required' };
  if (!token_out) return { success: false, error: 'token_out is required' };
  if (!amount_in) return { success: false, error: 'amount_in is required' };

  const coinInInfo  = resolveCoin(token_in);
  const coinOutInfo = resolveCoin(token_out);

  const parsedAmount = parseFloat(String(amount_in));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount_in must be a positive number string, e.g. "1.5"' };
  }
  const amountBaseUnits = BigInt(Math.round(parsedAmount * 10 ** coinInInfo.decimals));

  try {
    const af = new Aftermath('MAINNET');
    await af.init();
    const router = af.Router();

    const route = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType: coinInInfo.type,
      coinOutType: coinOutInfo.type,
      coinInAmount: amountBaseUnits,
    });

    const tx = await router.getTransactionForCompleteTradeRoute({
      walletAddress: sender,
      completeRoute: route,
      slippage,
    });

    tx.setSender(sender);
    tx.setGasBudget(100_000_000);
    const { SuiClient, getFullnodeUrl } = await import('@mysten/sui/client');
    const suiClient = new SuiClient({ url: getFullnodeUrl('mainnet') });
    const txBytes = await tx.build({ client: suiClient });

    const amountOutHuman = Number(route.coinOut.amount) / 10 ** coinOutInfo.decimals;

    return {
      success: true,
      output: {
        tx_bytes: Buffer.from(txBytes).toString('base64'),
        sender,
        gas_budget: '100000000',
        description: `Swap ${parsedAmount} ${token_in.toUpperCase()} → ${token_out.toUpperCase()} via Aftermath`,
        amount_in: parsedAmount,
        amount_out_estimated: amountOutHuman,
        slippage,
        usage: 'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer to sign and submit.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `Aftermath build_swap_tx failed: ${err.message}` };
  }
}

async function actionGetPools(input: any): Promise<SkillExecutionResult> {
  const { limit = 10 } = input ?? {};
  const data = await apiFetch(`/pools?limit=${limit}`);
  const pools = Array.isArray(data) ? data : (data.data ?? data.pools ?? []);

  const formatted = pools.slice(0, limit).map((p: any) => ({
    name:       p.name ?? p.poolName,
    pool_id:    p.poolId ?? p.id,
    tvl_usd:    p.tvl ?? p.tvlUsd,
    volume_24h: p.volume24h ?? p.volume_24h,
    apy:        p.apy ?? p.apr,
    fee:        p.fee ?? p.swapFee,
    coins:      p.coins ?? p.tokens,
  }));

  return {
    success: true,
    output: {
      protocol:   'Aftermath Finance',
      chain:      'sui',
      pool_count: formatted.length,
      pools:      formatted,
    },
  };
}

async function actionGetAfsuiInfo(): Promise<SkillExecutionResult> {
  const data = await apiFetch('/staking/afsui').catch(async () => {
    return apiFetch('/liquid-staking/afsui');
  });
  const d = data.data ?? data;

  return {
    success: true,
    output: {
      protocol:      'Aftermath Finance',
      asset:         'afSUI',
      description:   'Liquid staking token. Stake SUI → receive afSUI, which auto-compounds Sui validator rewards.',
      apy:           d.apy ?? d.stakingApy,
      exchange_rate: d.exchangeRate ?? d.afSuiToSui,
      total_staked:  d.totalStaked ?? d.totalSuiStaked,
      afsui_supply:  d.afSuiSupply ?? d.totalAfSui,
      chain:         'sui',
      _todo:         'Stake SUI → afSUI and unstake require wallet signing',
    },
  };
}

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:    'Aftermath Finance',
      chain:   'sui',
      type:    'DEX Aggregator + Liquid Staking',
      website: 'https://aftermath.finance',
      nickname: '"The Jupiter of Sui"',
      highlights: [
        'Smart order routing across all Sui DEXes for best price',
        'afSUI: liquid staking with auto-compounding rewards',
        'Low-slippage AMM pools',
        'Perpetuals trading (coming soon)',
      ],
      products: {
        swap:          'Aggregated swap — best route across Uniswap-style, CLMM, and stable pools',
        liquid_staking:'afSUI — stake SUI, receive liquid token, earn validator rewards',
        pools:         'AMM liquidity pools with LP rewards',
      },
      _todo: 'Execute swap and stake/unstake — requires wallet signing',
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const AFTERMATH_SKILL_METADATA = {
  name: 'Aftermath Finance',
  description:
    'Aftermath Finance is a DEX aggregator and liquid staking platform on Sui. ' +
    'Get swap quotes across all Sui liquidity pools, browse top pools by TVL, ' +
    'and query afSUI liquid staking info. Build real Sui PTBs for swap transactions (returns base64 tx_bytes). ' +
    'Best-price routing across Cetus, DeepBook, and more.',
  category: 'DeFi',
  version: '1.1.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['aftermath', 'sui', 'dex', 'aggregator', 'afsui', 'liquid-staking', 'swap', 'defi'],
  external_url: 'https://aftermath.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/aftermath-finance?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'get_pools', 'get_afsui_info', 'get_protocol_info', 'build_swap_tx'],
        description:
          'get_quote: best-price swap quote across all Sui pools (requires coinIn, coinOut, amountIn). ' +
          'get_pools: top liquidity pools sorted by TVL (optional limit). ' +
          'get_afsui_info: afSUI liquid staking exchange rate and yield. ' +
          'get_protocol_info: Aftermath overview and supported tokens. ' +
          'build_swap_tx: build a real Sui PTB for swap (requires sender, token_in, token_out, amount_in). Returns base64 tx_bytes.',
      },
      coinIn: {
        type: 'string',
        description: 'Input token symbol or full coin type (e.g. SUI, USDC). Required for get_quote.',
      },
      coinOut: {
        type: 'string',
        description: 'Output token symbol or full coin type. Required for get_quote.',
      },
      amountIn: {
        type: 'number',
        description: 'Input amount in human-readable units (e.g. 10 for 10 SUI). Required for get_quote.',
      },
      limit: {
        type: 'number',
        description: 'Max pools to return for get_pools (default: 10).',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x...). Required for build_swap_tx.',
      },
      token_in: {
        type: 'string',
        description: 'Input token symbol (SUI, USDC, USDT, WETH, WBTC, AFSUI). Required for build_swap_tx.',
      },
      token_out: {
        type: 'string',
        description: 'Output token symbol. Required for build_swap_tx.',
      },
      amount_in: {
        type: 'string',
        description: 'Human-readable input amount (e.g. "1.5"). Required for build_swap_tx.',
      },
      slippage: {
        type: 'number',
        description: 'Max acceptable slippage as decimal (e.g. 0.01 = 1%). Default: 0.01.',
      },
    },
  },
  usage_examples: [
    { title: 'Swap quote SUI→USDC', input: { action: 'get_quote', coinIn: 'SUI', coinOut: 'USDC', amountIn: 10 } },
    { title: 'Top pools', input: { action: 'get_pools', limit: 5 } },
    { title: 'afSUI staking info', input: { action: 'get_afsui_info' } },
    {
      title: 'Build swap SUI→USDC',
      input: { action: 'build_swap_tx', sender: '0xYOUR_ADDRESS', token_in: 'SUI', token_out: 'USDC', amount_in: '1.5' },
    },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeAftermathSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_quote':         return await actionGetQuote(input);
      case 'get_pools':         return await actionGetPools(input);
      case 'get_afsui_info':    return await actionGetAfsuiInfo();
      case 'get_protocol_info': return await actionGetProtocolInfo();
      case 'build_swap_tx':     return await actionBuildSwapTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_quote, get_pools, get_afsui_info, get_protocol_info, build_swap_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Aftermath skill' };
  }
}
