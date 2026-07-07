/**
 * DAOaaS Swap Skill — Server-side execution on Eniac Network (ENI Mainnet)
 *
 * DAOaaS (https://daoaas.io) is a DAO-as-a-Service platform whose flagship DEX
 * (`/swap`) is a Uniswap V3-fork deployed on Eniac Network — a permissioned-but-
 * open EVM L1 with EGAS as the gas token. The protocol exposes a standard V3
 * topology: QuoterV2 for off-chain quoting, a Factory for pool discovery, and
 * SwapRouter01 (with `deadline` in the params struct) for execution.
 *
 * Skill UUID: 7a3d8e21-9f4c-4b6e-bc15-d8a4f2e9c1b3
 *
 * Chain: ENI Mainnet, chain ID 173, native EGAS, RPC https://rpc.eniac.network
 *
 * Contracts (verified live):
 *   SwapRouter01 : 0xcc3dC42D1F7766E79bd14185ec09Cd2F94Ee2B25
 *   Factory V3   : 0x7C728ae7E43f04E768ffCe9CBA20A09f958ed8aD
 *   QuoterV2     : 0x47118D1Fdd5332Fc88B10322b9344E1DbF87a482
 *   NPM          : 0xee460d69CA3dCb275F38BcF19871378A09Cd0ca3
 *   WEGAS        : 0x6D1e851446F4D004AE2A72F9AfEd85e8829A205E
 *
 * Fee tiers scanned (matches stock Uniswap V3): 100 / 500 / 3000 / 10000 (bps × 10⁻⁴).
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ─── Chain config ────────────────────────────────────────────────────────────

const CHAIN_ID = 173;
const NATIVE_SYMBOL = 'EGAS';

const CONTRACTS = {
  swapRouter:  '0xcc3dC42D1F7766E79bd14185ec09Cd2F94Ee2B25',
  factory:     '0x7C728ae7E43f04E768ffCe9CBA20A09f958ed8aD',
  quoterV2:    '0x47118D1Fdd5332Fc88B10322b9344E1DbF87a482',
  positionMgr: '0xee460d69CA3dCb275F38BcF19871378A09Cd0ca3',
  weth:        '0x6D1e851446F4D004AE2A72F9AfEd85e8829A205E', // WEGAS
};

const FEE_TIERS = [100, 500, 3000, 10000] as const;
type FeeTier = typeof FEE_TIERS[number];

// Verified selectors
const SEL = {
  // QuoterV2
  quoteExactInputSingle:  'c6a5026a', // quoteExactInputSingle((address,address,uint256,uint24,uint160))
  // Factory
  getPool:                '1698ee82', // getPool(address,address,uint24)
  // V3 Pool (read-only)
  slot0:                  '3850c7bd', // slot0() → (sqrtPriceX96,tick,...)
  liquidity:              '1a686502', // liquidity()
  token0:                 '0dfe1681',
  token1:                 'd21220a7',
  // SwapRouter01
  exactInputSingle:       '414bf389', // exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
  multicall:              'ac9650d8', // multicall(bytes[])
  unwrapWETH9:            '49404b7c', // unwrapWETH9(uint256,address)
  // ERC20
  decimals:               '313ce567',
  symbol:                 '95d89b41',
  allowance:              'dd62ed3e',
  approve:                '095ea7b3',
};

// Well-known tokens on ENI Mainnet (chainId 173)
// Native EGAS is sentinel 0x0 — the executor swaps it via WEGAS internally.
const TOKENS: Record<string, { address: string; decimals: number }> = {
  EGAS:   { address: '0x0000000000000000000000000000000000000000',          decimals: 18 },
  WEGAS:  { address: CONTRACTS.weth,                                          decimals: 18 },
  USDT:   { address: '0xDC1a8A35b0BaA3229b13f348ED708a2fd50b5e3a',          decimals: 18 },
  MMX:    { address: '0xf124B927777D1D72dE87C7c5f4F1287C4809c7Db',          decimals: 18 },
  ENIDOG: { address: '0xddd0b3ca34Da2A8BECA3ED76e8275e57C80ff814',          decimals: 18 },
  ENIMZ:  { address: '0x9045f64eB82559Ef9A62694dE66446837dF9A6b5',          decimals: 18 },
  ZC:     { address: '0x11584c874050593c0Ed46e2522c52cB4e0882079',          decimals: 18 },
  ZENI:   { address: '0x9FEBf6a54824Dd8fBD15eD82b504638250B0a30F',          decimals: 18 },
  NUWA:   { address: '0xa18CeC0BdDe4696B42c813A1575BA7A417a9FB9b',          decimals: 18 },
  ZING:   { address: '0x02dE5ACcB417Cd3748f309138D9F15F3b1A84058',          decimals: 18 },
  FA:     { address: '0xbff9cC320ba5411f92b4fd16B861Ee1F45fE6610',          decimals: 18 },
  MEX:    { address: '0x6546641426d1Cc7C3384128F6C728616Bd3E37a8',          decimals: 18 },
};

// ─── RPC helper ───────────────────────────────────────────────────────────────

function getEniacRpcUrl(): string {
  return process.env.ENIAC_RPC_URL ?? 'https://rpc.eniac.network';
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
  const result = await rpcPost(getEniacRpcUrl(), {
    jsonrpc: '2.0', id: 1,
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
  if (!result) return '0x';
  return result as string;
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
  const lower = raw.trim().toLowerCase();
  const lcMatch = Object.entries(TOKENS).find(([k]) => k.toLowerCase() === lower);
  if (lcMatch) return { ...lcMatch[1], symbol: lcMatch[0] };

  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    const decHex = await ethCall(raw, '0x' + SEL.decimals).catch(() => '0x');
    const decimals = decHex === '0x' ? 18 : Number(readU256(decHex));
    return { address: raw, decimals, symbol: raw.slice(0, 8) + '…' };
  }

  throw new Error(
    `Unknown token "${raw}" on ENI Mainnet. ` +
    `Use a symbol (${Object.keys(TOKENS).join(', ')}) or a full 0x address.`
  );
}

/** Substitute native EGAS with WEGAS for routing/quoting; track origin. */
function wrap(token: TokenInfo): TokenInfo {
  if (token.address === '0x0000000000000000000000000000000000000000') {
    return { ...TOKENS.WEGAS, symbol: 'WEGAS' };
  }
  return token;
}

// ─── QuoterV2 ─────────────────────────────────────────────────────────────────

/**
 * Encode QuoterV2.quoteExactInputSingle calldata.
 * Struct: { tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96 } — all static,
 * so the struct is inlined directly after the selector (no head/tail).
 */
function encodeQuoteExactInputSingle(
  tokenIn: string, tokenOut: string, amountIn: bigint, fee: number,
): string {
  return '0x'
    + SEL.quoteExactInputSingle
    + p32(tokenIn)
    + p32(tokenOut)
    + p32(amountIn)
    + p32(fee)
    + p32(0); // sqrtPriceLimitX96 = 0 (no limit)
}

/** Returns null if pool empty/missing or any decode error. */
async function quoteSingleFee(
  tokenIn: string, tokenOut: string, amountIn: bigint, fee: number,
): Promise<bigint | null> {
  try {
    const data = encodeQuoteExactInputSingle(tokenIn, tokenOut, amountIn, fee);
    const hex  = (await ethCall(CONTRACTS.quoterV2, data)).replace('0x', '');
    if (!hex || hex.length < 64) return null;
    const out  = readU256(hex, 0);
    return out > 0n ? out : null;
  } catch {
    return null;
  }
}

interface QuoteResult { fee: FeeTier; amountOut: bigint }

/** Quote across all fee tiers in parallel; return the tier with the highest output. */
async function quoteBest(
  tokenIn: string, tokenOut: string, amountIn: bigint,
): Promise<QuoteResult | null> {
  const results = await Promise.all(
    FEE_TIERS.map(async fee => {
      const out = await quoteSingleFee(tokenIn, tokenOut, amountIn, fee);
      return out ? { fee, amountOut: out } : null;
    }),
  );
  const valid = results.filter((x): x is QuoteResult => x !== null);
  if (valid.length === 0) return null;
  return valid.sort((a, b) => (a.amountOut > b.amountOut ? -1 : 1))[0];
}

// ─── Factory ──────────────────────────────────────────────────────────────────

async function getPoolAddress(tokenA: string, tokenB: string, fee: number): Promise<string | null> {
  const data = '0x' + SEL.getPool + p32(tokenA) + p32(tokenB) + p32(fee);
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

// ─── Swap calldata ────────────────────────────────────────────────────────────

/**
 * SwapRouter01.exactInputSingle calldata.
 * Struct (all 8 fields static):
 *   address tokenIn; address tokenOut; uint24 fee; address recipient;
 *   uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96
 */
function encodeExactInputSingle(args: {
  tokenIn: string; tokenOut: string; fee: number;
  recipient: string; deadline: bigint;
  amountIn: bigint; amountOutMin: bigint;
}): string {
  return '0x'
    + SEL.exactInputSingle
    + p32(args.tokenIn)
    + p32(args.tokenOut)
    + p32(args.fee)
    + p32(args.recipient)
    + p32(args.deadline)
    + p32(args.amountIn)
    + p32(args.amountOutMin)
    + p32(0); // sqrtPriceLimitX96 = 0
}

/** unwrapWETH9(uint256 amountMinimum, address recipient) */
function encodeUnwrapWETH9(amountMin: bigint, recipient: string): string {
  return '0x' + SEL.unwrapWETH9 + p32(amountMin) + p32(recipient);
}

/**
 * Encode multicall(bytes[] data).
 * Layout: selector | offset(0x20) | length | offsets[]× | (length+data)× …
 * Per-element offsets are relative to the start of the bytes[] body
 * (i.e., to right after the length word), as per the Solidity ABI spec.
 */
function encodeMulticall(calls: string[]): string {
  const raws = calls.map(c => c.startsWith('0x') ? c.slice(2) : c);
  const n = raws.length;

  const offsets: bigint[] = [];
  let cursor = BigInt(n * 32); // start of first element's (length+data), relative to body start
  for (const r of raws) {
    offsets.push(cursor);
    const bytesLen = BigInt(r.length / 2);
    const padded   = ((bytesLen + 31n) / 32n) * 32n;
    cursor += 32n + padded;
  }

  let body = p32(n);
  for (const off of offsets) body += p32(off);
  for (const r of raws) {
    const bytesLen = r.length / 2;
    const padded   = r.padEnd(Math.ceil(bytesLen / 32) * 64, '0');
    body += p32(bytesLen) + padded;
  }

  return '0x' + SEL.multicall + p32(0x20) + body;
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function actionGetQuote(input: any): Promise<SkillExecutionResult> {
  const {
    tokenIn: rawInC, token_in: rawInS,
    tokenOut: rawOutC, token_out: rawOutS,
    amountIn: amountInC, amount_in: amountInS,
    fee: feeOverride,
  } = input;
  const rawIn  = rawInC ?? rawInS;
  const rawOut = rawOutC ?? rawOutS;
  const amountInStr = amountInC ?? amountInS;

  if (!rawIn || !rawOut)  return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountInStr)       return { success: false, error: 'amountIn is required (exact-input only in v1).' };

  const [tInRaw, tOutRaw] = await Promise.all([resolveToken(rawIn), resolveToken(rawOut)]);
  const tIn  = wrap(tInRaw);
  const tOut = wrap(tOutRaw);

  if (tIn.address.toLowerCase() === tOut.address.toLowerCase()) {
    return { success: false, error: `tokenIn and tokenOut resolve to the same asset (${tIn.symbol}).` };
  }

  const amountIn = parseUnits(String(amountInStr), tIn.decimals);

  let best: QuoteResult | null;
  if (typeof feeOverride === 'number') {
    const out = await quoteSingleFee(tIn.address, tOut.address, amountIn, feeOverride);
    best = out ? { fee: feeOverride as FeeTier, amountOut: out } : null;
  } else {
    best = await quoteBest(tIn.address, tOut.address, amountIn);
  }

  if (!best) {
    return {
      success: false,
      error: `No DAOaaS V3 pool found for ${tInRaw.symbol}→${tOutRaw.symbol} on ENI Mainnet. ` +
             `Tried fee tiers: ${FEE_TIERS.join(', ')}.`,
    };
  }

  const amountOutFmt = formatUnits(best.amountOut, tOut.decimals);
  const execPrice    = Number(amountOutFmt) / Number(amountInStr);

  // Optional reference price for price-impact estimate
  let priceImpact: number | null = null;
  try {
    const oneUnit = parseUnits('1', tIn.decimals);
    const ref = await quoteSingleFee(tIn.address, tOut.address, oneUnit, best.fee);
    if (ref) {
      const spot = Number(formatUnits(ref, tOut.decimals));
      if (spot > 0) {
        priceImpact = Number(((spot - execPrice) / spot).toFixed(6));
        if (priceImpact < 0) priceImpact = 0;
      }
    }
  } catch { /* non-fatal */ }

  const poolAddress = await getPoolAddress(tIn.address, tOut.address, best.fee).catch(() => null);

  return {
    success: true,
    output: {
      mode:         'exact-input',
      tokenIn:      tInRaw.symbol,
      tokenOut:     tOutRaw.symbol,
      amount_in:    String(amountInStr),
      amount_out:   amountOutFmt,
      fee_tier:     best.fee,
      fee_pct:      `${best.fee / 10000}%`,
      pool_address: poolAddress,
      price_impact: priceImpact,
      chain:        'eniac',
      chainId:      CHAIN_ID,
      router:       'DAOaaS V3 (Uniswap V3 fork)',
      _mock:        false,
    },
  };
}

async function actionBuildSwapTx(input: any): Promise<SkillExecutionResult> {
  const {
    tokenIn: rawInC, token_in: rawInS,
    tokenOut: rawOutC, token_out: rawOutS,
    amountIn: amountInC, amount_in: amountInS,
    sender, slippageBps = 50, fee: feeOverride,
  } = input;
  const rawIn  = rawInC ?? rawInS;
  const rawOut = rawOutC ?? rawOutS;
  const amountInStr = amountInC ?? amountInS;

  if (!rawIn || !rawOut)  return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountInStr)       return { success: false, error: 'amountIn is required.' };
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
    return { success: false, error: 'A valid sender address (0x...) is required.' };
  }

  const [tInRaw, tOutRaw] = await Promise.all([resolveToken(rawIn), resolveToken(rawOut)]);
  const isNativeIn  = tInRaw.address  === '0x0000000000000000000000000000000000000000';
  const isNativeOut = tOutRaw.address === '0x0000000000000000000000000000000000000000';
  const tIn  = wrap(tInRaw);
  const tOut = wrap(tOutRaw);

  if (tIn.address.toLowerCase() === tOut.address.toLowerCase()) {
    return { success: false, error: `tokenIn and tokenOut resolve to the same asset (${tIn.symbol}).` };
  }

  const amountIn = parseUnits(String(amountInStr), tIn.decimals);

  let best: QuoteResult | null;
  if (typeof feeOverride === 'number') {
    const out = await quoteSingleFee(tIn.address, tOut.address, amountIn, feeOverride);
    best = out ? { fee: feeOverride as FeeTier, amountOut: out } : null;
  } else {
    best = await quoteBest(tIn.address, tOut.address, amountIn);
  }
  if (!best) {
    return {
      success: false,
      error: `No DAOaaS V3 pool found for ${tInRaw.symbol}→${tOutRaw.symbol} on ENI Mainnet.`,
    };
  }

  const slip         = BigInt(slippageBps);
  const amountOutMin = best.amountOut * (10000n - slip) / 10000n;
  const deadline     = BigInt(Math.floor(Date.now() / 1000) + 1200);

  // ── Encode swap calldata ───────────────────────────────────────────────────
  // For token → native EGAS, recipient must be the router itself, and we wrap
  // the call in multicall([exactInputSingle, unwrapWETH9]) so the router unwraps
  // WEGAS → EGAS to the sender after the swap.
  const swapRecipient = isNativeOut ? CONTRACTS.swapRouter : sender;

  const swapInner = encodeExactInputSingle({
    tokenIn:      tIn.address,
    tokenOut:     tOut.address,
    fee:          best.fee,
    recipient:    swapRecipient,
    deadline,
    amountIn,
    amountOutMin,
  });

  const swapData: string = isNativeOut
    ? encodeMulticall([swapInner, encodeUnwrapWETH9(amountOutMin, sender)])
    : swapInner;

  const swapValue = isNativeIn ? ('0x' + amountIn.toString(16)) : '0x0';

  const swapTx = {
    to:    CONTRACTS.swapRouter,
    data:  swapData,
    value: swapValue,
    description: `Swap ${amountInStr} ${tInRaw.symbol} for ≥${formatUnits(amountOutMin, tOut.decimals)} ${tOutRaw.symbol} via DAOaaS V3 (fee ${best.fee / 10000}%)`,
  };

  let transactions;
  if (isNativeIn) {
    transactions = [swapTx];
  } else {
    const allowance = await getAllowance(tIn.address, sender, CONTRACTS.swapRouter);
    transactions = [
      ...(allowance < amountIn ? [{
        to:    tIn.address,
        data:  '0x' + SEL.approve + p32(CONTRACTS.swapRouter) + p32(amountIn),
        value: '0x0',
        description: `Approve ${amountInStr} ${tInRaw.symbol} for DAOaaS SwapRouter`,
      }] : []),
      swapTx,
    ];
  }

  return {
    success: true,
    output: {
      transactions,
      tokenIn:      tInRaw.symbol,
      tokenOut:     tOutRaw.symbol,
      amountIn:     String(amountInStr),
      amountOut:    formatUnits(best.amountOut, tOut.decimals),
      amountOutMin: formatUnits(amountOutMin,   tOut.decimals),
      slippageBps,
      fee_tier:     best.fee,
      fee_pct:      `${best.fee / 10000}%`,
      deadline:     Number(deadline),
      chain:        'eniac',
      chainId:      CHAIN_ID,
      router:       'DAOaaS V3 SwapRouter01',
      _note:        isNativeOut
        ? 'Native EGAS output uses multicall(exactInputSingle, unwrapWETH9) to unwrap WEGAS automatically.'
        : undefined,
    },
  };
}

async function actionGetPool(input: any): Promise<SkillExecutionResult> {
  const { tokenA: rawAC, token_a: rawAS, tokenB: rawBC, token_b: rawBS, fee: feeOverride } = input;
  const rawA = rawAC ?? rawAS;
  const rawB = rawBC ?? rawBS;
  if (!rawA || !rawB) return { success: false, error: 'tokenA and tokenB are required.' };

  const [tA, tB] = await Promise.all([resolveToken(rawA), resolveToken(rawB)]);
  const a = wrap(tA);
  const b = wrap(tB);

  const tiers: number[] = typeof feeOverride === 'number' ? [feeOverride] : [...FEE_TIERS];

  const pools = [];
  for (const fee of tiers) {
    const poolAddr = await getPoolAddress(a.address, b.address, fee);
    if (!poolAddr) continue;

    // Read slot0 and liquidity for context
    const [slot0Hex, liqHex, token0Hex] = await Promise.all([
      ethCall(poolAddr, '0x' + SEL.slot0).catch(() => '0x'),
      ethCall(poolAddr, '0x' + SEL.liquidity).catch(() => '0x'),
      ethCall(poolAddr, '0x' + SEL.token0).catch(() => '0x'),
    ]);

    let sqrtPriceX96: bigint | null = null;
    let tick: number | null = null;
    if (slot0Hex && slot0Hex !== '0x') {
      sqrtPriceX96 = readU256(slot0Hex, 0);
      const rawTick = readU256(slot0Hex, 1);
      // tick is int24; if MSB of the 24-bit value set, decode as negative
      const tickU = Number(rawTick & ((1n << 24n) - 1n));
      tick = tickU >= 0x800000 ? tickU - 0x1000000 : tickU;
    }
    const liquidity = liqHex && liqHex !== '0x' ? readU256(liqHex, 0) : null;
    const token0    = token0Hex && token0Hex !== '0x' ? readAddress(token0Hex, 0).toLowerCase() : '';

    // Compute implied price 1 A = ? B from sqrtPriceX96
    let impliedPrice: string = 'N/A';
    if (sqrtPriceX96 && sqrtPriceX96 > 0n) {
      // price token1/token0 = (sqrtPriceX96 / 2^96)^2
      // Use floating-point for display
      const sp = Number(sqrtPriceX96) / 2 ** 96;
      const price1per0 = sp * sp;
      const aIs0 = token0 === a.address.toLowerCase();
      const decAdjust = aIs0
        ? 10 ** (a.decimals - b.decimals)
        : 10 ** (b.decimals - a.decimals);
      const priceBperA = aIs0
        ? price1per0 / decAdjust
        : (1 / price1per0) / decAdjust;
      if (isFinite(priceBperA) && priceBperA > 0) {
        impliedPrice = `1 ${tA.symbol} = ${priceBperA.toPrecision(6)} ${tB.symbol}`;
      }
    }

    pools.push({
      pairAddress:  poolAddr,
      fee_tier:     fee,
      fee_pct:      `${fee / 10000}%`,
      liquidity:    liquidity?.toString() ?? null,
      tick,
      impliedPrice,
    });
  }

  if (pools.length === 0) {
    return {
      success: false,
      error: `No DAOaaS V3 pool found for ${tA.symbol}/${tB.symbol} on ENI Mainnet.`,
    };
  }

  return {
    success: true,
    output: {
      tokenA: tA.symbol,
      tokenB: tB.symbol,
      chain:  'eniac',
      chainId: CHAIN_ID,
      pools,
      factory: CONTRACTS.factory,
    },
  };
}

function actionGetTokens(): SkillExecutionResult {
  return {
    success: true,
    output: {
      chain:   'eniac',
      chainId: CHAIN_ID,
      count:   Object.keys(TOKENS).length,
      tokens:  Object.entries(TOKENS).map(([symbol, t]) => ({
        symbol, address: t.address, decimals: t.decimals,
      })),
      _note: 'EGAS uses sentinel 0x000…000; the executor wraps to WEGAS internally. ' +
             'Any unlisted token can be passed by full 0x address — decimals are fetched on-chain automatically.',
    },
  };
}

function actionGetDexInfo(): SkillExecutionResult {
  return {
    success: true,
    output: {
      protocol: 'DAOaaS Swap',
      chain:    'Eniac Network (ENI Mainnet)',
      chainId:  CHAIN_ID,
      native:   NATIVE_SYMBOL,
      app:      'https://daoaas.io/swap',
      explorer: 'https://scan.eniac.network',
      rpc:      'https://rpc.eniac.network',
      contracts: CONTRACTS,
      fee_tiers: FEE_TIERS.map(f => ({ bps: f, label: `${f / 10000}%` })),
      amm_design: 'Uniswap V3 fork — concentrated liquidity, per-tier pools',
      subgraph: 'https://graph.daoaas.io/subgraphs/name/uniswap-v3-eni-mainnet',
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const DAOAAS_SWAP_SKILL_METADATA = {
  id: '7a3d8e21-9f4c-4b6e-bc15-d8a4f2e9c1b3',
  name: 'DAOaaS Swap',
  description:
    'DAOaaS Swap — Uniswap V3-fork DEX on Eniac Network (ENI Mainnet, chain ID 173, native EGAS). ' +
    'Quote best fee tier via QuoterV2, build unsigned exactInputSingle swap transactions ' +
    '(with optional approve prefix and native EGAS wrap/unwrap multicall), and query pool details. ' +
    'Live at https://daoaas.io/swap.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['daoaas', 'eniac', 'eni', 'egas', 'dex', 'swap', 'uniswap-v3', 'amm', 'defi', 'l1'],
  external_url: 'https://daoaas.io/swap',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'build_swap_tx', 'get_pool', 'get_tokens', 'get_dex_info'],
        description:
          'get_quote: best-price swap quote across V3 fee tiers (requires tokenIn, tokenOut, amountIn). ' +
          'build_swap_tx: build unsigned swap calldata, including approve and native EGAS unwrap multicall (requires tokenIn, tokenOut, amountIn, sender). ' +
          'get_pool: pool details by token pair (requires tokenA, tokenB; optional fee). ' +
          'get_tokens: list well-known tokens on ENI Mainnet. ' +
          'get_dex_info: DAOaaS contract addresses and protocol info.',
      },
      tokenIn:  { type: 'string', description: 'Input token symbol (EGAS, WEGAS, USDT, MMX, …) or 0x address.' },
      tokenOut: { type: 'string', description: 'Output token symbol or 0x address.' },
      amountIn: { type: 'string', description: 'Exact input amount in human-readable units (e.g. "10.5").' },
      tokenA:   { type: 'string', description: 'First token for get_pool (symbol or 0x address).' },
      tokenB:   { type: 'string', description: 'Second token for get_pool (symbol or 0x address).' },
      sender:   { type: 'string', description: 'Wallet address (0x...) for build_swap_tx. Required.' },
      fee:      { type: 'number', description: 'Force a specific fee tier (100, 500, 3000, 10000). Omit to auto-select best.' },
      slippageBps: { type: 'number', description: 'Slippage tolerance in basis points (default: 50 = 0.5%).' },
    },
  },
  usage_examples: [
    { title: 'Quote 1 EGAS → USDT', input: { action: 'get_quote', tokenIn: 'EGAS', tokenOut: 'USDT', amountIn: '1' } },
    { title: 'Build swap: 10 USDT → EGAS', input: { action: 'build_swap_tx', tokenIn: 'USDT', tokenOut: 'EGAS', amountIn: '10', sender: '0xYourAddress' } },
    { title: 'Pool info WEGAS/USDT (3000)', input: { action: 'get_pool', tokenA: 'WEGAS', tokenB: 'USDT', fee: 3000 } },
    { title: 'List tokens', input: { action: 'get_tokens' } },
    { title: 'DEX overview', input: { action: 'get_dex_info' } },
  ],
};

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeDaoaasSwapSkill(input: any): Promise<SkillExecutionResult> {
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
    return { success: false, error: err.message ?? 'Unexpected error in DAOaaS Swap skill' };
  }
}
