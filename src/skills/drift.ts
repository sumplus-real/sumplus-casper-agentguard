/**
 * Official Skill: Drift Protocol (drift.trade)
 *
 * Drift is a leading Solana perpetual-futures and spot DEX. This skill reads
 * Drift perp market data (price, funding, open interest, volume) and builds a
 * structured order intent plus an app deep link for execution.
 *
 * Skill UUID: 96074985-a8fa-46d8-a365-1ec7c7289d87
 *
 * NOTE on data source: Drift's public Data API (https://data.api.drift.trade)
 * is fronted by a CloudFront WAF that blocks many datacenter egress IPs (403).
 * This executor degrades gracefully — if the API is unreachable from the deploy
 * region it returns a clear error rather than hanging. Verify reachability from
 * the production region before relying on the query actions.
 *
 * NOTE on transactions: Drift order placement requires the @drift-labs SDK
 * (subaccount init, collateral deposit, placePerpOrder) — there is no public
 * REST endpoint that returns a signable tx. The build action therefore returns
 * a structured order intent and an app.drift.trade deep link, not a base64 tx.
 *
 * Actions:
 *   get_markets        — all perp markets: price, funding rate (hourly + APR), OI, 24h volume
 *   get_market         — a single perp market by symbol
 *   get_funding_rate   — detailed funding for a market (hourly %, APR, oracle/mark TWAP)
 *   build_order_intent — structured perp order intent + app.drift.trade deep link
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Drift Data API ───────────────────────────────────────────────────────────────
const API = 'https://data.api.drift.trade';
const APP = 'https://app.drift.trade';

// ── Helpers ─────────────────────────────────────────────────────────────────────

function nodeGet(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    let options: any;
    let client: typeof https | typeof http;
    const baseHeaders: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' };
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method: 'GET',
        headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: 20000 };
    } else {
      client  = https;
      options = { hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method: 'GET',
        headers: baseHeaders, timeout: 20000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const code = res.statusCode ?? 200;
        if (code === 403) { reject(new Error('Drift Data API returned 403 (WAF-blocked from this region). The market-data actions are unavailable here; the build_order_intent action still works.')); return; }
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (code >= 400) reject(new Error(`Drift API ${code}: ${data.slice(0, 160)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function pctFromHourly(hourly: number): { hourly_pct: string; apr_pct: string } {
  return { hourly_pct: `${(hourly * 100).toFixed(4)}%`, apr_pct: `${(hourly * 24 * 365 * 100).toFixed(2)}%` };
}

// /contracts row → clean market view (CoinGecko-derivatives field convention)
function mapContract(c: any) {
  const funding = c.funding_rate != null ? parseFloat(c.funding_rate) : null;
  return {
    market: c.ticker_id ?? c.product?.toUpperCase(),
    base: c.base_currency,
    price: c.last_price ?? c.last,
    index_price: c.index_price,
    open_interest: c.open_interest,
    volume_24h_base: c.base_volume,
    volume_24h_quote: c.quote_volume,
    funding_rate: funding != null ? pctFromHourly(funding) : null,
    next_funding_rate: c.next_funding_rate ?? undefined,
    product_type: c.product_type ?? 'PERP',
  };
}

// normalize "SOL" / "sol-perp" → "SOL-PERP"
function normMarket(s: string): string {
  const u = (s ?? '').toUpperCase().trim();
  return u.endsWith('-PERP') ? u : `${u}-PERP`;
}

// ── Skill metadata ───────────────────────────────────────────────────────────────

export const DRIFT_SKILL_METADATA = {
  name: 'Drift Protocol',
  description:
    'Interact with Drift Protocol (drift.trade) — a leading Solana perpetual-futures DEX. Read perp ' +
    'market data (oracle/mark price, hourly funding rate and its APR, open interest, 24h volume) for ' +
    'markets like SOL-PERP, BTC-PERP, ETH-PERP, and build a structured perp order intent with an ' +
    'app.drift.trade deep link for execution.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['drift', 'solana', 'perpetuals', 'perps', 'derivatives', 'funding-rate', 'defi'],
  external_url: 'https://drift.trade',
  logo_url: 'https://icons.llamao.fi/icons/protocols/drift?w=48&h=48',
  // Held at 'pending': Drift's Data API (data.api.drift.trade) is WAF-blocked
  // (HTTP 403) from the Vercel deploy region, so the market-data actions are
  // non-functional in production and no region-safe alternative source exists
  // (CoinGecko lists Drift with 0 tickers; DefiLlama is TVL-only). Re-approve
  // once data is re-sourced (residential proxy or on-chain RPC + SDK).
  partner_verified: true,
  status: 'pending',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_markets', 'get_market', 'get_funding_rate', 'build_order_intent'],
        description:
          'Drift operation. ' +
          'get_markets: all perp markets (price, funding, OI, volume). ' +
          'get_market: one perp market by symbol. ' +
          'get_funding_rate: detailed funding for a market (hourly %, APR, TWAPs). ' +
          'build_order_intent: structured order intent + app.drift.trade deep link (not a signable tx — Drift needs its SDK to sign).',
      },
      market: {
        type: 'string',
        description: 'Perp market symbol, e.g. "SOL-PERP" or "SOL". Required for get_market, get_funding_rate, build_order_intent.',
      },
      side: {
        type: 'string',
        enum: ['long', 'short'],
        description: 'Order direction for build_order_intent.',
      },
      size_usd: {
        type: 'string',
        description: 'Notional order size in USD for build_order_intent.',
      },
      order_type: {
        type: 'string',
        enum: ['market', 'limit'],
        description: 'Order type for build_order_intent (default market).',
      },
      limit_price: {
        type: 'string',
        description: 'Limit price for build_order_intent when order_type is "limit".',
      },
    },
  },
  usage_examples: [
    { title: 'All perp markets', input: { action: 'get_markets' } },
    { title: 'SOL-PERP', input: { action: 'get_market', market: 'SOL-PERP' } },
    { title: 'SOL funding', input: { action: 'get_funding_rate', market: 'SOL' } },
    { title: 'Long 500 USD SOL', input: { action: 'build_order_intent', market: 'SOL-PERP', side: 'long', size_usd: '500' } },
  ],
};

// ── Executor ─────────────────────────────────────────────────────────────────────

export async function executeDriftSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {

      // ── get_markets ───────────────────────────────────────────────────────
      case 'get_markets': {
        const data = await nodeGet(`${API}/contracts`);
        const list: any[] = Array.isArray(data) ? data : (data.contracts ?? []);
        const perps = list.filter((c) => (c.product_type ?? 'PERP') === 'PERP').map(mapContract);
        return { success: true, output: { count: perps.length, markets: perps } };
      }

      // ── get_market ────────────────────────────────────────────────────────
      case 'get_market': {
        if (!input.market) return { success: false, error: 'market is required (e.g. "SOL-PERP")' };
        const want = normMarket(input.market);
        const data = await nodeGet(`${API}/contracts`);
        const list: any[] = Array.isArray(data) ? data : (data.contracts ?? []);
        const c = list.find((x) => (x.ticker_id ?? '').toUpperCase() === want);
        if (!c) return { success: false, error: `Market "${want}" not found. Try get_markets to list available markets.` };
        return { success: true, output: mapContract(c) };
      }

      // ── get_funding_rate ──────────────────────────────────────────────────
      case 'get_funding_rate': {
        if (!input.market) return { success: false, error: 'market is required (e.g. "SOL-PERP")' };
        const want = normMarket(input.market);
        const data = await nodeGet(`${API}/fundingRates?marketName=${want}`);
        const rates: any[] = data.fundingRates ?? [];
        if (rates.length === 0) return { success: false, error: `No funding data for "${want}"` };
        const latest = rates[rates.length - 1];
        const fundingRate = parseFloat(latest.fundingRate ?? '0') / 1e9;
        const oracleTwap  = parseFloat(latest.oraclePriceTwap ?? '0') / 1e6;
        const hourly = oracleTwap > 0 ? fundingRate / oracleTwap : 0;
        return {
          success: true,
          output: {
            market: want,
            funding_rate: pctFromHourly(hourly),
            oracle_price_twap: oracleTwap,
            mark_price_twap: parseFloat(latest.markPriceTwap ?? '0') / 1e6,
            ts: latest.ts,
            note: 'Positive funding = longs pay shorts. APR = hourly × 24 × 365.',
          },
        };
      }

      // ── build_order_intent ────────────────────────────────────────────────
      case 'build_order_intent': {
        const { market, side } = input;
        if (!market) return { success: false, error: 'market is required (e.g. "SOL-PERP")' };
        if (side !== 'long' && side !== 'short') return { success: false, error: 'side must be "long" or "short"' };
        const want = normMarket(market);
        const orderType = input.order_type ?? 'market';
        if (orderType === 'limit' && !input.limit_price) return { success: false, error: 'limit_price is required when order_type is "limit"' };

        return {
          success: true,
          output: {
            kind: 'order_intent',
            market: want,
            side,
            order_type: orderType,
            size_usd: input.size_usd ?? null,
            limit_price: input.limit_price ?? null,
            deep_link: `${APP}/${want}`,
            signable_tx: null,
            note: 'Drift order placement is not available as a signable REST transaction. Execute this intent in the Drift app via the deep link, or sign it programmatically with the @drift-labs/sdk (subaccount + placePerpOrder).',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Supported: get_markets, get_market, get_funding_rate, build_order_intent` };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Drift skill execution failed' };
  }
}
