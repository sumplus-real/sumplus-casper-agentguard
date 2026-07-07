/**
 * Centrifuge — Real World Asset (RWA) Tokenization Protocol
 *
 * Centrifuge brings real-world credit (invoices, real estate loans, trade finance)
 * on-chain as NFTs, then structures them into senior/junior lending pools.
 * The protocol operates on Centrifuge Chain (Substrate parachain on Polkadot)
 * and previously on Ethereum via Tinlake (legacy).
 *
 * Docs: https://docs.centrifuge.io
 * App:  https://app.centrifuge.io
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFILLAMA_URL = 'https://api.llama.fi/protocol/centrifuge';
const CENTRIFUGE_API_BASE = 'https://api.centrifuge.io/v1';

// Centrifuge subgraph on The Graph (decentralized network)
// The hosted service is being deprecated; this is the best-effort endpoint.
const CENTRIFUGE_GQL = 'https://api.centrifuge.io/graphql';

const FETCH_TIMEOUT = 12_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

async function queryCentrifugeGQL(query: string): Promise<any> {
  const res = await fetch(CENTRIFUGE_GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) throw new Error(`Centrifuge GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? 'GraphQL error');
  return json.data;
}

// ─── Action: get_protocol_info ────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Centrifuge',
      type: 'Real-World Asset (RWA) Tokenization',
      website: 'https://centrifuge.io',
      app: 'https://app.centrifuge.io',
      docs: 'https://docs.centrifuge.io',
      governance_token: {
        symbol: 'CFG',
        description: 'Centrifuge governance token used for on-chain voting and network fees',
      },
      description: [
        'Centrifuge is an on-chain credit marketplace that tokenizes real-world assets — invoices, real estate loans, trade receivables, and structured credit — as NFTs.',
        'These NFTs are pooled into Tinlake pools (Ethereum legacy) or native Centrifuge Chain pools, each with senior (lower risk, fixed yield) and junior (higher risk, first loss) tranches.',
        'Investors supply liquidity to pools in exchange for DROP (senior) or TIN (junior) tokens. Borrowers draw down capital against their asset NFTs.',
        'Centrifuge Chain is a Substrate-based parachain on the Polkadot network, purpose-built for RWA on-chain.',
        'The CFG token governs the protocol and is used for transaction fees on Centrifuge Chain.',
      ],
      how_it_works: [
        '1. Asset originator locks a real-world asset NFT as collateral in a pool.',
        '2. Borrower draws down stablecoin liquidity (DAI, USDC) against the NFT value.',
        '3. Investors supply liquidity to the senior or junior tranche.',
        '4. NAV (Net Asset Value) tracks outstanding loans; senior investors are repaid first.',
        '5. At maturity, loans are repaid and investors redeem their tranche tokens.',
      ],
      asset_classes: [
        'Invoice financing',
        'Trade receivables',
        'Real estate bridge loans',
        'Consumer loans',
        'Supply chain finance',
        'Freight invoice financing',
      ],
      links: {
        github: 'https://github.com/centrifuge',
        forum: 'https://gov.centrifuge.io',
        discord: 'https://discord.gg/centrifuge',
        twitter: 'https://twitter.com/centrifuge',
        tinlake_legacy: 'https://tinlake.centrifuge.io',
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_protocol_stats — total TVL and protocol-level metrics from DefiLlama',
        'get_pools — list of active Centrifuge pools with NAV and asset class',
        'get_pool_details — detailed info for a specific pool by pool_id',
      ],
    },
  };
}

// ─── Action: get_protocol_stats ───────────────────────────────────────────────

async function actionGetProtocolStats(): Promise<SkillExecutionResult> {
  let llama: any = null;
  let llamaError: string | null = null;

  try {
    llama = await fetchJson(DEFILLAMA_URL);
  } catch (err: any) {
    llamaError = err.message;
  }

  if (!llama && llamaError) {
    return {
      success: false,
      output: {
        error: `Failed to fetch protocol stats: ${llamaError}`,
        note: 'DefiLlama returned an error. Try again shortly or check https://defillama.com/protocol/centrifuge.',
      },
    };
  }

  const tvl = llama?.tvl ?? null;
  const chainTvls = llama?.chainTvls ?? null;
  const currentTvl =
    Array.isArray(llama?.tvl)
      ? llama.tvl[llama.tvl.length - 1]?.totalLiquidityUSD ?? null
      : llama?.tvl ?? null;

  // DefiLlama returns a time-series array for tvl; grab latest entry
  const latestTvl = Array.isArray(tvl)
    ? tvl[tvl.length - 1]?.totalLiquidityUSD ?? null
    : currentTvl;

  return {
    success: true,
    output: {
      protocol: 'Centrifuge',
      tvl_usd: latestTvl,
      chain_tvls: chainTvls
        ? Object.fromEntries(
            Object.entries(chainTvls).map(([chain, data]: [string, any]) => [
              chain,
              Array.isArray(data?.tvl)
                ? data.tvl[data.tvl.length - 1]?.totalLiquidityUSD ?? null
                : data?.tvl ?? null,
            ])
          )
        : null,
      governance_token: 'CFG',
      defillama_url: 'https://defillama.com/protocol/centrifuge',
      note: 'TVL represents total liquidity locked across all active Centrifuge pools (senior + junior tranches).',
    },
  };
}

// ─── Action: get_pools ────────────────────────────────────────────────────────

async function actionGetPools(): Promise<SkillExecutionResult> {
  // Strategy 1: Try the Centrifuge REST API
  let pools: any[] | null = null;
  let apiError: string | null = null;

  try {
    const data = await fetchJson(`${CENTRIFUGE_API_BASE}/pools`);
    if (Array.isArray(data)) {
      pools = data;
    } else if (Array.isArray(data?.pools)) {
      pools = data.pools;
    } else if (Array.isArray(data?.data)) {
      pools = data.data;
    }
  } catch (err: any) {
    apiError = err.message;
  }

  if (pools && pools.length > 0) {
    return {
      success: true,
      output: {
        source: 'Centrifuge API',
        pool_count: pools.length,
        pools: pools.map((p: any) => ({
          id: p.id ?? p.poolId ?? null,
          name: p.name ?? p.metadata?.name ?? null,
          asset_class: p.assetClass ?? p.metadata?.assetClass ?? null,
          currency: p.currency ?? p.poolCurrency?.symbol ?? null,
          nav: p.nav ?? p.netAssetValue ?? null,
          senior_apy: p.seniorInterestRate ?? p.DROP?.apy ?? null,
          junior_apy: p.juniorInterestRate ?? p.TIN?.apy ?? null,
          status: p.status ?? null,
        })),
      },
    };
  }

  // Strategy 2: Try the Centrifuge Ponder GraphQL API
  let subgraphError: string | null = null;
  try {
    const gql = `{
      pools(limit: 50, orderBy: "createdAt", orderDirection: "desc") {
        items {
          id
          isActive
          currency
          decimals
          createdAt
          tokens { items { id tokenPrice } }
        }
      }
    }`;
    const data = await queryCentrifugeGQL(gql);
    const items: any[] = data?.pools?.items ?? [];
    if (items.length > 0) {
      const activePools = items.filter((p: any) => p.isActive !== false);
      return {
        success: true,
        output: {
          source: 'Centrifuge GraphQL API',
          pool_count: activePools.length,
          pools: activePools.map((p: any) => {
            const decimals = p.decimals ?? 18;
            const scale = Math.pow(10, decimals);
            const tokens = p.tokens?.items ?? [];
            return {
              id: p.id,
              is_active: p.isActive,
              currency_code: p.currency,
              created_at: p.createdAt ? new Date(Number(p.createdAt)).toISOString() : null,
              token_prices: tokens.map((t: any) => ({
                token_id: t.id,
                price: t.tokenPrice ? (Number(t.tokenPrice) / scale).toFixed(6) : null,
              })),
            };
          }),
          note: 'Pool names require IPFS metadata resolution; use app.centrifuge.io to browse with full names. Token prices in pool currency units.',
          app_url: 'https://app.centrifuge.io',
        },
      };
    }
  } catch (err: any) {
    subgraphError = err.message;
  }

  // Both failed — surface gracefully
  return {
    success: false,
    output: {
      error: 'Could not retrieve pool list from any source.',
      tried: [
        { source: 'Centrifuge REST API', url: `${CENTRIFUGE_API_BASE}/pools`, error: apiError },
        { source: 'Centrifuge Subgraph', url: CENTRIFUGE_GQL, error: subgraphError },
      ],
      suggestion: [
        'Browse active pools at https://app.centrifuge.io',
        'Check pool data at https://defillama.com/protocol/centrifuge',
        'Developer docs: https://docs.centrifuge.io',
      ],
    },
  };
}

// ─── Action: get_pool_details ─────────────────────────────────────────────────

async function actionGetPoolDetails(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { pool_id } = input;
  if (!pool_id) {
    return { success: false, output: { error: 'pool_id is required for get_pool_details' } };
  }

  // Strategy 1: Centrifuge REST API — single pool endpoint
  let poolData: any = null;
  let apiError: string | null = null;

  try {
    poolData = await fetchJson(`${CENTRIFUGE_API_BASE}/pools/${encodeURIComponent(pool_id)}`);
  } catch (err: any) {
    apiError = err.message;
  }

  if (poolData && !poolData.error) {
    return {
      success: true,
      output: {
        source: 'Centrifuge API',
        pool: {
          id: poolData.id ?? poolData.poolId ?? pool_id,
          name: poolData.name ?? poolData.metadata?.name ?? null,
          asset_class: poolData.assetClass ?? poolData.metadata?.assetClass ?? null,
          currency: poolData.currency ?? poolData.poolCurrency?.symbol ?? null,
          nav: poolData.nav ?? poolData.netAssetValue ?? null,
          total_debt: poolData.totalDebt ?? null,
          total_reserve: poolData.totalReserve ?? null,
          senior_tranche: {
            token: 'DROP',
            apy: poolData.seniorInterestRate ?? poolData.DROP?.apy ?? null,
            token_price: poolData.seniorTokenPrice ?? poolData.DROP?.tokenPrice ?? null,
          },
          junior_tranche: {
            token: 'TIN',
            apy: poolData.juniorInterestRate ?? poolData.TIN?.apy ?? null,
            token_price: poolData.juniorTokenPrice ?? poolData.TIN?.tokenPrice ?? null,
          },
          status: poolData.status ?? null,
          originator: poolData.originator ?? poolData.metadata?.originator ?? null,
        },
      },
    };
  }

  // Strategy 2: Centrifuge Ponder GraphQL — query pool by ID
  let subgraphError: string | null = null;
  try {
    const gql = `{
      pool(id: "${pool_id}") {
        id
        isActive
        currency
        decimals
        createdAt
        tokens { items { id tokenPrice } }
      }
    }`;
    const data = await queryCentrifugeGQL(gql);
    if (data?.pool) {
      const p = data.pool;
      const decimals = p.decimals ?? 18;
      const scale = Math.pow(10, decimals);
      const tokens = p.tokens?.items ?? [];
      return {
        success: true,
        output: {
          source: 'Centrifuge GraphQL API',
          pool: {
            id: p.id,
            is_active: p.isActive,
            currency_code: p.currency,
            decimals: p.decimals,
            created_at: p.createdAt ? new Date(Number(p.createdAt)).toISOString() : null,
            token_prices: tokens.map((t: any) => ({
              token_id: t.id,
              price: t.tokenPrice ? (Number(t.tokenPrice) / scale).toFixed(6) : null,
            })),
            app_url: `https://app.centrifuge.io/pools/${p.id}`,
            note: 'Pool name requires IPFS metadata resolution. Visit app_url for full pool details.',
          },
        },
      };
    }
    subgraphError = `Pool "${pool_id}" not found`;
  } catch (err: any) {
    subgraphError = err.message;
  }

  // Both failed
  return {
    success: false,
    output: {
      error: `Could not retrieve details for pool "${pool_id}".`,
      tried: [
        { source: 'Centrifuge REST API', url: `${CENTRIFUGE_API_BASE}/pools/${pool_id}`, error: apiError },
        { source: 'Centrifuge Subgraph', url: CENTRIFUGE_GQL, error: subgraphError },
      ],
      suggestion: [
        `Browse this pool at https://app.centrifuge.io/pools/${pool_id}`,
        'Use get_pools to list available pool IDs.',
      ],
    },
  };
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const CENTRIFUGE_SKILL_METADATA = {
  name: 'Centrifuge',
  description:
    'Centrifuge RWA tokenization — pool list, NAV, TVL, and real-world asset pool details. Bridges off-chain credit to DeFi.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['centrifuge', 'rwa', 'real-world-assets', 'cfg', 'tokenization', 'credit', 'defi', 'clarity-act'],
  external_url: 'https://centrifuge.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/centrifuge?w=48&h=48',
  partner_verified: false,
  status: 'pending',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_protocol_stats', 'get_pools', 'get_pool_details'],
        description:
          'get_protocol_info: Overview of the Centrifuge RWA protocol — how it works, asset classes (invoices, real estate loans, trade finance), senior/junior tranche model, CFG token, and links. ' +
          'get_protocol_stats: Total TVL from DefiLlama, broken down by chain (Ethereum, Centrifuge Chain). ' +
          'get_pools: List of active Centrifuge pools with NAV, outstanding debt, reserve, interest rates, and asset class. Tries the Centrifuge API then falls back to the subgraph. ' +
          'get_pool_details: Detailed stats for a specific pool — debt, reserve, senior/junior token prices, top loans. Requires pool_id.',
      },
      pool_id: {
        type: 'string',
        description:
          'Pool identifier (pool address or slug). Required for get_pool_details. Use get_pools to discover pool IDs.',
      },
    },
  },
};

export async function executeCentrifugeSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
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
