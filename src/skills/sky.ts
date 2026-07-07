/**
 * Sky Protocol (formerly MakerDAO) — USDS Stablecoin, Sky Savings Rate, SparkLend
 *
 * Sky Protocol is the rebrand of MakerDAO. Key products:
 * - USDS: rebranded DAI stablecoin (1:1 swap with DAI)
 * - sUSDS: staked USDS earning the Sky Savings Rate (SSR)
 * - SKY: governance token (replaced MKR at 24,000 SKY per MKR)
 * - SparkLend: Aave V3 fork lending protocol
 *
 * Website: https://sky.money
 */

import type { SkillExecutionResult } from '@/types/skill';
import { formatUnits } from 'viem';
import { getPublicClient } from '@/lib/rpc';

const CONTRACTS = {
  USDS:  '0xdC035D45d973E3EC169d2276DDab16f1e407384F' as const,
  sUSDS: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD' as const,
  SKY:   '0x56072C95FAA701256059aa122697B133aDEd9279' as const,
  DAI:   '0x6B175474E89094C44Da98b954EedeAC495271d0F' as const,
};

const ERC20_ABI = [
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'decimals',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

const SUSDS_ABI = [
  { name: 'ssr',         type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'decimals',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

function getClient() {
  return getPublicClient('ethereum');
}

/** Convert SSR ray value (1e27 per-second rate) to APY percentage */
function ssrRayToApy(ssrRaw: bigint): number {
  // rate per second as a float
  const ratePerSecond = Number(ssrRaw) / 1e27;
  // compound over one year's worth of seconds
  const apy = (Math.pow(ratePerSecond, 365 * 24 * 3600) - 1) * 100;
  return apy;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Sky Protocol',
      formerly: 'MakerDAO',
      website: 'https://sky.money',
      description: [
        'Sky Protocol is the rebrand of MakerDAO, one of the oldest DeFi protocols on Ethereum.',
        'It issues USDS (rebranded DAI), a decentralized stablecoin soft-pegged to $1 USD.',
        'USDS holders can deposit into sUSDS to earn the Sky Savings Rate (SSR), a protocol-set yield.',
        'SKY is the new governance token, replacing MKR at a ratio of 24,000 SKY per MKR.',
        'SparkLend is Sky\'s lending market (Aave V3 fork) for borrowing against collateral.',
        'DAI remains fully interchangeable with USDS at 1:1.',
      ],
      tokens: {
        USDS:  { address: CONTRACTS.USDS,  description: 'Rebranded DAI stablecoin, pegged to $1 USD' },
        sUSDS: { address: CONTRACTS.sUSDS, description: 'Staked USDS — earns Sky Savings Rate (SSR)' },
        SKY:   { address: CONTRACTS.SKY,   description: 'Governance token (24,000 SKY = 1 MKR)' },
        DAI:   { address: CONTRACTS.DAI,   description: 'Original stablecoin, 1:1 swappable with USDS' },
      },
      products: {
        Sky_Savings: 'Deposit USDS → receive sUSDS → earn SSR yield automatically',
        SparkLend:   'Aave V3 fork — borrow stablecoins against ETH, wBTC, and other collateral',
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_ssr_rate — current Sky Savings Rate (APY) from sUSDS contract, plus supply stats',
        'get_usds_stats — USDS and DAI on-chain supply and DefiLlama TVL',
        'get_spark_stats — SparkLend pool rates from DefiLlama yields',
      ],
    },
  };
}

async function actionGetSsrRate(): Promise<SkillExecutionResult> {
  try {
    const client = getClient();
    const [ssrRaw, sUSDSTotalSupplyRaw, sUSDS_decimals, USDSTotalSupplyRaw, USDS_decimals] = await Promise.all([
      client.readContract({ address: CONTRACTS.sUSDS, abi: SUSDS_ABI, functionName: 'ssr' }),
      client.readContract({ address: CONTRACTS.sUSDS, abi: SUSDS_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: CONTRACTS.sUSDS, abi: SUSDS_ABI, functionName: 'decimals' }),
      client.readContract({ address: CONTRACTS.USDS,  abi: ERC20_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: CONTRACTS.USDS,  abi: ERC20_ABI, functionName: 'decimals' }),
    ]);

    const ssrApy = ssrRayToApy(ssrRaw);
    const sUSDS_supply = formatUnits(sUSDSTotalSupplyRaw, sUSDS_decimals);
    const USDS_supply  = formatUnits(USDSTotalSupplyRaw,  USDS_decimals);

    return {
      success: true,
      output: {
        sky_savings_rate: {
          apy_percent:     parseFloat(ssrApy.toFixed(4)),
          apy_display:     `${ssrApy.toFixed(2)}%`,
          raw_ray:         ssrRaw.toString(),
          note:            'SSR is set by Sky governance and accrues to sUSDS holders automatically',
        },
        sUSDS: {
          contract:     CONTRACTS.sUSDS,
          total_supply: sUSDS_supply,
          description:  'Total sUSDS in circulation — represents USDS staked for SSR',
        },
        USDS: {
          contract:     CONTRACTS.USDS,
          total_supply: USDS_supply,
          description:  'Total USDS in circulation (rebranded DAI)',
        },
        chain: 'Ethereum',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetUsdsStats(): Promise<SkillExecutionResult> {
  try {
    const client = getClient();
    const llamaFetch = fetch('https://api.llama.fi/protocol/sky', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.json())
      .catch(() => null);

    const [USDSTotalSupplyRaw, USDS_decimals, DAITotalSupplyRaw, DAI_decimals, llama] = await Promise.all([
      client.readContract({ address: CONTRACTS.USDS, abi: ERC20_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: CONTRACTS.USDS, abi: ERC20_ABI, functionName: 'decimals' }),
      client.readContract({ address: CONTRACTS.DAI,  abi: ERC20_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: CONTRACTS.DAI,  abi: ERC20_ABI, functionName: 'decimals' }),
      llamaFetch,
    ]);

    const USDS_supply = formatUnits(USDSTotalSupplyRaw, USDS_decimals);
    const DAI_supply  = formatUnits(DAITotalSupplyRaw,  DAI_decimals);

    return {
      success: true,
      output: {
        USDS: {
          contract:     CONTRACTS.USDS,
          total_supply: USDS_supply,
          chain:        'Ethereum',
          note:         'Rebranded DAI — 1:1 swappable with DAI at any time',
        },
        DAI: {
          contract:     CONTRACTS.DAI,
          total_supply: DAI_supply,
          chain:        'Ethereum',
          note:         'Original MakerDAO stablecoin — still fully functional, 1:1 with USDS',
        },
        combined_supply_estimate: (parseFloat(USDS_supply) + parseFloat(DAI_supply)).toLocaleString('en-US', { maximumFractionDigits: 0 }),
        protocol_tvl_usd:         llama?.tvl ?? null,
        defillama_url:            'https://defillama.com/protocol/sky',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetSparkStats(): Promise<SkillExecutionResult> {
  try {
    // DefiLlama yields API — filter by project='spark'
    const res = await fetch('https://yields.llama.fi/pools', { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`DefiLlama yields API error: ${res.status}`);

    const data: any = await res.json();
    const pools: any[] = (data?.data ?? []).filter(
      (p: any) => p.project?.toLowerCase() === 'spark' && p.chain?.toLowerCase() === 'ethereum'
    );

    if (pools.length === 0) {
      return {
        success: true,
        output: {
          message:     'No Spark pools found on Ethereum via DefiLlama yields API',
          fallback_url: 'https://app.spark.fi/markets',
          note:         'Try checking the Spark app directly for current lending rates',
        },
      };
    }

    const formatted = pools
      .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .map((p: any) => ({
        pool:           p.pool,
        symbol:         p.symbol,
        chain:          p.chain,
        apy_base:       p.apyBase != null  ? `${p.apyBase.toFixed(2)}%`  : null,
        apy_reward:     p.apyReward != null ? `${p.apyReward.toFixed(2)}%` : null,
        apy_total:      p.apy != null       ? `${p.apy.toFixed(2)}%`       : null,
        tvl_usd:        p.tvlUsd ?? null,
        utilization:    p.utilization != null ? `${(p.utilization * 100).toFixed(1)}%` : null,
      }));

    return {
      success: true,
      output: {
        protocol:   'SparkLend',
        description: 'Aave V3 fork by Sky Protocol for borrowing against collateral',
        app_url:    'https://app.spark.fi',
        chain:      'Ethereum',
        pools:      formatted,
        source:     'DefiLlama yields API',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const SKY_SKILL_METADATA = {
  name:             'Sky Protocol',
  description:      'Sky Protocol (formerly MakerDAO) — USDS stablecoin, Sky Savings Rate (sUSDS), and SparkLend. Get current SSR, USDS supply, and Spark lending rates.',
  category:         'DeFi',
  version:          '1.0.0',
  author_type:      'official',
  is_paid:          false,
  price:            null,
  tags:             ['sky', 'maker', 'makerdao', 'usds', 'dai', 'susds', 'ssr', 'spark', 'stablecoin', 'ethereum', 'clarity-act'],
  external_url:     'https://sky.money',
  logo_url:         'https://icons.llamao.fi/icons/protocols/sky?w=48&h=48',
  partner_verified: false,
  status:           'approved',
  schema: {
    type:     'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_ssr_rate', 'get_usds_stats', 'get_spark_stats'],
        description:
          'get_protocol_info: Overview of Sky Protocol (formerly MakerDAO) — products, token addresses, and migration from DAI/MKR. ' +
          'get_ssr_rate: Current Sky Savings Rate (SSR) as APY from the sUSDS contract, plus sUSDS and USDS total supply. ' +
          'get_usds_stats: USDS and DAI on-chain total supply, combined estimate, and Sky Protocol TVL from DefiLlama. ' +
          'get_spark_stats: SparkLend (Aave V3 fork) pool lending rates and TVL from DefiLlama yields API.',
      },
    },
  },
};

export async function executeSkySkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info': return actionGetProtocolInfo();
    case 'get_ssr_rate':      return actionGetSsrRate();
    case 'get_usds_stats':    return actionGetUsdsStats();
    case 'get_spark_stats':   return actionGetSparkStats();
    default:
      return {
        success: false,
        output: { error: `Unknown action: ${input.action}. Available: get_protocol_info, get_ssr_rate, get_usds_stats, get_spark_stats` },
      };
  }
}
