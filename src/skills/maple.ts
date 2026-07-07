/**
 * Maple Finance — Institutional Undercollateralized Lending
 *
 * Maple Finance operates institutional lending pools where "Pool Delegates"
 * assess borrower credit and manage capital. Borrowers are market makers,
 * trading firms, and other institutions. Lenders earn yield by depositing
 * into USDC pools.
 *
 * Docs: https://docs.maple.finance
 * App:  https://app.maple.finance
 */

import type { SkillExecutionResult } from '@/types/skill';

const MAPLE_API_BASE = 'https://api.maple.finance/v2';
const DEFILLAMA_PROTOCOL = 'https://api.llama.fi/protocol/maple';
const DEFILLAMA_YIELDS = 'https://yields.llama.fi/pools';

const TOKENS = {
  MPL: {
    address: '0x33349B282065b0284d756F0577FB39c158F935e6',
    chain: 'Ethereum',
    description: 'Maple governance token',
  },
  SYRUP: {
    address: '0x643C4E15d7d62Ad0aBeC4a8Aa8058Aa3b1cd88e0',
    chain: 'Ethereum',
    description: 'Syrup token — Maple retail yield product',
  },
};

// ─── Action handlers ──────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Maple Finance',
      type: 'Institutional Undercollateralized Lending',
      tagline: 'On-chain credit markets for institutions',
      website: 'https://maple.finance',
      app: 'https://app.maple.finance',
      docs: 'https://docs.maple.finance',
      description: [
        'Maple Finance is a decentralised credit protocol where lending pools are managed by "Pool Delegates" — vetted entities who assess borrower creditworthiness.',
        'Borrowers are institutional counterparties (market makers, trading firms, web3 companies) who can borrow undercollateralized or lightly collateralized against their on-chain reputation.',
        'Lenders deposit USDC into pools and earn yield from the interest paid by institutional borrowers.',
        'Syrup is Maple\'s retail-facing product offering simplified access to institutional yield.',
      ],
      chains: ['Ethereum', 'Solana'],
      products: [
        'Lending Pools (USDC, syrupUSDC) — institutional borrowing pools',
        'Syrup — retail yield product backed by Maple pools',
        'Cash Management — RWA-backed treasury product',
      ],
      tokens: TOKENS,
      links: {
        governance: 'https://community.maple.finance',
        twitter: 'https://twitter.com/maplefinance',
        discord: 'https://discord.gg/maplefinance',
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_protocol_stats — TVL and total loans originated',
        'get_pools — list active lending pools with APY and deposits',
        'get_pool_details — details for a specific pool by name or ID',
      ],
    },
  };
}

async function actionGetProtocolStats(): Promise<SkillExecutionResult> {
  // Fetch DefiLlama data (primary) and Maple API (secondary) in parallel
  const [llamaResult, mapleResult] = await Promise.allSettled([
    fetch(DEFILLAMA_PROTOCOL, { signal: AbortSignal.timeout(10_000) }).then(r => {
      if (!r.ok) throw new Error(`DefiLlama HTTP ${r.status}`);
      return r.json();
    }),
    fetch(`${MAPLE_API_BASE}/pools`, { signal: AbortSignal.timeout(10_000) }).then(r => {
      if (!r.ok) throw new Error(`Maple API HTTP ${r.status}`);
      return r.json();
    }),
  ]);

  const llama = llamaResult.status === 'fulfilled' ? llamaResult.value : null;
  const mapleData = mapleResult.status === 'fulfilled' ? mapleResult.value : null;

  // Try to extract total loans originated from Maple API data
  let totalLoansOriginated: number | null = null;
  let activeLoans: number | null = null;

  if (mapleData) {
    // Shape varies; try common fields
    if (Array.isArray(mapleData)) {
      const pools = mapleData as any[];
      totalLoansOriginated = pools.reduce((sum: number, p: any) => sum + (p.totalBorrowed ?? p.total_borrowed ?? 0), 0) || null;
      activeLoans = pools.reduce((sum: number, p: any) => sum + (p.activeLoans ?? p.active_loans ?? 0), 0) || null;
    } else if (mapleData.totalLoansOriginated !== undefined) {
      totalLoansOriginated = mapleData.totalLoansOriginated;
    }
  }

  // Build stats from DefiLlama
  const tvl = llama?.tvl ?? null;
  const chainTvls = llama?.chainTvls ?? null;

  if (!llama && !mapleData) {
    return {
      success: false,
      output: {
        error: 'Could not fetch data from Maple API or DefiLlama',
        maple_api_error: mapleResult.status === 'rejected' ? (mapleResult.reason as Error).message : null,
        defillama_error: llamaResult.status === 'rejected' ? (llamaResult.reason as Error).message : null,
      },
    };
  }

  return {
    success: true,
    output: {
      protocol: 'Maple Finance',
      tvl_usd: tvl,
      chain_tvls: chainTvls
        ? Object.entries(chainTvls).reduce((acc: Record<string, number>, [k, v]: [string, any]) => {
            if (typeof v === 'number') acc[k] = v;
            else if (v && typeof v.tvl === 'number') acc[k] = v.tvl;
            return acc;
          }, {})
        : null,
      total_loans_originated_usd: totalLoansOriginated,
      active_loans_usd: activeLoans,
      tokens: TOKENS,
      sources: {
        defillama: llamaResult.status === 'fulfilled' ? 'ok' : `error: ${(llamaResult.reason as Error).message}`,
        maple_api: mapleResult.status === 'fulfilled' ? 'ok' : `error: ${(mapleResult.reason as Error).message}`,
      },
    },
  };
}

async function actionGetPools(): Promise<SkillExecutionResult> {
  // Try Maple API first, fallback to DefiLlama yields
  let mapleApiPools: any[] | null = null;
  let mapleApiError: string | null = null;

  try {
    const res = await fetch(`${MAPLE_API_BASE}/pools`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Maple API HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      mapleApiPools = data;
    } else if (data?.pools && Array.isArray(data.pools) && data.pools.length > 0) {
      mapleApiPools = data.pools;
    }
  } catch (err: any) {
    mapleApiError = err.message;
  }

  if (mapleApiPools) {
    const pools = mapleApiPools.map((p: any) => ({
      id: p.id ?? p.poolId ?? null,
      name: p.name ?? p.poolName ?? null,
      pool_delegate: p.poolDelegate ?? p.pool_delegate ?? null,
      asset: p.asset ?? p.token ?? 'USDC',
      apy: p.apy ?? p.netApy ?? p.supplyApy ?? null,
      total_deposits_usd: p.totalDeposits ?? p.totalLiquidity ?? p.totalSupply ?? null,
      available_liquidity_usd: p.availableLiquidity ?? p.liquidity ?? null,
      total_borrowed_usd: p.totalBorrowed ?? p.outstandingLoans ?? null,
      status: p.status ?? p.state ?? null,
      chain: p.chain ?? 'Ethereum',
    }));

    return {
      success: true,
      output: {
        source: 'maple_api',
        pool_count: pools.length,
        pools,
      },
    };
  }

  // Fallback: DefiLlama yields filtered to maple
  let llamaError: string | null = null;
  try {
    const res = await fetch(DEFILLAMA_YIELDS, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`DefiLlama yields HTTP ${res.status}`);
    const data = await res.json();
    const allPools: any[] = data?.data ?? [];
    const maplePools = allPools.filter(
      (p: any) =>
        (p.project ?? '').toLowerCase().includes('maple') ||
        (p.symbol ?? '').toLowerCase().includes('maple') ||
        (p.symbol ?? '').toLowerCase().includes('syrup')
    );

    if (maplePools.length === 0) {
      return {
        success: false,
        output: {
          error: 'No Maple pools found on DefiLlama yields',
          maple_api_error: mapleApiError,
          defillama_error: 'No matching pools',
        },
      };
    }

    const pools = maplePools.map((p: any) => ({
      id: p.pool,
      name: `${p.project} — ${p.symbol}`,
      pool_delegate: null,
      asset: p.symbol ?? null,
      apy: p.apy ?? null,
      apy_base: p.apyBase ?? null,
      apy_reward: p.apyReward ?? null,
      tvl_usd: p.tvlUsd ?? null,
      chain: p.chain ?? 'Ethereum',
      il_risk: p.ilRisk ?? null,
      outlook: p.predictions?.predictedClass ?? null,
    }));

    return {
      success: true,
      output: {
        source: 'defillama_yields',
        note: `Maple API unavailable (${mapleApiError}); data from DefiLlama`,
        pool_count: pools.length,
        pools,
      },
    };
  } catch (err: any) {
    llamaError = err.message;
  }

  return {
    success: false,
    output: {
      error: 'Could not fetch pool data from Maple API or DefiLlama',
      maple_api_error: mapleApiError,
      defillama_error: llamaError,
    },
  };
}

async function actionGetPoolDetails(input: Record<string, any>): Promise<SkillExecutionResult> {
  const poolId: string | undefined = input.pool_id;
  if (!poolId) {
    return { success: false, output: { error: 'pool_id is required (pool name or ID string)' } };
  }

  // Try Maple API with pool ID as path segment and as query param
  const urlsToTry = [
    `${MAPLE_API_BASE}/pools/${encodeURIComponent(poolId)}`,
    `${MAPLE_API_BASE}/pools?name=${encodeURIComponent(poolId)}`,
    `${MAPLE_API_BASE}/pools?id=${encodeURIComponent(poolId)}`,
  ];

  let mapleData: any = null;
  let lastError: string | null = null;

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        lastError = `HTTP ${res.status} from ${url}`;
        continue;
      }
      const data = await res.json();
      // Accept if it looks like a single pool object or a non-empty array
      if (data && typeof data === 'object' && !Array.isArray(data) && (data.id || data.name || data.poolId)) {
        mapleData = data;
        break;
      }
      if (Array.isArray(data) && data.length > 0) {
        // Match by name or id
        const match = data.find(
          (p: any) =>
            String(p.id ?? p.poolId ?? '').toLowerCase() === poolId.toLowerCase() ||
            String(p.name ?? p.poolName ?? '').toLowerCase().includes(poolId.toLowerCase())
        );
        if (match) {
          mapleData = match;
          break;
        }
        // If first URL returned an array but no match, continue
        lastError = `No pool matching "${poolId}" in response array`;
      }
    } catch (err: any) {
      lastError = err.message;
    }
  }

  if (mapleData) {
    return {
      success: true,
      output: {
        source: 'maple_api',
        pool: {
          id: mapleData.id ?? mapleData.poolId ?? null,
          name: mapleData.name ?? mapleData.poolName ?? null,
          pool_delegate: mapleData.poolDelegate ?? mapleData.pool_delegate ?? null,
          asset: mapleData.asset ?? mapleData.token ?? 'USDC',
          apy: mapleData.apy ?? mapleData.netApy ?? mapleData.supplyApy ?? null,
          total_deposits_usd: mapleData.totalDeposits ?? mapleData.totalLiquidity ?? mapleData.totalSupply ?? null,
          available_liquidity_usd: mapleData.availableLiquidity ?? mapleData.liquidity ?? null,
          total_borrowed_usd: mapleData.totalBorrowed ?? mapleData.outstandingLoans ?? null,
          borrowers: mapleData.borrowers ?? mapleData.activeLoans ?? null,
          status: mapleData.status ?? mapleData.state ?? null,
          chain: mapleData.chain ?? 'Ethereum',
          contract_address: mapleData.address ?? mapleData.contractAddress ?? null,
          raw: mapleData,
        },
      },
    };
  }

  // Fallback: pull all pools from DefiLlama and find a matching one
  try {
    const res = await fetch(DEFILLAMA_YIELDS, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}`);
    const data = await res.json();
    const allPools: any[] = data?.data ?? [];
    const needle = poolId.toLowerCase();
    const match = allPools.find(
      (p: any) =>
        (p.project ?? '').toLowerCase().includes('maple') &&
        (
          String(p.pool ?? '').toLowerCase() === needle ||
          (p.symbol ?? '').toLowerCase().includes(needle) ||
          (p.project ?? '').toLowerCase().includes(needle)
        )
    );

    if (match) {
      return {
        success: true,
        output: {
          source: 'defillama_yields',
          note: `Maple API unavailable; found via DefiLlama. Maple API error: ${lastError}`,
          pool: {
            id: match.pool,
            name: `${match.project} — ${match.symbol}`,
            pool_delegate: null,
            asset: match.symbol ?? null,
            apy: match.apy ?? null,
            apy_base: match.apyBase ?? null,
            apy_reward: match.apyReward ?? null,
            tvl_usd: match.tvlUsd ?? null,
            chain: match.chain ?? 'Ethereum',
            il_risk: match.ilRisk ?? null,
            outlook: match.predictions?.predictedClass ?? null,
          },
        },
      };
    }

    return {
      success: false,
      output: {
        error: `No pool found matching "${poolId}"`,
        maple_api_error: lastError,
        tip: 'Try get_pools first to see available pool names/IDs, then pass one as pool_id.',
      },
    };
  } catch (err: any) {
    return {
      success: false,
      output: {
        error: `Could not fetch pool details for "${poolId}"`,
        maple_api_error: lastError,
        defillama_error: err.message,
        tip: 'Try get_pools to see available pools.',
      },
    };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const MAPLE_SKILL_METADATA = {
  name: 'Maple Finance',
  description:
    'Maple Finance institutional lending — pool list, APY, TVL, and pool details. Institutional undercollateralized credit protocol with on-chain pools.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['maple', 'lending', 'institutional', 'credit', 'rwa', 'usdc', 'ethereum', 'solana', 'clarity-act'],
  external_url: 'https://maple.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/maple?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_protocol_stats', 'get_pools', 'get_pool_details'],
        description:
          'get_protocol_info: Overview of Maple Finance — institutional undercollateralized lending, products (lending pools, Syrup, Cash Management), chains, and token addresses. ' +
          'get_protocol_stats: TVL from DefiLlama and total loans originated from Maple API. ' +
          'get_pools: List active lending pools with APY, total deposits, available liquidity, and pool delegate info. Falls back to DefiLlama yields if Maple API is unavailable. ' +
          'get_pool_details: Full details for a specific pool (requires pool_id — pool name or ID string). Falls back to DefiLlama if Maple API is unavailable.',
      },
      pool_id: {
        type: 'string',
        description:
          'Pool name or ID to look up. Required for get_pool_details. Use get_pools first to discover valid names/IDs. Examples: "cash-management", "high-yield", or a UUID.',
      },
    },
  },
};

export async function executeMapleSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info':
      return actionGetProtocolInfo();
    case 'get_protocol_stats':
      return actionGetProtocolStats();
    case 'get_pools':
      return actionGetPools();
    case 'get_pool_details':
      return actionGetPoolDetails(input);
    default:
      return {
        success: false,
        output: {
          error: `Unknown action: ${input.action}. Available: get_protocol_info, get_protocol_stats, get_pools, get_pool_details`,
        },
      };
  }
}
