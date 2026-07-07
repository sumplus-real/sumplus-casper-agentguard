/**
 * dYdX v4 — Decentralized Perpetuals Exchange
 *
 * dYdX v4 runs on its own Cosmos-based L1 chain with 293+ perpetual markets,
 * deep liquidity, and a fully on-chain order book.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * API: https://indexer.dydx.trade/v4
 */

import type { SkillExecutionResult } from '@/types/skill';

export const DYDX_SKILL_METADATA = {
  name: 'dYdX Perpetuals',
  description:
    '[ARSENAL-HOSTED ✓] Real-time market data and account queries for dYdX v4 — ' +
    'a decentralized perpetuals DEX with 290+ markets on its own L1 chain. ' +
    'Get market prices, funding rates, order books, OHLCV candles, recent trades, ' +
    'and user positions/orders/fills. No API key required.\n\n' +
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
  tags: ['dydx', 'perpetuals', 'perps', 'derivatives', 'orderbook', 'funding', 'cosmos', 'defi', 'trading'],
  external_url: 'https://dydx.exchange',
  logo_url: 'https://icons.llamao.fi/icons/protocols/dydx?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_markets',
          'get_orderbook',
          'get_recent_trades',
          'get_candles',
          'get_funding_history',
          'get_account',
          'get_positions',
          'get_orders',
          'get_fills',
        ],
        description:
          'Action to perform. ' +
          'Market data: get_markets, get_orderbook, get_recent_trades, get_candles, get_funding_history. ' +
          'Account (needs address): get_account, get_positions, get_orders, get_fills.',
      },
      ticker: {
        type: 'string',
        description: 'Market ticker in format "BASE-USD" (e.g. BTC-USD, ETH-USD, SOL-USD). Required for: get_orderbook, get_recent_trades, get_candles, get_funding_history.',
      },
      address: {
        type: 'string',
        description: 'dYdX chain address in bech32 format (dydx1...). Required for account actions.',
      },
      subaccount_number: {
        type: 'number',
        description: 'Subaccount number (default: 0, the main account).',
      },
      resolution: {
        type: 'string',
        enum: ['1MIN', '5MINS', '15MINS', '30MINS', '1HOUR', '4HOURS', '1DAY'],
        description: 'Candle resolution for get_candles (default: 1HOUR).',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default: 20, max: 100).',
      },
      depth: {
        type: 'number',
        description: 'Orderbook levels to return (default: 10, max: 50).',
      },
    },
  },
};

// ─── API helper ───────────────────────────────────────────────────────────────

const BASE = 'https://indexer.dydx.trade/v4';

async function dydxGet(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`dYdX API ${res.status} for ${path}: ${text}`);
  }
  return res.json();
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function actionGetMarkets(input: any): Promise<SkillExecutionResult> {
  const { ticker } = input;
  const qs = ticker ? `?ticker=${encodeURIComponent(ticker.toUpperCase())}` : '';
  const data = await dydxGet(`/perpetualMarkets${qs}`);
  const rawMarkets = data.markets ?? {};

  const markets = Object.values(rawMarkets).map((m: any) => {
    // nextFundingRate is per settlement interval (hourly); annualize for context
    const hourlyFunding = parseFloat(m.nextFundingRate ?? '0');
    const annualFunding = (hourlyFunding * 8760 * 100).toFixed(4);
    return {
      ticker:              m.ticker,
      status:              m.status,
      oracle_price:        m.oraclePrice,
      price_change_24h:    m.priceChange24H,
      volume_24h_usd:      m.volume24H,
      trades_24h:          m.trades24H,
      funding_rate_hourly: m.nextFundingRate,
      funding_rate_annual: `${annualFunding}%`,
      open_interest:       m.openInterest,   // in base asset
      max_leverage:        m.initialMarginFraction
        ? (1 / parseFloat(m.initialMarginFraction)).toFixed(0) + 'x'
        : null,
      tick_size:           m.tickSize,
      step_size:           m.stepSize,
      market_type:         m.marketType,
    };
  });

  // Sort by 24h volume descending
  markets.sort((a, b) => parseFloat(b.volume_24h_usd ?? '0') - parseFloat(a.volume_24h_usd ?? '0'));

  return {
    success: true,
    output: {
      platform:     'dYdX v4',
      market_count: markets.length,
      markets,
      _note: 'Perpetual markets on dYdX Chain. funding_rate_hourly * 8760 ≈ annual rate.',
    },
  };
}

async function actionGetOrderbook(input: any): Promise<SkillExecutionResult> {
  const { ticker, depth = 10 } = input;
  if (!ticker) return { success: false, error: 'ticker is required (e.g. BTC-USD, ETH-USD)' };

  const t = ticker.toUpperCase();
  const data = await dydxGet(`/orderbooks/perpetualMarket/${t}`);
  const actualDepth = Math.min(Number(depth) || 10, 50);

  const bids = (data.bids ?? []).slice(0, actualDepth);
  const asks = (data.asks ?? []).slice(0, actualDepth);

  return {
    success: true,
    output: {
      platform: 'dYdX v4',
      ticker:   t,
      best_bid: bids[0]?.price ?? null,
      best_ask: asks[0]?.price ?? null,
      spread:   bids[0] && asks[0]
        ? (parseFloat(asks[0].price) - parseFloat(bids[0].price)).toFixed(4)
        : null,
      bids: bids.map((l: any) => ({ price: l.price, size: l.size })),
      asks: asks.map((l: any) => ({ price: l.price, size: l.size })),
      _note: 'bids[0] = best bid (highest). asks[0] = best ask (lowest). Size in base token.',
    },
  };
}

async function actionGetRecentTrades(input: any): Promise<SkillExecutionResult> {
  const { ticker, limit = 20 } = input;
  if (!ticker) return { success: false, error: 'ticker is required (e.g. BTC-USD, ETH-USD)' };

  const t = ticker.toUpperCase();
  const actualLimit = Math.min(Number(limit) || 20, 100);
  const data = await dydxGet(`/trades/perpetualMarket/${t}?limit=${actualLimit}`);

  return {
    success: true,
    output: {
      platform:    'dYdX v4',
      ticker:      t,
      trade_count: data.trades?.length ?? 0,
      trades: (data.trades ?? []).map((t: any) => ({
        side:       t.side,         // BUY or SELL
        price:      t.price,
        size:       t.size,
        type:       t.type,         // LIMIT, LIQUIDATED, DELEVERAGED
        time:       t.createdAt,
        block:      t.createdAtHeight,
      })),
    },
  };
}

async function actionGetCandles(input: any): Promise<SkillExecutionResult> {
  const { ticker, resolution = '1HOUR', limit = 48 } = input;
  if (!ticker) return { success: false, error: 'ticker is required (e.g. BTC-USD, ETH-USD)' };

  const t = ticker.toUpperCase();
  const actualLimit = Math.min(Number(limit) || 48, 100);
  const data = await dydxGet(`/candles/perpetualMarkets/${t}?resolution=${resolution}&limit=${actualLimit}`);

  const candles = (data.candles ?? []).reverse(); // chronological order

  return {
    success: true,
    output: {
      platform:     'dYdX v4',
      ticker:       t,
      resolution,
      candle_count: candles.length,
      candles: candles.map((c: any) => ({
        time:        c.startedAt,
        open:        c.open,
        high:        c.high,
        low:         c.low,
        close:       c.close,
        volume_usd:  c.usdVolume,
        trades:      c.trades,
      })),
      _note: 'Candles in chronological order (oldest first).',
    },
  };
}

async function actionGetFundingHistory(input: any): Promise<SkillExecutionResult> {
  const { ticker, limit = 24 } = input;
  if (!ticker) return { success: false, error: 'ticker is required (e.g. BTC-USD, ETH-USD)' };

  const t = ticker.toUpperCase();
  const actualLimit = Math.min(Number(limit) || 24, 100);
  const data = await dydxGet(`/historicalFunding/${t}?limit=${actualLimit}`);

  const history = (data.historicalFunding ?? []).map((h: any) => ({
    time:          h.effectiveAt,
    rate:          h.rate,
    rate_annual:   `${(parseFloat(h.rate) * 8760 * 100).toFixed(4)}%`,
    oracle_price:  h.price,
  }));

  return {
    success: true,
    output: {
      platform: 'dYdX v4',
      ticker:   t,
      count:    history.length,
      history,
      _note: 'Funding settled hourly. rate * 8760 ≈ annualized rate.',
    },
  };
}

async function actionGetAccount(input: any): Promise<SkillExecutionResult> {
  const { address, subaccount_number = 0 } = input;
  if (!address) return { success: false, error: 'address is required (dydx1... format)' };

  const data = await dydxGet(`/addresses/${address}`);
  const subaccounts = data.subaccounts ?? [];
  const sub = subaccounts.find((s: any) => s.subaccountNumber === subaccount_number) ?? subaccounts[0];

  return {
    success: true,
    output: {
      platform:          'dYdX v4',
      address,
      subaccount_count:  subaccounts.length,
      equity:            sub?.equity,
      free_collateral:   sub?.freeCollateral,
      margin_enabled:    sub?.marginEnabled,
      updated_at_block:  sub?.updatedAtHeight,
      _note:             'equity = total account value in USD. free_collateral = available to trade.',
    },
  };
}

async function actionGetPositions(input: any): Promise<SkillExecutionResult> {
  const { address, subaccount_number = 0 } = input;
  if (!address) return { success: false, error: 'address is required (dydx1... format)' };

  const qs = new URLSearchParams({
    address,
    subaccountNumber: String(subaccount_number),
    status: 'OPEN',
  });
  const data = await dydxGet(`/perpetualPositions?${qs}`);

  return {
    success: true,
    output: {
      platform:        'dYdX v4',
      address,
      position_count:  data.positions?.length ?? 0,
      positions: (data.positions ?? []).map((p: any) => ({
        market:          p.market,
        side:            p.side,         // LONG or SHORT
        size:            p.size,
        entry_price:     p.entryPrice,
        unrealized_pnl:  p.unrealizedPnl,
        realized_pnl:    p.realizedPnl,
        net_funding:     p.netFunding,
        opened_at:       p.createdAt,
      })),
    },
  };
}

async function actionGetOrders(input: any): Promise<SkillExecutionResult> {
  const { address, subaccount_number = 0, limit = 20 } = input;
  if (!address) return { success: false, error: 'address is required (dydx1... format)' };

  const qs = new URLSearchParams({
    address,
    subaccountNumber: String(subaccount_number),
    limit: String(Math.min(Number(limit) || 20, 100)),
  });
  const data = await dydxGet(`/orders?${qs}`);

  return {
    success: true,
    output: {
      platform:    'dYdX v4',
      address,
      order_count: Array.isArray(data) ? data.length : 0,
      orders: (Array.isArray(data) ? data : []).map((o: any) => ({
        id:          o.id,
        market:      o.ticker,
        side:        o.side,
        type:        o.type,
        price:       o.price,
        size:        o.size,
        filled_size: o.totalFilled,
        status:      o.status,
        reduce_only: o.reduceOnly,
        time_in_force: o.timeInForce,
        created_at:  o.createdAtHeight,
      })),
    },
  };
}

async function actionGetFills(input: any): Promise<SkillExecutionResult> {
  const { address, subaccount_number = 0, limit = 20 } = input;
  if (!address) return { success: false, error: 'address is required (dydx1... format)' };

  const qs = new URLSearchParams({
    address,
    subaccountNumber: String(subaccount_number),
    limit: String(Math.min(Number(limit) || 20, 100)),
  });
  const data = await dydxGet(`/fills?${qs}`);

  return {
    success: true,
    output: {
      platform:   'dYdX v4',
      address,
      fill_count: data.fills?.length ?? 0,
      fills: (data.fills ?? []).map((f: any) => ({
        market:     f.market,
        side:       f.side,
        type:       f.type,       // LIMIT, LIQUIDATED, etc.
        price:      f.price,
        size:       f.size,
        fee:        f.fee,
        liquidity:  f.liquidity,  // TAKER or MAKER
        time:       f.createdAt,
      })),
    },
  };
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeDydxSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_markets':         return await actionGetMarkets(input);
      case 'get_orderbook':       return await actionGetOrderbook(input);
      case 'get_recent_trades':   return await actionGetRecentTrades(input);
      case 'get_candles':         return await actionGetCandles(input);
      case 'get_funding_history': return await actionGetFundingHistory(input);
      case 'get_account':         return await actionGetAccount(input);
      case 'get_positions':       return await actionGetPositions(input);
      case 'get_orders':          return await actionGetOrders(input);
      case 'get_fills':           return await actionGetFills(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_markets, get_orderbook, get_recent_trades, get_candles, get_funding_history, get_account, get_positions, get_orders, get_fills`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in dYdX skill' };
  }
}
