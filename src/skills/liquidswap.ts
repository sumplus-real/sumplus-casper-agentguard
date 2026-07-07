/**
 * Liquidswap — Aptos DEX by Pontem Network
 *
 * Liquidswap is the largest AMM DEX on Aptos, supporting both uncorrelated (v0)
 * and stable (v0.5) curve pools. It provides liquidity pools, swaps, and farming.
 *
 * API: https://api.liquidswap.com
 * Aptos fullnode: https://fullnode.mainnet.aptoslabs.com/v1
 * Docs: https://docs.liquidswap.com
 */

import type { SkillExecutionResult } from '@/types/skill';

const APTOS_FULLNODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const LIQUIDSWAP_API = 'https://api.liquidswap.com';
const DEFILLAMA_SLUG = 'liquidswap';

// Liquidswap package addresses (Aptos mainnet)
const LIQUIDSWAP_PACKAGE = '0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12';
const LIQUIDSWAP_V05_PACKAGE = '0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e';
const ROUTER_ADDR = '0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12';

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

async function lsFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`${LIQUIDSWAP_API}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Liquidswap API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Region-safe fallback: top Liquidswap pools from DeFiLlama yields
 * (project == "liquidswap", chain == "Aptos"). Used when api.liquidswap.com
 * is unavailable (503 / timeout).
 */
async function fetchLlamaTopPools(): Promise<any[]> {
  try {
    const res = await fetch('https://yields.llama.fi/pools', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    return (json?.data ?? [])
      .filter((p: any) => p.project === DEFILLAMA_SLUG && p.chain === 'Aptos')
      .sort((a: any, b: any) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .slice(0, 10)
      .map((p: any) => ({
        pool_id: p.pool,
        pair: p.symbol,
        tvl_usd: p.tvlUsd,
        apy_pct: p.apy,
        volume_24h_usd: p.volumeUsd1d ?? null,
      }));
  } catch {
    return [];
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  const llamaRes = await fetch(`https://api.llama.fi/protocol/${DEFILLAMA_SLUG}`, {
    signal: AbortSignal.timeout(10_000),
  }).then(r => r.json()).catch(() => null);

  // /protocol/{slug}.tvl is a historical array — use current chain TVL for a scalar
  const tvlUsd: number | null =
    llamaRes?.currentChainTvls?.Aptos ??
    (Array.isArray(llamaRes?.tvl) ? llamaRes.tvl.at(-1)?.totalLiquidityUSD ?? null : llamaRes?.tvl ?? null);

  return {
    success: true,
    output: {
      name: 'Liquidswap',
      developer: 'Pontem Network',
      type: 'AMM DEX',
      chain: 'Aptos',
      website: 'https://liquidswap.com',
      docs: 'https://docs.liquidswap.com',
      tvl_usd: tvlUsd,
      description: [
        'Liquidswap is the first and largest AMM DEX on Aptos, built by Pontem Network.',
        'It supports two curve types: uncorrelated (v0, for volatile pairs like APT/USDC) and stable (v0.5, for pegged assets like USDC/USDT).',
        'Liquidity providers earn trading fees; liquidity can be farmed for additional PONT rewards.',
      ],
      pool_types: {
        v0_uncorrelated: { description: 'Standard xy=k curve for volatile asset pairs', package: LIQUIDSWAP_PACKAGE },
        v05_stable: { description: 'StableSwap curve for correlated pairs (stablecoins)', package: LIQUIDSWAP_V05_PACKAGE },
      },
      available_actions: [
        'get_protocol_info — this overview with TVL',
        'get_pool_info — pool reserves and fee for a token pair',
        'get_top_pools — top pools by liquidity',
        'get_quote — estimate swap output for a given input amount',
      ],
    },
  };
}

async function actionGetPoolInfo(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { token_x, token_y, curve = 'uncorrelated' } = input;
  if (!token_x || !token_y) {
    return { success: false, output: { error: 'token_x and token_y are required (Aptos Move type strings)' } };
  }

  try {
    // Standard APT addresses
    const resolvedX = token_x === 'APT' ? '0x1::aptos_coin::AptosCoin' : token_x;
    const resolvedY = token_y === 'USDC'
      ? '0xf22bede237a07cbe7d9c5d10d204bad76cde8d2e6c6df1f7f97a38fc85fd24df::asset::USDC'
      : token_y;
    const curveType = curve === 'stable'
      ? `${LIQUIDSWAP_V05_PACKAGE}::curves::Stable`
      : `${LIQUIDSWAP_PACKAGE}::curves::Uncorrelated`;

    const [reserves] = await aptosView<any[]>(
      `${ROUTER_ADDR}::router::get_reserves_size`,
      [resolvedX, resolvedY, curveType],
      []
    );

    return {
      success: true,
      output: {
        token_x: resolvedX,
        token_y: resolvedY,
        curve,
        reserve_x: reserves?.[0] ?? null,
        reserve_y: reserves?.[1] ?? null,
      },
    };
  } catch (err: any) {
    // Fallback: try the REST API
    try {
      const pools = await lsFetch<any[]>('/pools');
      const match = pools?.find((p: any) =>
        (p.coinX?.includes(token_x) || p.coinY?.includes(token_x)) &&
        (p.coinX?.includes(token_y) || p.coinY?.includes(token_y))
      );
      if (match) return { success: true, output: match };
    } catch (_) {}
    return { success: false, output: { error: err.message, hint: 'Use full Move type strings like 0x1::aptos_coin::AptosCoin' } };
  }
}

async function actionGetTopPools(): Promise<SkillExecutionResult> {
  // Primary: Liquidswap REST API
  try {
    const pools = await lsFetch<any[]>('/pools');
    if (Array.isArray(pools) && pools.length > 0) {
      const top = pools
        .sort((a: any, b: any) => (b.tvlUSD ?? b.tvl ?? 0) - (a.tvlUSD ?? a.tvl ?? 0))
        .slice(0, 10)
        .map((p: any) => ({
          pool_id: p.id ?? p.poolId,
          token_x: p.coinXSymbol ?? p.coinX,
          token_y: p.coinYSymbol ?? p.coinY,
          curve: p.curve ?? p.poolType,
          tvl_usd: p.tvlUSD ?? p.tvl,
          volume_24h_usd: p.volume24h,
          fee: p.fee,
        }));
      return { success: true, output: { pools: top, data_source: 'Liquidswap API' } };
    }
  } catch (_) {
    // fall through to DeFiLlama fallback
  }

  // Fallback: DeFiLlama yields (region-safe) when api.liquidswap.com is 503/down
  const fallback = await fetchLlamaTopPools();
  if (fallback.length > 0) {
    return {
      success: true,
      output: {
        pools: fallback,
        data_source: 'DeFiLlama yields (fallback — Liquidswap API unavailable)',
      },
    };
  }

  return { success: false, output: { error: 'Failed to fetch top pools from both Liquidswap API and DeFiLlama.' } };
}

async function actionGetQuote(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { token_in, token_out, amount_in } = input;
  if (!token_in || !token_out || !amount_in) {
    return { success: false, output: { error: 'token_in, token_out, and amount_in are required' } };
  }

  try {
    // Try Liquidswap quote API
    const quote = await lsFetch<any>(
      `/quote?coinIn=${encodeURIComponent(token_in)}&coinOut=${encodeURIComponent(token_out)}&amountIn=${amount_in}`
    );
    return {
      success: true,
      output: {
        token_in,
        token_out,
        amount_in,
        amount_out: quote?.amountOut ?? quote?.outputAmount,
        price_impact_pct: quote?.priceImpact,
        route: quote?.route,
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message, hint: 'Use full Move type strings for tokens' } };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const LIQUIDSWAP_SKILL_METADATA = {
  name: 'Liquidswap',
  description: 'Largest AMM DEX on Aptos by Pontem Network. Get pool info, swap quotes, and top pools for APT and Aptos ecosystem tokens.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['liquidswap', 'aptos', 'dex', 'amm', 'swap', 'pontem', 'defi'],
  external_url: 'https://liquidswap.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/liquidswap?w=48&h=48',
  partner_verified: false,
  status: 'pending',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_pool_info', 'get_top_pools', 'get_quote'],
        description:
          'get_protocol_info: Overview of Liquidswap DEX, TVL, and pool types (uncorrelated v0, stable v0.5). ' +
          'get_pool_info: Pool reserves for a token pair (requires token_x, token_y as Move type strings; curve optional). ' +
          'get_top_pools: Top 10 pools by TVL with trading volume. ' +
          'get_quote: Estimate swap output (requires token_in, token_out as Move type strings, amount_in in base units).',
      },
      token_x: {
        type: 'string',
        description: 'First token as Aptos Move type (e.g. "0x1::aptos_coin::AptosCoin" or "APT"). For get_pool_info.',
      },
      token_y: {
        type: 'string',
        description: 'Second token as Aptos Move type. For get_pool_info.',
      },
      curve: {
        type: 'string',
        enum: ['uncorrelated', 'stable'],
        description: 'Pool curve type. "uncorrelated" (default) for volatile pairs, "stable" for stablecoins.',
      },
      token_in: {
        type: 'string',
        description: 'Input token Move type for get_quote.',
      },
      token_out: {
        type: 'string',
        description: 'Output token Move type for get_quote.',
      },
      amount_in: {
        type: 'string',
        description: 'Input amount in base units (e.g. "100000000" for 1 APT at 8 decimals). For get_quote.',
      },
    },
  },
  usage_examples: [
    { title: 'Protocol overview with TVL', input: { action: 'get_protocol_info' } },
    { title: 'Top pools by liquidity', input: { action: 'get_top_pools' } },
    { title: 'APT/USDC pool info', input: { action: 'get_pool_info', token_x: 'APT', token_y: 'USDC' } },
    { title: 'Quote 1 APT → USDC', input: { action: 'get_quote', token_in: '0x1::aptos_coin::AptosCoin', token_out: '0xf22bede237a07cbe7d9c5d10d204bad76cde8d2e6c6df1f7f97a38fc85fd24df::asset::USDC', amount_in: '100000000' } },
  ],
};

export async function executeLiquidswapSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info': return actionGetProtocolInfo();
    case 'get_pool_info': return actionGetPoolInfo(input);
    case 'get_top_pools': return actionGetTopPools();
    case 'get_quote': return actionGetQuote(input);
    default:
      return { success: false, output: { error: `Unknown action: ${input.action}. Available: get_protocol_info, get_pool_info, get_top_pools, get_quote` } };
  }
}
