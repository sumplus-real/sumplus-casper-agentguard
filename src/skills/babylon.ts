/**
 * Babylon Protocol — BTC Staking Protocol
 *
 * Babylon allows BTC holders to lock their BTC on the Bitcoin network
 * using timelocks to provide economic security to PoS chains (restaking)
 * without requiring bridging or wrapping.
 *
 * API base: https://staking-api.babylonlabs.io
 */

import type { SkillExecutionResult } from '@/types/skill';

const BABYLON_BASE = 'https://staking-api.babylonlabs.io';

async function babylonFetch<T = any>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BABYLON_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Babylon API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Babylon Protocol',
      type: 'BTC Staking Protocol',
      website: 'https://babylonlabs.io',
      api_base: BABYLON_BASE,
      description: [
        'Babylon is the leading BTC staking protocol.',
        'It allows BTC holders to lock their BTC via Bitcoin timelocks without any bridging or wrapping.',
        'The locked BTC provides economic security to Proof-of-Stake (PoS) chains, effectively bringing the concept of restaking to Bitcoin.',
      ],
      available_actions: [
        'get_protocol_info — this overview',
        'get_global_stats — total BTC staked, staker count, finality provider count',
        'get_finality_providers — list top finality providers with stake amounts',
        'get_staking_params — current min/max BTC amounts, timelock params',
      ],
    },
  };
}

async function actionGetGlobalStats(): Promise<SkillExecutionResult> {
  try {
    const data = await babylonFetch<any>('/v1/stats');
    const s = data?.data ?? data;
    const activeBtc = s.active_tvl != null ? s.active_tvl / 1e8 : null;
    const totalBtc = s.total_tvl != null ? s.total_tvl / 1e8 : null;

    return {
      success: true,
      output: {
        active_tvl_btc: activeBtc,
        total_tvl_btc: totalBtc,
        active_tvl_sats: s.active_tvl,
        total_tvl_sats: s.total_tvl,
        total_stakers: s.total_stakers,
        active_delegations: s.active_delegations,
        total_delegations: s.total_delegations,
        btc_price_usd: s.btc_price_usd,
        display: [
          `Active TVL: ${activeBtc != null ? activeBtc.toFixed(4) : '?'} BTC`,
          `Total TVL: ${totalBtc != null ? totalBtc.toFixed(4) : '?'} BTC`,
          `Stakers: ${s.total_stakers ?? '?'}`,
          `Active/Total Delegations: ${s.active_delegations ?? '?'} / ${s.total_delegations ?? '?'}`
        ].join(' | '),
        raw_data: data
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to fetch global stats from Babylon' };
  }
}

async function actionGetFinalityProviders(input: any): Promise<SkillExecutionResult> {
  try {
    const limit = input.limit?.toString() || '10';
    const params = { limit };
    
    const data = await babylonFetch<any>('/v1/finality-providers', params);
    const providers = (data.data ?? []).map((fp: any, i: number) => ({
      rank: i + 1,
      name: fp.description?.moniker || fp.moniker || 'Unknown',
      pk: fp.btc_pk,
      total_staked: fp.total_delegation || fp.total_stake || '0',
      status: fp.status || fp.state,
      commission: fp.commission,
      display: `#${i + 1} ${fp.description?.moniker || fp.moniker || 'Unknown'} — Staked: ${fp.total_delegation || fp.total_stake || '0'} satoshis | Status: ${fp.status || fp.state}`
    }));

    return {
      success: true,
      output: {
        providers,
        count: providers.length,
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to fetch finality providers from Babylon' };
  }
}

async function actionGetStakingParams(): Promise<SkillExecutionResult> {
  try {
    const data = await babylonFetch<any>('/v2/network-info').catch(async () => {
      // Fallback in case /v2/network-info is not available or differs slightly
      return babylonFetch<any>('/v1/staking-params');
    });

    return {
      success: true,
      output: {
        min_staking_amount: data.min_staking_amount,
        max_staking_amount: data.max_staking_amount,
        max_staking_time_blocks: data.max_staking_time_blocks,
        min_staking_time_blocks: data.min_staking_time_blocks,
        unbonding_time_blocks: data.unbonding_time_blocks,
        display: [
          `Min Stake: ${data.min_staking_amount} sats`,
          `Max Stake: ${data.max_staking_amount} sats`,
          `Min Time: ${data.min_staking_time_blocks} blocks`,
          `Max Time: ${data.max_staking_time_blocks} blocks`
        ].join(' | '),
        raw_data: data
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to fetch staking params from Babylon' };
  }
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const BABYLON_SKILL_METADATA = {
  name: 'Babylon Protocol',
  description: 'Babylon allows BTC holders to lock their BTC on the Bitcoin network to provide economic security to PoS chains (restaking) without bridging.',
  category: 'BTC DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['babylon', 'btc', 'bitcoin', 'staking', 'restaking', 'defi'],
  external_url: 'https://babylonlabs.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/babylon?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_protocol_info',
          'get_global_stats',
          'get_finality_providers',
          'get_staking_params'
        ],
        description:
          'get_protocol_info: Babylon overview and explanation of bridge-less BTC staking. ' +
          'get_global_stats: Total BTC staked, staker count, and finality provider count. ' +
          'get_finality_providers: List top finality providers and their staked amounts. ' +
          'get_staking_params: Current min/max BTC staking amounts and timelock parameters.'
      },
      limit: {
        type: 'number',
        description: 'Limit the number of finality providers returned (default 10).'
      }
    }
  },
  usage_examples: [
    {
      title: 'Babylon Overview',
      input: { action: 'get_protocol_info' }
    },
    {
      title: 'Global Staking Stats',
      input: { action: 'get_global_stats' }
    },
    {
      title: 'Top Finality Providers',
      input: { action: 'get_finality_providers', limit: 5 }
    },
    {
      title: 'Staking Parameters',
      input: { action: 'get_staking_params' }
    }
  ]
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeBabylonSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':      return actionGetProtocolInfo();
      case 'get_global_stats':       return actionGetGlobalStats();
      case 'get_finality_providers': return actionGetFinalityProviders(input);
      case 'get_staking_params':     return actionGetStakingParams();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_global_stats, get_finality_providers, get_staking_params`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Babylon skill unexpected error' };
  }
}
