/**
 * Uniswap V3 on BNB Smart Chain — Server-side execution
 *
 * Uniswap V3 is officially deployed on BSC (chain ID 56). Get live swap quotes
 * and build unsigned swap transactions. Second-largest DEX on BSC after PancakeSwap.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls BSC's public RPC directly. No API key needed.
 *
 * Skill UUID: d54885d1-1455-497c-9366-d747b1f280af
 *
 * Contracts on BSC (chain ID 56, verified on-chain 2026-06-15):
 *   UniswapV3Factory:  0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7
 *   QuoterV2:          0x78D78E420Da98ad378D7799bE8f4AF69033EB077
 *   SwapRouter02:      0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2  (SwapRouter02, NO deadline)
 *
 * ⚠ BSC decimals trap: USDT and USDC on BSC are 18 decimals (NOT 6 like Ethereum).
 *   WBNB swaps the wrapped token — hold WBNB, not native BNB (use bnb-chain wrap first).
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Contracts ─────────────────────────────────────────────────────────────────

const CONTRACTS = {
  factory:    '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
  quoterV2:   '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
  swapRouter: '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2',
} as const;

const DEFAULT_RPC = 'https://bsc-dataseed.bnbchain.org';
const CHAIN_ID    = 56;

function getRpcUrl(): string { return process.env.BSC_RPC_URL || DEFAULT_RPC; }

// ── Well-known BSC tokens (ALL 18 decimals on BSC, including stablecoins) ───────

const TOKENS: Record<string, { address: string; decimals: number }> = {
  WBNB: { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
  BNB:  { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 }, // alias → WBNB (wrapped)
  USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  BTCB: { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 },
  ETH:  { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
  CAKE: { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18 },
};

// ── ABI selectors ─────────────────────────────────────────────────────────────

const SEL = {
  quoteExactInput:  'c6a5026a', // QuoterV2.quoteExactInputSingle
  quoteExactOutput: 'bd21704a', // QuoterV2.quoteExactOutputSingle
  swapExactInput:   '04e45aaf', // SwapRouter02.exactInputSingle (no deadline)
  swapExactOutput:  '5023b4df', // SwapRouter02.exactOutputSingle
  getPool:          '1698ee82', // V3Factory.getPool
  erc20Decimals:    '313ce567',
  erc20Allowance:   'dd62ed3e',
} as const;

const FEE_TIERS = [100, 500, 3000, 10000];

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

async function quoteExactIn(tokenIn: string, tokenOut: string, amountIn: bigint, fee: number) {
  const data = '0x' + SEL.quoteExactInput + p32(tokenIn) + p32(tokenOut) + p32(amountIn) + p32(fee) + p32(0n);
  try {
    const hex = (await ethCall(CONTRACTS.quoterV2, data)).replace('0x', '');
    if (!hex || hex === '0'.repeat(hex.length)) return null;
    return { amountOut: readU256(hex, 0), gasEstimate: readU256(hex, 3) };
  } catch { return null; }
}
async function quoteExactOut(tokenIn: string, tokenOut: string, amountOut: bigint, fee: number) {
  const data = '0x' + SEL.quoteExactOutput + p32(tokenIn) + p32(tokenOut) + p32(amountOut) + p32(fee) + p32(0n);
  try {
    const hex = (await ethCall(CONTRACTS.quoterV2, data)).replace('0x', '');
    if (!hex || hex === '0'.repeat(hex.length)) return null;
    return { amountIn: readU256(hex, 0), gasEstimate: readU256(hex, 3) };
  } catch { return null; }
}
async function bestQuoteIn(tokenIn: string, tokenOut: string, amountIn: bigint, feeTiers = FEE_TIERS) {
  let best: { amountOut: bigint; gasEstimate: bigint; fee: number } | null = null;
  for (const fee of feeTiers) { const q = await quoteExactIn(tokenIn, tokenOut, amountIn, fee); if (q && (!best || q.amountOut > best.amountOut)) best = { ...q, fee }; }
  return best;
}
async function bestQuoteOut(tokenIn: string, tokenOut: string, amountOut: bigint, feeTiers = FEE_TIERS) {
  let best: { amountIn: bigint; gasEstimate: bigint; fee: number } | null = null;
  for (const fee of feeTiers) { const q = await quoteExactOut(tokenIn, tokenOut, amountOut, fee); if (q && (!best || q.amountIn < best.amountIn)) best = { ...q, fee }; }
  return best;
}
async function getAllowance(token: string, owner: string, spender: string): Promise<bigint> {
  try { return readU256(await ethCall(token, '0x' + SEL.erc20Allowance + p32(owner) + p32(spender))); } catch { return 0n; }
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const UNISWAP_BSC_SKILL_METADATA = {
  name: 'Uniswap V3 on BSC',
  description:
    '[ARSENAL-HOSTED ✓] Swap tokens on Uniswap V3 deployed on BNB Smart Chain (chain ID 56, native gas BNB). ' +
    'The second-largest DEX on BSC after PancakeSwap. Get live quotes and build swap transactions for ' +
    'WBNB, USDT, USDC, BTCB, ETH, CAKE and any ERC-20 on BSC. ' +
    'Note: on BSC, USDT and USDC are 18-decimal tokens (not 6). Swaps use wrapped WBNB (hold WBNB, not native BNB).\n\n' +
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
  tags: ['uniswap', 'bsc', 'bnb', 'swap', 'defi', 'evm', 'v3', 'clmm'],
  external_url: 'https://app.uniswap.org',
  logo_url: 'https://icons.llamao.fi/icons/protocols/uniswap?w=48&h=48',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'build_swap_tx', 'get_pools'],
        description:
          'get_quote: Live swap quote from QuoterV2 — returns amountOut/amountIn and price impact. ' +
          'build_swap_tx: Build unsigned swap calldata via SwapRouter02 — returns transactions array. ' +
          'get_pools: Check which fee-tier pools exist for a token pair.',
      },
      tokenIn:     { type: 'string', description: 'Input token symbol (WBNB, USDT, USDC, BTCB, ETH, CAKE) or 0x address.' },
      tokenOut:    { type: 'string', description: 'Output token symbol or 0x address.' },
      amountIn:    { type: 'string', description: 'Exact input amount in human-readable units (e.g. "100" for 100 USDT).' },
      amountOut:   { type: 'string', description: 'Exact output amount for exact-output mode.' },
      sender:      { type: 'string', description: 'Wallet address (0x…). Required for build_swap_tx.' },
      slippageBps: { type: 'number', description: 'Slippage tolerance in basis points (default: 50 = 0.5%).' },
      feeTier:     { type: 'number', enum: [100, 500, 3000, 10000], description: 'Specific fee tier in bps. If omitted, best tier is selected automatically.' },
    },
  },
  usage_examples: [
    { title: 'Quote WBNB → USDT', input: { action: 'get_quote', tokenIn: 'WBNB', tokenOut: 'USDT', amountIn: '1' } },
    { title: 'Quote USDT → USDC', input: { action: 'get_quote', tokenIn: 'USDT', tokenOut: 'USDC', amountIn: '100' } },
    { title: 'Build swap', input: { action: 'build_swap_tx', tokenIn: 'WBNB', tokenOut: 'USDT', amountIn: '1', sender: '0xYourAddress' } },
    { title: 'Check pools', input: { action: 'get_pools', tokenIn: 'WBNB', tokenOut: 'USDT' } },
  ],
};

// ── Action handlers ───────────────────────────────────────────────────────────

async function getQuote(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut, amountIn, amountOut, feeTier } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountIn && !amountOut) return { success: false, error: 'Provide amountIn or amountOut.' };
  try {
    const tIn = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const tiers = feeTier ? [Number(feeTier)] : FEE_TIERS;

    if (amountIn) {
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw, tiers);
      if (!best) return { success: false, error: `No Uniswap V3 pool found for ${tIn.symbol}→${tOut.symbol} on BSC.` };
      const amountOutStr = formatUnits(best.amountOut, tOut.decimals);
      const execPrice = Number(amountOutStr) / Number(amountIn);
      let priceImpactPct: number | null = null;
      try {
        const spot = await quoteExactIn(tIn.address, tOut.address, 10n ** BigInt(tIn.decimals), best.fee);
        if (spot) { const sp = Number(formatUnits(spot.amountOut, tOut.decimals)); if (sp > 0) priceImpactPct = Math.max(0, Number(((sp - execPrice) / sp * 100).toFixed(4))); }
      } catch { /* non-fatal */ }
      return { success: true, output: { amountIn: String(amountIn), amountOut: amountOutStr, fee: `${best.fee / 10000}%`, route: [tIn.symbol, tOut.symbol], executionPrice: execPrice.toFixed(6), price_impact: priceImpactPct, gasEstimate: best.gasEstimate.toString(), chain: 'bsc', chain_id: CHAIN_ID, _operation: 'uniswap_v3_swap' } };
    } else {
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, tiers);
      if (!best) return { success: false, error: `No Uniswap V3 pool found for ${tIn.symbol}→${tOut.symbol} on BSC.` };
      const amountInStr = formatUnits(best.amountIn, tIn.decimals);
      const execPrice = Number(amountOut) / Number(amountInStr);
      return { success: true, output: { amountIn: amountInStr, amountOut: String(amountOut), fee: `${best.fee / 10000}%`, route: [tIn.symbol, tOut.symbol], executionPrice: execPrice.toFixed(6), gasEstimate: best.gasEstimate.toString(), chain: 'bsc', chain_id: CHAIN_ID, _operation: 'uniswap_v3_swap' } };
    }
  } catch (err: any) { return { success: false, error: `get_quote failed: ${err.message}` }; }
}

async function buildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut, amountIn, amountOut, sender, slippageBps = 50, feeTier } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) return { success: false, error: 'A valid sender address (0x…) is required.' };
  if (!amountIn && !amountOut) return { success: false, error: 'Provide amountIn or amountOut.' };
  try {
    const tIn = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const slip = BigInt(slippageBps);
    const tiers = feeTier ? [Number(feeTier)] : FEE_TIERS;

    if (amountOut) {
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, tiers);
      if (!best) return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on BSC.` };
      const amountInMax = best.amountIn * (10000n + slip) / 10000n;
      const calldata = SEL.swapExactOutput + p32(tIn.address) + p32(tOut.address) + p32(best.fee) + p32(sender) + p32(amountOutRaw) + p32(amountInMax) + p32(0n);
      const swapTx = { to: CONTRACTS.swapRouter, data: '0x' + calldata, value: '0x0', chain_id: CHAIN_ID, description: `Swap at most ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for exactly ${amountOut} ${tOut.symbol} via Uniswap V3 on BSC` };
      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.swapRouter);
      const transactions = [
        ...(allowance < amountInMax ? [{ to: tIn.address, data: '0x095ea7b3' + p32(CONTRACTS.swapRouter) + p32(amountInMax), value: '0x0', chain_id: CHAIN_ID, description: `Approve ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for Uniswap SwapRouter02` }] : []),
        swapTx,
      ];
      return { success: true, output: { transactions, amountOut: String(amountOut), amountInMax: formatUnits(amountInMax, tIn.decimals), fee: `${best.fee / 10000}%`, chain: 'bsc', chain_id: CHAIN_ID, _operation: 'uniswap_v3_swap' } };
    } else {
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw, tiers);
      if (!best) return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on BSC.` };
      const amountOutMin = best.amountOut * (10000n - slip) / 10000n;
      const calldata = SEL.swapExactInput + p32(tIn.address) + p32(tOut.address) + p32(best.fee) + p32(sender) + p32(amountInRaw) + p32(amountOutMin) + p32(0n);
      const swapTx = { to: CONTRACTS.swapRouter, data: '0x' + calldata, value: '0x0', chain_id: CHAIN_ID, description: `Swap exactly ${amountIn} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via Uniswap V3 on BSC` };
      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.swapRouter);
      const transactions = [
        ...(allowance < amountInRaw ? [{ to: tIn.address, data: '0x095ea7b3' + p32(CONTRACTS.swapRouter) + p32(amountInRaw), value: '0x0', chain_id: CHAIN_ID, description: `Approve ${amountIn} ${tIn.symbol} for Uniswap SwapRouter02` }] : []),
        swapTx,
      ];
      return { success: true, output: { transactions, amountIn: String(amountIn), amountOutMin: formatUnits(amountOutMin, tOut.decimals), fee: `${best.fee / 10000}%`, chain: 'bsc', chain_id: CHAIN_ID, _operation: 'uniswap_v3_swap' } };
    }
  } catch (err: any) { return { success: false, error: `build_swap_tx failed: ${err.message}` }; }
}

async function getPools(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  try {
    const tIn = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const results: Array<{ fee: number; fee_label: string; pool: string; exists: boolean }> = [];
    for (const fee of FEE_TIERS) {
      const result = await ethCall(CONTRACTS.factory, '0x' + SEL.getPool + p32(tIn.address) + p32(tOut.address) + p32(fee));
      const pool = '0x' + result.replace('0x', '').slice(24);
      const exists = pool !== '0x0000000000000000000000000000000000000000';
      results.push({ fee, fee_label: `${fee / 10000}%`, pool: exists ? pool : '—', exists });
    }
    return { success: true, output: { tokenIn: { symbol: tIn.symbol, address: tIn.address }, tokenOut: { symbol: tOut.symbol, address: tOut.address }, pools: results, chain: 'bsc', chain_id: CHAIN_ID } };
  } catch (err: any) { return { success: false, error: `get_pools failed: ${err.message}` }; }
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeUniswapBscSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'get_quote':     return getQuote(input);
    case 'build_swap_tx': return buildSwapTx(input);
    case 'get_pools':     return getPools(input);
    default:
      return { success: false, error: `Unknown action "${action}". Valid: get_quote, build_swap_tx, get_pools` };
  }
}
