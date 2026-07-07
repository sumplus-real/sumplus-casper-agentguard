/**
 * Thala Finance — Aptos DeFi (AMM + CDP Stablecoin + Liquid Staking)
 *
 * Thala is a comprehensive DeFi protocol on Aptos with:
 *   - MOD (Move Dollar): overcollateralized CDP stablecoin
 *   - thAPT: liquid staked APT (like stETH for Aptos)
 *   - Thala Swap: StableSwap-optimized AMM
 *   - THL: governance token
 *
 * API: https://app.thala.fi/api
 * Aptos fullnode: https://fullnode.mainnet.aptoslabs.com/v1
 * Docs: https://docs.thala.fi
 */

import type { SkillExecutionResult } from '@/types/skill';

const APTOS_FULLNODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const THALA_API = 'https://app.thala.fi/api';
const DEFILLAMA_SLUG = 'thala';

// Thala contract addresses (Aptos mainnet)
const THALA_ADDR = '0x6f986d146e4a90b828d8c12c14b6f4e003fdff11a864f05f227df72054d67600';
const FARMING_ADDR = '0x6b3720cd988adeaf721ed9d4730da4324d52364871a68eac62b46d21e4d2fa99';
const MOD_COIN = `${THALA_ADDR}::mod_coin::MOD`;
const THAPT_COIN = `${THALA_ADDR}::base_pool::ThalaAPT`;
const THL_COIN = `${THALA_ADDR}::thl_coin::THL`;

async function aptosView<T = any>(func: string, type_arguments: string[], arguments_: any[]): Promise<T> {
  const res = await fetch(`${APTOS_FULLNODE}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ function: func, type_arguments, arguments: arguments_ }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Aptos view ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function thalaFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`${THALA_API}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Thala API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  const [llama, cgMOD] = await Promise.allSettled([
    fetch(`https://api.llama.fi/protocol/${DEFILLAMA_SLUG}`, { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=thala-for-metapool&vs_currencies=usd', { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
  ]);

  return {
    success: true,
    output: {
      name: 'Thala Finance',
      type: 'AMM + CDP Stablecoin + Liquid Staking',
      chain: 'Aptos',
      website: 'https://thala.fi',
      docs: 'https://docs.thala.fi',
      tvl_usd: llama.status === 'fulfilled' ? llama.value?.tvl : null,
      description: [
        'Thala is the DeFi backbone of Aptos, combining a StableSwap AMM, CDP stablecoin (MOD), and liquid staking (thAPT).',
        'MOD (Move Dollar) is an overcollateralized stablecoin minted against APT, USDC, and other Aptos assets.',
        'thAPT is liquid staked APT — stake APT, receive thAPT, earn staking rewards while staying liquid.',
        'THL is the governance and incentive token for the Thala ecosystem.',
      ],
      tokens: {
        MOD: { type: 'CDP Stablecoin', pegged_to: 'USD', coin_type: MOD_COIN },
        thAPT: { type: 'Liquid Staked APT', coin_type: THAPT_COIN },
        THL: { type: 'Governance Token', coin_type: THL_COIN, coingecko_id: 'thala-for-metapool' },
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_mod_stats — MOD stablecoin: total supply, collateral, stability fee',
        'get_thapt_stats — thAPT liquid staking: APY, total staked APT, exchange rate',
        'get_pool_stats — Thala AMM pools with TVL and APY',
      ],
    },
  };
}

async function actionGetModStats(): Promise<SkillExecutionResult> {
  try {
    const [apiRes, cgRes] = await Promise.allSettled([
      thalaFetch<any>('/mod-stats'),
      fetch('https://api.coingecko.com/api/v3/coins/move-dollar?localization=false&tickers=false&community_data=false&developer_data=false', { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
    ]);

    const api = apiRes.status === 'fulfilled' ? apiRes.value : null;
    const cg = cgRes.status === 'fulfilled' ? cgRes.value : null;
    const m = cg?.market_data;

    return {
      success: true,
      output: {
        token: 'MOD (Move Dollar)',
        coin_type: MOD_COIN,
        peg: 'USD',
        total_supply: api?.totalSupply ?? m?.total_supply ?? null,
        market_cap_usd: m?.market_cap?.usd ?? null,
        price_usd: m?.current_price?.usd ?? 1.0,
        collateral_ratio: api?.collateralRatio ?? null,
        stability_fee_annual: api?.stabilityFee ?? null,
        total_collateral_usd: api?.totalCollateralUSD ?? null,
        supported_collateral: api?.collateralTypes ?? ['APT', 'USDC', 'thAPT'],
        mechanism: 'CDP (Collateralized Debt Position) — mint MOD by depositing collateral > 150% ratio',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetThAptStats(): Promise<SkillExecutionResult> {
  try {
    const [apiRes, llamaYields] = await Promise.allSettled([
      thalaFetch<any>('/thapt-stats'),
      fetch('https://yields.llama.fi/pools', { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
    ]);

    const api = apiRes.status === 'fulfilled' ? apiRes.value : null;
    const yields = llamaYields.status === 'fulfilled' ? llamaYields.value : null;
    const thAptPool = yields?.data?.find((p: any) =>
      p.project?.toLowerCase().includes('thala') && p.symbol?.toLowerCase().includes('thapt')
    );

    return {
      success: true,
      output: {
        token: 'thAPT',
        coin_type: THAPT_COIN,
        description: 'Liquid staked APT — stake APT, receive thAPT, earn Aptos validator rewards while remaining liquid',
        total_staked_apt: api?.totalStakedAPT ?? null,
        exchange_rate_apt: api?.exchangeRate ?? null,
        apy_pct: api?.apy ?? thAptPool?.apy ?? null,
        unstake_mechanism: api?.unstakeMechanism ?? 'Instant swap via AMM or delayed redemption (lock period)',
        validator_count: api?.validatorCount ?? null,
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetPoolStats(): Promise<SkillExecutionResult> {
  try {
    const [apiRes, llamaYields] = await Promise.allSettled([
      thalaFetch<any>('/pools'),
      fetch('https://yields.llama.fi/pools', { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
    ]);

    const pools = apiRes.status === 'fulfilled' ? (apiRes.value?.pools ?? apiRes.value ?? []) : [];
    const yields = llamaYields.status === 'fulfilled' ? llamaYields.value : null;
    const thalaPools = yields?.data?.filter((p: any) => p.project?.toLowerCase().includes('thala')) ?? [];

    if (pools.length > 0) {
      return {
        success: true,
        output: {
          pools: pools.slice(0, 10).map((p: any) => ({
            name: p.name ?? p.poolName,
            type: p.type ?? p.poolType ?? 'stable',
            tvl_usd: p.tvlUSD ?? p.tvl,
            apy_pct: p.apy ?? p.apr,
            tokens: p.coins ?? p.tokens,
            volume_24h_usd: p.volume24h,
          })),
        },
      };
    }

    return {
      success: true,
      output: {
        pools: thalaPools.slice(0, 10).map((p: any) => ({
          name: p.symbol,
          chain: p.chain,
          tvl_usd: p.tvlUsd,
          apy_pct: p.apy,
          project: p.project,
        })),
        source: 'DefiLlama yields',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const THALA_SKILL_METADATA = {
  name: 'Thala Finance',
  description: 'Aptos DeFi protocol: MOD stablecoin (CDP), thAPT liquid staking, and StableSwap AMM. Get MOD stats, thAPT APY, and pool data.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['thala', 'aptos', 'stablecoin', 'mod', 'thapt', 'liquid-staking', 'amm', 'cdp', 'defi'],
  external_url: 'https://thala.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/thala?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_mod_stats', 'get_thapt_stats', 'get_pool_stats'],
        description:
          'get_protocol_info: Full overview of Thala Finance (MOD stablecoin, thAPT liquid staking, AMM) with TVL. ' +
          'get_mod_stats: MOD (Move Dollar) stablecoin stats: supply, collateral ratio, stability fee, price. ' +
          'get_thapt_stats: thAPT liquid staking stats: total staked APT, exchange rate, APY. ' +
          'get_pool_stats: Thala AMM pools with TVL, APY, and token pairs.',
      },
    },
  },
  usage_examples: [
    { title: 'Thala protocol overview', input: { action: 'get_protocol_info' } },
    { title: 'MOD stablecoin stats', input: { action: 'get_mod_stats' } },
    { title: 'thAPT liquid staking APY', input: { action: 'get_thapt_stats' } },
    { title: 'Top AMM pools', input: { action: 'get_pool_stats' } },
  ],
};

export async function executeThalaSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info': return actionGetProtocolInfo();
    case 'get_mod_stats': return actionGetModStats();
    case 'get_thapt_stats': return actionGetThAptStats();
    case 'get_pool_stats': return actionGetPoolStats();
    default:
      return { success: false, output: { error: `Unknown action: ${input.action}. Available: get_protocol_info, get_mod_stats, get_thapt_stats, get_pool_stats` } };
  }
}
