/**
 * Official Skill: Jupiter (jup.ag)
 *
 * Jupiter is the leading DEX aggregator on Solana. It routes swaps through
 * Raydium, Orca, Meteora, Whirlpool, and 20+ other DEXes to guarantee the
 * best price. $500B+ cumulative volume.
 *
 * Skill UUID: a8f2c1d4-7e3b-4a9f-b6c5-2d8e1f403b91
 *
 * Actions:
 *   get_swap_quote  — best price quote across all Solana DEXes (no signing)
 *   build_swap_tx   — serialised swap transaction (base64) ready for wallet signing
 *   get_token_price — real-time USD price of any Solana token via Jupiter Price API
 *   get_token_info  — resolve symbol → mint address + metadata
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Jupiter REST API endpoints ────────────────────────────────────────────────
// lite-api.jup.ag = free tier (rate-limited, no auth required)
// api.jup.ag      = paid tier (requires Authorization: Bearer <key>)
const QUOTE_API = 'https://lite-api.jup.ag/swap/v1';
const PRICE_API = 'https://lite-api.jup.ag/price/v3'; // v2 retired → "Route not found"
const TOKEN_API = 'https://tokens.jup.ag';

// ── Well-known Solana token mint registry ─────────────────────────────────────
const TOKEN_REGISTRY: Record<string, { mint: string; decimals: number; name: string }> = {
  SOL:   { mint: 'So11111111111111111111111111111111111111112',           decimals: 9, name: 'Wrapped SOL' },
  WSOL:  { mint: 'So11111111111111111111111111111111111111112',           decimals: 9, name: 'Wrapped SOL' },
  USDC:  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',        decimals: 6, name: 'USD Coin' },
  USDT:  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',         decimals: 6, name: 'Tether USD' },
  RAY:   { mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',        decimals: 6, name: 'Raydium' },
  JUP:   { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',         decimals: 6, name: 'Jupiter' },
  BONK:  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',        decimals: 5, name: 'Bonk' },
  WIF:   { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',        decimals: 6, name: 'dogwifhat' },
  MSOL:  { mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',         decimals: 9, name: 'Marinade Staked SOL' },
  JITOSOL: { mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',      decimals: 9, name: 'Jito Staked SOL' },
  ORCA:  { mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',         decimals: 6, name: 'Orca' },
  PYTH:  { mint: 'HZ1JovNiVvGrv1aUvfUrFApkeje64C6SFf3eGGe4BqNAHK',      decimals: 6, name: 'Pyth Network' },
  MNGO:  { mint: 'MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac',         decimals: 6, name: 'Mango Markets' },
  SAMO:  { mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',         decimals: 9, name: 'Samoyed Coin' },
  BSOL:  { mint: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',         decimals: 9, name: 'BlazeStake Staked SOL' },
  STSOL: { mint: '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',        decimals: 9, name: 'Lido Staked SOL' },
  KMNO:  { mint: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS',         decimals: 6, name: 'Kamino Finance' },
};

// ── HTTP helpers (Node https — more reliable than fetch on Vercel) ────────────

function nodeRequest(urlStr: string, method: 'GET' | 'POST', body?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const bodyStr   = body ? JSON.stringify(body) : undefined;

    let options: any;
    let client: typeof https | typeof http;

    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = {
        hostname: proxy.hostname,
        port:     proxy.port || 7890,
        path:     urlStr,
        method,
        headers: {
          Host:            targetUrl.hostname,
          Accept:          'application/json',
          'Content-Type':  'application/json',
          'User-Agent':    'Arsenal/1.0',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
        timeout: 30000,
      };
    } else {
      client  = https;
      options = {
        hostname: targetUrl.hostname,
        path:     targetUrl.pathname + targetUrl.search,
        method,
        headers: {
          Accept:         'application/json',
          'Content-Type': 'application/json',
          'User-Agent':   'Arsenal/1.0',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
        timeout: 30000,
        family:  4,
      };
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if ((res.statusCode ?? 200) >= 400) {
            reject(new Error(`Jupiter API ${res.statusCode}: ${data.slice(0, 200)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Failed to parse Jupiter response: ${data.slice(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Jupiter API timeout')); });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function jupFetch(url: string): Promise<any> {
  return nodeRequest(url, 'GET');
}

function jupPost(url: string, body: unknown): Promise<any> {
  return nodeRequest(url, 'POST', body);
}

// ── Token helpers ─────────────────────────────────────────────────────────────

function resolveMint(symbol: string): { mint: string; decimals: number; name: string } {
  // If it looks like a mint address already (base58, 32–44 chars), pass through
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbol) && !TOKEN_REGISTRY[symbol.toUpperCase()]) {
    return { mint: symbol, decimals: 9, name: symbol };
  }
  const entry = TOKEN_REGISTRY[symbol.toUpperCase()];
  if (!entry) {
    throw new Error(
      `Unknown token "${symbol}". Pass a mint address directly, or use a known symbol: ` +
      Object.keys(TOKEN_REGISTRY).join(', ')
    );
  }
  return entry;
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const JUPITER_SKILL_METADATA = {
  name: 'Jupiter Aggregator',
  description:
    'Interact with Jupiter (jup.ag) — the leading DEX aggregator on Solana. ' +
    'Get best-price swap quotes routed through Raydium, Orca, Meteora, and 20+ DEXes. ' +
    'Build serialised swap transactions ready for wallet signing, look up real-time token prices, ' +
    'and resolve token symbols to mint addresses.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['jupiter', 'solana', 'dex', 'swap', 'aggregator', 'defi', 'spl'],
  external_url: 'https://jup.ag',
  logo_url: 'https://icons.llamao.fi/icons/protocols/jupiter?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['jupiter_get_quote', 'jupiter_build_tx', 'get_token_price', 'get_token_info',
               'get_swap_quote', 'build_swap_tx'],  // last two kept for backwards compat
        description:
          'Jupiter operation to perform. ' +
          'jupiter_get_quote: best price quote (exact-input or exact-output, read-only). ' +
          'jupiter_build_tx: serialised VersionedTransaction (base64) for Privy / wallet signing. ' +
          'get_token_price: USD price of any SPL token. ' +
          'get_token_info: resolve symbol to mint address.',
      },
      token_in: {
        type: 'string',
        description: 'Input token symbol (SOL, USDC, RAY …) or raw SPL mint address.',
      },
      token_out: {
        type: 'string',
        description: 'Output token symbol or mint address.',
      },
      amount_in: {
        type: 'string',
        description: 'Human-readable exact-input amount (e.g. "1.5" for 1.5 SOL). Provide either amount_in OR amount_out.',
      },
      amount_out: {
        type: 'string',
        description: 'Human-readable exact-output amount (e.g. "100" for 100 USDC). Provide either amount_in OR amount_out.',
      },
      quote_response: {
        type: 'object',
        description: 'Opaque quote blob from jupiter_get_quote output. Pass verbatim to jupiter_build_tx.',
      },
      sender: {
        type: 'string',
        description: 'Solana wallet public key (base58). Required for jupiter_build_tx.',
      },
      slippage: {
        type: 'number',
        description: 'Max slippage as decimal (e.g. 0.005 = 0.5%). Only used in jupiter_build_tx. Default: 0.005.',
      },
      chain: {
        type: 'string',
        enum: ['solana', 'solana:devnet'],
        description: 'Network. Default: solana (mainnet).',
      },
      tokens: {
        type: 'array',
        items: { type: 'string' },
        description: 'Token symbols or mint addresses for get_token_price.',
      },
      symbol: {
        type: 'string',
        description: 'Token symbol to look up for get_token_info.',
      },
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a human-readable route array from a Jupiter routePlan */
function buildRouteSymbols(routePlan: any[], fromMint: string): string[] {
  const mints = [fromMint];
  for (const leg of routePlan ?? []) {
    mints.push(leg.swapInfo?.outputMint ?? '');
  }
  return mints
    .filter(Boolean)
    .map(m => Object.entries(TOKEN_REGISTRY).find(([, v]) => v.mint === m)?.[0] ?? m.slice(0, 8) + '…');
}

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeJupiterSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {

      // ── jupiter_get_quote (canonical) + get_swap_quote (alias) ────────────
      case 'jupiter_get_quote':
      case 'get_swap_quote': {
        const { token_in, token_out } = input;
        // amount_in = exact-input mode; amount_out = exact-output mode
        const amountInStr  = input.amount_in  ?? (input.amount != null ? String(input.amount) : undefined);
        const amountOutStr = input.amount_out;

        if (!token_in || !token_out) {
          return { success: false, error: 'token_in and token_out are required' };
        }
        if (!amountInStr && !amountOutStr) {
          return { success: false, error: 'Provide amount_in (exact-input) or amount_out (exact-output)' };
        }

        const fromToken = resolveMint(token_in);
        const toToken   = resolveMint(token_out);

        let swapMode: string;
        let amountUnits: bigint;
        if (amountInStr) {
          swapMode    = 'ExactIn';
          amountUnits = BigInt(Math.round(parseFloat(amountInStr) * 10 ** fromToken.decimals));
        } else {
          swapMode    = 'ExactOut';
          amountUnits = BigInt(Math.round(parseFloat(amountOutStr) * 10 ** toToken.decimals));
        }

        const params = new URLSearchParams({
          inputMint:  fromToken.mint,
          outputMint: toToken.mint,
          amount:     amountUnits.toString(),
          swapMode,
        });

        const quote = await jupFetch(`${QUOTE_API}/quote?${params}`);

        const inAmt  = Number(quote.inAmount)  / 10 ** fromToken.decimals;
        const outAmt = Number(quote.outAmount) / 10 ** toToken.decimals;
        // Jupiter returns priceImpactPct as a string percentage (e.g. "0.05"); normalise to 0-1
        const priceImpact = parseFloat(quote.priceImpactPct ?? '0') / 100;
        const route = buildRouteSymbols(quote.routePlan ?? [], fromToken.mint);

        return {
          success: true,
          output: {
            amount_in:      String(inAmt),
            amount_out:     String(outAmt),
            price_impact:   parseFloat(priceImpact.toFixed(8)),  // 0–1
            route,
            quote_response: quote,   // opaque blob — pass verbatim to jupiter_build_tx
            _operation:     'jupiter_swap',
            // bonus
            swap_mode:      swapMode,
            hop_count:      (quote.routePlan ?? []).length,
            dex_label:      quote.routePlan?.[0]?.swapInfo?.label ?? 'unknown',
          },
        };
      }

      // ── jupiter_build_tx (canonical) + build_swap_tx (alias) ─────────────
      case 'jupiter_build_tx':
      case 'build_swap_tx': {
        const { sender, slippage = 0.005, chain = 'solana' } = input;
        // Accept quote_response from jupiter_get_quote output, or build fresh
        let quote = input.quote_response;

        if (!sender) {
          return { success: false, error: 'sender (wallet public key) is required' };
        }

        if (!quote) {
          // Fallback: build fresh quote from token_in/token_out/amount_in
          const { token_in, token_out } = input;
          const amountInStr = input.amount_in ?? (input.amount != null ? String(input.amount) : undefined);
          if (!token_in || !token_out || !amountInStr) {
            return { success: false, error: 'Provide quote_response (from jupiter_get_quote), or token_in + token_out + amount_in' };
          }
          const fromToken   = resolveMint(token_in);
          const toToken     = resolveMint(token_out);
          const amountUnits = BigInt(Math.round(parseFloat(amountInStr) * 10 ** fromToken.decimals));
          const params = new URLSearchParams({
            inputMint:  fromToken.mint,
            outputMint: toToken.mint,
            amount:     amountUnits.toString(),
            swapMode:   'ExactIn',
          });
          quote = await jupFetch(`${QUOTE_API}/quote?${params}`);
        }

        const slippageBps = Math.round(slippage * 10000); // 0.005 → 50 bps

        const swapResp = await jupPost(`${QUOTE_API}/swap`, {
          quoteResponse:             quote,
          userPublicKey:             sender,
          wrapAndUnwrapSol:          true,
          dynamicComputeUnitLimit:   true,
          prioritizationFeeLamports: 'auto',
          slippageBps,
        });

        if (!swapResp.swapTransaction) {
          return { success: false, error: 'Jupiter did not return a swap transaction' };
        }

        const fromMint = quote.inputMint  as string;
        const toMint   = quote.outputMint as string;
        const inAmt    = Number(quote.inAmount)  / 10 ** (TOKEN_REGISTRY[Object.keys(TOKEN_REGISTRY).find(k => TOKEN_REGISTRY[k].mint === fromMint) ?? '']?.decimals ?? 9);
        const outAmt   = Number(quote.outAmount) / 10 ** (TOKEN_REGISTRY[Object.keys(TOKEN_REGISTRY).find(k => TOKEN_REGISTRY[k].mint === toMint) ?? '']?.decimals ?? 6);

        return {
          success: true,
          output: {
            transaction:  swapResp.swapTransaction,  // base64 VersionedTransaction for Privy signing
            amount_in:   String(inAmt),
            amount_out:  String(outAmt),
            slippage_bps: slippageBps,
            chain,
            instructions: [
              'Pass transaction to Privy sendTransaction or sign with your Solana keypair.',
              'transaction is a base64-encoded Solana VersionedTransaction.',
            ],
          },
        };
      }

      // ── get_token_price ───────────────────────────────────────────────────
      case 'get_token_price': {
        const rawTokens: string[] = input.tokens ?? (input.symbol ? [input.symbol] : []);
        if (rawTokens.length === 0) {
          return { success: false, error: 'Provide tokens (array) or symbol (string)' };
        }

        const resolved = rawTokens.map(t => {
          try { return { symbol: t, ...resolveMint(t) }; }
          catch { return { symbol: t, mint: t, decimals: 9, name: t }; }
        });

        const ids = resolved.map(r => r.mint).join(',');
        // Price API v3: top-level object keyed by mint, price under `usdPrice`.
        const data = await jupFetch(`${PRICE_API}?ids=${ids}`);

        const prices: Record<string, any> = {};
        for (const r of resolved) {
          const entry = data?.[r.mint];
          prices[r.symbol.toUpperCase()] = (entry && entry.usdPrice != null)
            ? { usd: entry.usdPrice, mint: r.mint, name: r.name, price_change_24h: entry.priceChange24h ?? null }
            : { usd: null, mint: r.mint, error: 'price not available' };
        }

        return { success: true, output: { prices } };
      }

      // ── get_token_info ────────────────────────────────────────────────────
      case 'get_token_info': {
        const { symbol } = input;
        if (!symbol) return { success: false, error: 'symbol is required' };

        // Check local registry first
        const local = TOKEN_REGISTRY[symbol.toUpperCase()];
        if (local) {
          return {
            success: true,
            output: {
              symbol: symbol.toUpperCase(),
              mint:     local.mint,
              decimals: local.decimals,
              name:     local.name,
              source:   'arsenal_registry',
            },
          };
        }

        // Fall back to Jupiter token list search
        const data = await jupFetch(`${TOKEN_API}/tokens?tags=verified`);
        const match = (data as any[]).find(
          (t: any) => t.symbol?.toUpperCase() === symbol.toUpperCase()
        );

        if (!match) {
          return {
            success: false,
            error: `Token "${symbol}" not found. Pass a mint address directly if known.`,
          };
        }

        return {
          success: true,
          output: {
            symbol:   match.symbol,
            mint:     match.address,
            decimals: match.decimals,
            name:     match.name,
            logo_uri: match.logoURI,
            tags:     match.tags,
            source:   'jupiter_token_list',
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported: get_swap_quote, build_swap_tx, get_token_price, get_token_info`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Jupiter skill execution failed' };
  }
}
