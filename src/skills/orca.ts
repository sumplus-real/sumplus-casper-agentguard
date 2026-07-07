/**
 * Official Skill: Orca (orca.so)
 *
 * Orca is one of Solana's largest concentrated-liquidity DEXes (Whirlpools).
 * This skill gives an agent Orca-routed swaps: quotes and serialised swap
 * transactions are forced through Orca's Whirlpool pools by constraining the
 * Jupiter routing engine to the `Whirlpool` DEX label (dexes=Whirlpool).
 * That keeps the well-tested Solana transaction-building path while guaranteeing
 * the liquidity comes from Orca only.
 *
 * Skill UUID: d2f9a4c7-6b1e-4e8a-bc35-7a0d5f2c9e16
 *
 * Actions:
 *   get_swap_quote  — best Orca (Whirlpool) price quote (no signing)
 *   build_swap_tx   — serialised VersionedTransaction (base64) for wallet signing
 *   get_token_price — real-time USD price of any SPL token via Jupiter Price API
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// lite-api.jup.ag = free tier (rate-limited, no auth). dexes=Whirlpool pins routing to Orca.
const QUOTE_API = 'https://lite-api.jup.ag/swap/v1';
const PRICE_API = 'https://lite-api.jup.ag/price/v3';
const ORCA_DEX  = 'Whirlpool';

const TOKEN_REGISTRY: Record<string, { mint: string; decimals: number; name: string }> = {
  SOL:     { mint: 'So11111111111111111111111111111111111111112',  decimals: 9, name: 'Wrapped SOL' },
  WSOL:    { mint: 'So11111111111111111111111111111111111111112',  decimals: 9, name: 'Wrapped SOL' },
  USDC:    { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  decimals: 6, name: 'USD Coin' },
  USDT:    { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  decimals: 6, name: 'Tether USD' },
  ORCA:    { mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',  decimals: 6, name: 'Orca' },
  RAY:     { mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',  decimals: 6, name: 'Raydium' },
  JUP:     { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  decimals: 6, name: 'Jupiter' },
  BONK:    { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',  decimals: 5, name: 'Bonk' },
  WIF:     { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',  decimals: 6, name: 'dogwifhat' },
  MSOL:    { mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',   decimals: 9, name: 'Marinade Staked SOL' },
  JITOSOL: { mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',  decimals: 9, name: 'Jito Staked SOL' },
};

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
        hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method,
        headers: { Host: targetUrl.hostname, Accept: 'application/json', 'Content-Type': 'application/json',
          'User-Agent': 'Arsenal/1.0', ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}) },
        timeout: 30000,
      };
    } else {
      client  = https;
      options = {
        hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json',
          'User-Agent': 'Arsenal/1.0', ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}) },
        timeout: 30000, family: 4,
      };
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`Orca/Jupiter API ${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Failed to parse response: ${data.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Orca/Jupiter API timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function resolveMint(symbol: string): { mint: string; decimals: number; name: string } {
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbol) && !TOKEN_REGISTRY[symbol.toUpperCase()]) {
    return { mint: symbol, decimals: 9, name: symbol };
  }
  const entry = TOKEN_REGISTRY[symbol.toUpperCase()];
  if (!entry) throw new Error(`Unknown token "${symbol}". Pass a mint address directly, or use a known symbol: ${Object.keys(TOKEN_REGISTRY).join(', ')}`);
  return entry;
}

export const ORCA_SKILL_METADATA = {
  name: 'Orca Whirlpools',
  description:
    'Interact with Orca (orca.so) — one of Solana\'s largest concentrated-liquidity DEXes (Whirlpools). ' +
    'Get Orca-routed best-price swap quotes, build serialised VersionedTransactions (base64) ready for wallet signing, ' +
    'and look up real-time SPL token prices. Routing is constrained to Orca\'s Whirlpool pools only (dexes=Whirlpool), ' +
    'so liquidity comes from Orca even though the transaction is built via the Jupiter swap engine. No API key required.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['orca', 'whirlpool', 'solana', 'dex', 'swap', 'clmm', 'concentrated-liquidity', 'defi', 'spl'],
  external_url: 'https://www.orca.so',
  logo_url: 'https://icons.llamao.fi/icons/protocols/orca?w=48&h=48',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_swap_quote', 'build_swap_tx', 'get_token_price'],
        description:
          'get_swap_quote: best Orca/Whirlpool exact-input price quote, read-only (requires token_in, token_out, amount_in). ' +
          'build_swap_tx: serialised base64 VersionedTransaction for wallet signing (requires token_in, token_out, amount_in, sender; optional slippage). ' +
          'get_token_price: USD price of SPL tokens (requires tokens or symbol).',
      },
      token_in:  { type: 'string', description: 'Input token symbol (SOL, USDC, ORCA …) or raw SPL mint address.' },
      token_out: { type: 'string', description: 'Output token symbol or mint address.' },
      amount_in: { type: 'string', description: 'Human-readable exact-input amount (e.g. "1.5" for 1.5 SOL).' },
      sender:    { type: 'string', description: 'Solana wallet public key (base58). Required for build_swap_tx.' },
      slippage:  { type: 'number', description: 'Max slippage as decimal (0.005 = 0.5%). Default 0.005.' },
      tokens:    { type: 'array', items: { type: 'string' }, description: 'Token symbols or mints for get_token_price.' },
      symbol:    { type: 'string', description: 'Single token symbol for get_token_price.' },
    },
  },
  usage_examples: [
    { title: 'Quote 1 SOL → USDC on Orca', input: { action: 'get_swap_quote', token_in: 'SOL', token_out: 'USDC', amount_in: '1' } },
    { title: 'Build the swap tx', input: { action: 'build_swap_tx', token_in: 'SOL', token_out: 'USDC', amount_in: '1', sender: 'YourBase58Pubkey' } },
  ],
};

async function orcaQuote(tokenIn: string, tokenOut: string, amountInStr: string) {
  const fromToken = resolveMint(tokenIn);
  const toToken   = resolveMint(tokenOut);
  const amountUnits = BigInt(Math.round(parseFloat(amountInStr) * 10 ** fromToken.decimals));
  const params = new URLSearchParams({
    inputMint:  fromToken.mint,
    outputMint: toToken.mint,
    amount:     amountUnits.toString(),
    swapMode:   'ExactIn',
    dexes:      ORCA_DEX, // pin routing to Orca Whirlpools
  });
  const quote = await nodeRequest(`${QUOTE_API}/quote?${params}`, 'GET');
  return { quote, fromToken, toToken };
}

export async function executeOrcaSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_swap_quote': {
        const { token_in, token_out } = input;
        const amountInStr = input.amount_in ?? (input.amount != null ? String(input.amount) : undefined);
        if (!token_in || !token_out || !amountInStr) return { success: false, error: 'token_in, token_out, and amount_in are required' };

        const { quote, fromToken, toToken } = await orcaQuote(token_in, token_out, amountInStr);
        if (!quote?.outAmount) return { success: false, error: 'No Orca (Whirlpool) route found for this pair/size. The pair may not have an Orca pool.' };

        const inAmt  = Number(quote.inAmount)  / 10 ** fromToken.decimals;
        const outAmt = Number(quote.outAmount) / 10 ** toToken.decimals;
        return {
          success: true,
          output: {
            dex: 'Orca Whirlpools',
            amount_in: String(inAmt),
            amount_out: String(outAmt),
            price_impact: parseFloat(quote.priceImpactPct ?? '0') / 100,
            hop_count: (quote.routePlan ?? []).length,
            dex_label: quote.routePlan?.[0]?.swapInfo?.label ?? ORCA_DEX,
            quote_response: quote,
          },
        };
      }

      case 'build_swap_tx': {
        const { sender, slippage = 0.005 } = input;
        const { token_in, token_out } = input;
        const amountInStr = input.amount_in ?? (input.amount != null ? String(input.amount) : undefined);
        if (!sender) return { success: false, error: 'sender (wallet public key) is required' };
        if (!token_in || !token_out || !amountInStr) return { success: false, error: 'token_in, token_out, and amount_in are required' };

        let quote = input.quote_response;
        let fromToken, toToken;
        if (!quote) {
          const q = await orcaQuote(token_in, token_out, amountInStr);
          quote = q.quote; fromToken = q.fromToken; toToken = q.toToken;
        } else {
          fromToken = resolveMint(token_in); toToken = resolveMint(token_out);
        }
        if (!quote?.outAmount) return { success: false, error: 'No Orca (Whirlpool) route found for this pair/size.' };

        const slippageBps = Math.round(slippage * 10000);
        const swapResp = await nodeRequest(`${QUOTE_API}/swap`, 'POST', {
          quoteResponse: quote,
          userPublicKey: sender,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
          slippageBps,
        });
        if (!swapResp.swapTransaction) return { success: false, error: 'Jupiter did not return a swap transaction' };

        return {
          success: true,
          output: {
            dex: 'Orca Whirlpools',
            transaction: swapResp.swapTransaction, // base64 VersionedTransaction
            amount_in: String(Number(quote.inAmount) / 10 ** fromToken.decimals),
            amount_out: String(Number(quote.outAmount) / 10 ** toToken.decimals),
            slippage_bps: slippageBps,
            chain: 'solana',
            instructions: [
              'transaction is a base64-encoded Solana VersionedTransaction.',
              'Sign with your Solana keypair or pass to a wallet (e.g. Privy sendTransaction).',
            ],
          },
        };
      }

      case 'get_token_price': {
        const rawTokens: string[] = input.tokens ?? (input.symbol ? [input.symbol] : []);
        if (rawTokens.length === 0) return { success: false, error: 'Provide tokens (array) or symbol (string)' };
        const resolved = rawTokens.map(t => { try { return { symbol: t, ...resolveMint(t) }; } catch { return { symbol: t, mint: t, decimals: 9, name: t }; } });
        const ids = resolved.map(r => r.mint).join(',');
        // Jupiter Price API v3: top-level object keyed by mint, price under `usdPrice`.
        const data = await nodeRequest(`${PRICE_API}?ids=${ids}`, 'GET');
        const prices: Record<string, any> = {};
        for (const r of resolved) {
          const entry = data?.[r.mint];
          prices[r.symbol.toUpperCase()] = (entry && entry.usdPrice != null)
            ? { usd: entry.usdPrice, mint: r.mint, name: r.name, price_change_24h: entry.priceChange24h ?? null }
            : { usd: null, mint: r.mint, error: 'price not available' };
        }
        return { success: true, output: { prices } };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_swap_quote, build_swap_tx, get_token_price` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Orca skill execution failed' };
  }
}
