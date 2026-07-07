/**
 * Official Skill: Binance Exchange
 *
 * Spot market data + trading for Binance, the largest crypto CEX.
 *
 * Public market data (no key) is served from data-api.binance.vision — Binance's
 * public-data mirror — which avoids the geo-restriction (HTTP 451) that
 * api.binance.com applies to some server regions.
 *
 * Private endpoints (account, trading) require the user's own Binance API key +
 * secret. Requests are signed server-side with HMAC-SHA256 over the query string
 * and sent to api.binance.com with the X-MBX-APIKEY header. Set BINANCE_API_BASE
 * to override the private base (e.g. a region-appropriate endpoint).
 *
 * API Docs: https://developers.binance.com/docs/binance-spot-api-docs
 *
 * Skill UUID: e7c3b9a2-5f8d-4a1e-b6c4-3d9f0e2a7c81
 */

import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { httpsGet } from '@/lib/skill-executors';

const PUBLIC_BASE = 'https://data-api.binance.vision';
function privateBase(): string {
  return process.env.BINANCE_API_BASE || 'https://api.binance.com';
}

const KLINE_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];

export const BINANCE_SKILL_METADATA = {
  name: 'Binance Exchange',
  description:
    'Spot market data and trading on Binance, the largest crypto CEX. ' +
    'Public market data — live prices, 24h stats, order book, K-line candles, recent trades, average price, and ' +
    'exchange trading rules — requires no API key. With your own Binance API key + secret, also supports account ' +
    'balances, placing/cancelling spot orders, and querying orders. Public data is read from Binance\'s public mirror; ' +
    'signed requests use HMAC-SHA256.',
  category: 'Finance',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['binance', 'cex', 'spot', 'trading', 'market-data', 'orderbook', 'klines', 'ticker'],
  external_url: 'https://www.binance.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/binance?w=48&h=48',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_price', 'get_24h_stats', 'get_orderbook', 'get_klines', 'get_recent_trades', 'get_avg_price', 'get_exchange_info',
          'get_account', 'place_order', 'cancel_order', 'get_order', 'get_open_orders',
        ],
        description:
          'Public (no key): get_price (one symbol or all), get_24h_stats, get_orderbook, get_klines, get_recent_trades, get_avg_price, get_exchange_info. ' +
          'Private (require api_key + secret_key): get_account, place_order, cancel_order, get_order, get_open_orders.',
      },
      symbol:   { type: 'string', description: 'Trading pair, e.g. BTCUSDT. Required for most actions; for get_price/get_24h_stats omit to return all symbols.' },
      interval: { type: 'string', enum: KLINE_INTERVALS, description: 'K-line interval for get_klines. Default 1h.' },
      limit:    { type: 'number', description: 'Number of results. Default 100; order book/trades capped per Binance limits.' },
      api_key:    { type: 'string', description: 'Binance API key. Required for private actions.' },
      secret_key: { type: 'string', description: 'Binance API secret for HMAC signing. Required for private actions.' },
      side:       { type: 'string', enum: ['BUY', 'SELL'], description: 'Order side for place_order.' },
      order_type: { type: 'string', enum: ['LIMIT', 'MARKET'], description: 'Order type for place_order. Default LIMIT.' },
      quantity:   { type: 'string', description: 'Base-asset quantity for place_order.' },
      quote_order_qty: { type: 'string', description: 'Quote-asset amount for a MARKET buy (alternative to quantity).' },
      price:      { type: 'string', description: 'Limit price for place_order (required for LIMIT).' },
      time_in_force: { type: 'string', enum: ['GTC', 'IOC', 'FOK'], description: 'Time-in-force for LIMIT orders. Default GTC.' },
      order_id:   { type: 'string', description: 'Order id for cancel_order / get_order.' },
      recv_window: { type: 'number', description: 'recvWindow in ms for signed requests. Default 5000.' },
    },
  },
  usage_examples: [
    { title: 'BTC price', input: { action: 'get_price', symbol: 'BTCUSDT' } },
    { title: '24h stats', input: { action: 'get_24h_stats', symbol: 'ETHUSDT' } },
    { title: 'Place a limit buy', input: { action: 'place_order', symbol: 'BTCUSDT', side: 'BUY', order_type: 'LIMIT', quantity: '0.001', price: '50000', api_key: 'YOUR_KEY', secret_key: 'YOUR_SECRET' } },
  ],
};

// ── Public helper (data mirror, no auth) ──────────────────────────────────────
async function pubGet(path: string, params?: Record<string, string>): Promise<any> {
  const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  return httpsGet(`${PUBLIC_BASE}${path}${qs}`);
}

// ── Signed request (api.binance.com) ──────────────────────────────────────────
// Binance signs the full query string with HMAC-SHA256 and appends &signature=<hex>.
function sign(query: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(query).digest('hex');
}

function signedRequest(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number>, apiKey: string, secretKey: string): Promise<any> {
  const query = new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString();
  const signature = sign(query, secretKey);
  const fullQuery = `${query}&signature=${signature}`;
  const urlStr = `${privateBase()}${path}?${fullQuery}`;

  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);
    const proxyUrl = process.env.https_proxy || process.env.http_proxy;
    let client: typeof https | typeof http;
    let options: any;
    const headers: Record<string, string> = { 'X-MBX-APIKEY': apiKey, 'User-Agent': 'Arsenal/1.0', Accept: 'application/json' };

    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method, headers: { ...headers, Host: target.hostname }, timeout: 30000 };
    } else {
      client = https;
      options = { hostname: target.hostname, path: target.pathname + target.search, method, headers, timeout: 30000, family: 4 };
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`Binance ${res.statusCode}: ${parsed?.msg ?? data.slice(0, 200)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Failed to parse Binance response: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Binance request timeout')); });
    req.end();
  });
}

export async function executeBinanceSkill(input: any): Promise<Record<string, any>> {
  const {
    action, symbol, interval = '1h', limit = 100,
    api_key, secret_key, side, order_type = 'LIMIT', quantity, quote_order_qty, price,
    time_in_force = 'GTC', order_id, recv_window = 5000,
  } = input ?? {};

  const PRIVATE_ACTIONS = ['get_account', 'place_order', 'cancel_order', 'get_order', 'get_open_orders'];
  if (PRIVATE_ACTIONS.includes(action) && (!api_key || !secret_key)) {
    return { error: 'api_key and secret_key are required for this action.' };
  }

  try {
    switch (action) {
      // ── Public ──────────────────────────────────────────────────────────────
      case 'get_price': {
        const res = await pubGet('/api/v3/ticker/price', symbol ? { symbol } : undefined);
        if (Array.isArray(res)) return { prices: res.map((t: any) => ({ symbol: t.symbol, price: t.price })), count: res.length };
        if (res?.code) return { error: res.msg, code: res.code };
        return { symbol: res.symbol, price: res.price };
      }

      case 'get_24h_stats': {
        const res = await pubGet('/api/v3/ticker/24hr', symbol ? { symbol } : undefined);
        if (res?.code) return { error: res.msg, code: res.code };
        const map = (t: any) => ({
          symbol: t.symbol, last_price: t.lastPrice, price_change: t.priceChange, price_change_pct: t.priceChangePercent,
          high_24h: t.highPrice, low_24h: t.lowPrice, volume_24h: t.volume, quote_volume_24h: t.quoteVolume,
          open: t.openPrice, trade_count: t.count,
        });
        return Array.isArray(res) ? { stats: res.map(map), count: res.length } : map(res);
      }

      case 'get_orderbook': {
        if (!symbol) return { error: 'symbol is required' };
        const res = await pubGet('/api/v3/depth', { symbol, limit: String(Math.min(limit, 5000)) });
        if (res?.code) return { error: res.msg, code: res.code };
        return { symbol, last_update_id: res.lastUpdateId, bids: res.bids, asks: res.asks };
      }

      case 'get_klines': {
        if (!symbol) return { error: 'symbol is required' };
        if (!KLINE_INTERVALS.includes(interval)) return { error: `invalid interval; one of ${KLINE_INTERVALS.join(', ')}` };
        const res = await pubGet('/api/v3/klines', { symbol, interval, limit: String(Math.min(limit, 1000)) });
        if (res?.code) return { error: res.msg, code: res.code };
        return {
          symbol, interval,
          candles: (res as any[]).map((c) => ({ open_time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5], close_time: c[6], quote_volume: c[7], trades: c[8] })),
        };
      }

      case 'get_recent_trades': {
        if (!symbol) return { error: 'symbol is required' };
        const res = await pubGet('/api/v3/trades', { symbol, limit: String(Math.min(limit, 1000)) });
        if (res?.code) return { error: res.msg, code: res.code };
        return { symbol, trades: (res as any[]).map((t) => ({ id: t.id, price: t.price, qty: t.qty, quote_qty: t.quoteQty, time: t.time, is_buyer_maker: t.isBuyerMaker })) };
      }

      case 'get_avg_price': {
        if (!symbol) return { error: 'symbol is required' };
        const res = await pubGet('/api/v3/avgPrice', { symbol });
        if (res?.code) return { error: res.msg, code: res.code };
        return { symbol, mins: res.mins, price: res.price };
      }

      case 'get_exchange_info': {
        const res = await pubGet('/api/v3/exchangeInfo', symbol ? { symbol } : undefined);
        if (res?.code) return { error: res.msg, code: res.code };
        return {
          timezone: res.timezone, server_time: res.serverTime,
          symbols: (res.symbols || []).map((s: any) => ({
            symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset, status: s.status,
            base_precision: s.baseAssetPrecision, quote_precision: s.quoteAssetPrecision,
            order_types: s.orderTypes, is_spot: s.isSpotTradingAllowed,
          })),
          count: (res.symbols || []).length,
        };
      }

      // ── Private (signed) ──────────────────────────────────────────────────────
      case 'get_account': {
        const res = await signedRequest('GET', '/api/v3/account', { timestamp: Date.now(), recvWindow: recv_window }, api_key, secret_key);
        const balances = (res.balances || [])
          .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
          .map((b: any) => ({ asset: b.asset, free: b.free, locked: b.locked, total: String(parseFloat(b.free) + parseFloat(b.locked)) }));
        return { can_trade: res.canTrade, account_type: res.accountType, balances, count: balances.length };
      }

      case 'place_order': {
        if (!symbol || !side) return { error: 'symbol and side are required' };
        const type = String(order_type).toUpperCase();
        const params: Record<string, string | number> = { symbol, side: String(side).toUpperCase(), type, timestamp: Date.now(), recvWindow: recv_window };
        if (type === 'LIMIT') {
          if (!price || !quantity) return { error: 'price and quantity are required for LIMIT orders' };
          params.timeInForce = time_in_force; params.price = price; params.quantity = quantity;
        } else { // MARKET
          if (!quantity && !quote_order_qty) return { error: 'quantity or quote_order_qty is required for MARKET orders' };
          if (quantity) params.quantity = quantity;
          if (quote_order_qty) params.quoteOrderQty = quote_order_qty;
        }
        const res = await signedRequest('POST', '/api/v3/order', params, api_key, secret_key);
        return {
          order_id: res.orderId, symbol: res.symbol, side: res.side, type: res.type,
          status: res.status, price: res.price, orig_qty: res.origQty, executed_qty: res.executedQty,
          cummulative_quote_qty: res.cummulativeQuoteQty, fills: res.fills,
        };
      }

      case 'cancel_order': {
        if (!symbol || !order_id) return { error: 'symbol and order_id are required' };
        const res = await signedRequest('DELETE', '/api/v3/order', { symbol, orderId: order_id, timestamp: Date.now(), recvWindow: recv_window }, api_key, secret_key);
        return { order_id: res.orderId, symbol: res.symbol, status: res.status };
      }

      case 'get_order': {
        if (!symbol || !order_id) return { error: 'symbol and order_id are required' };
        const res = await signedRequest('GET', '/api/v3/order', { symbol, orderId: order_id, timestamp: Date.now(), recvWindow: recv_window }, api_key, secret_key);
        return {
          order_id: res.orderId, symbol: res.symbol, side: res.side, type: res.type, status: res.status,
          price: res.price, orig_qty: res.origQty, executed_qty: res.executedQty, time: res.time, update_time: res.updateTime,
        };
      }

      case 'get_open_orders': {
        const params: Record<string, string | number> = { timestamp: Date.now(), recvWindow: recv_window };
        if (symbol) params.symbol = symbol;
        const res = await signedRequest('GET', '/api/v3/openOrders', params, api_key, secret_key);
        return { open_orders: (res as any[]).map((o) => ({ order_id: o.orderId, symbol: o.symbol, side: o.side, type: o.type, price: o.price, orig_qty: o.origQty, executed_qty: o.executedQty, status: o.status })), count: (res as any[]).length };
      }

      default:
        return { error: `Unknown action "${action}". Public: get_price, get_24h_stats, get_orderbook, get_klines, get_recent_trades, get_avg_price, get_exchange_info. Private: get_account, place_order, cancel_order, get_order, get_open_orders.` };
    }
  } catch (err: any) {
    return { error: err.message || 'Binance skill execution failed' };
  }
}
