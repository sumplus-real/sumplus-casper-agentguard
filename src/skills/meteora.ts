/**
 * Official Skill: Meteora (meteora.ag)
 *
 * Meteora is Solana's largest liquidity layer — its flagship DLMM (Dynamic
 * Liquidity Market Maker, concentrated-liquidity bins) and DAMM v2 power a huge
 * share of Solana on-chain volume. This skill reads DLMM pool/market data and
 * builds a serialised Solana swap transaction routed through Meteora.
 *
 * Skill UUID: 8cb3f235-4d25-4968-aefb-0f5c1a6294b1
 *
 * Data source: Meteora's datapi (https://dlmm.datapi.meteora.ag) — keyless,
 * CORS-open, datacenter-safe (verified, no Cloudflare JS-challenge). The legacy
 * dlmm-api.meteora.ag/pair host is deprecated; do not use it.
 *
 * Transactions: Meteora exposes NO native REST endpoint that returns a signable
 * transaction — position/liquidity actions require the @meteora-ag/dlmm SDK and
 * an RPC connection (out of scope for this hosted executor). SWAPS, however, are
 * buildable via Jupiter pinned to Meteora's program (dexes=Meteora DLMM / DAMM
 * v2 / Meteora), which returns a base64 VersionedTransaction — the same pattern
 * the Raydium and Orca skills use.
 *
 * Actions:
 *   get_pools          — DLMM pools ranked by volume/TVL/APR (filter + search)
 *   get_pool           — a single pool by address
 *   get_protocol_stats — Meteora protocol-wide TVL / volume / fees
 *   get_price          — USD prices for Solana tokens (via Jupiter Price API v3)
 *   build_swap_tx      — build a swap routed through Meteora (token_in/out, amount_in, sender)
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Meteora datapi + Jupiter ──────────────────────────────────────────────────
const DLMM_API  = 'https://dlmm.datapi.meteora.ag';
const PRICE_API = 'https://lite-api.jup.ag/price/v3'; // Jupiter free tier
const JUP_API   = 'https://lite-api.jup.ag/swap/v1';  // Jupiter routing

// Meteora program labels exposed by Jupiter routing (verified via program-id-to-label)
const METEORA_DEXES: Record<string, string> = {
  DLMM:     'Meteora DLMM',
  'DAMM V2': 'Meteora DAMM v2',
  DAMM:     'Meteora',        // DAMM v1
};

// ── Token mint registry (for get_price + swap decimals) ───────────────────────
const TOKEN_MINTS: Record<string, string> = {
  SOL:     'So11111111111111111111111111111111111111112',
  WSOL:    'So11111111111111111111111111111111111111112',
  USDC:    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT:    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP:     'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK:    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF:     'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  MSOL:    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  JITOSOL: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
  RAY:     '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  JLP:     '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
};
const USD_TOKENS = new Set(['USDC', 'USDT']);

// ── Helpers (raw node https with proxy support) ───────────────────────────────

function nodeGet(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    let options: any;
    let client: typeof https | typeof http;
    const baseHeaders = { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' };
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method: 'GET',
        headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: 30000 };
    } else {
      client  = https;
      options = { hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method: 'GET',
        headers: baseHeaders, timeout: 30000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`Meteora API ${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function nodePost(urlStr: string, body: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const bodyStr   = JSON.stringify(body);
    let options: any;
    let client: typeof https | typeof http;
    const baseHeaders = { Accept: 'application/json', 'Content-Type': 'application/json',
      'User-Agent': 'Arsenal/1.0', 'Content-Length': Buffer.byteLength(bodyStr) };
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method: 'POST',
        headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: 30000 };
    } else {
      client  = https;
      options = { hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method: 'POST',
        headers: baseHeaders, timeout: 30000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

function fmtUsd(n: number): string {
  if (!isFinite(n)) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function decimalsFor(symbolOrMint: string): number {
  const up = symbolOrMint.toUpperCase();
  if (TOKEN_MINTS[up]) return USD_TOKENS.has(up) ? 6 : 9;
  return 9; // default for unknown SPL mints
}

function mapPool(p: any) {
  return {
    address:      p.address,
    name:         p.name,
    bin_step:     p.pool_config?.bin_step,
    base_fee_pct: p.pool_config?.base_fee_pct,
    token_x:      p.token_x ? { symbol: p.token_x.symbol, mint: p.token_x.address, price: p.token_x.price } : null,
    token_y:      p.token_y ? { symbol: p.token_y.symbol, mint: p.token_y.address, price: p.token_y.price } : null,
    current_price: p.current_price,
    tvl:          fmtUsd(p.tvl ?? 0),
    volume_24h:   fmtUsd(p.volume?.['24h'] ?? 0),
    fees_24h:     fmtUsd(p.fees?.['24h'] ?? 0),
    apr_pct:      p.apr != null ? `${(p.apr * 100).toFixed(2)}%` : null,
    apy_pct:      p.apy != null ? `${(p.apy).toFixed(2)}%` : null,
    has_farm:     p.has_farm ?? false,
    farm_apr_pct: p.farm_apr != null ? `${(p.farm_apr * 100).toFixed(2)}%` : null,
  };
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const METEORA_SKILL_METADATA = {
  name: 'Meteora',
  description:
    'Interact with Meteora (meteora.ag) — Solana\'s largest liquidity layer, home of the DLMM ' +
    '(Dynamic Liquidity Market Maker / concentrated-liquidity bins) and DAMM v2. Browse DLMM pools ' +
    'ranked by volume, TVL or APR, inspect a single pool (bin step, fees, reserves, farm APR), read ' +
    'protocol-wide stats and token prices, and build a Solana swap transaction routed through Meteora.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['meteora', 'solana', 'dlmm', 'dex', 'amm', 'liquidity', 'concentrated-liquidity', 'defi', 'spl'],
  external_url: 'https://app.meteora.ag',
  logo_url: 'https://icons.llamao.fi/icons/protocols/meteora?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_pools', 'get_pool', 'get_protocol_stats', 'get_price', 'build_swap_tx'],
        description:
          'Meteora operation. ' +
          'get_pools: DLMM pools ranked by a metric (sort_by) with optional text search (query). ' +
          'get_pool: one pool by address (pool_id). ' +
          'get_protocol_stats: protocol-wide TVL / volume / fees. ' +
          'get_price: USD prices for Solana tokens (tokens[]). ' +
          'build_swap_tx: build a Solana swap routed through Meteora (token_in, token_out, amount_in, sender).',
      },
      sort_by: {
        type: 'string',
        enum: ['volume_24h', 'tvl', 'apr_24h', 'fee_24h'],
        description: 'Ranking metric for get_pools (default: volume_24h, descending).',
      },
      limit: {
        type: 'integer',
        description: 'Max pools to return for get_pools (default: 20, max: 50).',
      },
      query: {
        type: 'string',
        description: 'Text search for get_pools — match by pair name, token symbol or address (e.g. "SOL/USDC").',
      },
      pool_id: {
        type: 'string',
        description: 'Pool address (base58) for get_pool.',
      },
      tokens: {
        type: 'array',
        items: { type: 'string' },
        description: 'Token symbols or SPL mint addresses for get_price.',
      },
      token_in: {
        type: 'string',
        description: 'Input token symbol (SOL, USDC, JUP…) or SPL mint. Required for build_swap_tx.',
      },
      token_out: {
        type: 'string',
        description: 'Output token symbol or SPL mint. Required for build_swap_tx.',
      },
      amount_in: {
        type: 'string',
        description: 'Human-readable exact-input amount (e.g. "1.5" for 1.5 SOL). Required for build_swap_tx.',
      },
      sender: {
        type: 'string',
        description: 'Solana wallet public key (base58). Required for build_swap_tx.',
      },
      dex: {
        type: 'string',
        enum: ['DLMM', 'DAMM V2', 'DAMM'],
        description: 'Which Meteora program to pin the swap route to (default: DLMM).',
      },
      slippage: {
        type: 'number',
        description: 'Max slippage as a decimal (e.g. 0.005 = 0.5%). Default: 0.005. Used by build_swap_tx.',
      },
    },
  },
  usage_examples: [
    { title: 'Top DLMM pools by volume', input: { action: 'get_pools', sort_by: 'volume_24h', limit: 10 } },
    { title: 'Search SOL/USDC pools', input: { action: 'get_pools', query: 'SOL/USDC' } },
    { title: 'Pool detail', input: { action: 'get_pool', pool_id: '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6' } },
    { title: 'Protocol stats', input: { action: 'get_protocol_stats' } },
    { title: 'SOL + JUP price', input: { action: 'get_price', tokens: ['SOL', 'JUP'] } },
    { title: 'Swap 1 SOL → USDC via Meteora', input: { action: 'build_swap_tx', token_in: 'SOL', token_out: 'USDC', amount_in: '1', sender: 'YourWalletPublicKey' } },
  ],
};

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeMeteoraSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {

      // ── get_pools ─────────────────────────────────────────────────────────
      case 'get_pools': {
        const sortMap: Record<string, string> = {
          volume_24h: 'volume_24h:desc',
          tvl:        'tvl:desc',
          apr_24h:    'apr_24h:desc',
          fee_24h:    'fee_24h:desc',
        };
        const sortBy = sortMap[input.sort_by] ?? 'volume_24h:desc';
        const limit  = Math.min(input.limit ?? 20, 50);

        const params = new URLSearchParams({ page: '1', page_size: String(limit), sort_by: sortBy });
        if (input.query) params.set('query', String(input.query));

        const data = await nodeGet(`${DLMM_API}/pools?${params}`);
        const pools: any[] = data.data ?? [];

        return {
          success: true,
          output: {
            count:   pools.length,
            total:   data.total,
            sort_by: input.sort_by ?? 'volume_24h',
            pools:   pools.map(mapPool),
          },
        };
      }

      // ── get_pool ──────────────────────────────────────────────────────────
      case 'get_pool': {
        const { pool_id } = input;
        if (!pool_id) return { success: false, error: 'pool_id (pool address, base58) is required' };
        const p = await nodeGet(`${DLMM_API}/pools/${pool_id}`);
        if (!p || !p.address) return { success: false, error: `Pool ${pool_id} not found on Meteora DLMM` };
        return {
          success: true,
          output: {
            ...mapPool(p),
            reserve_x:       p.reserve_x,
            reserve_y:       p.reserve_y,
            token_x_amount:  p.token_x_amount,
            token_y_amount:  p.token_y_amount,
            dynamic_fee_pct: p.dynamic_fee_pct,
            volume:          p.volume,
            fees:            p.fees,
          },
        };
      }

      // ── get_protocol_stats ──────────────────────────────────────────────────
      case 'get_protocol_stats': {
        const info = await nodeGet(`${DLMM_API}/stats/protocol_metrics`);
        return { success: true, output: { protocol: 'Meteora', metrics: info } };
      }

      // ── get_price ─────────────────────────────────────────────────────────
      case 'get_price': {
        const rawTokens: string[] = input.tokens ?? (input.token ? [input.token] : []);
        if (rawTokens.length === 0) return { success: false, error: 'Provide tokens (array of symbols or mint addresses)' };

        const resolved = rawTokens.map(t => ({ symbol: t, mint: TOKEN_MINTS[t.toUpperCase()] ?? t }));
        const ids = resolved.map(r => r.mint).join(',');
        const data = await nodeGet(`${PRICE_API}?ids=${ids}`);

        const prices: Record<string, any> = {};
        for (const r of resolved) {
          const entry = data?.[r.mint];
          prices[r.symbol.toUpperCase()] = (entry && entry.usdPrice != null)
            ? { usd: entry.usdPrice, mint: r.mint, price_change_24h: entry.priceChange24h ?? null }
            : { usd: null, mint: r.mint, error: 'price not available' };
        }
        return { success: true, output: { prices } };
      }

      // ── build_swap_tx ───────────────────────────────────────────────────────
      case 'build_swap_tx': {
        const { token_in, token_out, amount_in, sender, slippage = 0.005 } = input;
        if (!token_in || !token_out) return { success: false, error: 'token_in and token_out are required' };
        if (!amount_in)              return { success: false, error: 'amount_in is required' };
        if (!sender)                 return { success: false, error: 'sender (Solana wallet public key) is required' };

        const dexKey = (input.dex ?? 'DLMM').toUpperCase();
        const dexLabel = METEORA_DEXES[dexKey] ?? METEORA_DEXES.DLMM;

        const fromMint = TOKEN_MINTS[token_in.toUpperCase()] ?? token_in;
        const toMint   = TOKEN_MINTS[token_out.toUpperCase()] ?? token_out;
        const fromDecimals = decimalsFor(token_in);
        const toDecimals   = decimalsFor(token_out);

        const amountUnits = BigInt(Math.round(parseFloat(String(amount_in)) * 10 ** fromDecimals));
        const slippageBps = Math.round(slippage * 10000);

        const params = new URLSearchParams({
          inputMint:  fromMint,
          outputMint: toMint,
          amount:     amountUnits.toString(),
          swapMode:   'ExactIn',
          slippageBps: String(slippageBps),
          dexes:      dexLabel,
        });

        const quote = await nodeGet(`${JUP_API}/quote?${params}`);
        if (!quote || !quote.outAmount) {
          return { success: false, error: `No Meteora (${dexLabel}) route found for ${token_in} → ${token_out}. Try a different dex or pair.` };
        }

        const swapResp = await nodePost(`${JUP_API}/swap`, {
          quoteResponse:             quote,
          userPublicKey:             sender,
          wrapAndUnwrapSol:          true,
          dynamicComputeUnitLimit:   true,
          prioritizationFeeLamports: 'auto',
        });

        if (!swapResp.swapTransaction) return { success: false, error: 'Failed to build Meteora swap transaction' };

        return {
          success: true,
          output: {
            transaction:  swapResp.swapTransaction, // base64 Solana VersionedTransaction
            amount_in:    String(Number(quote.inAmount) / 10 ** fromDecimals),
            amount_out:   String(Number(quote.outAmount) / 10 ** toDecimals),
            slippage_bps: slippageBps,
            chain:        'solana',
            dex:          dexLabel,
            route:        quote.routePlan?.map((r: any) => r.swapInfo?.label ?? 'unknown').filter(Boolean) ?? [],
            usage: 'Pass transaction to Privy sendTransaction or any Solana wallet to sign and submit.',
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported: get_pools, get_pool, get_protocol_stats, get_price, build_swap_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Meteora skill execution failed' };
  }
}
