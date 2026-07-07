/**
 * THENA — Server-side execution (BNB Smart Chain, chain ID 56)
 *
 * THENA is the leading ve(3,3) DEX on BSC. It has TWO liquidity venues:
 *   - Fusion  — Algebra concentrated-liquidity (dynamic fees, deep on majors)
 *   - V1      — Solidly-fork AMM (stable + volatile pools, broad coverage)
 *
 * This skill quotes BOTH venues and routes the swap through whichever gives the
 * better output (best execution). Get live quotes and build unsigned swap txns.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls BSC's public RPC directly. No API key needed.
 *
 * Skill UUID: 211c5851-b682-4132-9b1d-a876515ff365
 *
 * Contracts on BSC (chain ID 56, verified on-chain 2026-06-15):
 *   Fusion Quoter (Algebra):     0xeA68020D6A9532EeC42D4dB0f92B83580c39b2cA
 *   Fusion SwapRouter (Algebra): 0x327Dd3208f0bCF590A66110aCB6e5e6941A4EfA0
 *   V1 Router (Solidly fork):    0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109
 *
 * ⚠ BSC decimals trap: USDT/USDC on BSC are 18 decimals (NOT 6). Swaps use
 *   wrapped WBNB (hold WBNB, not native BNB).
 * ⚠ Algebra (Fusion) has NO fee param in its quoter/router — fees are dynamic.
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Contracts ─────────────────────────────────────────────────────────────────

const FUSION_QUOTER = '0xeA68020D6A9532EeC42D4dB0f92B83580c39b2cA';
const FUSION_ROUTER = '0x327Dd3208f0bCF590A66110aCB6e5e6941A4EfA0';
const V1_ROUTER     = '0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109';

const DEFAULT_RPC = 'https://bsc-dataseed.bnbchain.org';
const CHAIN_ID    = 56;

function getRpcUrl(): string { return process.env.BSC_RPC_URL || DEFAULT_RPC; }

// ── Well-known BSC tokens (ALL 18 decimals on BSC, including stablecoins) ───────

const TOKENS: Record<string, { address: string; decimals: number }> = {
  WBNB: { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
  BNB:  { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 }, // alias → WBNB (wrapped)
  USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  THE:  { address: '0xF4C8E32EaDEC4BFe97E0F595AdD0f4450a863a11', decimals: 18 },
  BTCB: { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 },
  ETH:  { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
};

// ── ABI selectors ─────────────────────────────────────────────────────────────

const SEL = {
  fusionQuote:    '2d9ebd1d', // Algebra Quoter.quoteExactInputSingle(tokenIn,tokenOut,amountIn,limitSqrtPrice) → (amountOut, uint16 fee)
  fusionSwap:     'bc651188', // Algebra SwapRouter.exactInputSingle((tokenIn,tokenOut,recipient,deadline,amountIn,amountOutMinimum,limitSqrtPrice))
  v1Quote:        '5e1e6325', // Solidly Router.getAmountOut(amountIn,tokenIn,tokenOut) → (amount, bool stable)
  v1Swap:         'f41766d8', // Solidly Router.swapExactTokensForTokens(amountIn,amountOutMin,Route[](from,to,stable),to,deadline)
  erc20Decimals:  '313ce567',
  erc20Allowance: 'dd62ed3e',
  erc20Approve:   '095ea7b3',
} as const;

// ── Low-level helpers (proxy-aware JSON-RPC) ──────────────────────────────────

function rpcPost(body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const rpcUrl    = getRpcUrl();
    const targetUrl = new URL(rpcUrl);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const payload   = JSON.stringify(body);
    let options: any;
    let client: typeof https | typeof http;
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: rpcUrl, method: 'POST',
        headers: { Host: targetUrl.hostname, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 20000 };
    } else {
      client  = targetUrl.protocol === 'http:' ? http : https;
      options = { hostname: targetUrl.hostname, port: targetUrl.port || 443, path: targetUrl.pathname + targetUrl.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 20000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(`BSC RPC error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`));
          else resolve(parsed.result);
        } catch { reject(new Error(`BSC RPC parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('BSC RPC timeout')); });
    req.write(payload);
    req.end();
  });
}

async function ethCall(to: string, data: string): Promise<string> {
  const r = await rpcPost({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] });
  return (r as string) ?? '0x';
}

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}
function readU256(hex: string, slot = 0): bigint {
  const h = hex.replace('0x', '');
  return BigInt('0x' + (h.slice(slot * 64, slot * 64 + 64) || '0'));
}
function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
}
function formatUnits(value: bigint, decimals: number): string {
  const d = 10n ** BigInt(decimals);
  const whole = value / d, frac = value % d;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

interface TokenInfo { address: string; decimals: number; symbol: string }
async function resolveToken(raw: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  if (TOKENS[upper]) return { ...TOKENS[upper], symbol: upper === 'BNB' ? 'WBNB' : upper };
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) throw new Error(`Unknown token "${raw}". Use a symbol (${Object.keys(TOKENS).join(', ')}) or a 0x address.`);
  const decimals = Number(readU256(await ethCall(raw, '0x' + SEL.erc20Decimals)));
  return { address: raw, decimals, symbol: raw.slice(0, 8) + '…' };
}

async function getAllowance(token: string, owner: string, spender: string): Promise<bigint> {
  try { return readU256(await ethCall(token, '0x' + SEL.erc20Allowance + p32(owner) + p32(spender))); } catch { return 0n; }
}

// ── Venue quotes ──────────────────────────────────────────────────────────────

// Fusion (Algebra): quoteExactInputSingle(tokenIn, tokenOut, amountIn, limitSqrtPrice=0) → (amountOut, uint16 fee)
async function quoteFusion(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<{ amountOut: bigint; fee: number } | null> {
  const data = '0x' + SEL.fusionQuote + p32(tokenIn) + p32(tokenOut) + p32(amountIn) + p32(0n);
  try {
    const hex = (await ethCall(FUSION_QUOTER, data)).replace('0x', '');
    const amountOut = readU256(hex, 0);
    if (amountOut === 0n) return null;
    return { amountOut, fee: Number(readU256(hex, 1)) };
  } catch { return null; }
}

// V1 (Solidly): getAmountOut(amountIn, tokenIn, tokenOut) → (amount, bool stable). Use lowercase addresses.
async function quoteV1(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<{ amountOut: bigint; stable: boolean } | null> {
  const data = '0x' + SEL.v1Quote + p32(amountIn) + p32(tokenIn.toLowerCase()) + p32(tokenOut.toLowerCase());
  try {
    const hex = (await ethCall(V1_ROUTER, data)).replace('0x', '');
    const amountOut = readU256(hex, 0);
    if (amountOut === 0n) return null;
    return { amountOut, stable: readU256(hex, 1) === 1n };
  } catch { return null; }
}

type Venue = 'fusion' | 'v1';
interface BestQuote { venue: Venue; amountOut: bigint; fee?: number; stable?: boolean }

async function bestQuote(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<BestQuote | null> {
  const [f, v] = await Promise.all([quoteFusion(tokenIn, tokenOut, amountIn), quoteV1(tokenIn, tokenOut, amountIn)]);
  const candidates: BestQuote[] = [];
  if (f) candidates.push({ venue: 'fusion', amountOut: f.amountOut, fee: f.fee });
  if (v) candidates.push({ venue: 'v1', amountOut: v.amountOut, stable: v.stable });
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.amountOut > a.amountOut ? b : a));
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const THENA_SKILL_METADATA = {
  name: 'THENA',
  description:
    '[ARSENAL-HOSTED ✓] Swap tokens on THENA, the leading ve(3,3) DEX on BNB Smart Chain (chain ID 56, native gas BNB). ' +
    'THENA has two venues: Fusion (Algebra concentrated liquidity, dynamic fees) and V1 (Solidly-fork AMM with stable + volatile pools). ' +
    'This skill quotes BOTH and routes through whichever gives the better output (best execution). ' +
    'Supports WBNB, USDT, USDC, THE, BTCB, ETH and any ERC-20 on BSC. ' +
    'Note: on BSC, USDT and USDC are 18-decimal tokens (not 6). Swaps use wrapped WBNB (hold WBNB, not native BNB). ' +
    'Exact-input only (specify amountIn).\n\n' +
    'execution_mode: server-side\n' +
    'chain: bsc (id: 56)\n' +
    'rpc: https://bsc-dataseed.bnbchain.org\n' +
    'gas_token: BNB\n' +
    'sop_compliance:\n' +
    '  provides_quote: true\n' +
    '  returns_price_impact: true\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['thena', 'bsc', 'bnb', 'dex', 'swap', 'defi', 'evm', 've33', 'solidly', 'algebra', 'clmm'],
  external_url: 'https://thena.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/thena?w=48&h=48',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'build_swap_tx'],
        description:
          'get_quote: live best-execution quote across THENA Fusion + V1 (no gas). ' +
          'build_swap_tx: build approve + swap transaction(s) routed through the better venue. ' +
          'Both require amountIn (exact-input only; exact-output is not supported).',
      },
      tokenIn:     { type: 'string', description: 'Input token symbol (WBNB, USDT, USDC, THE, BTCB, ETH) or 0x address on BSC.' },
      tokenOut:    { type: 'string', description: 'Output token symbol or 0x address on BSC.' },
      amountIn:    { type: 'string', description: 'Human-readable input amount, e.g. "1" for 1 WBNB. Required.' },
      sender:      { type: 'string', description: 'EVM wallet address (0x…). Required for build_swap_tx.' },
      slippageBps: { type: 'number', description: 'Slippage tolerance in basis points (default: 50 = 0.5%). Used in build_swap_tx.' },
    },
  },
  usage_examples: [
    { title: 'Quote 1 WBNB → USDT', input: { action: 'get_quote', tokenIn: 'WBNB', tokenOut: 'USDT', amountIn: '1' } },
    { title: 'Quote 100 USDT → USDC', input: { action: 'get_quote', tokenIn: 'USDT', tokenOut: 'USDC', amountIn: '100' } },
    { title: 'Build swap WBNB → USDT', input: { action: 'build_swap_tx', tokenIn: 'WBNB', tokenOut: 'USDT', amountIn: '1', sender: '0xYourAddress' } },
  ],
};

// ── Action handlers ───────────────────────────────────────────────────────────

async function getQuote(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut, amountIn } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountIn) return { success: false, error: 'amountIn is required (exact-input only).' };
  try {
    const tIn  = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
    const best = await bestQuote(tIn.address, tOut.address, amountInRaw);
    if (!best) return { success: false, error: `No THENA pool found for ${tIn.symbol}→${tOut.symbol} on BSC (checked Fusion + V1).` };

    const amountOutStr = formatUnits(best.amountOut, tOut.decimals);
    const execPrice = Number(amountOutStr) / Number(amountIn);

    // Price impact: compare execution price vs 1-unit spot at the winning venue
    let priceImpactPct: number | null = null;
    try {
      const oneUnit = 10n ** BigInt(tIn.decimals);
      const spot = best.venue === 'fusion'
        ? await quoteFusion(tIn.address, tOut.address, oneUnit)
        : await quoteV1(tIn.address, tOut.address, oneUnit);
      if (spot) { const sp = Number(formatUnits(spot.amountOut, tOut.decimals)); if (sp > 0) priceImpactPct = Math.max(0, Number(((sp - execPrice) / sp * 100).toFixed(4))); }
    } catch { /* non-fatal */ }

    return {
      success: true,
      output: {
        amountIn: String(amountIn),
        amountOut: amountOutStr,
        venue: best.venue === 'fusion' ? 'THENA Fusion (Algebra CLMM)' : `THENA V1 (Solidly ${best.stable ? 'stable' : 'volatile'})`,
        fee: best.venue === 'fusion' && best.fee != null ? `${(best.fee / 10000).toFixed(4)}%` : (best.stable ? 'stable pool' : 'volatile pool'),
        executionPrice: execPrice.toFixed(6),
        price_impact: priceImpactPct,
        route: [tIn.symbol, tOut.symbol],
        chain: 'bsc',
        chain_id: CHAIN_ID,
        _operation: 'thena_swap',
      },
    };
  } catch (err: any) { return { success: false, error: `get_quote failed: ${err.message}` }; }
}

async function buildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut, amountIn, sender, slippageBps = 50 } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountIn) return { success: false, error: 'amountIn is required (exact-input only).' };
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) return { success: false, error: 'A valid sender address (0x…) is required.' };
  try {
    const tIn  = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const slip = BigInt(slippageBps);
    const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
    const best = await bestQuote(tIn.address, tOut.address, amountInRaw);
    if (!best) return { success: false, error: `No THENA pool found for ${tIn.symbol}→${tOut.symbol} on BSC (checked Fusion + V1).` };

    const amountOutMin = best.amountOut * (10000n - slip) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800); // now + 30 min
    const router = best.venue === 'fusion' ? FUSION_ROUTER : V1_ROUTER;

    let swapCalldata: string;
    let venueLabel: string;
    if (best.venue === 'fusion') {
      // exactInputSingle((tokenIn, tokenOut, recipient, deadline, amountIn, amountOutMinimum, limitSqrtPrice)) — 7 static words
      swapCalldata = '0x' + SEL.fusionSwap
        + p32(tIn.address) + p32(tOut.address) + p32(sender) + p32(deadline)
        + p32(amountInRaw) + p32(amountOutMin) + p32(0n);
      venueLabel = 'THENA Fusion';
    } else {
      // swapExactTokensForTokens(amountIn, amountOutMin, Route[](from,to,stable), to, deadline)
      // head: amountIn, amountOutMin, offset(0xa0), to, deadline | tail: len(1), from, to, stable
      const stableFlag = best.stable ? 1n : 0n;
      swapCalldata = '0x' + SEL.v1Swap
        + p32(amountInRaw) + p32(amountOutMin) + p32(0xa0) + p32(sender) + p32(deadline)
        + p32(1n) + p32(tIn.address) + p32(tOut.address) + p32(stableFlag);
      venueLabel = `THENA V1 (${best.stable ? 'stable' : 'volatile'})`;
    }

    const swapTx = {
      to: router,
      data: swapCalldata,
      value: '0x0',
      chain_id: CHAIN_ID,
      description: `Swap ${amountIn} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via ${venueLabel} on BSC`,
    };

    const allowance = await getAllowance(tIn.address, sender, router);
    const transactions = [
      ...(allowance < amountInRaw ? [{
        to: tIn.address,
        data: '0x' + SEL.erc20Approve + p32(router) + p32(amountInRaw),
        value: '0x0',
        chain_id: CHAIN_ID,
        description: `Approve ${amountIn} ${tIn.symbol} for ${venueLabel} router`,
      }] : []),
      swapTx,
    ];

    return {
      success: true,
      output: {
        transactions,
        amount_out_estimated: formatUnits(best.amountOut, tOut.decimals),
        amount_out_minimum: formatUnits(amountOutMin, tOut.decimals),
        venue: venueLabel,
        router,
        chain: 'bsc',
        chain_id: CHAIN_ID,
        _operation: 'thena_swap',
      },
    };
  } catch (err: any) { return { success: false, error: `build_swap_tx failed: ${err.message}` }; }
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeThenaSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'get_quote':     return getQuote(input);
    case 'build_swap_tx': return buildSwapTx(input);
    default:
      return { success: false, error: `Unknown action "${action}". Valid: get_quote, build_swap_tx` };
  }
}
