/**
 * EigenLayer — Ethereum Restaking Protocol
 *
 * EigenLayer lets ETH stakers and LST holders "restake" their assets to
 * simultaneously secure additional services called AVS (Actively Validated
 * Services), earning extra yield on top of base Ethereum staking rewards.
 *
 * Docs: https://docs.eigenlayer.xyz
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Contract addresses ───────────────────────────────────────────────────────

const CONTRACTS = {
  StrategyManager: '0x858646372CC42E1A627fcE94aa7A7033e7CF075A' as const,
  DelegationManager: '0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37B' as const,
  EigenPodManager: '0x91E677b07F7AF907ec9a428aafA9fc14a0d3A338' as const,
};

const DEFILLAMA_URL = 'https://api.llama.fi/protocol/eigenlayer';
const EIGENEXPLORER_BASE = 'https://api.eigenexplorer.com';

function eigenHeaders(): Record<string, string> {
  const key = process.env.EIGENEXPLORER_API_KEY;
  return key ? { 'X-API-Token': key } : {};
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'EigenLayer',
      type: 'Ethereum Restaking Protocol',
      website: 'https://eigenlayer.xyz',
      docs: 'https://docs.eigenlayer.xyz',
      description: [
        'EigenLayer enables ETH stakers and LST (liquid staking token) holders to restake their assets.',
        'Restaked assets simultaneously secure additional networks/services called AVS (Actively Validated Services).',
        'Restakers earn base Ethereum staking yield PLUS extra rewards from each AVS they opt into.',
        'Supported LSTs include stETH (Lido), rETH (Rocket Pool), cbETH (Coinbase), and many others.',
        'Operators run AVS software on behalf of restakers and share in rewards.',
      ],
      key_concepts: {
        restaking: 'Depositing ETH or LSTs into EigenLayer to secure AVS services in addition to Ethereum.',
        avs: 'Actively Validated Services — external networks (bridges, rollups, oracles) that inherit Ethereum security via EigenLayer.',
        operator: 'Entity that runs AVS node software; restakers delegate stake to operators.',
        delegation: 'Restakers delegate their stake weight to a chosen operator.',
      },
      contracts: {
        StrategyManager: { address: CONTRACTS.StrategyManager, description: 'Handles LST deposits into restaking strategies' },
        DelegationManager: { address: CONTRACTS.DelegationManager, description: 'Manages stake delegation from restakers to operators' },
        EigenPodManager: { address: CONTRACTS.EigenPodManager, description: 'Manages native ETH restaking via EigenPods' },
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_protocol_stats — TVL from DefiLlama, AVS and operator counts from EigenExplorer',
        'get_avs_list — list of live AVS services with names, metadata, and TVL',
        'get_operator_info — details for a specific operator by address (requires operator_address)',
      ],
    },
  };
}

async function actionGetProtocolStats(): Promise<SkillExecutionResult> {
  try {
    const [llamaRes, metricsRes] = await Promise.allSettled([
      fetch(DEFILLAMA_URL, { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
      fetch(`${EIGENEXPLORER_BASE}/metrics`, { signal: AbortSignal.timeout(10_000), headers: eigenHeaders() }).then(r => r.json()),
    ]);

    const llama = llamaRes.status === 'fulfilled' ? llamaRes.value : null;
    const metrics = metricsRes.status === 'fulfilled' ? metricsRes.value : null;

    return {
      success: true,
      output: {
        tvl_usd: llama?.tvl ?? null,
        tvl_breakdown: llama?.chainTvls
          ? Object.fromEntries(
              Object.entries(llama.chainTvls as Record<string, any>).map(([k, v]) => [k, (v as any)?.tvl ?? null])
            )
          : null,
        avs_count: metrics?.avsCount ?? metrics?.avs_count ?? null,
        operator_count: metrics?.operatorCount ?? metrics?.operator_count ?? null,
        total_restakers: metrics?.stakerCount ?? metrics?.staker_count ?? null,
        total_restaked_eth: metrics?.totalRestaked ?? metrics?.total_restaked ?? null,
        sources: {
          tvl: DEFILLAMA_URL,
          metrics: `${EIGENEXPLORER_BASE}/metrics`,
        },
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetAvsList(): Promise<SkillExecutionResult> {
  try {
    const res = await fetch(`${EIGENEXPLORER_BASE}/avs?limit=20`, {
      signal: AbortSignal.timeout(10_000),
      headers: eigenHeaders(),
    });
    if (!res.ok) throw new Error(`EigenExplorer /avs returned HTTP ${res.status}`);
    const data = await res.json();

    // EigenExplorer may wrap in { data: [...] } or return array directly
    const avsList: any[] = Array.isArray(data) ? data : (data?.data ?? data?.avs ?? []);

    const formatted = avsList.map((avs: any) => ({
      name: avs.name ?? avs.metadata?.name ?? null,
      address: avs.address ?? avs.id ?? null,
      description: avs.description ?? avs.metadata?.description ?? null,
      website: avs.website ?? avs.metadata?.website ?? null,
      tvl_eth: avs.tvl ?? avs.totalStake ?? null,
      operator_count: avs.operatorCount ?? avs.operator_count ?? null,
      staker_count: avs.stakerCount ?? avs.staker_count ?? null,
    }));

    return {
      success: true,
      output: {
        avs_list: formatted,
        total_returned: formatted.length,
        source: `${EIGENEXPLORER_BASE}/avs`,
        note: 'AVS = Actively Validated Service. Each AVS is a network secured by restaked ETH.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetOperatorInfo(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { operator_address } = input;
  if (!operator_address) {
    return { success: false, output: { error: 'operator_address is required' } };
  }

  try {
    const res = await fetch(`${EIGENEXPLORER_BASE}/operators/${operator_address}`, {
      signal: AbortSignal.timeout(10_000),
      headers: eigenHeaders(),
    });
    if (!res.ok) throw new Error(`EigenExplorer /operators/${operator_address} returned HTTP ${res.status}`);
    const data = await res.json();

    return {
      success: true,
      output: {
        address: operator_address,
        name: data.name ?? data.metadata?.name ?? null,
        description: data.description ?? data.metadata?.description ?? null,
        website: data.website ?? data.metadata?.website ?? null,
        logo: data.logo ?? data.metadata?.logo ?? null,
        tvl_eth: data.tvl ?? data.totalStake ?? null,
        staker_count: data.stakerCount ?? data.staker_count ?? null,
        avs_count: data.avsCount ?? data.avs_count ?? null,
        registered_avs: data.avs ?? data.registeredAvs ?? null,
        raw: data,
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const EIGENLAYER_SKILL_METADATA = {
  name: 'EigenLayer',
  description:
    'EigenLayer Ethereum restaking protocol — pool TVL, AVS list, and operator info. Stake once, earn multiple yields by securing AVS services.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['eigenlayer', 'restaking', 'avs', 'ethereum', 'lst', 'eth', 'staking', 'clarity-act'],
  external_url: 'https://eigenlayer.xyz',
  logo_url: 'https://icons.llamao.fi/icons/protocols/eigenlayer?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_protocol_stats', 'get_avs_list', 'get_operator_info'],
        description:
          'get_protocol_info: Overview of EigenLayer, restaking concept, AVS model, and contract addresses. ' +
          'get_protocol_stats: TVL from DefiLlama plus AVS count, operator count, and restaked ETH from EigenExplorer. ' +
          'get_avs_list: List of up to 20 live AVS (Actively Validated Services) with name, description, TVL, and operator counts. ' +
          'get_operator_info: Detailed info for a specific operator by Ethereum address — requires operator_address.',
      },
      operator_address: {
        type: 'string',
        description: 'Ethereum address (0x...) of the EigenLayer operator. Required for get_operator_info.',
      },
    },
  },
};

export async function executeEigenLayerSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info':
      return actionGetProtocolInfo();
    case 'get_protocol_stats':
      return actionGetProtocolStats();
    case 'get_avs_list':
      return actionGetAvsList();
    case 'get_operator_info':
      return actionGetOperatorInfo(input);
    default:
      return {
        success: false,
        output: {
          error: `Unknown action: ${input.action}. Available: get_protocol_info, get_protocol_stats, get_avs_list, get_operator_info`,
        },
      };
  }
}
