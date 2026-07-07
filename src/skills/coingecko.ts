/**
 * CoinGecko — Comprehensive Crypto Market Data
 *
 * CoinGecko is the largest independent cryptocurrency data aggregator,
 * tracking 10000+ coins across 700+ exchanges. Provides real-time and
 * historical pricing, market caps, volume, trending data, and global stats.
 *
 * [ARSENAL-HOSTED ✓] Uses CoinGecko public API v3 — no API key required.
 * Rate limit: ~30 calls/min on free tier.
 *
 * API base: https://api.coingecko.com/api/v3
 * Docs: https://www.coingecko.com/en/api/documentation
 */

import type { SkillExecutionResult } from '@/types/skill';

const CG_BASE = 'https://api.coingecko.com/api/v3';

const COMMON_IDS: Record<string, string> = {
  btc:  'bitcoin',
  eth:  'ethereum',
  sol:  'solana',
  sui:  'sui',
  usdc: 'usd-coin',
  usdt: 'tether',
  bnb:  'binancecoin',
  xrp:  'ripple',
  ada:  'cardano',
  doge: 'dogecoin',
  dot:  'polkadot',
  matic:'matic-network',
  link: 'chainlink',
  avax: 'avalanche-2',
  atom: 'cosmos',
  uni:  'uniswap',
  aave: 'aave',
  arb:  'arbitrum',
  op:   'optimism',
  near: 'near',
  apt:  'aptos',
  inj:  'injective-protocol',
};

async function cgFetch<T = any>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${CG_BASE}${path}`);
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
    throw new Error(`CoinGecko API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function resolveCoinId(coin: string): string {
  const lower = coin.toLowerCase().trim();
  return COMMON_IDS[lower] || lower;
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return 'N/A';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toExponential(4);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'CoinGecko',
      type: 'Crypto Market Data Aggregator',
      website: 'https://www.coingecko.com',
      docs: 'https://www.coingecko.com/en/api/documentation',
      api_base: CG_BASE,
      description: [
        'CoinGecko is the largest independent cryptocurrency data aggregator, ' +
        'tracking 10000+ coins across 700+ exchanges worldwide.',
        'Provides real-time pricing, historical data, market caps, trading volume, ' +
        'trending coins, and global market statistics.',
        'This skill uses the free public API v3 — no API key required. ' +
        'Rate limited to ~30 requests/minute.',
      ],
      data_quality: [
        'Prices are aggregated from 700+ exchanges and weighted by volume.',
        'Market data includes 24h volume, market cap, and percentage changes.',
        'Trending data is updated every 4 hours based on CoinGecko search activity.',
        'Global stats reflect the total cryptocurrency market.',
      ],
      available_actions: [
        'get_protocol_info — this overview',
        'get_price — current price(s) for one or more coins',
        'get_market_data — full market data for a coin (price, volume, mcap, 24h change)',
        'search_token — search coins by name or symbol, top 5 results',
        'get_global_stats — global crypto market cap, dominance, volume',
        'get_trending — top 7 trending coins on CoinGecko',
      ],
      common_coin_ids: Object.entries(COMMON_IDS)
        .map(([sym, id]) => `${sym} → ${id}`)
        .join(', '),
    },
  };
}

async function actionGetPrice(input: any): Promise<SkillExecutionResult> {
  const raw: string | string[] | undefined = input.coins;
  const vsCurrency: string = input.vs_currency ?? 'usd';

  if (!raw) {
    return {
      success: false,
      error: 'Provide "coins" as a string (e.g. "bitcoin") or array (e.g. ["bitcoin","ethereum"]). ' +
        'You can also use common symbols like "btc", "eth", "sol", "sui".',
    };
  }

  const coinList = Array.isArray(raw) ? raw : [raw];
  if (coinList.length === 0) {
    return { success: false, error: '"coins" must be a non-empty string or array.' };
  }
  if (coinList.length > 50) {
    return { success: false, error: 'Maximum 50 coins per request.' };
  }

  const ids = coinList.map(resolveCoinId).join(',');
  const symbolMap: Record<string, string> = {};
  coinList.forEach((c) => {
    symbolMap[resolveCoinId(c)] = c;
  });

  try {
    const data = await cgFetch<Record<string, Record<string, number>>>(
      '/simple/price',
      { ids, vs_currencies: vsCurrency }
    );

    const prices: Record<string, any> = {};
    for (const [id, currencies] of Object.entries(data)) {
      const price = currencies[vsCurrency];
      prices[id] = {
        price,
        vs_currency: vsCurrency,
        display: price != null ? `${symbolMap[id] || id}: ${formatPrice(price)} ${vsCurrency.toUpperCase()}` : 'N/A',
      };
    }

    const missing = ids.split(',').filter((id) => !data[id]);
    return {
      success: true,
      output: {
        prices,
        fetched_count: Object.keys(prices).length,
        missing_ids: missing.length > 0 ? missing : undefined,
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to fetch prices from CoinGecko' };
  }
}

async function actionGetMarketData(input: any): Promise<SkillExecutionResult> {
  const coin: string | undefined = input.coin_id ?? input.symbol;
  const vsCurrency: string = input.vs_currency ?? 'usd';

  if (!coin) {
    return {
      success: false,
      error: 'Provide "coin_id" (e.g. "bitcoin") or "symbol" (e.g. "btc").',
    };
  }

  const coinId = resolveCoinId(coin);

  try {
    const data = await cgFetch<any[]>(
      '/coins/markets',
      { vs_currency: vsCurrency, ids: coinId, sparkline: 'false' }
    );

    if (!data || data.length === 0) {
      return {
        success: false,
        error: `No market data found for "${coinId}". Try searching first with search_token.`,
      };
    }

    const d = data[0];
    const priceChange24h = d.price_change_percentage_24h;

    return {
      success: true,
      output: {
        id: d.id,
        symbol: d.symbol?.toUpperCase(),
        name: d.name,
        image: d.image,
        current_price: d.current_price,
        market_cap: d.market_cap,
        market_cap_rank: d.market_cap_rank,
        fully_diluted_valuation: d.fully_diluted_valuation,
        total_volume: d.total_volume,
        high_24h: d.high_24h,
        low_24h: d.low_24h,
        price_change_24h: d.price_change_24h,
        price_change_percentage_24h: priceChange24h,
        circulating_supply: d.circulating_supply,
        total_supply: d.total_supply,
        max_supply: d.max_supply,
        ath: d.ath,
        ath_change_percentage: d.ath_change_percentage,
        last_updated: d.last_updated,
        display: [
          `${d.name} (${d.symbol?.toUpperCase()}) #${d.market_cap_rank}`,
          `Price: ${formatPrice(d.current_price)} ${vsCurrency.toUpperCase()}`,
          `24h: ${priceChange24h != null ? priceChange24h.toFixed(2) + '%' : 'N/A'}`,
          `MCap: ${formatUsd(d.market_cap)} | Vol: ${formatUsd(d.total_volume)}`,
        ].join(' | '),
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to fetch market data from CoinGecko' };
  }
}

async function actionSearchToken(input: any): Promise<SkillExecutionResult> {
  const query: string | undefined = input.query;
  if (!query || query.trim().length === 0) {
    return { success: false, error: 'Provide "query" with a coin name or symbol to search.' };
  }

  try {
    const data = await cgFetch<{ coins?: any[] }>('/search', { query: query.trim() });
    const coins = (data.coins ?? []).slice(0, 5);

    if (coins.length === 0) {
      return { success: false, error: `No coins found matching "${query}".` };
    }

    const results = coins.map((c: any) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      market_cap_rank: c.market_cap_rank,
      thumb: c.thumb,
      display: `${c.name} (${c.symbol}) — id: ${c.id}${c.market_cap_rank ? ` | Rank #${c.market_cap_rank}` : ''}`,
    }));

    return {
      success: true,
      output: {
        query,
        results,
        count: results.length,
        hint: 'Use the "id" field in get_price or get_market_data actions.',
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to search CoinGecko' };
  }
}

async function actionGetGlobalStats(): Promise<SkillExecutionResult> {
  try {
    const data = await cgFetch<{ data: any }>('/global');
    const g = data.data;

    return {
      success: true,
      output: {
        active_cryptocurrencies: g.active_cryptocurrencies,
        markets: g.markets,
        total_market_cap: g.total_market_cap,
        total_volume: g.total_volume,
        market_cap_percentage: g.market_cap_percentage,
        market_cap_change_percentage_24h_usd: g.market_cap_change_percentage_24h_usd,
        updated_at: g.updated_at,
        display: [
          `Active coins: ${g.active_cryptocurrencies} | Markets: ${g.markets}`,
          `Total MCap: ${formatUsd(g.total_market_cap?.usd)}`,
          `BTC dominance: ${(g.market_cap_percentage?.btc ?? 0).toFixed(1)}%`,
          `ETH dominance: ${(g.market_cap_percentage?.eth ?? 0).toFixed(1)}%`,
          `24h MCap change: ${(g.market_cap_change_percentage_24h_usd ?? 0).toFixed(2)}%`,
        ].join(' | '),
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to fetch global stats from CoinGecko' };
  }
}

async function actionGetTrending(): Promise<SkillExecutionResult> {
  try {
    const data = await cgFetch<{ coins: any[] }>('/search/trending');
    const coins = (data.coins ?? []).slice(0, 7);

    const results = coins.map((entry: any, i: number) => {
      const c = entry.item;
      return {
        rank: i + 1,
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        market_cap_rank: c.market_cap_rank,
        price_btc: c.price_btc,
        score: c.score,
        display: `#${i + 1} ${c.name} (${c.symbol}) — MCap Rank: ${c.market_cap_rank ?? 'N/A'}`,
      };
    });

    return {
      success: true,
      output: {
        trending: results,
        count: results.length,
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to fetch trending coins from CoinGecko' };
  }
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const COINGECKO_SKILL_METADATA = {
  name: 'CoinGecko',
  description:
    '[ARSENAL-HOSTED ✓] Comprehensive crypto market data via CoinGecko API. ' +
    'Get real-time prices, market data (volume, market cap, 24h change), search tokens, ' +
    'global market stats, and trending coins. No API key required. Free tier: ~30 calls/min.',
  category: 'Data & Oracles',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['coingecko', 'price', 'market-data', 'crypto', 'trending', 'data', 'oracle'],
  external_url: 'https://www.coingecko.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/coingecko?w=48&h=48',
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
          'get_price',
          'get_market_data',
          'search_token',
          'get_global_stats',
          'get_trending',
        ],
        description:
          'get_protocol_info: CoinGecko overview and data quality notes. ' +
          'get_price: Current price(s) for one or more coins (requires coins). ' +
          'get_market_data: Full market data for a coin — price, volume, mcap, 24h change (requires coin_id or symbol). ' +
          'search_token: Search coins by name/symbol, returns top 5 (requires query). ' +
          'get_global_stats: Global crypto market cap, dominance, volume. ' +
          'get_trending: Top 7 trending coins on CoinGecko.',
      },
      coins: {
        type: 'string',
        description:
          'Coin ID(s) for get_price. Accepts a single string "bitcoin" or array ["bitcoin","ethereum"]. ' +
          'Common symbols like "btc", "eth", "sol", "sui" are auto-resolved to CoinGecko IDs.',
      },
      coin_id: {
        type: 'string',
        description:
          'CoinGecko coin ID for get_market_data, e.g. "bitcoin", "ethereum", "solana". ' +
          'Alternatively use "symbol" and it will be auto-resolved.',
      },
      symbol: {
        type: 'string',
        description:
          'Shorthand symbol for get_market_data, e.g. "btc", "eth", "sol". ' +
          'Auto-resolved to CoinGecko coin ID. Ignored if coin_id is provided.',
      },
      vs_currency: {
        type: 'string',
        description:
          'Target currency for price denomination. Default: "usd". Examples: "eur", "btc", "eth".',
      },
      query: {
        type: 'string',
        description:
          'Search query for search_token action. Can be a coin name ("bitcoin") or symbol ("btc").',
      },
    },
  },
  usage_examples: [
    {
      title: 'BTC price',
      input: { action: 'get_price', coins: 'btc' },
    },
    {
      title: 'Multiple prices',
      input: { action: 'get_price', coins: ['btc', 'eth', 'sol', 'sui'] },
    },
    {
      title: 'Full market data for Ethereum',
      input: { action: 'get_market_data', coin_id: 'ethereum' },
    },
    {
      title: 'Search for a token',
      input: { action: 'search_token', query: 'chainlink' },
    },
    {
      title: 'Global market stats',
      input: { action: 'get_global_stats' },
    },
    {
      title: 'Trending coins',
      input: { action: 'get_trending' },
    },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeCoinGeckoSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return actionGetProtocolInfo();
      case 'get_price':         return actionGetPrice(input);
      case 'get_market_data':   return actionGetMarketData(input);
      case 'search_token':      return actionSearchToken(input);
      case 'get_global_stats':  return actionGetGlobalStats();
      case 'get_trending':      return actionGetTrending();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_price, get_market_data, search_token, get_global_stats, get_trending`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'CoinGecko skill unexpected error' };
  }
}
