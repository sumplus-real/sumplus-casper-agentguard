/**
 * Polymarket — Prediction Market Data & Account Queries
 *
 * Polymarket is the world's largest prediction market platform.
 * Users trade on real-world event outcomes (politics, sports, crypto, etc.)
 * using USDC on Polygon.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * APIs used:
 *   Gamma API:  https://gamma-api.polymarket.com  (market discovery)
 *   CLOB API:   https://clob.polymarket.com       (orderbook, prices)
 *   Data API:   https://data-api.polymarket.com   (trades, positions)
 */

import type { SkillExecutionResult } from '@/types/skill';

export const POLYMARKET_SKILL_METADATA = {
  name: 'Polymarket Prediction Markets',
  description:
    '[ARSENAL-HOSTED ✓] Real-time data for Polymarket — the world\'s largest prediction market. ' +
    'Search live markets, get current prices (Yes/No probabilities), order books, price history, ' +
    'recent trades, and user positions. No API key required.\n\n' +
    'execution_mode: server-side\n' +
    'sop_compliance:\n' +
    '  provides_quote: false\n' +
    '  returns_price_impact: false\n' +
    '  uses_authoritative_contracts: true\n' +
    '  read_only: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['polymarket', 'prediction-market', 'betting', 'events', 'politics', 'sports', 'crypto', 'probability', 'polygon', 'usdc'],
  external_url: 'https://polymarket.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/polymarket?w=48&h=48',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'search_markets',
          'get_market',
          'get_orderbook',
          'get_price_history',
          'get_market_trades',
          'get_user_positions',
          'get_user_trades',
        ],
        description:
          'Action to perform. ' +
          'search_markets: browse/search live prediction markets. ' +
          'get_market: detailed info for a specific market (by slug or condition_id). ' +
          'get_orderbook: Yes/No order book (requires token_id or slug). ' +
          'get_price_history: historical probability chart (requires token_id or slug). ' +
          'get_market_trades: recent trades for a market (requires condition_id). ' +
          'get_user_positions: a user\'s current holdings (requires address). ' +
          'get_user_trades: a user\'s trade history (requires address).',
      },
      slug: {
        type: 'string',
        description: 'Market slug from Polymarket URL (e.g. "will-bitcoin-hit-100k-in-2025"). Used by get_market, get_orderbook, get_price_history.',
      },
      condition_id: {
        type: 'string',
        description: 'Market condition ID (0x hex string). Used by get_market, get_market_trades.',
      },
      token_id: {
        type: 'string',
        description: 'CLOB token ID for a specific outcome (Yes or No). Used by get_orderbook, get_price_history. Find it via get_market.',
      },
      address: {
        type: 'string',
        description: 'User EVM wallet address (0x...). Required for get_user_positions and get_user_trades.',
      },
      keyword: {
        type: 'string',
        description: 'Search keyword for search_markets (e.g. "bitcoin", "US election", "Trump").',
      },
      category: {
        type: 'string',
        description: 'Category filter for search_markets (e.g. "crypto", "politics", "sports").',
      },
      sort_by: {
        type: 'string',
        enum: ['volume_24hr', 'liquidity', 'newest', 'ending_soon'],
        description: 'Sort order for search_markets (default: volume_24hr).',
      },
      interval: {
        type: 'string',
        enum: ['1d', '1w', '1m', '3m', '6m', '1y', 'all'],
        description: 'Time interval for get_price_history (default: 1w).',
      },
      outcome: {
        type: 'string',
        enum: ['yes', 'no'],
        description: 'Which outcome token to use for get_orderbook and get_price_history when providing a slug (default: yes).',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default: 20, max: 100).',
      },
    },
  },
};

// ─── API helpers ──────────────────────────────────────────────────────────────

const GAMMA = 'https://gamma-api.polymarket.com';
const CLOB  = 'https://clob.polymarket.com';
const DATA  = 'https://data-api.polymarket.com';

async function get(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Polymarket API ${res.status} for ${url}: ${text}`);
  }
  return res.json();
}

/** Fetch a market's clobTokenIds by slug (from Gamma). Returns [yesTokenId, noTokenId]. */
async function getTokenIdsBySlug(slug: string): Promise<[string, string]> {
  const markets = await get(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}&limit=1`);
  const market = Array.isArray(markets) ? markets[0] : markets;
  if (!market) throw new Error(`No market found for slug: ${slug}`);
  const tokenIds = JSON.parse(market.clobTokenIds || '[]');
  if (!tokenIds[0]) throw new Error(`Market "${slug}" has no CLOB token IDs`);
  return [tokenIds[0], tokenIds[1] ?? tokenIds[0]];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function actionSearchMarkets(input: any): Promise<SkillExecutionResult> {
  const {
    keyword,
    sort_by = 'volume_24hr',
    limit = 20,
  } = input;

  const params = new URLSearchParams({
    active:  'true',
    closed:  'false',
    limit:   String(Math.min(Number(limit) || 20, 100)),
  });

  if (keyword) params.set('q', keyword);

  // sort_by mapping → Gamma API order params
  const sortMap: Record<string, string> = {
    volume_24hr:  'volume_24hr',
    liquidity:    'liquidity',
    newest:       'created_at',
    ending_soon:  'end_date',
  };
  if (sortMap[sort_by]) {
    params.set('order', sortMap[sort_by]);
    params.set('ascending', sort_by === 'ending_soon' ? 'true' : 'false');
  }

  const events = await get(`${GAMMA}/events?${params}`);
  if (!Array.isArray(events)) return { success: false, error: 'Unexpected response from Gamma API' };

  const results = events.map((e: any) => {
    const markets = (e.markets ?? []).map((m: any) => ({
      question:       m.question,
      condition_id:   m.conditionId,
      slug:           m.slug,
      yes_price:      m.outcomePrices ? JSON.parse(m.outcomePrices)[0] : null,
      no_price:       m.outcomePrices ? JSON.parse(m.outcomePrices)[1] : null,
      last_trade:     m.lastTradePrice,
      volume:         m.volumeNum ?? m.volume,
      liquidity:      m.liquidityNum ?? m.liquidity,
      end_date:       m.endDateIso,
      accepting_orders: m.acceptingOrders,
    }));
    return {
      title:          e.title,
      slug:           e.slug,
      volume_24hr:    e.volume24hr,
      liquidity:      e.liquidity,
      end_date:       e.endDate?.split('T')[0],
      markets,
    };
  });

  return {
    success: true,
    output: {
      platform:     'Polymarket',
      result_count: results.length,
      events:       results,
      _note:        'yes_price / no_price are implied probabilities (0-1). Sum ≈ 1 (accounting for spread).',
    },
  };
}

async function actionGetMarket(input: any): Promise<SkillExecutionResult> {
  const { slug, condition_id } = input;
  if (!slug && !condition_id) {
    return { success: false, error: 'Either slug or condition_id is required' };
  }

  let market: any;
  if (slug) {
    const markets = await get(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}&limit=1`);
    market = Array.isArray(markets) ? markets[0] : markets;
  } else {
    const markets = await get(`${GAMMA}/markets?condition_ids=${condition_id}&limit=1`);
    market = Array.isArray(markets) ? markets[0] : markets;
  }

  if (!market) {
    return { success: false, error: `Market not found for ${slug ?? condition_id}` };
  }

  const outcomes = JSON.parse(market.outcomes || '[]');
  const outcomePrices = JSON.parse(market.outcomePrices || '[]');
  const tokenIds = JSON.parse(market.clobTokenIds || '[]');

  return {
    success: true,
    output: {
      platform:         'Polymarket',
      question:         market.question,
      description:      market.description,
      slug:             market.slug,
      condition_id:     market.conditionId,
      outcomes: outcomes.map((o: string, i: number) => ({
        outcome:       o,
        price:         outcomePrices[i],
        token_id:      tokenIds[i],
      })),
      yes_price:          outcomePrices[0],
      no_price:           outcomePrices[1],
      last_trade_price:   market.lastTradePrice,
      best_bid:           market.bestBid,
      best_ask:           market.bestAsk,
      spread:             market.spread,
      volume:             market.volumeNum ?? market.volume,
      volume_24hr:        market.volume24hr,
      liquidity:          market.liquidityClob ?? market.liquidity,
      start_date:         market.startDateIso,
      end_date:           market.endDateIso,
      accepting_orders:   market.acceptingOrders,
      resolution_source:  market.resolutionSource,
      competitive_score:  market.competitive,
      neg_risk:           market.negRisk,
      _note:              'yes_price is probability of YES outcome (0-1). token_id required for get_orderbook and get_price_history.',
    },
  };
}

async function actionGetOrderbook(input: any): Promise<SkillExecutionResult> {
  let { token_id, slug, outcome = 'yes', depth = 10 } = input;

  if (!token_id) {
    if (!slug) return { success: false, error: 'Either token_id or slug is required' };
    const [yesId, noId] = await getTokenIdsBySlug(slug);
    token_id = outcome.toLowerCase() === 'no' ? noId : yesId;
  }

  const book = await get(`${CLOB}/book?token_id=${token_id}`);
  const actualDepth = Math.min(Number(depth) || 10, 20);

  const bids = (book.bids ?? []).slice(0, actualDepth);
  const asks = (book.asks ?? []).slice(0, actualDepth);

  return {
    success: true,
    output: {
      platform:        'Polymarket',
      token_id,
      last_trade_price: book.last_trade_price,
      best_bid:         bids[0]?.price ?? null,
      best_ask:         asks[0]?.price ?? null,
      spread:           bids[0] && asks[0]
        ? (parseFloat(asks[0].price) - parseFloat(bids[0].price)).toFixed(4)
        : null,
      tick_size:        book.tick_size,
      min_order_size:   book.min_order_size,
      bids: bids.map((l: any) => ({ price: l.price, size: l.size })),
      asks: asks.map((l: any) => ({ price: l.price, size: l.size })),
      _note: 'Prices are probabilities (0-1). bids[0] = highest buy, asks[0] = lowest sell. Size in USDC.',
    },
  };
}

async function actionGetPriceHistory(input: any): Promise<SkillExecutionResult> {
  let { token_id, slug, outcome = 'yes', interval = '1w' } = input;

  if (!token_id) {
    if (!slug) return { success: false, error: 'Either token_id or slug is required' };
    const [yesId, noId] = await getTokenIdsBySlug(slug);
    token_id = outcome.toLowerCase() === 'no' ? noId : yesId;
  }

  // fidelity = number of data points per interval bucket
  const fidelityMap: Record<string, number> = {
    '1d': 60, '1w': 100, '1m': 100, '3m': 100, '6m': 100, '1y': 100, 'all': 100,
  };
  const fidelity = fidelityMap[interval] ?? 100;

  const data = await get(`${CLOB}/prices-history?market=${token_id}&interval=${interval}&fidelity=${fidelity}`);
  const history: Array<{ t: number; p: number }> = data.history ?? [];

  // Compute simple stats
  const prices = history.map(h => h.p);
  const current = prices[prices.length - 1] ?? null;
  const start   = prices[0] ?? null;
  const high    = prices.length ? Math.max(...prices) : null;
  const low     = prices.length ? Math.min(...prices) : null;

  return {
    success: true,
    output: {
      platform:   'Polymarket',
      token_id,
      interval,
      outcome:    outcome.toUpperCase(),
      current_price: current,
      start_price:   start,
      price_change:  current !== null && start !== null ? (current - start).toFixed(4) : null,
      high,
      low,
      data_points: history.length,
      history: history.map(h => ({ time: h.t, price: h.p })),
      _note: 'Prices are probabilities (0-1 = 0%-100%). time is Unix timestamp.',
    },
  };
}

async function actionGetMarketTrades(input: any): Promise<SkillExecutionResult> {
  const { condition_id, slug, limit = 20 } = input;

  let condId = condition_id;
  if (!condId) {
    if (!slug) return { success: false, error: 'Either condition_id or slug is required' };
    const markets = await get(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}&limit=1`);
    const market = Array.isArray(markets) ? markets[0] : markets;
    if (!market) return { success: false, error: `No market found for slug: ${slug}` };
    condId = market.conditionId;
  }

  const actualLimit = Math.min(Number(limit) || 20, 100);
  const trades = await get(`${DATA}/trades?market=${condId}&limit=${actualLimit}`);

  if (!Array.isArray(trades)) {
    return { success: false, error: 'Unexpected response from Data API' };
  }

  return {
    success: true,
    output: {
      platform:    'Polymarket',
      condition_id: condId,
      trade_count:  trades.length,
      trades: trades.map((t: any) => ({
        side:    t.side,           // BUY or SELL
        outcome: t.outcome,        // "Yes" or "No"
        price:   t.price,
        size:    t.size,           // USDC amount
        time:    t.timestamp,
        user:    t.proxyWallet,
        tx_hash: t.transactionHash,
      })),
      _note: 'Trades are public. size is in USDC. price is probability (0-1).',
    },
  };
}

async function actionGetUserPositions(input: any): Promise<SkillExecutionResult> {
  const { address, limit = 50 } = input;
  if (!address) return { success: false, error: 'address is required (EVM wallet address, 0x...)' };

  const actualLimit = Math.min(Number(limit) || 50, 100);
  const positions = await get(`${DATA}/positions?user=${address}&limit=${actualLimit}`);

  if (!Array.isArray(positions)) {
    return { success: false, error: 'Unexpected response from Data API' };
  }

  const open = positions.filter((p: any) => parseFloat(p.size ?? '0') > 0);

  return {
    success: true,
    output: {
      platform:       'Polymarket',
      address,
      position_count: open.length,
      positions: open.map((p: any) => ({
        market:          p.title ?? p.market,
        outcome:         p.outcome,
        side:            p.side,
        size:            p.size,            // shares held
        avg_price:       p.avgPrice ?? p.initialValue,
        current_value:   p.currentValue,
        unrealized_pnl:  p.unrealizedProfit,
        realized_pnl:    p.realizedProfit,
        condition_id:    p.conditionId,
        slug:            p.slug,
      })),
      _note: 'size = number of shares. Each share pays $1 USDC if outcome resolves Yes.',
    },
  };
}

async function actionGetUserTrades(input: any): Promise<SkillExecutionResult> {
  const { address, limit = 50 } = input;
  if (!address) return { success: false, error: 'address is required (EVM wallet address, 0x...)' };

  const actualLimit = Math.min(Number(limit) || 50, 100);
  const trades = await get(`${DATA}/trades?user=${address}&limit=${actualLimit}`);

  if (!Array.isArray(trades)) {
    return { success: false, error: 'Unexpected response from Data API' };
  }

  return {
    success: true,
    output: {
      platform:    'Polymarket',
      address,
      trade_count: trades.length,
      trades: trades.map((t: any) => ({
        market:  t.title ?? t.market,
        outcome: t.outcome,
        side:    t.side,
        price:   t.price,
        size:    t.size,
        time:    t.timestamp,
        tx_hash: t.transactionHash,
        slug:    t.slug,
      })),
      _note: 'Most recent trades first. size in USDC. price is probability (0-1).',
    },
  };
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executePolymarketSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'search_markets':     return await actionSearchMarkets(input);
      case 'get_market':         return await actionGetMarket(input);
      case 'get_orderbook':      return await actionGetOrderbook(input);
      case 'get_price_history':  return await actionGetPriceHistory(input);
      case 'get_market_trades':  return await actionGetMarketTrades(input);
      case 'get_user_positions': return await actionGetUserPositions(input);
      case 'get_user_trades':    return await actionGetUserTrades(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: search_markets, get_market, get_orderbook, get_price_history, get_market_trades, get_user_positions, get_user_trades`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Polymarket skill' };
  }
}
