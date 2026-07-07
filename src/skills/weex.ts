/**
 * Official Skill: WEEX Exchange
 *
 * Spot trading and market data for WEEX CEX.
 * Public endpoints (market data) require no API key.
 * Private endpoints (trading, account) require user's WEEX API credentials.
 *
 * API Docs: https://www.weex.com/api-doc/spot/introduction/APIBriefIntroduction
 */

import * as crypto from 'crypto';
import { httpsGet } from '@/lib/skill-executors';

const BASE_URL = 'https://api-spot.weex.com';

export const WEEX_SKILL_METADATA = {
  name: 'WEEX Exchange',
  description:
    'Spot trading and real-time market data on WEEX CEX. ' +
    'Get live prices, order books, K-line charts, and recent trades for any trading pair. ' +
    'With a WEEX API key, also supports account balance queries, placing orders, and cancelling orders.',
  category: 'Finance',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['weex', 'cex', 'spot', 'trading', 'market-data', 'orderbook', 'klines'],
  external_url: 'https://www.weex.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/weex?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_ticker',
          'get_all_tickers',
          'get_orderbook',
          'get_klines',
          'get_recent_trades',
          'get_account_balance',
          'place_order',
          'cancel_order',
          'get_order_info',
        ],
        description: 'Action to perform. Public: get_ticker, get_all_tickers, get_orderbook, get_klines, get_recent_trades. Private (requires api_key): get_account_balance, place_order, cancel_order, get_order_info.',
      },
      symbol: {
        type: 'string',
        description: 'Trading pair symbol, e.g. BTCUSDT, ETHUSDT. Required for most actions.',
      },
      period: {
        type: 'string',
        enum: ['1min', '5min', '15min', '30min', '1h', '4h', '12h', '1day', '1week'],
        description: 'Candlestick interval for get_klines. Default: 1h.',
      },
      limit: {
        type: 'number',
        description: 'Number of results to return. Default: 20.',
      },
      depth_type: {
        type: 'string',
        enum: ['step0', 'step1', 'step2', 'step3', 'step4', 'step5'],
        description: 'Order book aggregation level for get_orderbook. Default: step0 (no aggregation).',
      },
      // Private endpoint fields
      api_key: {
        type: 'string',
        description: 'WEEX API key. Required for private actions (account, trading).',
      },
      secret_key: {
        type: 'string',
        description: 'WEEX secret key for signing requests. Required for private actions.',
      },
      passphrase: {
        type: 'string',
        description: 'WEEX API passphrase set during key creation. Required for private actions.',
      },
      // Order fields
      side: {
        type: 'string',
        enum: ['buy', 'sell'],
        description: 'Order direction for place_order.',
      },
      order_type: {
        type: 'string',
        enum: ['limit', 'market'],
        description: 'Order type for place_order. Default: limit.',
      },
      price: {
        type: 'string',
        description: 'Order price for limit orders.',
      },
      quantity: {
        type: 'string',
        description: 'Order quantity (base asset amount) for place_order.',
      },
      order_id: {
        type: 'string',
        description: 'Order ID for cancel_order and get_order_info.',
      },
    },
  },
};

// ── Auth helpers ──────────────────────────────────────────

function buildSignature(
  timestamp: string,
  method: string,
  path: string,
  body: string,
  secretKey: string
): string {
  const prehash = timestamp + method.toUpperCase() + path + body;
  return crypto.createHmac('sha256', secretKey).update(prehash).digest('base64');
}

function privateHeaders(
  method: string,
  path: string,
  body: string,
  apiKey: string,
  secretKey: string,
  passphrase: string
): Record<string, string> {
  const timestamp = Date.now().toString();
  const sign = buildSignature(timestamp, method, path, body, secretKey);
  return {
    'Content-Type': 'application/json',
    'ACCESS-KEY': apiKey,
    'ACCESS-SIGN': sign,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': passphrase,
  };
}

// ── HTTP helpers ──────────────────────────────────────────

async function weexGet(path: string, params?: Record<string, string>): Promise<any> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return httpsGet(`${BASE_URL}${path}${qs}`);
}

async function weexPrivateGet(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  secretKey: string,
  passphrase: string
): Promise<any> {
  const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  const fullPath = path + qs;
  const headers = privateHeaders('GET', fullPath, '', apiKey, secretKey, passphrase);

  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${fullPath}`);
    const https = require('https');
    const req = https.get(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers,
        timeout: 30000,
        family: 4,
      },
      (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Failed to parse response')); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function weexPrivatePost(
  path: string,
  body: Record<string, any>,
  apiKey: string,
  secretKey: string,
  passphrase: string
): Promise<any> {
  const bodyStr = JSON.stringify(body);
  const headers = privateHeaders('POST', path, bodyStr, apiKey, secretKey, passphrase);

  return new Promise((resolve, reject) => {
    const https = require('https');
    const req = https.request(
      {
        hostname: 'api.weex.com',
        path,
        method: 'POST',
        headers,
        timeout: 30000,
        family: 4,
      },
      (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Failed to parse response')); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

// ── Symbol helper ─────────────────────────────────────────
// WEEX v2 uses suffix _SPBL for spot pairs (e.g. BTCUSDT_SPBL)
function toSpotSymbol(symbol: string): string {
  if (symbol.endsWith('_SPBL')) return symbol;
  return symbol + '_SPBL';
}

// ── Main executor ─────────────────────────────────────────

export async function executeWeexSkill(input: any): Promise<Record<string, any>> {
  const {
    action,
    symbol,
    period = '1h',
    limit = 20,
    api_key,
    secret_key,
    passphrase,
    side,
    order_type = 'limit',
    price,
    quantity,
    order_id,
  } = input;

  // Validate private action credentials
  const PRIVATE_ACTIONS = ['get_account_balance', 'place_order', 'cancel_order', 'get_order_info'];
  if (PRIVATE_ACTIONS.includes(action)) {
    if (!api_key || !secret_key || !passphrase) {
      return { error: 'api_key, secret_key, and passphrase are required for this action.' };
    }
  }

  try {
    switch (action) {

      // ── Public: get ticker for one symbol ──
      case 'get_ticker': {
        if (!symbol) return { error: 'symbol is required' };
        const sym = toSpotSymbol(symbol);
        const res = await weexGet('/api/v2/market/ticker', { symbol: sym });
        if (res.code !== '00000') return { error: res.msg, code: res.code };
        const t = res.data;
        return {
          symbol: t.symbol,
          last_price: t.lastPrice ?? t.close,
          open_24h: t.open,
          high_24h: t.high,
          low_24h: t.low,
          volume_24h: t.size ?? t.baseVol,
          price_change_pct_24h: t.priceChangePercent ?? t.change24h,
          timestamp: res.requestTime,
        };
      }

      // ── Public: get all tickers ──
      case 'get_all_tickers': {
        const res = await weexGet('/api/v2/market/tickers');
        if (res.code !== '00000') return { error: res.msg, code: res.code };
        const tickers = (res.data || []).map((t: any) => ({
          symbol: t.symbol,
          last_price: t.lastPrice ?? t.close,
          price_change_pct_24h: t.priceChangePercent ?? t.change24h,
          volume_24h: t.size ?? t.baseVol,
        }));
        return { tickers, count: tickers.length };
      }

      // ── Public: order book ──
      case 'get_orderbook': {
        if (!symbol) return { error: 'symbol is required' };
        const sym = toSpotSymbol(symbol);
        const res = await weexGet('/api/v2/market/depth', { symbol: sym });
        if (res.code !== '00000') return { error: res.msg, code: res.code };
        return {
          symbol: sym,
          bids: (res.data?.bids || []).slice(0, limit),
          asks: (res.data?.asks || []).slice(0, limit),
          timestamp: res.requestTime,
        };
      }

      // ── Public: candlestick / K-line ──
      case 'get_klines': {
        if (!symbol) return { error: 'symbol is required' };
        const sym = toSpotSymbol(symbol);
        const res = await weexGet('/api/v2/market/candles', { symbol: sym, period });
        if (res.code !== '00000') return { error: res.msg, code: res.code };
        const candles = (res.data || []).slice(0, limit).map((c: any) => ({
          timestamp: c[0],
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
          volume: c[5],
        }));
        return { symbol: sym, period, candles };
      }

      // ── Public: recent trades ──
      case 'get_recent_trades': {
        if (!symbol) return { error: 'symbol is required' };
        const sym = toSpotSymbol(symbol);
        const res = await weexGet('/api/v2/market/fills', { symbol: sym, limit: String(limit) });
        if (res.code !== '00000') return { error: res.msg, code: res.code };
        return {
          symbol: sym,
          trades: (res.data || []).map((t: any) => ({
            price: t.price,
            size: t.size,
            side: t.side,
            timestamp: t.ts ?? t.timestamp,
          })),
        };
      }

      // ── Private: account balance ──
      case 'get_account_balance': {
        const res = await weexPrivateGet(
          '/api/v2/account/assets',
          {},
          api_key, secret_key, passphrase
        );
        if (res.code !== '00000') return { error: res.msg, code: res.code };
        const assets = (res.data || [])
          .filter((a: any) => parseFloat(a.available) > 0 || parseFloat(a.frozen) > 0)
          .map((a: any) => ({
            coin: a.coinName ?? a.coin,
            available: a.available,
            frozen: a.frozen,
            total: String(parseFloat(a.available || '0') + parseFloat(a.frozen || '0')),
          }));
        return { assets, count: assets.length };
      }

      // ── Private: place order ──
      case 'place_order': {
        if (!symbol || !side || !quantity) {
          return { error: 'symbol, side, and quantity are required' };
        }
        if (order_type === 'limit' && !price) {
          return { error: 'price is required for limit orders' };
        }
        const body: Record<string, any> = {
          symbol: toSpotSymbol(symbol),
          side,
          orderType: order_type,
          quantity,
          ...(price && { price }),
        };
        const res = await weexPrivatePost(
          '/api/v2/trade/orders',
          body,
          api_key, secret_key, passphrase
        );
        if (res.code !== '00000') return { error: res.msg, code: res.code };
        return {
          order_id: res.data?.orderId,
          symbol: body.symbol,
          side,
          order_type,
          price,
          quantity,
          status: 'submitted',
        };
      }

      // ── Private: cancel order ──
      case 'cancel_order': {
        if (!symbol || !order_id) return { error: 'symbol and order_id are required' };
        const res = await weexPrivatePost(
          '/api/v2/trade/cancel-order',
          { symbol: toSpotSymbol(symbol), orderId: order_id },
          api_key, secret_key, passphrase
        );
        if (res.code !== '00000') return { error: res.msg, code: res.code };
        return { order_id, symbol: toSpotSymbol(symbol), status: 'cancelled' };
      }

      // ── Private: get order info ──
      case 'get_order_info': {
        if (!symbol || !order_id) return { error: 'symbol and order_id are required' };
        const res = await weexPrivatePost(
          '/api/v2/trade/orderInfo',
          { symbol: toSpotSymbol(symbol), orderId: order_id },
          api_key, secret_key, passphrase
        );
        if (res.code !== '00000') return { error: res.msg, code: res.code };
        const o = res.data;
        return {
          order_id: o?.orderId,
          symbol: o?.symbol,
          side: o?.side,
          order_type: o?.orderType,
          price: o?.price,
          quantity: o?.quantity,
          filled_quantity: o?.filledQty,
          status: o?.status,
          created_at: o?.cTime,
        };
      }

      default:
        return { error: `Unknown action: ${action}` };
    }
  } catch (err: any) {
    return { error: err.message || 'Execution failed' };
  }
}
