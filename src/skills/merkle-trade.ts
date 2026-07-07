/**
 * Merkle Trade — Perpetuals DEX on Aptos
 *
 * Merkle Trade is a decentralised perpetual-futures exchange on Aptos offering
 * high leverage across crypto, forex, and commodity pairs. Trades settle against
 * a shared liquidity vault (house LP); prices come from Pyth / Stork oracles.
 *
 * Data is sourced from:
 *   1. Merkle public API — trading summary / pair stats when it responds
 *      (https://api.merkle.trade — often behind Cloudflare; treated as best-effort)
 *   2. Aptos fullnode    — the on-chain list of tradable pairs (pair_types module)
 *   3. DeFiLlama         — protocol TVL / market cap
 *
 * Trading package: 0x5ae6789dd2fec1a9ec9cccfb3acaf12e93d432f0a3a42c92fe1a9d490b7bbc06
 * Docs:            https://docs.merkle.trade
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Constants ────────────────────────────────────────────────────────────────

const APTOS_NODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const MERKLE_API = 'https://api.merkle.trade';
const LLAMA_BASE = 'https://api.llama.fi';
const DEFILLAMA_SLUG = 'merkle-trade';

/** Merkle trading package address (Aptos mainnet) */
const MERKLE_ADDR = '0x5ae6789dd2fec1a9ec9cccfb3acaf12e93d432f0a3a42c92fe1a9d490b7bbc06';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function merkleFetch<T = any>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${MERKLE_API}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function llamaFetch<T = any>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${LLAMA_BASE}${path}`, {
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

/**
 * Fetch the on-chain list of tradable pairs from the pair_types module.
 * Each struct in the module is a phantom type for one perp market (e.g. BTC_USD).
 * This is region-safe and does not depend on the Merkle API.
 */
async function fetchOnchainPairs(): Promise<string[]> {
  const res = await fetch(`${APTOS_NODE}/accounts/${MERKLE_ADDR}/module/pair_types`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const mod: any = await res.json();
  const structs: any[] = mod?.abi?.structs ?? [];
  return structs.map((s) => s.name).filter(Boolean);
}

function prettyPair(name: string): { pair: string; base: string; quote: string } {
  // pair_types structs are like "BTC_USD" or "USD_JPY"
  const [a, b] = name.split('_');
  return { pair: `${a}/${b}`, base: a, quote: b };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  const llama = await llamaFetch<any>(`/protocol/${DEFILLAMA_SLUG}`);
  const tvlUsd: number | null = llama?.currentChainTvls?.Aptos ?? llama?.tvl ?? null;
  const mcapUsd: number | null = typeof llama?.mcap === 'number' ? llama.mcap : null;

  return {
    success: true,
    output: {
      name: 'Merkle Trade',
      type: 'Perpetuals DEX (Aptos)',
      chain: 'Aptos',
      website: 'https://merkle.trade',
      docs: 'https://docs.merkle.trade',
      package: MERKLE_ADDR,
      tvl_usd: tvlUsd,
      mkl_mcap_usd: mcapUsd,
      tvl_display: tvlUsd != null ? `Vault TVL: ${formatUsd(tvlUsd)}` : 'Vault TVL: unavailable',
      description: [
        'Merkle Trade is a decentralised perpetual-futures exchange on Aptos.',
        'It offers high leverage across crypto, forex, and commodity pairs, settling',
        'trades against a shared liquidity vault (house LP) rather than an order book.',
        'Prices are sourced from Pyth / Stork oracles. MKL is the protocol token.',
      ],
      available_actions: [
        'get_protocol_info — this overview with TVL',
        'get_pairs — all tradable perp pairs (from on-chain pair_types)',
        'get_markets — alias of get_pairs',
        'get_stats — protocol TVL / market-cap stats',
      ],
    },
  };
}

async function actionGetPairs(): Promise<SkillExecutionResult> {
  // Best-effort: try the Merkle API first for live funding/price
  const api = await merkleFetch<any>('/v1/summary');
  const apiPairs: any[] | null = Array.isArray(api?.pairs)
    ? api.pairs
    : Array.isArray(api?.data)
      ? api.data
      : null;

  if (apiPairs?.length) {
    return {
      success: true,
      output: {
        pairs: apiPairs.map((p: any) => ({
          pair: p.pair ?? p.symbol ?? p.name,
          price: p.price ?? p.markPrice ?? null,
          funding_rate: p.fundingRate ?? p.funding ?? null,
          open_interest: p.openInterest ?? p.oi ?? null,
          max_leverage: p.maxLeverage ?? null,
        })),
        count: apiPairs.length,
        data_sources: ['Merkle API (live)'],
      },
    };
  }

  // Fallback: on-chain pair list (region-safe, no API dependency)
  try {
    const names = await fetchOnchainPairs();
    if (!names.length) {
      return {
        success: false,
        error:
          'Merkle API unavailable and no on-chain pairs returned. The public API (api.merkle.trade) ' +
          'is currently unreachable; try again later.',
      };
    }
    const pairs = names.map(prettyPair).sort((a, b) => a.pair.localeCompare(b.pair));
    return {
      success: true,
      output: {
        pairs,
        count: pairs.length,
        note: 'Live price/funding unavailable (Merkle public API unreachable). Pair list read on-chain from pair_types.',
        data_sources: ['Aptos fullnode (pair_types module)'],
      },
    };
  } catch (err: any) {
    return { success: false, error: `Failed to read Merkle pairs: ${err.message}` };
  }
}

async function actionGetStats(): Promise<SkillExecutionResult> {
  const llama = await llamaFetch<any>(`/protocol/${DEFILLAMA_SLUG}`);
  const tvlUsd: number | null = llama?.currentChainTvls?.Aptos ?? llama?.tvl ?? null;
  const mcapUsd: number | null = typeof llama?.mcap === 'number' ? llama.mcap : null;

  // Best-effort live summary
  const api = await merkleFetch<any>('/v1/summary');

  return {
    success: true,
    output: {
      protocol: 'Merkle Trade',
      chain: 'Aptos',
      vault_tvl_usd: tvlUsd,
      mkl_mcap_usd: mcapUsd,
      volume_24h_usd: api?.volume24h ?? api?.total24h ?? null,
      open_interest_usd: api?.openInterest ?? null,
      display: [
        tvlUsd != null ? `Vault TVL ${formatUsd(tvlUsd)}` : 'Vault TVL n/a',
        mcapUsd != null ? `MKL mcap ${formatUsd(mcapUsd)}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      data_sources: api
        ? ['DeFiLlama (TVL/mcap)', 'Merkle API (volume/OI)']
        : ['DeFiLlama (TVL/mcap)'],
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const MERKLE_TRADE_SKILL_METADATA = {
  name: 'Merkle Trade',
  description:
    '[ARSENAL-HOSTED ✓] Perpetuals DEX on Aptos with high-leverage crypto, forex, and commodity ' +
    'pairs. Get the protocol overview, all tradable perp pairs (read on-chain from pair_types), and ' +
    'TVL / market-cap stats. Data from Aptos fullnode + DeFiLlama, with best-effort Merkle API.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['merkle', 'merkle-trade', 'aptos', 'perps', 'perpetuals', 'derivatives', 'dex', 'defi'],
  external_url: 'https://merkle.trade',
  logo_url: 'https://icons.llamao.fi/icons/protocols/merkle-trade?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_pairs', 'get_markets', 'get_stats'],
        description:
          'get_protocol_info: Merkle Trade overview and vault TVL. ' +
          'get_pairs: All tradable perp pairs (on-chain pair_types; live price/funding when the Merkle API responds). ' +
          'get_markets: Alias of get_pairs. ' +
          'get_stats: Protocol TVL, MKL market cap, and volume/OI when available.',
      },
    },
  },
  usage_examples: [
    { title: 'Merkle overview', input: { action: 'get_protocol_info' } },
    { title: 'All perp pairs', input: { action: 'get_pairs' } },
    { title: 'Protocol stats', input: { action: 'get_stats' } },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeMerkleTradeSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return actionGetProtocolInfo();
      case 'get_pairs':
      case 'get_markets': return actionGetPairs();
      case 'get_stats': return actionGetStats();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_pairs, get_markets, get_stats`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Merkle Trade skill unexpected error' };
  }
}
