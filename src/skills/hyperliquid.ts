/**
 * Hyperliquid — Perpetuals & Spot DEX Market Data + Account Queries
 *
 * Hyperliquid is the highest-volume decentralized perpetuals exchange,
 * running on its own L1 with native order book, 200+ markets, and sub-second finality.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * API: POST https://api.hyperliquid.xyz/info
 */

import type { SkillExecutionResult } from '@/types/skill';
import { keccak256 } from 'viem';

export const HYPERLIQUID_SKILL_METADATA = {
  name: 'Hyperliquid Market & Account',
  description:
    '[ARSENAL-HOSTED ✓] Real-time market data, account queries, and order building for Hyperliquid — ' +
    'the #1 decentralized perpetuals exchange. Get perp/spot market prices, funding rates, order books, ' +
    'recent trades, and user account state (positions, open orders, fills). Build perp orders ' +
    '(build_order) and cancels (build_cancel_order): Arsenal returns the exact EIP-712 typed data the ' +
    'user\'s own wallet signs client-side, then the client POSTs it to Hyperliquid — Arsenal never holds ' +
    'a key. No API key required.\n\n' +
    'execution_mode: server-side\n' +
    'sop_compliance:\n' +
    '  provides_quote: false\n' +
    '  returns_price_impact: false\n' +
    '  uses_authoritative_contracts: true\n' +
    '  read_only: false',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['hyperliquid', 'perpetuals', 'perps', 'futures', 'derivatives', 'spot', 'orderbook', 'funding', 'defi', 'trading', 'clarity-act'],
  external_url: 'https://app.hyperliquid.xyz',
  logo_url: 'https://icons.llamao.fi/icons/protocols/hyperliquid?w=48&h=48',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_markets',
          'get_all_mids',
          'get_orderbook',
          'get_funding_rates',
          'get_funding_history',
          'get_recent_trades',
          'get_spot_markets',
          'get_account_state',
          'get_spot_balances',
          'get_open_orders',
          'get_fills',
          'build_order',
          'build_cancel_order',
        ],
        description:
          'Action to perform. Market data: get_markets, get_all_mids, get_orderbook, get_funding_rates, get_funding_history, get_recent_trades, get_spot_markets. Account (needs address): get_account_state, get_spot_balances, get_open_orders, get_fills. Trading (returns EIP-712 typed data for the user to sign + submit): build_order, build_cancel_order.',
      },
      coin: {
        type: 'string',
        description: 'Asset/coin symbol (e.g. BTC, ETH, SOL). Required for: get_orderbook, get_funding_history, get_recent_trades, build_order, build_cancel_order.',
      },
      address: {
        type: 'string',
        description: 'User EVM wallet address (0x...). Required for account actions: get_account_state, get_spot_balances, get_open_orders, get_fills.',
      },
      depth: {
        type: 'number',
        description: 'Number of price levels to return for get_orderbook (default: 10, max: 20).',
      },
      limit: {
        type: 'number',
        description: 'Max results to return for get_fills (default: 50, max: 200).',
      },
      start_time: {
        type: 'number',
        description: 'Start timestamp in milliseconds for get_funding_history (default: 7 days ago).',
      },
      end_time: {
        type: 'number',
        description: 'End timestamp in milliseconds for get_funding_history (default: now).',
      },
      is_buy: {
        type: 'boolean',
        description: 'build_order: true = buy/long, false = sell/short.',
      },
      size: {
        type: 'string',
        description: 'build_order: order size in units of the base asset (e.g. "0.1" for 0.1 ETH). Rounded to the asset\'s szDecimals.',
      },
      price: {
        type: 'string',
        description: 'build_order: limit price. Required when order_type is "limit". Ignored for "market" (an aggressive IOC price is derived from the mark price).',
      },
      order_type: {
        type: 'string',
        enum: ['limit', 'market'],
        description: 'build_order: "limit" (default) rests at price with the given tif; "market" sends an aggressive IOC at mark ± slippage.',
      },
      tif: {
        type: 'string',
        enum: ['Gtc', 'Ioc', 'Alo'],
        description: 'build_order: time-in-force for limit orders (default Gtc). Gtc=rest, Ioc=fill-or-kill remainder, Alo=add-liquidity-only (post-only).',
      },
      reduce_only: {
        type: 'boolean',
        description: 'build_order: true to only reduce/close an existing position (used to close a position).',
      },
      slippage: {
        type: 'number',
        description: 'build_order: for market orders, max slippage from mark price as a decimal (default 0.05 = 5%).',
      },
      order_id: {
        type: 'number',
        description: 'build_cancel_order: the oid (order id) to cancel, from get_open_orders.',
      },
      nonce: {
        type: 'number',
        description: 'build_order/build_cancel_order: optional millisecond nonce. Defaults to the current time; the client may override to match its own clock.',
      },
    },
  },
};

// ─── API helper ───────────────────────────────────────────────────────────────

const HL_INFO = 'https://api.hyperliquid.xyz/info';

async function hlPost(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hyperliquid API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Market data actions ──────────────────────────────────────────────────────

async function actionGetMarkets(): Promise<SkillExecutionResult> {
  // Returns [meta, assetCtxs] where meta.universe is array of perp assets
  const [meta, ctxs] = await hlPost({ type: 'metaAndAssetCtxs' });
  const universe: any[] = meta.universe ?? [];

  const markets = universe.map((asset: any, i: number) => {
    const ctx = ctxs[i] ?? {};
    return {
      coin:           asset.name,
      max_leverage:   asset.maxLeverage,
      sz_decimals:    asset.szDecimals,
      mark_price:     ctx.markPx,
      mid_price:      ctx.midPx,
      oracle_price:   ctx.oraclePx,
      funding_rate:   ctx.funding,
      open_interest:  ctx.openInterest,
      day_volume_usd: ctx.dayNtlVlm,
      premium:        ctx.premium,
    };
  });

  return {
    success: true,
    output: {
      platform:     'Hyperliquid',
      market_type:  'perpetual',
      market_count: markets.length,
      markets,
      _note: 'Funding rates are hourly (annualized ≈ rate × 8760). Open interest in USD.',
    },
  };
}

async function actionGetAllMids(): Promise<SkillExecutionResult> {
  const mids = await hlPost({ type: 'allMids' });
  const entries = Object.entries(mids as Record<string, string>)
    .map(([coin, price]) => ({ coin, price }))
    .sort((a, b) => a.coin.localeCompare(b.coin));

  return {
    success: true,
    output: {
      platform:    'Hyperliquid',
      asset_count: entries.length,
      prices:      mids,
      prices_list: entries,
      _note:       'Mid prices for all perp and spot assets. Keys are coin symbols.',
    },
  };
}

async function actionGetOrderbook(input: any): Promise<SkillExecutionResult> {
  const { coin, depth = 10 } = input;
  if (!coin) return { success: false, error: 'coin is required (e.g. BTC, ETH, SOL)' };

  const actualDepth = Math.min(Number(depth) || 10, 20);
  const book = await hlPost({ type: 'l2Book', coin: coin.toUpperCase() });

  // Response: { coin, levels: [bids[], asks[]] } where each level is { px, sz, n }
  const [bids, asks] = book.levels ?? [[], []];

  const mapLevel = (l: any) => ({ price: l.px, size: l.sz, num_orders: l.n });

  return {
    success: true,
    output: {
      platform:  'Hyperliquid',
      coin:      coin.toUpperCase(),
      best_bid:  bids[0]?.px ?? null,
      best_ask:  asks[0]?.px ?? null,
      spread:    bids[0] && asks[0]
        ? (parseFloat(asks[0].px) - parseFloat(bids[0].px)).toFixed(6)
        : null,
      bids: bids.slice(0, actualDepth).map(mapLevel),
      asks: asks.slice(0, actualDepth).map(mapLevel),
      _note: 'L2 order book. bids[0] = best bid (highest), asks[0] = best ask (lowest).',
    },
  };
}

async function actionGetFundingRates(): Promise<SkillExecutionResult> {
  const [meta, ctxs] = await hlPost({ type: 'metaAndAssetCtxs' });
  const universe: any[] = meta.universe ?? [];

  const rates = universe
    .map((asset: any, i: number) => {
      const ctx = ctxs[i] ?? {};
      const rate = parseFloat(ctx.funding ?? '0');
      const annualized = (rate * 8760 * 100).toFixed(4); // hourly → annual %
      return {
        coin:            asset.name,
        funding_rate:    ctx.funding,
        funding_annual:  `${annualized}%`,
        premium:         ctx.premium,
        open_interest:   ctx.openInterest,
        mark_price:      ctx.markPx,
        oracle_price:    ctx.oraclePx,
      };
    })
    .sort((a: any, b: any) =>
      Math.abs(parseFloat(b.funding_rate ?? '0')) - Math.abs(parseFloat(a.funding_rate ?? '0'))
    );

  return {
    success: true,
    output: {
      platform:     'Hyperliquid',
      market_count: rates.length,
      funding_rates: rates,
      _note: 'Sorted by absolute funding rate (highest first). Positive = longs pay shorts. funding_annual is approximate.',
    },
  };
}

async function actionGetFundingHistory(input: any): Promise<SkillExecutionResult> {
  const { coin, start_time, end_time } = input;
  if (!coin) return { success: false, error: 'coin is required (e.g. BTC, ETH)' };

  const body: any = {
    type:      'fundingHistory',
    coin:      coin.toUpperCase(),
    startTime: start_time ?? Date.now() - 7 * 24 * 60 * 60 * 1000,
  };
  if (end_time) body.endTime = end_time;

  const history = await hlPost(body);

  return {
    success: true,
    output: {
      platform: 'Hyperliquid',
      coin:     coin.toUpperCase(),
      count:    history.length,
      history:  history.map((h: any) => ({
        time:          h.time,
        funding_rate:  h.fundingRate,
        premium:       h.premium,
      })),
      _note: 'Hourly funding rate history. Most recent entries last.',
    },
  };
}

async function actionGetRecentTrades(input: any): Promise<SkillExecutionResult> {
  const { coin } = input;
  if (!coin) return { success: false, error: 'coin is required (e.g. BTC, ETH)' };

  const trades = await hlPost({ type: 'recentTrades', coin: coin.toUpperCase() });

  return {
    success: true,
    output: {
      platform: 'Hyperliquid',
      coin:     coin.toUpperCase(),
      count:    trades.length,
      trades:   trades.slice(0, 50).map((t: any) => ({
        side:  t.side === 'B' ? 'buy' : 'sell',
        price: t.px,
        size:  t.sz,
        time:  t.time,
        hash:  t.hash,
      })),
      _note: 'Most recent trades first. side: buy = B, sell = A (ask).',
    },
  };
}

async function actionGetSpotMarkets(): Promise<SkillExecutionResult> {
  // Returns [meta, assetCtxs] for spot markets
  const [meta, ctxs] = await hlPost({ type: 'spotMetaAndAssetCtxs' });
  const tokens: any[] = meta.tokens ?? [];
  const universe: any[] = meta.universe ?? [];

  const markets = universe.map((market: any, i: number) => {
    const ctx = ctxs[i] ?? {};
    const [baseIdx, quoteIdx] = market.tokens ?? [];
    const baseToken = tokens[baseIdx] ?? {};
    const quoteToken = tokens[quoteIdx] ?? {};
    return {
      name:               market.name,
      base_token:         baseToken.name,
      quote_token:        quoteToken.name,
      mark_price:         ctx.markPx,
      mid_price:          ctx.midPx,
      prev_day_price:     ctx.prevDayPx,
      day_change_pct:     ctx.markPx && ctx.prevDayPx
        ? (((parseFloat(ctx.markPx) - parseFloat(ctx.prevDayPx)) / parseFloat(ctx.prevDayPx)) * 100).toFixed(2) + '%'
        : null,
      day_volume_usd:     ctx.dayNtlVlm,
      circulating_supply: ctx.circulatingSupply,
    };
  });

  return {
    success: true,
    output: {
      platform:     'Hyperliquid',
      market_type:  'spot',
      market_count: markets.length,
      markets,
      _note: 'Native spot markets on Hyperliquid L1.',
    },
  };
}

// ─── Account actions (require address) ───────────────────────────────────────

async function actionGetAccountState(input: any): Promise<SkillExecutionResult> {
  const { address } = input;
  if (!address) return { success: false, error: 'address is required (EVM address, 0x...)' };

  const state = await hlPost({ type: 'clearinghouseState', user: address });

  const positions = (state.assetPositions ?? [])
    .filter((p: any) => p.position?.szi && parseFloat(p.position.szi) !== 0)
    .map((p: any) => {
      const pos = p.position;
      return {
        coin:              pos.coin,
        size:              pos.szi,
        side:              parseFloat(pos.szi) > 0 ? 'long' : 'short',
        entry_price:       pos.entryPx,
        mark_price:        pos.positionValue && pos.szi
          ? (Math.abs(parseFloat(pos.positionValue)) / Math.abs(parseFloat(pos.szi))).toFixed(6)
          : null,
        position_value:    pos.positionValue,
        unrealized_pnl:    pos.unrealizedPnl,
        realized_pnl:      pos.realizedPnl,
        leverage:          pos.leverage?.value,
        leverage_type:     pos.leverage?.type,  // 'cross' or 'isolated'
        liquidation_price: pos.liquidationPx,
        margin_used:       pos.marginUsed,
      };
    });

  const summary = state.crossMarginSummary ?? state.marginSummary ?? {};

  return {
    success: true,
    output: {
      platform:           'Hyperliquid',
      address,
      account_value:      summary.accountValue,
      total_margin_used:  summary.totalMarginUsed,
      total_position_usd: summary.totalNtlPos,
      total_raw_usd:      summary.totalRawUsd,
      withdrawable:       state.withdrawable,
      open_positions:     positions,
      position_count:     positions.length,
      _note: 'Cross-margin perpetual account. account_value includes unrealized PnL.',
    },
  };
}

async function actionGetSpotBalances(input: any): Promise<SkillExecutionResult> {
  const { address } = input;
  if (!address) return { success: false, error: 'address is required (EVM address, 0x...)' };

  const state = await hlPost({ type: 'spotClearinghouseState', user: address });

  const balances = (state.balances ?? [])
    .filter((b: any) => parseFloat(b.total ?? '0') > 0)
    .map((b: any) => ({
      coin:            b.coin,
      total:           b.total,
      hold:            b.hold,  // locked in open orders
      available:       (parseFloat(b.total ?? '0') - parseFloat(b.hold ?? '0')).toFixed(8),
      entry_notional:  b.entryNtl,
    }));

  return {
    success: true,
    output: {
      platform:      'Hyperliquid',
      address,
      asset_count:   balances.length,
      balances,
      _note: 'Spot token balances on Hyperliquid L1. hold = locked in open orders.',
    },
  };
}

async function actionGetOpenOrders(input: any): Promise<SkillExecutionResult> {
  const { address } = input;
  if (!address) return { success: false, error: 'address is required (EVM address, 0x...)' };

  const orders = await hlPost({ type: 'openOrders', user: address });

  return {
    success: true,
    output: {
      platform:    'Hyperliquid',
      address,
      order_count: orders.length,
      orders: (orders as any[]).map((o: any) => ({
        order_id:     o.oid,
        coin:         o.coin,
        side:         o.side === 'B' ? 'buy' : 'sell',
        price:        o.limitPx,
        size:         o.sz,
        size_filled:  o.origSz
          ? (parseFloat(o.origSz) - parseFloat(o.sz)).toFixed(8)
          : '0',
        orig_size:    o.origSz,
        order_type:   o.orderType,
        reduce_only:  o.reduceOnly,
        tif:          o.tif,        // time-in-force: GTC, IOC, ALO
        timestamp:    o.timestamp,
      })),
    },
  };
}

async function actionGetFills(input: any): Promise<SkillExecutionResult> {
  const { address, limit = 50 } = input;
  if (!address) return { success: false, error: 'address is required (EVM address, 0x...)' };

  const fills = await hlPost({ type: 'userFills', user: address });
  const actualLimit = Math.min(Number(limit) || 50, 200);

  return {
    success: true,
    output: {
      platform:   'Hyperliquid',
      address,
      fill_count: fills.length,
      fills: (fills as any[]).slice(0, actualLimit).map((f: any) => ({
        coin:        f.coin,
        side:        f.side === 'B' ? 'buy' : 'sell',
        price:       f.px,
        size:        f.sz,
        fee:         f.fee,
        fee_token:   f.feeToken,
        time:        f.time,
        hash:        f.hash,
        order_id:    f.oid,
        crossed:     f.crossed,  // true = taker, false = maker
        closed_pnl:  f.closedPnl,  // non-zero only on closing trades
        start_position: f.startPosition,
        dir:         f.dir,      // 'Open Long', 'Close Long', etc.
      })),
      _note: 'Most recent fills first. closed_pnl is realized PnL for closing trades. crossed=true means taker fill.',
    },
  };
}

// ─── Order building (signing payload) ─────────────────────────────────────────
//
// Hyperliquid orders are signed "L1 actions". The wallet signs an EIP-712
// "phantom agent" struct whose connectionId is keccak256(msgpack(action) ||
// nonce(8B BE) || vaultByte). Arsenal reconstructs this payload server-side and
// returns the typed data for the user's wallet to sign — Arsenal never holds a
// key. The order action contains only maps/strings/bools/uints (prices & sizes
// are strings), so a tiny hand-rolled msgpack encoder is sufficient.

const HL_EXCHANGE = 'https://api.hyperliquid.xyz/exchange';

// Minimal msgpack encoder: maps (insertion order), arrays, utf-8 strings,
// booleans, non-negative integers. Throws on anything else to catch mistakes.
function mpEncode(v: any): Buffer {
  if (typeof v === 'boolean') return Buffer.from([v ? 0xc3 : 0xc2]);
  if (typeof v === 'string') {
    const b = Buffer.from(v, 'utf8'); const L = b.length;
    let head: Buffer;
    if (L < 32) head = Buffer.from([0xa0 | L]);
    else if (L < 256) head = Buffer.from([0xd9, L]);
    else { head = Buffer.alloc(3); head[0] = 0xda; head.writeUInt16BE(L, 1); }
    return Buffer.concat([head, b]);
  }
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 0) throw new Error(`mpEncode: only non-negative integers supported, got ${v}`);
    if (v < 128) return Buffer.from([v]);
    if (v < 256) return Buffer.from([0xcc, v]);
    if (v < 65536) { const b = Buffer.alloc(3); b[0] = 0xcd; b.writeUInt16BE(v, 1); return b; }
    if (v < 4294967296) { const b = Buffer.alloc(5); b[0] = 0xce; b.writeUInt32BE(v, 1); return b; }
    const b = Buffer.alloc(9); b[0] = 0xcf; b.writeBigUInt64BE(BigInt(v), 1); return b;
  }
  if (Array.isArray(v)) {
    const L = v.length;
    let head: Buffer;
    if (L < 16) head = Buffer.from([0x90 | L]);
    else { head = Buffer.alloc(3); head[0] = 0xdc; head.writeUInt16BE(L, 1); }
    return Buffer.concat([head, ...v.map(mpEncode)]);
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    const L = entries.length;
    let head: Buffer;
    if (L < 16) head = Buffer.from([0x80 | L]);
    else { head = Buffer.alloc(3); head[0] = 0xde; head.writeUInt16BE(L, 1); }
    const parts: Buffer[] = [head];
    for (const [k, val] of entries) { parts.push(mpEncode(k)); parts.push(mpEncode(val)); }
    return Buffer.concat(parts);
  }
  throw new Error(`mpEncode: unsupported value ${v === null ? 'null' : typeof v}`);
}

function actionHash(action: any, nonce: number): `0x${string}` {
  const packed = mpEncode(action);
  const nonceBuf = Buffer.alloc(8); nonceBuf.writeBigUInt64BE(BigInt(nonce));
  const data = Buffer.concat([packed, nonceBuf, Buffer.from([0x00])]); // vaultAddress = none
  return keccak256(new Uint8Array(data));
}

// EIP-712 typed data over the phantom agent (chainId 1337 constant; source 'a' = mainnet)
function agentTypedData(connectionId: `0x${string}`) {
  return {
    domain: { name: 'Exchange', version: '1', chainId: 1337, verifyingContract: '0x0000000000000000000000000000000000000000' },
    types: { Agent: [{ name: 'source', type: 'string' }, { name: 'connectionId', type: 'bytes32' }] },
    primaryType: 'Agent',
    message: { source: 'a', connectionId },
  };
}

// strip trailing zeros after fixing decimals; never emit "-0"
function fmtNum(n: number, decimals: number): string {
  let s = n.toFixed(decimals);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}
// Hyperliquid price rules: ≤5 significant figures and ≤(6 - szDecimals) decimals for perps
function formatPrice(px: number, szDecimals: number): string {
  const sig = Number(px.toPrecision(5));
  return fmtNum(sig, Math.max(0, 6 - szDecimals));
}

async function resolvePerpAsset(coin: string): Promise<{ index: number; szDecimals: number; markPx: number }> {
  const [meta, ctxs] = await hlPost({ type: 'metaAndAssetCtxs' });
  const universe: any[] = meta.universe ?? [];
  const idx = universe.findIndex((a: any) => (a.name ?? '').toUpperCase() === coin.toUpperCase());
  if (idx < 0) throw new Error(`Unknown perp market "${coin}". Use get_markets to list available coins.`);
  const ctx = ctxs[idx] ?? {};
  return { index: idx, szDecimals: universe[idx].szDecimals ?? 2, markPx: parseFloat(ctx.markPx ?? ctx.oraclePx ?? '0') };
}

async function actionBuildOrder(input: any): Promise<SkillExecutionResult> {
  const { coin } = input;
  if (!coin) return { success: false, error: 'coin is required (e.g. BTC, ETH, SOL)' };
  if (typeof input.is_buy !== 'boolean') return { success: false, error: 'is_buy (boolean: true=long/buy, false=short/sell) is required' };
  if (!input.size) return { success: false, error: 'size is required (base-asset units, e.g. "0.1")' };

  const orderType = (input.order_type ?? 'limit').toLowerCase();
  const { index, szDecimals, markPx } = await resolvePerpAsset(coin);

  const sizeStr = fmtNum(Number(input.size), szDecimals);
  if (Number(sizeStr) <= 0) return { success: false, error: 'size rounds to zero at this market\'s precision' };

  let priceStr: string;
  let t: any;
  if (orderType === 'market') {
    if (!markPx || markPx <= 0) return { success: false, error: 'could not read mark price for a market order; pass order_type "limit" with an explicit price' };
    const slip = input.slippage != null ? Number(input.slippage) : 0.05;
    priceStr = formatPrice(input.is_buy ? markPx * (1 + slip) : markPx * (1 - slip), szDecimals);
    t = { limit: { tif: 'Ioc' } }; // market = aggressive IOC
  } else {
    if (!input.price) return { success: false, error: 'price is required for a limit order' };
    priceStr = formatPrice(Number(input.price), szDecimals);
    const tif = input.tif ?? 'Gtc';
    if (!['Gtc', 'Ioc', 'Alo'].includes(tif)) return { success: false, error: 'tif must be Gtc, Ioc, or Alo' };
    t = { limit: { tif } };
  }

  // order wire object — key order must be exactly a,b,p,s,r,t (cloid omitted)
  const order: any = { a: index, b: input.is_buy, p: priceStr, s: sizeStr, r: input.reduce_only === true, t };
  const action = { type: 'order', orders: [order], grouping: 'na' };
  const nonce = Number(input.nonce ?? Date.now());
  const connectionId = actionHash(action, nonce);

  return {
    success: true,
    output: {
      platform: 'Hyperliquid',
      kind: 'order',
      summary: `${input.is_buy ? 'BUY/LONG' : 'SELL/SHORT'} ${sizeStr} ${coin.toUpperCase()} @ ${orderType === 'market' ? `market (~${priceStr})` : priceStr}${input.reduce_only ? ' [reduce-only]' : ''}`,
      action,
      nonce,
      sign: { method: 'eth_signTypedData_v4', typed_data: agentTypedData(connectionId) },
      submit: { url: HL_EXCHANGE, method: 'POST', body_template: { action, nonce, signature: '{r,s,v from the signed typed data}' } },
      _note: 'The wallet signs an opaque hash (connectionId = keccak of the msgpack-encoded action), so display `summary` to the user before signing. After signing, split the 65-byte signature into {r (first 32B), s (next 32B), v (last byte, normalize to 27/28)} and POST {action, nonce, signature} to the submit url from the user\'s own client (api.hyperliquid.xyz geofences by the submitter\'s IP).',
    },
  };
}

async function actionBuildCancelOrder(input: any): Promise<SkillExecutionResult> {
  const { coin } = input;
  if (!coin) return { success: false, error: 'coin is required (the market of the order to cancel)' };
  if (input.order_id == null) return { success: false, error: 'order_id (oid from get_open_orders) is required' };
  const { index } = await resolvePerpAsset(coin);
  const action = { type: 'cancel', cancels: [{ a: index, o: Number(input.order_id) }] };
  const nonce = Number(input.nonce ?? Date.now());
  const connectionId = actionHash(action, nonce);
  return {
    success: true,
    output: {
      platform: 'Hyperliquid',
      kind: 'cancel',
      summary: `CANCEL order ${input.order_id} on ${coin.toUpperCase()}`,
      action,
      nonce,
      sign: { method: 'eth_signTypedData_v4', typed_data: agentTypedData(connectionId) },
      submit: { url: HL_EXCHANGE, method: 'POST', body_template: { action, nonce, signature: '{r,s,v from the signed typed data}' } },
      _note: 'Sign the typed data, then POST {action, nonce, signature} to the submit url from the user\'s client.',
    },
  };
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeHyperliquidSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      // Market data
      case 'get_markets':          return await actionGetMarkets();
      case 'get_all_mids':         return await actionGetAllMids();
      case 'get_orderbook':        return await actionGetOrderbook(input);
      case 'get_funding_rates':    return await actionGetFundingRates();
      case 'get_funding_history':  return await actionGetFundingHistory(input);
      case 'get_recent_trades':    return await actionGetRecentTrades(input);
      case 'get_spot_markets':     return await actionGetSpotMarkets();
      // Account queries
      case 'get_account_state':    return await actionGetAccountState(input);
      case 'get_spot_balances':    return await actionGetSpotBalances(input);
      case 'get_open_orders':      return await actionGetOpenOrders(input);
      case 'get_fills':            return await actionGetFills(input);
      // Trading (returns signing payload; the user signs + submits client-side)
      case 'build_order':          return await actionBuildOrder(input);
      case 'build_cancel_order':   return await actionBuildCancelOrder(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_markets, get_all_mids, get_orderbook, get_funding_rates, get_funding_history, get_recent_trades, get_spot_markets, get_account_state, get_spot_balances, get_open_orders, get_fills, build_order, build_cancel_order`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Hyperliquid skill' };
  }
}
