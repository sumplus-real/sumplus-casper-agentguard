/**
 * Official Skill: Raydium (raydium.io)
 *
 * Raydium is Solana's largest native AMM + CLMM (concentrated liquidity) DEX.
 * It provides the deepest on-chain liquidity on Solana and powers a significant
 * portion of Solana DeFi.
 *
 * Skill UUID: c5e9d2a7-3f4b-4c8e-a1b6-8f5d923e140c
 *
 * Actions:
 *   get_top_pairs      — top trading pairs sorted by 24h volume or liquidity
 *   get_pool_info      — details for a specific pool by address or token pair
 *   get_protocol_stats — overall Raydium protocol TVL, volume, and fee stats
 *   get_price          — token prices via Jupiter Price API (covers all Raydium tokens)
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Raydium public API ────────────────────────────────────────────────────────
const API_V2    = 'https://api.raydium.io/v2';
const PRICE_API = 'https://lite-api.jup.ag/price/v3'; // Jupiter free tier (v2 retired → "Route not found")
const JUP_API   = 'https://lite-api.jup.ag/swap/v1';  // Jupiter routing (covers Raydium)

// ── Well-known pool addresses (AMM v4 + CLMM) ────────────────────────────────
// Verified from raydium.io app and Solscan
const KNOWN_POOLS: Record<string, { poolId: string; base: string; quote: string; type: string }> = {
  'SOL/USDC':  { poolId: '58oQChx4yWmvKec8RyhDUsXNhTMj5cXZFRHzzNLZe9oF',  base: 'SOL',  quote: 'USDC', type: 'AMM' },
  'SOL/USDT':  { poolId: 'HLmqeL62xR1QoZ1HKKbXRrdN1p3phKpxRMb2VVopvBBz',  base: 'SOL',  quote: 'USDT', type: 'AMM' },
  'RAY/SOL':   { poolId: 'AVs9TA4nWDzfPJE9gGVNs98e5oh7ojzCMkZE9HbNCKHE',   base: 'RAY',  quote: 'SOL',  type: 'AMM' },
  'RAY/USDC':  { poolId: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',   base: 'RAY',  quote: 'USDC', type: 'AMM' },
  'mSOL/SOL':  { poolId: 'HVDpJGjsAMkYqSfoFby2rnVgMixiMk3KoFGXxHQqvWRq',  base: 'mSOL', quote: 'SOL',  type: 'AMM' },
  'BONK/SOL':  { poolId: 'Eit7RCZHAjke1pLKbAcNYJKEBzip7QsRh5uFJJ9orHzS',  base: 'BONK', quote: 'SOL',  type: 'AMM' },
};

// ── Token mint registry (for get_price) ──────────────────────────────────────
const TOKEN_MINTS: Record<string, string> = {
  SOL:     'So11111111111111111111111111111111111111112',
  WSOL:    'So11111111111111111111111111111111111111112',
  USDC:    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT:    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  RAY:     '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  JUP:     'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK:    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF:     'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  MSOL:    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  JITOSOL: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
  ORCA:    'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodePost(urlStr: string, body: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const bodyStr   = JSON.stringify(body);
    let options: any;
    let client: typeof https | typeof http;
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method: 'POST',
        headers: { Host: targetUrl.hostname, Accept: 'application/json', 'Content-Type': 'application/json',
          'User-Agent': 'Arsenal/1.0', 'Content-Length': Buffer.byteLength(bodyStr) }, timeout: 30000 };
    } else {
      client  = https;
      options = { hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json',
          'User-Agent': 'Arsenal/1.0', 'Content-Length': Buffer.byteLength(bodyStr) }, timeout: 30000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

function nodeGet(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    let options: any;
    let client: typeof https | typeof http;
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method: 'GET',
        headers: { Host: targetUrl.hostname, Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' }, timeout: 30000 };
    } else {
      client  = https;
      options = { hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' }, timeout: 30000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

async function raydiumFetch(path: string): Promise<any> {
  return nodeGet(`${API_V2}${path}`);
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const RAYDIUM_SKILL_METADATA = {
  name: 'Raydium DEX',
  description:
    'Interact with Raydium (raydium.io) — Solana\'s largest native AMM + CLMM DEX. ' +
    'Query top trading pairs by volume or liquidity, get detailed pool information, ' +
    'view real-time protocol TVL and fee stats, and look up token prices.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['raydium', 'solana', 'dex', 'amm', 'clmm', 'liquidity', 'defi', 'spl'],
  external_url: 'https://raydium.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/raydium?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_top_pairs', 'get_pool_info', 'get_protocol_stats', 'get_price', 'build_swap_tx'],
        description:
          'Raydium operation to perform. ' +
          'get_top_pairs: top AMM pairs ranked by 24h volume or liquidity. ' +
          'get_pool_info: details for a specific pool. ' +
          'get_protocol_stats: TVL, 24h volume, total fees. ' +
          'get_price: USD prices for Solana tokens. ' +
          'build_swap_tx: build a serialised Solana swap transaction routed through Raydium (requires token_in, token_out, amount_in, sender).',
      },
      sort_by: {
        type: 'string',
        enum: ['volume24h', 'liquidity', 'fee24h', 'apr24h'],
        description: 'Sort field for get_top_pairs (default: volume24h).',
      },
      limit: {
        type: 'integer',
        description: 'Max number of pairs to return for get_top_pairs (default: 20, max: 50).',
      },
      pool_id: {
        type: 'string',
        description: 'Pool address (base58) for get_pool_info.',
      },
      pair: {
        type: 'string',
        description: 'Token pair shorthand for get_pool_info, e.g. "SOL/USDC". Supported: ' + Object.keys(KNOWN_POOLS).join(', '),
      },
      tokens: {
        type: 'array',
        items: { type: 'string' },
        description: 'Token symbols or mint addresses for get_price.',
      },
      token_in: {
        type: 'string',
        description: 'Input token symbol (SOL, USDC, RAY, BONK…) or SPL mint address. Required for build_swap_tx.',
      },
      token_out: {
        type: 'string',
        description: 'Output token symbol or SPL mint address. Required for build_swap_tx.',
      },
      amount_in: {
        type: 'string',
        description: 'Human-readable exact-input amount (e.g. "1.5" for 1.5 SOL). Required for build_swap_tx.',
      },
      sender: {
        type: 'string',
        description: 'Solana wallet public key (base58). Required for build_swap_tx.',
      },
      slippage: {
        type: 'number',
        description: 'Max slippage as decimal (e.g. 0.005 = 0.5%). Default: 0.005. Used by build_swap_tx.',
      },
    },
  },
  usage_examples: [
    { title: 'Top pairs by volume', input: { action: 'get_top_pairs', sort_by: 'volume24h', limit: 10 } },
    { title: 'SOL/USDC pool info', input: { action: 'get_pool_info', pair: 'SOL/USDC' } },
    { title: 'Protocol stats', input: { action: 'get_protocol_stats' } },
    { title: 'SOL price', input: { action: 'get_price', tokens: ['SOL', 'RAY'] } },
    { title: 'Build swap 1 SOL → USDC', input: { action: 'build_swap_tx', token_in: 'SOL', token_out: 'USDC', amount_in: '1', sender: 'YourWalletPublicKey' } },
  ],
};

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeRaydiumSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {

      // ── get_top_pairs ─────────────────────────────────────────────────────
      case 'get_top_pairs': {
        const sortBy: string = input.sort_by ?? 'volume24h';
        const limit: number  = Math.min(input.limit ?? 20, 50);

        // /v2/main/pairs returns all AMM pairs
        const pairs: any[] = await raydiumFetch('/main/pairs');
        if (!Array.isArray(pairs)) {
          return { success: false, error: 'Unexpected response from Raydium pairs API' };
        }

        const sorted = pairs
          .filter((p: any) => p[sortBy] != null && p.liquidity > 0)
          .sort((a: any, b: any) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0))
          .slice(0, limit)
          .map((p: any) => ({
            name:        p.name,
            pool_id:     p.ammId,
            liquidity:   fmtUsd(p.liquidity ?? 0),
            volume_24h:  fmtUsd(p.volume24h ?? 0),
            volume_7d:   fmtUsd(p.volume7d ?? 0),
            fee_24h:     fmtUsd(p.fee24h ?? 0),
            apr_24h:     `${((p.apr24h ?? 0) * 100).toFixed(2)}%`,
            price:       p.price,
          }));

        return {
          success: true,
          output: {
            count:   sorted.length,
            sort_by: sortBy,
            pairs:   sorted,
          },
        };
      }

      // ── get_pool_info ─────────────────────────────────────────────────────
      case 'get_pool_info': {
        const { pool_id, pair } = input;
        if (!pool_id && !pair) {
          return { success: false, error: 'Provide pool_id (address) or pair (e.g. "SOL/USDC")' };
        }

        let targetPoolId = pool_id as string | undefined;

        // Resolve named pair → pool ID
        if (!targetPoolId && pair) {
          const key = pair.toUpperCase().replace('-', '/');
          const known = KNOWN_POOLS[key];
          if (!known) {
            return {
              success: false,
              error: `Unknown pair "${pair}". Supported: ${Object.keys(KNOWN_POOLS).join(', ')}. For other pools pass pool_id directly.`,
            };
          }
          targetPoolId = known.poolId;
        }

        // Fetch all pairs and find matching pool
        const pairs: any[] = await raydiumFetch('/main/pairs');
        const pool = pairs.find((p: any) => p.ammId === targetPoolId);

        if (!pool) {
          return {
            success: false,
            error: `Pool ${targetPoolId} not found in Raydium AMM. It may be a CLMM pool — use pool_id for direct lookup.`,
          };
        }

        return {
          success: true,
          output: {
            name:       pool.name,
            pool_id:    pool.ammId,
            lp_mint:    pool.lpMint,
            market:     pool.market,
            price:      pool.price,
            liquidity:  fmtUsd(pool.liquidity ?? 0),
            volume_24h: fmtUsd(pool.volume24h ?? 0),
            volume_7d:  fmtUsd(pool.volume7d ?? 0),
            fee_24h:    fmtUsd(pool.fee24h ?? 0),
            apr_24h:    `${((pool.apr24h ?? 0) * 100).toFixed(2)}%`,
            apr_7d:     `${((pool.apr7d ?? 0) * 100).toFixed(2)}%`,
            apr_30d:    `${((pool.apr30d ?? 0) * 100).toFixed(2)}%`,
          },
        };
      }

      // ── get_protocol_stats ────────────────────────────────────────────────
      case 'get_protocol_stats': {
        const info: any = await raydiumFetch('/main/info');

        return {
          success: true,
          output: {
            tvl:            fmtUsd(info.tvl ?? 0),
            volume_24h:     fmtUsd(info.volume24h ?? 0),
            volume_total:   fmtUsd(info.totalvolume ?? 0),
            total_liquidity: fmtUsd(info.totalLiquidity ?? 0),
            _raw:           info,
          },
        };
      }

      // ── get_price ─────────────────────────────────────────────────────────
      case 'get_price': {
        const rawTokens: string[] = input.tokens ?? (input.token ? [input.token] : []);
        if (rawTokens.length === 0) {
          return { success: false, error: 'Provide tokens (array of symbols or mint addresses)' };
        }

        // Resolve to mint addresses
        const resolved = rawTokens.map(t => {
          const mint = TOKEN_MINTS[t.toUpperCase()] ?? t;
          return { symbol: t, mint };
        });

        const ids = resolved.map(r => r.mint).join(',');
        const data: any = await nodeGet(`${PRICE_API}?ids=${ids}`);

        // Price API v3: top-level object keyed by mint, price under `usdPrice`.
        const prices: Record<string, any> = {};
        for (const r of resolved) {
          const entry = data?.[r.mint];
          prices[r.symbol.toUpperCase()] = (entry && entry.usdPrice != null)
            ? { usd: entry.usdPrice, mint: r.mint, price_change_24h: entry.priceChange24h ?? null }
            : { usd: null, mint: r.mint, error: 'price not available' };
        }

        return { success: true, output: { prices } };
      }

      // ── build_swap_tx ──────────────────────────────────────────────────────
      case 'build_swap_tx': {
        const { token_in, token_out, amount_in, sender, slippage = 0.005 } = input;
        if (!token_in || !token_out) return { success: false, error: 'token_in and token_out are required' };
        if (!amount_in)              return { success: false, error: 'amount_in is required' };
        if (!sender)                 return { success: false, error: 'sender (Solana wallet public key) is required' };

        const fromMint = TOKEN_MINTS[token_in.toUpperCase()] ?? token_in;
        const toMint   = TOKEN_MINTS[token_out.toUpperCase()] ?? token_out;

        // Resolve decimals from registry (fallback 9 for SOL-based tokens)
        const fromDecimals = Object.entries(TOKEN_MINTS).find(([, m]) => m === fromMint)
          ? (token_in.toUpperCase() === 'USDC' || token_in.toUpperCase() === 'USDT' ? 6 : 9)
          : 9;

        const amountUnits = BigInt(Math.round(parseFloat(String(amount_in)) * 10 ** fromDecimals));
        const slippageBps = Math.round(slippage * 10000);

        const params = new URLSearchParams({
          inputMint:  fromMint,
          outputMint: toMint,
          amount:     amountUnits.toString(),
          swapMode:   'ExactIn',
        });

        const quote = await nodeGet(`${JUP_API}/quote?${params}`);

        const swapResp = await nodePost(`${JUP_API}/swap`, {
          quoteResponse:             quote,
          userPublicKey:             sender,
          wrapAndUnwrapSol:          true,
          dynamicComputeUnitLimit:   true,
          prioritizationFeeLamports: 'auto',
          slippageBps,
        });

        if (!swapResp.swapTransaction) {
          return { success: false, error: 'Failed to build Raydium swap transaction' };
        }

        const inAmt  = Number(quote.inAmount)  / 10 ** fromDecimals;
        const outAmt = Number(quote.outAmount) / 10 ** (token_out.toUpperCase() === 'USDC' || token_out.toUpperCase() === 'USDT' ? 6 : 9);

        return {
          success: true,
          output: {
            transaction:  swapResp.swapTransaction,  // base64 Solana VersionedTransaction
            amount_in:   String(inAmt),
            amount_out:  String(outAmt),
            slippage_bps: slippageBps,
            chain:       'solana',
            route:       quote.routePlan?.map((r: any) => r.swapInfo?.label ?? 'unknown').filter(Boolean) ?? [],
            usage: 'Pass transaction to Privy sendTransaction or any Solana wallet to sign and submit.',
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported: get_top_pairs, get_pool_info, get_protocol_stats, get_price, build_swap_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Raydium skill execution failed' };
  }
}
