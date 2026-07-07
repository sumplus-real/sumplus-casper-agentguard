/**
 * Echelon Market — Lending Money Market on Aptos
 *
 * Echelon is a decentralised lending protocol ("money market") on Aptos where
 * users supply assets to earn interest and borrow against collateral. It supports
 * both Coin and Fungible-Asset (FA) markets, isolated pools, and e-mode.
 *
 * Data is sourced from:
 *   1. Echelon public API — live per-asset supply/borrow APR, price, caps, LTV
 *      (https://app.echelon.market/api/markets?network=aptos_mainnet)
 *   2. DeFiLlama          — protocol TVL + yields fallback (project == "echelon-market")
 *
 * Contract: 0xfc087a394c203d62c43eecfeba79db01441d39dd9d234131b78415626a26750e
 * Docs:     https://docs.echelon.market
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Constants ────────────────────────────────────────────────────────────────

const ECHELON_API = 'https://app.echelon.market/api/markets?network=aptos_mainnet';
const LLAMA_BASE = 'https://api.llama.fi';
const YIELDS_BASE = 'https://yields.llama.fi';
const DEFILLAMA_SLUG = 'echelon-market';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function echelonFetch<T = any>(): Promise<T | null> {
  try {
    const res = await fetch(ECHELON_API, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function llamaFetch<T = any>(base: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function formatUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function pct(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(v * 1e6) / 1e4; // fraction → percent, 4 dp
}

/**
 * Build normalized markets from the Echelon API payload.
 * marketStats is a list of [assetAddress, {totalShares,totalLiability,totalReserve,totalCash}].
 */
function normalizeEchelonMarkets(data: any): any[] {
  const assets: any[] = data?.data?.assets ?? [];
  const statsList: any[] = data?.data?.marketStats ?? [];
  const statsByAddr = new Map<string, any>();
  for (const entry of statsList) {
    if (Array.isArray(entry) && entry.length === 2) statsByAddr.set(entry[0], entry[1]);
  }

  return assets.map((a: any) => {
    const stats = statsByAddr.get(a.address) ?? {};
    const price = Number(a.price ?? 0);
    const totalCash = Number(stats.totalCash ?? 0);
    const totalBorrowed = Number(stats.totalLiability ?? 0);
    const totalSupplied = totalCash + totalBorrowed;
    return {
      asset: a.symbol,
      name: a.name,
      coin_type: a.address,
      is_fa_market: a.isFaMarket ?? false,
      decimals: a.decimals,
      price_usd: price,
      supply_apy_pct: pct(a.supplyApr),
      borrow_apy_pct: pct(a.borrowApr),
      ltv_pct: pct(a.ltv),
      liquidation_threshold_pct: pct(a.lt),
      total_supplied: totalSupplied,
      total_borrowed: totalBorrowed,
      total_supplied_usd: totalSupplied * price,
      total_borrowed_usd: totalBorrowed * price,
      supply_cap: a.supplyCap ?? null,
      borrow_cap: a.borrowCap ?? null,
      market: a.market,
      display: `${a.symbol}: Supply ${(pct(a.supplyApr) ?? 0).toFixed(4)}% | Borrow ${(pct(a.borrowApr) ?? 0).toFixed(4)}% | Supplied ${formatUsd(totalSupplied * price)} | LTV ${(pct(a.ltv) ?? 0).toFixed(2)}%`,
    };
  });
}

// DeFiLlama yields fallback (project == echelon-market on Aptos)
async function llamaMarkets(): Promise<any[]> {
  const yields = await llamaFetch<{ data: any[] }>(YIELDS_BASE, '/pools');
  if (!yields?.data) return [];
  return yields.data
    .filter((p: any) => p.project === DEFILLAMA_SLUG && p.chain === 'Aptos')
    .map((p: any) => ({
      asset: p.symbol,
      supply_apy_pct: p.apy ?? p.apyBase ?? null,
      total_supplied_usd: p.tvlUsd ?? null,
      display: `${p.symbol}: APY ${(p.apy ?? 0).toFixed(4)}% | TVL ${formatUsd(p.tvlUsd ?? 0)}`,
    }));
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  const llama = await llamaFetch<any>(LLAMA_BASE, `/protocol/${DEFILLAMA_SLUG}`);
  const tvlUsd: number | null = llama?.currentChainTvls?.Aptos ?? llama?.tvl ?? null;
  const borrowedUsd: number | null = llama?.currentChainTvls?.['Aptos-borrowed'] ?? null;

  return {
    success: true,
    output: {
      name: 'Echelon Market',
      type: 'Lending / Money Market (Aptos)',
      chain: 'Aptos',
      website: 'https://app.echelon.market',
      docs: 'https://docs.echelon.market',
      tvl_usd: tvlUsd,
      borrowed_usd: borrowedUsd,
      tvl_display: tvlUsd != null ? `TVL: ${formatUsd(tvlUsd)}` : 'TVL: unavailable',
      description: [
        'Echelon Market is a decentralised lending protocol (money market) on Aptos.',
        'Users supply assets to earn interest and borrow against their collateral at',
        'variable rates. It supports both Coin and Fungible-Asset markets, isolated',
        'pools for long-tail assets, and e-mode for correlated collateral.',
      ],
      available_actions: [
        'get_protocol_info — this overview with TVL',
        'get_markets — all lending markets: supply/borrow APY, price, LTV, TVL per asset',
        'get_market — detail for a single asset (requires asset symbol)',
      ],
    },
  };
}

async function actionGetMarkets(): Promise<SkillExecutionResult> {
  const data = await echelonFetch<any>();
  if (data?.data?.assets?.length) {
    const markets = normalizeEchelonMarkets(data);
    return {
      success: true,
      output: {
        markets,
        count: markets.length,
        data_sources: ['Echelon API (live on-chain markets)'],
      },
    };
  }

  // Fallback to DeFiLlama yields
  const fallback = await llamaMarkets();
  if (fallback.length) {
    return {
      success: true,
      output: {
        markets: fallback,
        count: fallback.length,
        data_sources: ['DeFiLlama yields (fallback — Echelon API unavailable)'],
      },
    };
  }

  return { success: false, error: 'Failed to fetch Echelon markets from both Echelon API and DeFiLlama.' };
}

async function actionGetMarket(input: Record<string, any>): Promise<SkillExecutionResult> {
  const rawAsset: string | undefined = input.asset;
  if (!rawAsset) {
    return { success: false, error: 'Provide "asset" as a market symbol (e.g. "USDC", "APT", "zUSDT").' };
  }

  const data = await echelonFetch<any>();
  if (!data?.data?.assets?.length) {
    return { success: false, error: 'Echelon API unavailable — cannot fetch single-market detail.' };
  }

  const markets = normalizeEchelonMarkets(data);
  const target = rawAsset.toLowerCase();
  const market =
    markets.find((m) => (m.asset ?? '').toLowerCase() === target) ??
    markets.find((m) => (m.asset ?? '').toLowerCase().includes(target));

  if (!market) {
    return {
      success: false,
      error: `No Echelon market found for "${rawAsset}". Available: ${markets.map((m) => m.asset).join(', ')}`,
    };
  }

  return { success: true, output: market };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const ECHELON_SKILL_METADATA = {
  name: 'Echelon Market',
  description:
    '[ARSENAL-HOSTED ✓] Lending money market on Aptos. Supply assets to earn interest and borrow ' +
    'against collateral. Get protocol TVL, all lending markets (supply/borrow APY, price, LTV, TVL ' +
    'per asset), and per-asset detail. Data from the Echelon API + DeFiLlama.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['echelon', 'aptos', 'lending', 'borrowing', 'money-market', 'defi', 'apt', 'usdc'],
  external_url: 'https://app.echelon.market',
  logo_url: 'https://icons.llamao.fi/icons/protocols/echelon-market?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_markets', 'get_market'],
        description:
          'get_protocol_info: Echelon overview and TVL. ' +
          'get_markets: All lending markets — supply APY, borrow APY, price, LTV, total supplied/borrowed per asset. ' +
          'get_market: Full detail for one asset market (requires asset symbol).',
      },
      asset: {
        type: 'string',
        description: 'Market asset symbol for get_market, e.g. "USDC", "APT", "zUSDT".',
      },
    },
  },
  usage_examples: [
    { title: 'Echelon overview', input: { action: 'get_protocol_info' } },
    { title: 'All lending markets', input: { action: 'get_markets' } },
    { title: 'APT market detail', input: { action: 'get_market', asset: 'APT' } },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeEchelonSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return actionGetProtocolInfo();
      case 'get_markets': return actionGetMarkets();
      case 'get_market': return actionGetMarket(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_markets, get_market`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Echelon skill unexpected error' };
  }
}
