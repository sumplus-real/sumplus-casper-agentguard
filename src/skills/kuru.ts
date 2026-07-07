/**
 * Official Skill: Kuru (Monad-native CLOB DEX) — READ-ONLY
 *
 * Kuru is a fully on-chain central-limit-order-book (CLOB) DEX native to Monad,
 * combining an order book with an AMM vault per market. This skill reads Kuru's
 * markets: token pairs, prices, fees, tick/size precision, and rolling volume /
 * liquidity stats.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Kuru's region-safe public API. No API key needed.
 *
 * WHY READ-ONLY: swapping on Kuru requires CLOB router calldata (order placement
 * against a specific market / limit price), which is only reliably produced by
 * the Kuru SDK / off-chain flow engine (JWT/websocket). Build actions are deferred
 * until that path is region-safe and ABI-grounded. Reads are fully supported.
 *
 * Contracts on Monad (chain ID 143), for reference:
 *   Kuru Aggregator / entrypoint: 0xb3e6778480b2E488385E8205eA05E20060B813cb
 *   Kuru Flow Router:             0x0d3a1BE29E9dEd63c7a5678b31e847D68F71FFa2
 *   Kuru MarginAccount:           0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5
 *   Kuru MarketFactory:           0xd651346d7c789536ebf06dc72aE3C8502cd695CC
 *
 * Data source (region-safe):
 *   Kuru API  https://api.kuru.io/api/v1/markets       — market list
 *             https://api.kuru.io/api/v1/markets/<addr> — single market
 *
 * Actions:
 *   get_protocol_info — protocol overview + market count + contract addresses
 *   get_markets       — list markets (pair, price, fees, 24h volume, liquidity)
 *   get_market        — one market by address
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

const CHAIN_ID = 143;
const API_BASE = 'https://api.kuru.io/api/v1';

const CONTRACTS = {
  aggregator:    '0xb3e6778480b2E488385E8205eA05E20060B813cb',
  flowRouter:    '0x0d3a1BE29E9dEd63c7a5678b31e847D68F71FFa2',
  marginAccount: '0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5',
  marketFactory: '0xd651346d7c789536ebf06dc72aE3C8502cd695CC',
} as const;

// ── Low-level HTTP (proxy-aware GET) ──────────────────────────────────────────
function nodeGet(urlStr: string, timeoutMs = 20000): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const baseHeaders: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' };
    let options: any; let client: typeof https | typeof http;
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method: 'GET', headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: timeoutMs };
    } else {
      client = targetUrl.protocol === 'http:' ? http : https;
      options = { hostname: targetUrl.hostname, port: targetUrl.port || 443, path: targetUrl.pathname + targetUrl.search, method: 'GET', headers: baseHeaders, timeout: timeoutMs, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 160)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const num = (v: any) => (v == null ? null : Number(v));

// Flatten a raw Kuru market record into an agent-friendly shape.
function shapeMarket(m: any) {
  const base = m.basetoken ?? {};
  const quote = m.quotetoken ?? {};
  return {
    market: m.market,
    pair: base.ticker && quote.ticker ? `${base.ticker}/${quote.ticker}` : null,
    base_token: { address: m.baseasset, symbol: base.ticker ?? null, name: base.name ?? null, decimals: base.decimal != null ? Number(base.decimal) : null },
    quote_token: { address: m.quoteasset, symbol: quote.ticker ?? null, name: quote.name ?? null, decimals: quote.decimal != null ? Number(quote.decimal) : null },
    amm_vault: m.kuruammvault ?? null,
    last_price: num(m.lastPrice),
    price_change_24h: num(m.priceChange24h),
    volume_24h: num(m.volume24h),
    liquidity: num(m.liquidity),
    taker_fee_bps: m.takerfeebps != null ? Number(m.takerfeebps) : null,
    maker_fee_bps: m.makerfeebps != null ? Number(m.makerfeebps) : null,
    tick_size: m.ticksize ?? null,
    min_size: m.minsize ?? null,
    max_size: m.maxsize ?? null,
    unique_traders_24h: m.uniqueTraders24h != null ? Number(m.uniqueTraders24h) : null,
  };
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const KURU_SKILL_METADATA = {
  name: 'Kuru (Monad CLOB DEX)',
  description:
    '[ARSENAL-HOSTED ✓] Read Kuru, a fully on-chain central-limit-order-book (CLOB) DEX native to Monad mainnet ' +
    '(chain ID 143). List markets with their token pair, last price, 24h price change and volume, liquidity, ' +
    'maker/taker fees and tick / size precision, or read a single market by address. Read-only: order placement / ' +
    'swap calldata is produced by the Kuru SDK and is not built here yet.\n\n' +
    'execution_mode: server-side\n' +
    'chain: monad (id: 143)\n' +
    'data_source: https://api.kuru.io\n' +
    'gas_token: MON\n' +
    'sop_compliance:\n' +
    '  read_only: true\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['kuru', 'monad', 'clob', 'orderbook', 'dex', 'defi', 'evm', 'mon', 'trading'],
  external_url: 'https://www.kuru.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/kuru?w=48&h=48',
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
          'get_protocol_info: protocol overview, market count, contract addresses. ' +
          'get_markets: list markets (pair, price, fees, 24h volume, liquidity). ' +
          'get_market: one market by address (needs market).',
      },
      market: { type: 'string', description: 'Market contract address (0x…, 40 hex). Required for get_market.' },
      limit:  { type: 'number', description: 'Max markets to return for get_markets (default 50).' },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'List markets', input: { action: 'get_markets', limit: 20 } },
    { title: 'Get a market', input: { action: 'get_market', market: '0x065c9d28e428a0db40191a54d33d5b7c71a9c394' } },
  ],
};

// ── Executor ────────────────────────────────────────────────────────────────

export async function executeKuruSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {

      case 'get_protocol_info': {
        let marketCount: number | null = null;
        try {
          const r = await nodeGet(`${API_BASE}/markets`);
          const arr = r?.data?.data ?? r?.data ?? [];
          marketCount = Array.isArray(arr) ? arr.length : null;
        } catch { /* non-fatal */ }
        return {
          success: true,
          output: {
            protocol: 'Kuru', kind: 'On-chain CLOB DEX', chain: 'monad', chain_id: CHAIN_ID,
            market_count: marketCount,
            contracts: CONTRACTS,
            api: `${API_BASE}/markets`,
            read_only: true,
            note: 'Kuru is a fully on-chain order-book DEX native to Monad. This skill provides market reads; swaps/order placement use the Kuru SDK and are not built here.',
          },
        };
      }

      case 'get_markets': {
        const limit = Number(input.limit ?? 50);
        const r = await nodeGet(`${API_BASE}/markets`);
        const arr: any[] = r?.data?.data ?? r?.data ?? [];
        if (!Array.isArray(arr)) return { success: false, error: 'Unexpected Kuru API response shape' };
        const markets = arr
          .map(shapeMarket)
          .sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0))
          .slice(0, Math.max(1, limit));
        return {
          success: true,
          output: {
            protocol: 'Kuru', chain: 'monad', chain_id: CHAIN_ID,
            total_markets: arr.length, returned: markets.length,
            markets,
            note: 'Sorted by 24h volume, descending. Read-only.',
          },
        };
      }

      case 'get_market': {
        const market = input.market;
        if (!market || !isAddr(market)) return { success: false, error: 'A valid market address (0x…, 40 hex) is required' };
        const r = await nodeGet(`${API_BASE}/markets/${market.toLowerCase()}`);
        const m = r?.data?.data ?? r?.data;
        if (!m || !m.market) return { success: false, error: `Kuru market ${market} not found` };
        return {
          success: true,
          output: { protocol: 'Kuru', chain: 'monad', chain_id: CHAIN_ID, ...shapeMarket(m) },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Valid: get_protocol_info, get_markets, get_market` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Kuru skill execution failed' };
  }
}
