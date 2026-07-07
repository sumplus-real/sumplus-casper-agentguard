/**
 * HSKSwap Skill — Server-side execution on HashKey Chain
 *
 * HSKSwap is the primary DEX on HashKey Chain (chain ID 177), a compliance-first
 * Ethereum L2 backed by HashKey Group. It uses a Solidly V1-style AMM with stable
 * and volatile pool types — same design as Velodrome V1 / Aerodrome, but with a
 * 3-field route struct (no factory field).
 *
 * Pool types:
 *  - Volatile (vAMM): xy=k, for general token pairs (HSK/USDT, etc.)
 *  - Stable (sAMM):   Curve-style invariant, for pegged assets (USDT/USDC)
 *
 * Skill UUID: a3f8c201-7e45-4b9d-b3f2-6c1d8a2e5047
 *
 * Contracts on HashKey Chain (mainnet, chain ID 177):
 *   Router:  0x6d88Eb05F63a9979729963C0c31649c9eaA9e7bD
 *   Factory: 0x5C3027D8Cb28A712413553206A094213337E88c5
 *   WHSK:    0xB210D2120d57b758EE163cFfb43e73728c471Cf1
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getRpcEndpoints } from '@/lib/rpc';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ─── Chain config ────────────────────────────────────────────────────────────

const CONTRACTS = {
  router:  '0x6d88Eb05F63a9979729963C0c31649c9eaA9e7bD',
  factory: '0x5C3027D8Cb28A712413553206A094213337E88c5',
  whsk:    '0xB210D2120d57b758EE163cFfb43e73728c471Cf1',
};

// Verified function selectors (route struct is (address from, address to, bool stable) — 3 fields)
const SEL = {
  getAmountsOut:    '9881fcb4', // getAmountsOut(uint256,(address,address,bool)[])
  swapTokens:       'f41766d8', // swapExactTokensForTokens(uint256,uint256,(address,address,bool)[],address,uint256)
  swapETHForTokens: '67ffb66a', // swapExactETHForTokens(uint256,(address,address,bool)[],address,uint256)
  swapTokensForETH: '18a13086', // swapExactTokensForETH(uint256,uint256,(address,address,bool)[],address,uint256)
  getPair:          '6801cc30', // getPair(address,address,bool)
  getReserves:      '0902f1ac', // getReserves()
  token0:           '0dfe1681', // token0()
  decimals:         '313ce567', // decimals()
  symbol:           '95d89b41', // symbol()
  allowance:        'dd62ed3e', // allowance(address,address)
  approve:          '095ea7b3', // approve(address,uint256)
};

// Well-known tokens on HashKey Chain mainnet
const TOKENS: Record<string, { address: string; decimals: number }> = {
  HSK:    { address: CONTRACTS.whsk,                                    decimals: 18 }, // native, use WHSK address
  WHSK:   { address: CONTRACTS.whsk,                                    decimals: 18 },
  USDT:   { address: '0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029',    decimals: 6  },
  USDC:   { address: '0x8845E8C74cE5dF8E0d37bf0fe57dc5E0ddD8021b',    decimals: 6  },
  'USDC.e': { address: '0x054ed45810DbBAb8B27668922D110669c9D88D0a',  decimals: 6  },
};

// ─── RPC helper ───────────────────────────────────────────────────────────────

// RPC endpoints (HASHKEY_RPC_URL env override, then public endpoints) come from
// the central registry so failover is shared and updated in one place.
function getHashKeyRpcUrls(): string[] {
  return getRpcEndpoints('hashkey');
}

function rpcPost(rpcUrl: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(rpcUrl);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const payload   = JSON.stringify(body);

    let options: any;
    let client: typeof https | typeof http;

    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = {
        hostname: proxy.hostname, port: proxy.port || 7890,
        path: rpcUrl, method: 'POST',
        headers: { Host: targetUrl.hostname, 'Content-Type': 'application/json',
                   'Content-Length': Buffer.byteLength(payload) },
        timeout: 20000,
      };
    } else {
      client  = https;
      options = {
        hostname: targetUrl.hostname,
        path:     targetUrl.pathname + targetUrl.search,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout:  20000,
        family:   4,
      };
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(`RPC error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`));
          else resolve(parsed.result);
        } catch { reject(new Error(`RPC parse error: ${data.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('RPC timeout')); });
    req.write(payload);
    req.end();
  });
}

async function ethCall(to: string, data: string): Promise<string> {
  const body = { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] };
  let lastErr: unknown;
  for (const url of getHashKeyRpcUrls()) {
    try {
      const result = await rpcPost(url, body);
      return (result as string) || '0x';
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('All HashKey RPC endpoints failed');
}

// ─── ABI encoding helpers ─────────────────────────────────────────────────────

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) {
    return v.slice(2).toLowerCase().padStart(64, '0');
  }
  return BigInt(v).toString(16).padStart(64, '0');
}

function readU256(hex: string, slot = 0): bigint {
  const h = hex.replace('0x', '');
  return BigInt('0x' + (h.slice(slot * 64, slot * 64 + 64) || '0'));
}

function readAddress(hex: string, slot = 0): string {
  const h = hex.replace('0x', '');
  return '0x' + h.slice(slot * 64 + 24, slot * 64 + 64);
}

function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(fracPadded || '0');
}

function formatUnits(value: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole   = value / divisor;
  const frac    = value % divisor;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

// ─── Token resolution ─────────────────────────────────────────────────────────

interface TokenInfo { address: string; decimals: number; symbol: string }

async function resolveToken(raw: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  if (TOKENS[upper]) return { ...TOKENS[upper], symbol: upper };
  if (raw.trim().toLowerCase() in Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k.toLowerCase(), v]))) {
    const entry = Object.entries(TOKENS).find(([k]) => k.toLowerCase() === raw.trim().toLowerCase())!;
    return { ...entry[1], symbol: entry[0] };
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    const decHex = await ethCall(raw, '0x' + SEL.decimals).catch(() => '0x');
    const decimals = decHex === '0x' ? 18 : Number(readU256(decHex));
    return { address: raw, decimals, symbol: raw.slice(0, 8) + '…' };
  }

  throw new Error(
    `Unknown token "${raw}" on HashKey Chain. ` +
    `Use a symbol (${Object.keys(TOKENS).join(', ')}) or a full 0x address.`
  );
}

// ─── Router calldata encoders ─────────────────────────────────────────────────

/**
 * Encode getAmountsOut calldata.
 * Route struct: (address from, address to, bool stable) — 3 fields
 *
 * After selector:
 *   [32] amountIn
 *   [32] offset to routes array = 0x40
 *   [32] routes.length = 1
 *   [32] route.from
 *   [32] route.to
 *   [32] route.stable
 */
function encodeGetAmountsOut(amountIn: bigint, tokenIn: string, tokenOut: string, stable: boolean): string {
  return '0x'
    + SEL.getAmountsOut
    + p32(amountIn)
    + p32(0x40)
    + p32(1)
    + p32(tokenIn)
    + p32(tokenOut)
    + p32(stable ? 1 : 0);
}

/**
 * Call router getAmountsOut for single hop. Returns amountOut or null if no pool.
 * Return: uint256[] → [amountIn, amountOut]; amountOut is at slot 3.
 */
async function quoteRoute(
  tokenIn: string, tokenOut: string, amountIn: bigint, stable: boolean
): Promise<bigint | null> {
  try {
    const data = encodeGetAmountsOut(amountIn, tokenIn, tokenOut, stable);
    const hex = (await ethCall(CONTRACTS.router, data)).replace('0x', '');
    if (!hex || hex.length < 256) return null;
    const out = readU256(hex, 3);
    return out > 0n ? out : null;
  } catch {
    return null;
  }
}

async function getPairAddress(tokenA: string, tokenB: string, stable: boolean): Promise<string | null> {
  const data = '0x' + SEL.getPair + p32(tokenA) + p32(tokenB) + p32(stable ? 1 : 0);
  const result = await ethCall(CONTRACTS.factory, data).catch(() => '0x');
  if (!result || result === '0x' || result.length < 66) return null;
  const addr = readAddress(result, 0);
  return addr === '0x0000000000000000000000000000000000000000' ? null : addr;
}

async function getAllowance(tokenAddr: string, owner: string, spender: string): Promise<bigint> {
  const data = '0x' + SEL.allowance + p32(owner) + p32(spender);
  try {
    const result = await ethCall(tokenAddr, data);
    return readU256(result);
  } catch {
    return 0n;
  }
}

/**
 * Estimate amountIn needed to receive desiredOut (exact-output approximation).
 * Uses spot rate + 3% buffer for price impact.
 */
async function estimateExactIn(
  tokenIn: string, tokenOut: string, desiredOut: bigint,
  stable: boolean, decimalsIn: number,
): Promise<bigint | null> {
  const refIn  = parseUnits('0.001', decimalsIn);
  const refOut = await quoteRoute(tokenIn, tokenOut, refIn, stable);
  if (!refOut || refOut === 0n) return null;
  return desiredOut * refIn / refOut * 103n / 100n;
}

// ─── Swap calldata encoders ───────────────────────────────────────────────────

/**
 * ERC20 → ERC20 swap.
 * swapExactTokensForTokens(uint256,uint256,(address,address,bool)[],address,uint256)
 * Params layout: amountIn | amountOutMin | offset(0xA0) | to | deadline | length=1 | from | to | stable
 */
function encodeSwapERC20ToERC20(
  amountIn: bigint, amountOutMin: bigint,
  tokenIn: string, tokenOut: string, stable: boolean,
  recipient: string, deadline: bigint,
): string {
  return '0x'
    + SEL.swapTokens
    + p32(amountIn)
    + p32(amountOutMin)
    + p32(0xA0)       // offset: 5 fixed slots × 32 = 160
    + p32(recipient)
    + p32(deadline)
    + p32(1)
    + p32(tokenIn)
    + p32(tokenOut)
    + p32(stable ? 1 : 0);
}

/**
 * Native HSK → ERC20 swap (msg.value = amountIn).
 * swapExactETHForTokens(uint256,(address,address,bool)[],address,uint256)
 * Params: amountOutMin | offset(0x80) | to | deadline | length=1 | from(WHSK) | to | stable
 */
function encodeSwapHSKToERC20(
  amountOutMin: bigint,
  tokenOut: string, stable: boolean,
  recipient: string, deadline: bigint,
): string {
  return '0x'
    + SEL.swapETHForTokens
    + p32(amountOutMin)
    + p32(0x80)       // offset: 4 fixed slots × 32 = 128
    + p32(recipient)
    + p32(deadline)
    + p32(1)
    + p32(CONTRACTS.whsk)   // route.from = WHSK (router wraps native HSK)
    + p32(tokenOut)
    + p32(stable ? 1 : 0);
}

/**
 * ERC20 → Native HSK swap (router unwraps WHSK → HSK).
 * swapExactTokensForETH(uint256,uint256,(address,address,bool)[],address,uint256)
 * Params: amountIn | amountOutMin | offset(0xA0) | to | deadline | length=1 | from | to(WHSK) | stable
 */
function encodeSwapERC20ToHSK(
  amountIn: bigint, amountOutMin: bigint,
  tokenIn: string, stable: boolean,
  recipient: string, deadline: bigint,
): string {
  return '0x'
    + SEL.swapTokensForETH
    + p32(amountIn)
    + p32(amountOutMin)
    + p32(0xA0)
    + p32(recipient)
    + p32(deadline)
    + p32(1)
    + p32(tokenIn)
    + p32(CONTRACTS.whsk)   // route.to = WHSK (router unwraps to HSK)
    + p32(stable ? 1 : 0);
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function actionGetQuote(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawInC, token_in: rawInS, tokenOut: rawOutC, token_out: rawOutS, amountIn: amountInC, amount_in: amountInS, amount_out: amountOutStr, stable: stableOverride } = input;
  const rawIn = rawInC ?? rawInS;
  const rawOut = rawOutC ?? rawOutS;
  const amountInStr = amountInC ?? amountInS;

  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountInStr && !amountOutStr) {
    return { success: false, error: 'Provide amountIn (exact-input) or amount_out (exact-output).' };
  }

  const [tIn, tOut] = await Promise.all([resolveToken(rawIn), resolveToken(rawOut)]);

  // ── Exact-output mode ────────────────────────────────────────────────────────
  if (!amountInStr && amountOutStr) {
    const desiredOut = parseUnits(String(amountOutStr), tOut.decimals);

    let stableIn:   bigint | null = null;
    let volatileIn: bigint | null = null;
    if (stableOverride === true) {
      stableIn   = await estimateExactIn(tIn.address, tOut.address, desiredOut, true,  tIn.decimals);
    } else if (stableOverride === false) {
      volatileIn = await estimateExactIn(tIn.address, tOut.address, desiredOut, false, tIn.decimals);
    } else {
      [stableIn, volatileIn] = await Promise.all([
        estimateExactIn(tIn.address, tOut.address, desiredOut, true,  tIn.decimals),
        estimateExactIn(tIn.address, tOut.address, desiredOut, false, tIn.decimals),
      ]);
    }

    if (!stableIn && !volatileIn) {
      return { success: false, error: `No HSKSwap pool found for ${tIn.symbol}→${tOut.symbol} on HashKey Chain.` };
    }

    const useStable   = stableIn != null && (volatileIn == null || stableIn <= volatileIn);
    const bestAmtIn   = useStable ? stableIn! : volatileIn!;
    const poolAddress = await getPairAddress(tIn.address, tOut.address, useStable).catch(() => null);

    return {
      success: true,
      output: {
        mode:         'exact-output',
        tokenIn:      tIn.symbol,
        tokenOut:     tOut.symbol,
        amount_out:   String(amountOutStr),
        amount_in:    formatUnits(bestAmtIn, tIn.decimals),
        route:        useStable ? 'stable' : 'volatile',
        pool_address: poolAddress,
        chain:        'hashkey',
        router:       'HSKSwap',
        _note:        'amount_in includes a 3% buffer for price impact.',
        _mock:        false,
        alternatives: {
          stable:   stableIn   ? formatUnits(stableIn,   tIn.decimals) : 'no pool',
          volatile: volatileIn ? formatUnits(volatileIn, tIn.decimals) : 'no pool',
        },
      },
    };
  }

  // ── Exact-input mode ─────────────────────────────────────────────────────────
  const amountIn = parseUnits(String(amountInStr), tIn.decimals);

  let stableOut: bigint | null = null;
  let volatileOut: bigint | null = null;
  if (stableOverride === true) {
    stableOut   = await quoteRoute(tIn.address, tOut.address, amountIn, true);
  } else if (stableOverride === false) {
    volatileOut = await quoteRoute(tIn.address, tOut.address, amountIn, false);
  } else {
    [stableOut, volatileOut] = await Promise.all([
      quoteRoute(tIn.address, tOut.address, amountIn, true),
      quoteRoute(tIn.address, tOut.address, amountIn, false),
    ]);
  }

  if (!stableOut && !volatileOut) {
    return {
      success: false,
      error: `No HSKSwap pool found for ${tIn.symbol}→${tOut.symbol} on HashKey Chain. ` +
             `Use get_pool to verify pool existence, or check token addresses.`,
    };
  }

  const useStable = stableOut != null && (volatileOut == null || stableOut >= volatileOut);
  const bestOut   = useStable ? stableOut! : volatileOut!;
  const poolType  = useStable ? 'stable' : 'volatile';

  const amountOutFmt   = formatUnits(bestOut, tOut.decimals);
  const executionPrice = Number(amountOutFmt) / Number(amountInStr);

  let priceImpact: number | null = null;
  try {
    const oneUnit = parseUnits('1', tIn.decimals);
    const refOut  = await quoteRoute(tIn.address, tOut.address, oneUnit, useStable);
    if (refOut) {
      const spotPrice = Number(formatUnits(refOut, tOut.decimals));
      if (spotPrice > 0) {
        priceImpact = Number(((spotPrice - executionPrice) / spotPrice).toFixed(6));
        if (priceImpact < 0) priceImpact = 0;
      }
    }
  } catch { /* non-fatal */ }

  const poolAddress = await getPairAddress(tIn.address, tOut.address, useStable).catch(() => null);

  return {
    success: true,
    output: {
      mode:         'exact-input',
      tokenIn:      tIn.symbol,
      tokenOut:     tOut.symbol,
      amount_in:    String(amountInStr),
      amount_out:   amountOutFmt,
      route:        poolType,
      pool_address: poolAddress,
      price_impact: priceImpact,
      chain:        'hashkey',
      router:       'HSKSwap',
      _mock:        false,
      alternatives: {
        stable:   stableOut   ? formatUnits(stableOut,   tOut.decimals) : 'no pool',
        volatile: volatileOut ? formatUnits(volatileOut, tOut.decimals) : 'no pool',
      },
    },
  };
}

async function actionBuildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawInC, token_in: rawInS, tokenOut: rawOutC, token_out: rawOutS, amountIn: amountInC, amount_in: amountInS, stable: stableOverride, sender, slippageBps = 50 } = input;
  const rawIn = rawInC ?? rawInS;
  const rawOut = rawOutC ?? rawOutS;
  const amountInStr = amountInC ?? amountInS;

  if (!rawIn || !rawOut)  return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountInStr)       return { success: false, error: 'amountIn is required.' };
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
    return { success: false, error: 'A valid sender address (0x...) is required.' };
  }

  const isNativeIn  = rawIn.trim().toUpperCase()  === 'HSK';
  const isNativeOut = rawOut.trim().toUpperCase() === 'HSK';

  const [tIn, tOut] = await Promise.all([resolveToken(rawIn), resolveToken(rawOut)]);
  const amountIn    = parseUnits(String(amountInStr), tIn.decimals);

  let stableOut: bigint | null = null;
  let volatileOut: bigint | null = null;
  if (stableOverride === true) {
    stableOut   = await quoteRoute(tIn.address, tOut.address, amountIn, true);
  } else if (stableOverride === false) {
    volatileOut = await quoteRoute(tIn.address, tOut.address, amountIn, false);
  } else {
    [stableOut, volatileOut] = await Promise.all([
      quoteRoute(tIn.address, tOut.address, amountIn, true),
      quoteRoute(tIn.address, tOut.address, amountIn, false),
    ]);
  }

  if (!stableOut && !volatileOut) {
    return { success: false, error: `No HSKSwap pool found for ${tIn.symbol}→${tOut.symbol} on HashKey Chain.` };
  }

  const useStable    = stableOut != null && (volatileOut == null || stableOut >= volatileOut);
  const amountOut    = useStable ? stableOut! : volatileOut!;
  const poolType     = useStable ? 'stable' : 'volatile';
  const slip         = BigInt(slippageBps);
  const amountOutMin = amountOut * (10000n - slip) / 10000n;
  const deadline     = BigInt(Math.floor(Date.now() / 1000) + 1200);

  let swapData: string;
  let swapValue: string;

  if (isNativeIn) {
    swapData  = encodeSwapHSKToERC20(amountOutMin, tOut.address, useStable, sender, deadline);
    swapValue = '0x' + amountIn.toString(16);
  } else if (isNativeOut) {
    swapData  = encodeSwapERC20ToHSK(amountIn, amountOutMin, tIn.address, useStable, sender, deadline);
    swapValue = '0x0';
  } else {
    swapData  = encodeSwapERC20ToERC20(amountIn, amountOutMin, tIn.address, tOut.address, useStable, sender, deadline);
    swapValue = '0x0';
  }

  const swapTx = {
    to: CONTRACTS.router, data: swapData, value: swapValue,
    description: `Swap ${amountInStr} ${tIn.symbol} for ≥${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via HSKSwap (${poolType})`,
  };

  let transactions;
  if (isNativeIn) {
    transactions = [swapTx];
  } else {
    const allowance = await getAllowance(tIn.address, sender, CONTRACTS.router);
    transactions = [
      ...(allowance < amountIn ? [{
        to:    tIn.address,
        data:  '0x' + SEL.approve + p32(CONTRACTS.router) + p32(amountIn),
        value: '0x0',
        description: `Approve ${amountInStr} ${tIn.symbol} for HSKSwap Router`,
      }] : []),
      swapTx,
    ];
  }

  return {
    success: true,
    output: {
      transactions,
      tokenIn:      tIn.symbol,
      tokenOut:     tOut.symbol,
      amountIn:     String(amountInStr),
      amountOut:    formatUnits(amountOut,    tOut.decimals),
      amountOutMin: formatUnits(amountOutMin, tOut.decimals),
      slippageBps,
      poolType,
      deadline:     Number(deadline),
      chain:        'hashkey',
      chainId:      177,
      router:       'HSKSwap',
    },
  };
}

async function actionGetPool(input: any): Promise<SkillExecutionResult> {
  const { tokenA: rawAC, token_a: rawAS, tokenB: rawBC, token_b: rawBS, stable } = input;
  const rawA = rawAC ?? rawAS;
  const rawB = rawBC ?? rawBS;
  if (!rawA || !rawB) return { success: false, error: 'tokenA and tokenB are required.' };

  const [tA, tB] = await Promise.all([resolveToken(rawA), resolveToken(rawB)]);
  const typesToCheck: boolean[] = stable === undefined ? [true, false] : [!!stable];

  const pools = [];
  for (const isStable of typesToCheck) {
    const pairAddr = await getPairAddress(tA.address, tB.address, isStable);
    if (!pairAddr) continue;

    const [reservesHex, token0Hex] = await Promise.all([
      ethCall(pairAddr, '0x' + SEL.getReserves).catch(() => '0x'),
      ethCall(pairAddr, '0x' + SEL.token0).catch(() => '0x'),
    ]);

    if (reservesHex === '0x') continue;

    const token0    = token0Hex !== '0x' ? readAddress(token0Hex, 0).toLowerCase() : '';
    const reserve0  = readU256(reservesHex, 0);
    const reserve1  = readU256(reservesHex, 1);
    const isAToken0 = token0 === tA.address.toLowerCase();
    const [resA, resB] = isAToken0 ? [reserve0, reserve1] : [reserve1, reserve0];

    const resAFmt   = formatUnits(resA, tA.decimals);
    const resBFmt   = formatUnits(resB, tB.decimals);
    const priceAinB = resA > 0n && resB > 0n
      ? (Number(resBFmt) / Number(resAFmt)).toFixed(6)
      : 'N/A';

    pools.push({
      pairAddress: pairAddr,
      poolType:    isStable ? 'stable (sAMM)' : 'volatile (vAMM)',
      [`reserve_${tA.symbol}`]: resAFmt,
      [`reserve_${tB.symbol}`]: resBFmt,
      impliedPrice: `1 ${tA.symbol} = ${priceAinB} ${tB.symbol}`,
    });
  }

  if (pools.length === 0) {
    return {
      success: false,
      error: `No HSKSwap pool found for ${tA.symbol}/${tB.symbol} on HashKey Chain.`,
    };
  }

  return {
    success: true,
    output: {
      tokenA: tA.symbol,
      tokenB: tB.symbol,
      chain:  'hashkey',
      chainId: 177,
      pools,
      factory: CONTRACTS.factory,
    },
  };
}

function actionGetTokens(): SkillExecutionResult {
  return {
    success: true,
    output: {
      chain:   'hashkey',
      chainId: 177,
      count:   Object.keys(TOKENS).length,
      tokens:  Object.entries(TOKENS).map(([symbol, t]) => ({
        symbol, address: t.address, decimals: t.decimals,
      })),
      _note: 'Pass any unlisted token as a full 0x address — decimals are fetched on-chain automatically.',
    },
  };
}

function actionGetDexInfo(): SkillExecutionResult {
  return {
    success: true,
    output: {
      protocol: 'HSKSwap',
      chain:    'HashKey Chain',
      chainId:  177,
      explorer: 'https://hashkey.blockscout.com',
      contracts: {
        router:  CONTRACTS.router,
        factory: CONTRACTS.factory,
        whsk:    CONTRACTS.whsk,
      },
      tokens:    TOKENS,
      pool_types: [
        { type: 'volatile (vAMM)', curve: 'xy=k',   best_for: 'general pairs (HSK/USDT)' },
        { type: 'stable (sAMM)',   curve: 'Curve-style', best_for: 'pegged assets (USDT/USDC)' },
      ],
      amm_design: 'Solidly V1 fork (same as Velodrome V1 / Aerodrome)',
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const HSKSWAP_SKILL_METADATA = {
  id: 'a3f8c201-7e45-4b9d-b3f2-6c1d8a2e5047',
  name: 'HSKSwap',
  description:
    'HSKSwap is the primary DEX on HashKey Chain (EVM chain ID 177). ' +
    'Get swap quotes, build unsigned swap transactions, and query pool details. ' +
    'Uses a Solidly V1-style AMM with stable and volatile pool types.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  tags: ['hskswap', 'hashkey', 'hashkeychain', 'dex', 'swap', 'amm', 'defi', 'hsk'],
  external_url: 'https://app.hskswap.com',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'build_swap_tx', 'get_pool', 'get_tokens', 'get_dex_info'],
        description:
          'get_quote: best-price swap quote (requires tokenIn, tokenOut, amountIn or amount_out). ' +
          'build_swap_tx: build unsigned swap calldata (requires tokenIn, tokenOut, amountIn, sender). ' +
          'get_pool: pool details by token pair (requires tokenA, tokenB). ' +
          'get_tokens: list known tokens on HashKey Chain. ' +
          'get_dex_info: HSKSwap contract addresses and protocol info.',
      },
      tokenIn:  { type: 'string', description: 'Input token symbol (HSK, USDT, USDC) or 0x address.' },
      tokenOut: { type: 'string', description: 'Output token symbol or 0x address.' },
      amountIn: { type: 'string', description: 'Exact input amount in human-readable units (e.g. "10.5").' },
      amount_out: { type: 'string', description: 'Desired output amount for exact-output mode.' },
      tokenA:   { type: 'string', description: 'First token for get_pool (symbol or 0x address).' },
      tokenB:   { type: 'string', description: 'Second token for get_pool (symbol or 0x address).' },
      sender:   { type: 'string', description: 'Wallet address (0x...) for build_swap_tx.' },
      stable:   { type: 'boolean', description: 'Force stable (true) or volatile (false) pool. Omit for auto-select.' },
      slippageBps: { type: 'number', description: 'Slippage tolerance in basis points (default: 50 = 0.5%).' },
    },
  },
  usage_examples: [
    { title: 'Quote 10 HSK → USDT', input: { action: 'get_quote', tokenIn: 'HSK', tokenOut: 'USDT', amountIn: '10' } },
    { title: 'Build swap: 10 USDT → HSK', input: { action: 'build_swap_tx', tokenIn: 'USDT', tokenOut: 'HSK', amountIn: '10', sender: '0xYourAddress' } },
    { title: 'Get pool info', input: { action: 'get_pool', tokenA: 'HSK', tokenB: 'USDT' } },
    { title: 'List tokens', input: { action: 'get_tokens' } },
  ],
};

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeHskSwapSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {
      case 'get_quote':     return await actionGetQuote(input);
      case 'build_swap_tx': return await actionBuildSwapTx(input);
      case 'get_pool':      return await actionGetPool(input);
      case 'get_tokens':    return actionGetTokens();
      case 'get_dex_info':  return actionGetDexInfo();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_quote, build_swap_tx, get_pool, get_tokens, get_dex_info`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in HSKSwap skill' };
  }
}
