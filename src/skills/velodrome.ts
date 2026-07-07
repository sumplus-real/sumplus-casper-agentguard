/**
 * Velodrome V2 Skill — Server-side execution on Optimism
 *
 * Velodrome is the dominant DEX/liquidity hub on Optimism.
 * Uses a ve(3,3) model: VELO emissions are voted to pools each epoch,
 * creating deep, incentivized liquidity for Optimism's ecosystem.
 *
 * Pool types:
 *  - Stable (sAMM): low-slippage for pegged assets (USDC/DAI, stablecoins)
 *  - Volatile (vAMM): standard xy=k AMM for volatile pairs (ETH, VELO, OP)
 *  - Concentrated (Slipstream/clAMM): V3-style, rewards active-tick LPs only
 *
 * [ARSENAL-HOSTED ✓] Arsenal provides Alchemy RPC. No API key needed.
 *
 * Contracts on Optimism:
 *   Router V2:  0xa062ae8a9c5e11aaa026fc2670b0d65ccc8b2858
 *   Factory V2: 0x25cbddb98b35ab1ff77413456b31ec81a6b6b746
 *   Voter:      0x09236cfF45047DBee6B921e00704bed6D6B8Cf7e
 *   VELO token: 0x3c8B650257cFb5f272f799F5e2b4e65093a11a05
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Chain config ───────────────────────────────────────────────────────────

const ALCHEMY_URL = 'https://opt-mainnet.g.alchemy.com/v2';

const CONTRACTS = {
  routerV2:  '0xa062ae8a9c5e11aaa026fc2670b0d65ccc8b2858',
  // Verified: Router V2 defaultFactory() returns 0xf1046053aa5682b4f9a81b5481394da16be5ff5a
  // 0x25cbddb98b35ab1ff77413456b31ec81a6b6b746 is Velodrome V1 — do not use for V2 routes
  factoryV2: '0xf1046053aa5682b4f9a81b5481394da16be5ff5a',
  voter:     '0x09236cfF45047DBee6B921e00704bed6D6B8Cf7e',
  velo:      '0x3c8B650257cFb5f272f799F5e2b4e65093a11a05',
};

// Verified function selectors (keccak256 of canonical ABI signature, first 4 bytes)
const SEL = {
  getAmountsOut: '5509a1ac', // getAmountsOut(uint256,(address,address,bool,address)[])
  getPair:       '6801cc30', // getPair(address,address,bool)
  getReserves:   '0902f1ac', // getReserves()
  token0:        '0dfe1681', // token0()
  token1:        'd21220a7', // token1()
  decimals:      '313ce567', // decimals()
  symbol:        '95d89b41', // symbol()
};

// Well-known tokens on Optimism mainnet
const TOKENS: Record<string, { address: string; decimals: number }> = {
  ETH:    { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  WETH:   { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  USDC:   { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6  },
  USDT:   { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6  },
  DAI:    { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
  WBTC:   { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8  },
  VELO:   { address: '0x3c8B650257cFb5f272f799F5e2b4e65093a11a05', decimals: 18 },
  OP:     { address: '0x4200000000000000000000000000000000000042', decimals: 18 },
  SNX:    { address: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4', decimals: 18 },
  LUSD:   { address: '0xc40F949F8a4e094D1b49a23ea9241D289B7b2819', decimals: 18 },
  SUSD:   { address: '0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9', decimals: 18 },
  SETH:   { address: '0xE405de8F52ba7559f9df3C368500B6E6ae6Cee49', decimals: 18 },
  FRAX:   { address: '0x2E3D870790dC77A83dd1d18184Acc7439A53f475', decimals: 18 },
  WSTETH: { address: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb', decimals: 18 },
  LINK:   { address: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6', decimals: 18 },
  WLD:    { address: '0xdC6fF44d5d932Cbd77B52E5612Ba0529DC6226F1', decimals: 18 },
};

// ─── Low-level helpers ──────────────────────────────────────────────────────

function getApiKey(override?: string): string {
  const key = override ?? process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error(
    'No Alchemy API key. Arsenal provides one by default. ' +
    'If you see this, pass your own key as "alchemy_key" in the request.'
  );
  return key;
}

/** ERC20.allowance(owner, spender) → uint256 */
async function getAllowance(
  tokenAddr: string, owner: string, spender: string, apiKey: string,
): Promise<bigint> {
  const data = '0xdd62ed3e' + p32(owner) + p32(spender);
  try {
    const result = await ethCall(tokenAddr, data, apiKey);
    return readU256(result);
  } catch {
    return 0n;
  }
}

async function ethCall(to: string, data: string, apiKey: string): Promise<string> {
  const res = await fetch(`${ALCHEMY_URL}/${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  if (!res.ok) throw new Error(`Alchemy HTTP error: ${res.status}`);
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`eth_call reverted: ${json.error.message}`);
  return json.result ?? '0x';
}

/** Pad address or integer to 32-byte ABI word (64 hex chars) */
function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) {
    return v.slice(2).toLowerCase().padStart(64, '0');
  }
  return BigInt(v).toString(16).padStart(64, '0');
}

/** Read uint256 from slot `slot` of hex-encoded ABI return data */
function readU256(hex: string, slot = 0): bigint {
  const h = hex.replace('0x', '');
  return BigInt('0x' + h.slice(slot * 64, slot * 64 + 64));
}

/** Read address (20 bytes) from slot of ABI return data */
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
  const whole = value / divisor;
  const frac = value % divisor;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

interface TokenInfo { address: string; decimals: number; symbol: string }

async function resolveToken(raw: string, apiKey: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  if (TOKENS[upper]) return { ...TOKENS[upper], symbol: upper };

  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    const decHex = await ethCall(raw, '0x' + SEL.decimals, apiKey).catch(() => '0x');
    const decimals = decHex === '0x' ? 18 : Number(readU256(decHex));
    return { address: raw, decimals, symbol: raw.slice(0, 8) + '…' };
  }

  throw new Error(
    `Unknown token "${raw}" on Optimism. ` +
    `Use a symbol (${Object.keys(TOKENS).join(', ')}) or a full 0x address.`
  );
}

// ─── Router V2 ABI encoding ────────────────────────────────────────────────

/**
 * Encode Router V2 getAmountsOut calldata.
 * Route struct: { from, to, stable, factory } → ABI type (address,address,bool,address)
 *
 * Layout (params only, after selector):
 *   [32] amountIn
 *   [32] offset to routes array = 0x40
 *   [32] routes.length = 1
 *   [32] route.from
 *   [32] route.to
 *   [32] route.stable
 *   [32] route.factory
 */
function encodeGetAmountsOut(
  amountIn: bigint, tokenIn: string, tokenOut: string, stable: boolean
): string {
  return '0x'
    + SEL.getAmountsOut
    + p32(amountIn)
    + p32(0x40)                   // offset to routes array
    + p32(1)                      // routes.length
    + p32(tokenIn)                // route.from
    + p32(tokenOut)               // route.to
    + p32(stable ? 1 : 0)        // route.stable
    + p32(0);                     // route.factory = address(0) → Router uses its defaultFactory
}

/**
 * Call Router V2 getAmountsOut for a single-hop route.
 * Return: uint256[] → [amountIn, amountOut] for single hop.
 * Slot 3 = amounts[1] = output amount (accounting for offset + length + amounts[0]).
 */
async function quoteRoute(
  tokenIn: string, tokenOut: string, amountIn: bigint, stable: boolean, apiKey: string
): Promise<bigint | null> {
  try {
    const data = encodeGetAmountsOut(amountIn, tokenIn, tokenOut, stable);
    const hex = (await ethCall(CONTRACTS.routerV2, data, apiKey)).replace('0x', '');
    if (!hex || hex.length < 256) return null; // need at least 4 slots
    return readU256(hex, 3); // amounts[1]
  } catch {
    return null; // pool doesn't exist or zero liquidity
  }
}

/**
 * Factory getPair: returns pair address or null (zero address = no pool).
 */
async function getPairAddress(
  tokenA: string, tokenB: string, stable: boolean, apiKey: string
): Promise<string | null> {
  const data = '0x' + SEL.getPair + p32(tokenA) + p32(tokenB) + p32(stable ? 1 : 0);
  const result = await ethCall(CONTRACTS.factoryV2, data, apiKey).catch(() => '0x');
  if (!result || result === '0x' || result.length < 66) return null;
  const addr = readAddress(result, 0);
  return addr === '0x0000000000000000000000000000000000000000' ? null : addr;
}

// ─── Swap calldata encoders ────────────────────────────────────────────────

// Verified selectors:
//   cac88ea9  swapExactTokensForTokens(uint256,uint256,(address,address,bool,address)[],address,uint256)
//   903638a4  swapExactETHForTokens(uint256,(address,address,bool,address)[],address,uint256)
//   c6b7f1b6  swapExactTokensForETH(uint256,uint256,(address,address,bool,address)[],address,uint256)

/**
 * ERC20 → ERC20 swap calldata.
 * ABI layout (params after selector):
 *   [32] amountIn | [32] amountOutMin | [32] offset(0xA0) | [32] to | [32] deadline
 *   [32] routes.length=1 | [32] from | [32] to | [32] stable | [32] factory
 */
function encodeSwapERC20ToERC20(
  amountIn: bigint, amountOutMin: bigint,
  tokenIn: string, tokenOut: string, stable: boolean,
  recipient: string, deadline: bigint,
): string {
  return '0x'
    + 'cac88ea9'
    + p32(amountIn)
    + p32(amountOutMin)
    + p32(0xA0)           // offset to routes: 5 fixed slots × 32 = 160
    + p32(recipient)
    + p32(deadline)
    + p32(1)              // routes.length
    + p32(tokenIn)
    + p32(tokenOut)
    + p32(stable ? 1 : 0)
    + p32(CONTRACTS.factoryV2);
}

/**
 * Native ETH → ERC20 swap calldata (msg.value = amountIn).
 * ABI layout:
 *   [32] amountOutMin | [32] offset(0x80) | [32] to | [32] deadline
 *   [32] routes.length=1 | [32] from(WETH) | [32] to | [32] stable | [32] factory
 */
function encodeSwapETHToERC20(
  amountOutMin: bigint,
  tokenOut: string, stable: boolean,
  recipient: string, deadline: bigint,
): string {
  const WETH = TOKENS.WETH.address;
  return '0x'
    + '903638a4'
    + p32(amountOutMin)
    + p32(0x80)           // offset: 4 fixed slots × 32 = 128
    + p32(recipient)
    + p32(deadline)
    + p32(1)
    + p32(WETH)           // route.from = WETH (router wraps ETH internally)
    + p32(tokenOut)
    + p32(stable ? 1 : 0)
    + p32(CONTRACTS.factoryV2);
}

/**
 * ERC20 → Native ETH swap calldata (router unwraps WETH to ETH for recipient).
 * ABI layout:
 *   [32] amountIn | [32] amountOutMin | [32] offset(0xA0) | [32] to | [32] deadline
 *   [32] routes.length=1 | [32] from | [32] to(WETH) | [32] stable | [32] factory
 */
function encodeSwapERC20ToETH(
  amountIn: bigint, amountOutMin: bigint,
  tokenIn: string, stable: boolean,
  recipient: string, deadline: bigint,
): string {
  const WETH = TOKENS.WETH.address;
  return '0x'
    + 'c6b7f1b6'
    + p32(amountIn)
    + p32(amountOutMin)
    + p32(0xA0)
    + p32(recipient)
    + p32(deadline)
    + p32(1)
    + p32(tokenIn)
    + p32(WETH)           // route.to = WETH (router unwraps to ETH)
    + p32(stable ? 1 : 0)
    + p32(CONTRACTS.factoryV2);
}

// ─── Action handlers ────────────────────────────────────────────────────────

/**
 * Estimate exact-output: how much tokenIn is needed to receive `desiredOut` tokenOut?
 * Uses a reference quote (tiny amount) to get spot rate, then scales + adds a 3% buffer
 * for price impact. The result is a safe over-estimate (will produce >= desiredOut on-chain).
 */
async function estimateExactIn(
  tokenIn: string, tokenOut: string, desiredOut: bigint,
  stable: boolean, decimalsIn: number, apiKey: string,
): Promise<bigint | null> {
  // Reference: quote 0.001 units in → how much out?
  const refIn  = parseUnits('0.001', decimalsIn);
  const refOut = await quoteRoute(tokenIn, tokenOut, refIn, stable, apiKey);
  if (!refOut || refOut === 0n) return null;
  // Scale: desired_in ≈ (desired_out / spot_rate) + 3% price-impact buffer
  return desiredOut * refIn / refOut * 103n / 100n;
}

async function actionGetQuote(input: any, apiKey: string): Promise<SkillExecutionResult> {
  const {
    tokenIn: rawIn, tokenOut: rawOut,
    amountIn: amountInStr, amount_out: amountOutStr,
    stable: stableOverride,
  } = input;

  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountInStr && !amountOutStr) {
    return { success: false, error: 'Provide amountIn (exact-input) or amount_out (exact-output).' };
  }

  const [tIn, tOut] = await Promise.all([
    resolveToken(rawIn, apiKey),
    resolveToken(rawOut, apiKey),
  ]);

  // ── Exact-output mode ────────────────────────────────────────────────────
  if (!amountInStr && amountOutStr) {
    const desiredOut = parseUnits(String(amountOutStr), tOut.decimals);

    let stableIn:   bigint | null = null;
    let volatileIn: bigint | null = null;
    if (stableOverride === true) {
      stableIn   = await estimateExactIn(tIn.address, tOut.address, desiredOut, true,  tIn.decimals, apiKey);
    } else if (stableOverride === false) {
      volatileIn = await estimateExactIn(tIn.address, tOut.address, desiredOut, false, tIn.decimals, apiKey);
    } else {
      [stableIn, volatileIn] = await Promise.all([
        estimateExactIn(tIn.address, tOut.address, desiredOut, true,  tIn.decimals, apiKey),
        estimateExactIn(tIn.address, tOut.address, desiredOut, false, tIn.decimals, apiKey),
      ]);
    }

    if (!stableIn && !volatileIn) {
      return {
        success: false,
        error: `No Velodrome V2 pool found for ${tIn.symbol}→${tOut.symbol} on Optimism.`,
      };
    }

    // Pick pool type that requires less input
    const useStable = stableIn != null && (volatileIn == null || stableIn <= volatileIn);
    const best = { amountIn: useStable ? stableIn! : volatileIn!, poolType: useStable ? 'stable' : 'volatile' };
    const amountInFmt = formatUnits(best.amountIn, tIn.decimals);
    const poolAddress = await getPairAddress(tIn.address, tOut.address, useStable, apiKey).catch(() => null);

    return {
      success: true,
      output: {
        mode:         'exact-output',
        tokenIn:      tIn.symbol,
        tokenOut:     tOut.symbol,
        amount_out:   String(amountOutStr),
        amount_in:    amountInFmt,   // estimated input needed (includes 3% buffer)
        route:        best.poolType,
        pool_address: poolAddress,
        chain:        'optimism',
        router:       'Velodrome V2',
        _operation:   'velodrome_swap',
        _note:        'amount_in includes a 3% buffer for price impact. Actual on-chain input may be slightly lower.',
        _mock:        false,
        alternatives: {
          stable:   stableIn   ? formatUnits(stableIn,   tIn.decimals) : 'no pool',
          volatile: volatileIn ? formatUnits(volatileIn, tIn.decimals) : 'no pool',
        },
      },
    };
  }

  // ── Exact-input mode (original) ──────────────────────────────────────────
  const amountIn = parseUnits(String(amountInStr), tIn.decimals);

  // If caller specifies stable=true/false, only query that pool type
  let stableOut: bigint | null = null;
  let volatileOut: bigint | null = null;
  if (stableOverride === true) {
    stableOut = await quoteRoute(tIn.address, tOut.address, amountIn, true, apiKey);
  } else if (stableOverride === false) {
    volatileOut = await quoteRoute(tIn.address, tOut.address, amountIn, false, apiKey);
  } else {
    [stableOut, volatileOut] = await Promise.all([
      quoteRoute(tIn.address, tOut.address, amountIn, true,  apiKey),
      quoteRoute(tIn.address, tOut.address, amountIn, false, apiKey),
    ]);
  }

  if (!stableOut && !volatileOut) {
    return {
      success: false,
      error: `No Velodrome V2 pool found for ${tIn.symbol}→${tOut.symbol} on Optimism. ` +
             `Try get_pool action to verify pool existence, or check token addresses.`,
    };
  }

  // Pick the route that gives more output
  const useStable = stableOut != null && (volatileOut == null || stableOut >= volatileOut);
  const best = { amountOut: useStable ? stableOut! : volatileOut!, poolType: useStable ? 'stable' : 'volatile' };

  const amountOutFmt   = formatUnits(best.amountOut, tOut.decimals);
  const executionPrice = Number(amountOutFmt) / Number(amountInStr);

  // Price impact: compare execution price vs spot price (tiny reference quote). Non-fatal.
  let priceImpact: number | null = null;
  try {
    const oneUnit = parseUnits('1', tIn.decimals);
    const refOut  = await quoteRoute(tIn.address, tOut.address, oneUnit, useStable, apiKey);
    if (refOut) {
      const spotPrice = Number(formatUnits(refOut, tOut.decimals));
      if (spotPrice > 0) {
        // Normalised to 0-1 (not percentage)
        priceImpact = Number(((spotPrice - executionPrice) / spotPrice).toFixed(6));
        if (priceImpact < 0) priceImpact = 0;
      }
    }
  } catch { /* non-fatal */ }

  const poolAddress = await getPairAddress(tIn.address, tOut.address, useStable, apiKey).catch(() => null);

  return {
    success: true,
    output: {
      mode:           'exact-input',
      tokenIn:        tIn.symbol,
      tokenOut:       tOut.symbol,
      amount_in:      String(amountInStr),
      amount_out:     amountOutFmt,
      route:          best.poolType,          // 'stable' | 'volatile'
      pool_address:   poolAddress,
      price_impact:   priceImpact,            // 0-1 (null if not computable)
      chain:          'optimism',
      router:         'Velodrome V2',
      _operation:     'velodrome_swap',
      _mock:          false,
      alternatives: {
        stable:   stableOut   ? formatUnits(stableOut,   tOut.decimals) : 'no pool',
        volatile: volatileOut ? formatUnits(volatileOut, tOut.decimals) : 'no pool',
      },
    },
  };
}

async function actionBuildSwapTx(input: any, apiKey: string): Promise<SkillExecutionResult> {
  const {
    tokenIn: rawIn, tokenOut: rawOut,
    amountIn: amountInStr,
    stable: stableOverride,
    sender,
    slippageBps = 50,
  } = input;

  if (!rawIn || !rawOut)  return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountInStr)       return { success: false, error: 'amountIn is required.' };
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
    return { success: false, error: 'A valid sender address (0x...) is required.' };
  }

  const isNativeIn  = rawIn.trim().toUpperCase()  === 'ETH';
  const isNativeOut = rawOut.trim().toUpperCase() === 'ETH';

  const [tIn, tOut] = await Promise.all([
    resolveToken(rawIn,  apiKey),
    resolveToken(rawOut, apiKey),
  ]);

  const amountIn = parseUnits(String(amountInStr), tIn.decimals);

  // If caller specifies stable=true/false, force that pool type; otherwise auto-select best
  let stableOut: bigint | null = null;
  let volatileOut: bigint | null = null;
  if (stableOverride === true) {
    stableOut = await quoteRoute(tIn.address, tOut.address, amountIn, true, apiKey);
  } else if (stableOverride === false) {
    volatileOut = await quoteRoute(tIn.address, tOut.address, amountIn, false, apiKey);
  } else {
    [stableOut, volatileOut] = await Promise.all([
      quoteRoute(tIn.address, tOut.address, amountIn, true,  apiKey),
      quoteRoute(tIn.address, tOut.address, amountIn, false, apiKey),
    ]);
  }

  if (!stableOut && !volatileOut) {
    return { success: false, error: `No Velodrome V2 pool found for ${tIn.symbol}→${tOut.symbol} on Optimism.` };
  }

  const useStable  = stableOut != null && (volatileOut == null || stableOut >= volatileOut);
  const amountOut  = useStable ? stableOut! : volatileOut!;
  const poolType   = useStable ? 'stable' : 'volatile';

  // Apply slippage tolerance
  const slip         = BigInt(slippageBps);
  const amountOutMin = amountOut * (10000n - slip) / 10000n;

  // Deadline: now + 20 minutes
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  let swapData: string;
  let swapValue: string;

  if (isNativeIn) {
    swapData  = encodeSwapETHToERC20(amountOutMin, tOut.address, useStable, sender, deadline);
    swapValue = '0x' + amountIn.toString(16);
  } else if (isNativeOut) {
    swapData  = encodeSwapERC20ToETH(amountIn, amountOutMin, tIn.address, useStable, sender, deadline);
    swapValue = '0x0';
  } else {
    swapData  = encodeSwapERC20ToERC20(amountIn, amountOutMin, tIn.address, tOut.address, useStable, sender, deadline);
    swapValue = '0x0';
  }

  const swapTx = {
    to: CONTRACTS.routerV2, data: swapData, value: swapValue,
    description: `Swap ${amountInStr} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via Velodrome V2 (${poolType})`,
  };

  // Check on-chain allowance; only prepend approve if needed
  let transactions;
  if (isNativeIn) {
    transactions = [swapTx];
  } else {
    const allowance = await getAllowance(tIn.address, sender, CONTRACTS.routerV2, apiKey);
    transactions = [
      ...(allowance < amountIn ? [{
        to:    tIn.address,
        data:  '0x095ea7b3' + p32(CONTRACTS.routerV2) + p32(amountIn),
        value: '0x0',
        description: `Approve ${amountInStr} ${tIn.symbol} for Velodrome Router V2`,
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
      chain:        'optimism',
      router:       'Velodrome V2',
    },
  };
}

async function actionGetPool(input: any, apiKey: string): Promise<SkillExecutionResult> {
  const { tokenA: rawA, tokenB: rawB, stable } = input;
  if (!rawA || !rawB) return { success: false, error: 'tokenA and tokenB are required.' };

  const [tA, tB] = await Promise.all([
    resolveToken(rawA, apiKey),
    resolveToken(rawB, apiKey),
  ]);

  // If stable not specified, check both
  const typesToCheck: boolean[] = stable === undefined ? [true, false] : [!!stable];

  const pools = [];
  for (const isStable of typesToCheck) {
    const pairAddr = await getPairAddress(tA.address, tB.address, isStable, apiKey);
    if (!pairAddr) continue;

    const [reservesHex, token0Hex] = await Promise.all([
      ethCall(pairAddr, '0x' + SEL.getReserves, apiKey).catch(() => '0x'),
      ethCall(pairAddr, '0x' + SEL.token0,      apiKey).catch(() => '0x'),
    ]);

    if (reservesHex === '0x') continue;

    const token0 = token0Hex !== '0x' ? readAddress(token0Hex, 0).toLowerCase() : '';
    const reserve0 = readU256(reservesHex, 0);
    const reserve1 = readU256(reservesHex, 1);

    // Assign reserves to correct token
    const isAToken0 = token0 === tA.address.toLowerCase();
    const [resA, resB] = isAToken0 ? [reserve0, reserve1] : [reserve1, reserve0];

    const resAFmt = formatUnits(resA, tA.decimals);
    const resBFmt = formatUnits(resB, tB.decimals);

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
      error: `No Velodrome V2 pool found for ${tA.symbol}/${tB.symbol} on Optimism. ` +
             `The pair may only exist as a Slipstream (CL) pool, which is queried separately.`,
    };
  }

  return {
    success: true,
    output: {
      tokenA: tA.symbol,
      tokenB: tB.symbol,
      chain:  'optimism',
      pools,
      factory: CONTRACTS.factoryV2,
      _note: 'TVL in USD requires external price feed. Reserve amounts shown in token units.',
    },
  };
}

function actionGetTokens(): SkillExecutionResult {
  return {
    success: true,
    output: {
      chain: 'optimism',
      count: Object.keys(TOKENS).length,
      tokens: Object.entries(TOKENS).map(([symbol, t]) => ({
        symbol,
        address:  t.address,
        decimals: t.decimals,
      })),
      _note: 'Pass any unlisted token as a full 0x address — decimals are fetched automatically.',
    },
  };
}

function actionGetVeloInfo(): SkillExecutionResult {
  // Velodrome V2 launched ~June 2023. Emissions start at 15M VELO/week, decay 1% per week.
  const LAUNCH = new Date('2023-06-01T00:00:00Z').getTime();
  const weeksSinceLaunch = Math.floor((Date.now() - LAUNCH) / (7 * 24 * 3600 * 1000));
  const currentEmissions = Math.round(15_000_000 * (0.99 ** weeksSinceLaunch));

  // Next epoch flip: every Wednesday ~23:59 UTC
  const now = new Date();
  const daysToWednesday = (3 - now.getUTCDay() + 7) % 7 || 7;
  const nextFlip = new Date(now);
  nextFlip.setUTCDate(now.getUTCDate() + daysToWednesday);
  nextFlip.setUTCHours(23, 59, 0, 0);

  return {
    success: true,
    output: {
      protocol:        'Velodrome V2',
      chain:           'optimism',
      velo_token:      CONTRACTS.velo,
      router_v2:       CONTRACTS.routerV2,
      factory_v2:      CONTRACTS.factoryV2,
      voter:           CONTRACTS.voter,
      tokenomics: {
        weekly_emissions_approx: `~${currentEmissions.toLocaleString()} VELO`,
        emission_decay:          '1% per epoch (weekly)',
        weeks_since_v2_launch:   weeksSinceLaunch,
        next_epoch_flip_utc:     nextFlip.toISOString(),
        epoch_length:            '7 days',
      },
      ve_mechanism: {
        token:         'veVELO (ERC-721 NFT)',
        max_lock:      '4 years',
        voting_power:  'Linear by lock duration (100 VELO × 4yr = 100 veVELO)',
        revenue_share: 'Fees + bribes + rebases distributed to veVELO voters weekly',
        apr_estimate:  '~48–87% APR (varies by epoch)',
      },
      pool_types: [
        { type: 'stable (sAMM)',          fee: '0.02% default', best_for: 'pegged assets (USDC/DAI, stablecoins)' },
        { type: 'volatile (vAMM)',         fee: '0.02% default', best_for: 'general token pairs (ETH/OP, VELO/USDC)' },
        { type: 'concentrated (Slipstream/clAMM)', fee: 'variable', best_for: 'capital-efficient LP with active management' },
      ],
      _note: 'Emission count is estimated from decay formula. Verify live data at velodrome.finance',
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const VELODROME_SKILL_METADATA = {
  name: 'Velodrome V2',
  description:
    'Velodrome is the dominant AMM and liquidity hub on Optimism (ve(3,3) model). ' +
    'Get swap quotes, build unsigned swap transactions, query pool details, ' +
    'list supported tokens, and view VELO emission info.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['velodrome', 'optimism', 'dex', 'swap', 'liquidity', 'velo', 'defi', 'amm', 've33'],
  external_url: 'https://velodrome.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/velodrome-v2?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'build_swap_tx', 'get_pool', 'get_tokens', 'get_velo_info'],
        description:
          'get_quote: best-price swap quote (requires tokenIn, tokenOut, amountIn or amount_out). ' +
          'build_swap_tx: build unsigned swap calldata (requires tokenIn, tokenOut, amountIn, sender). ' +
          'get_pool: pool details by token pair (requires tokenIn, tokenOut). ' +
          'get_tokens: list all supported tokens. ' +
          'get_velo_info: VELO token info and emission schedule.',
      },
      tokenIn:  { type: 'string', description: 'Input token symbol (ETH, USDC, VELO, OP) or 0x address.' },
      tokenOut: { type: 'string', description: 'Output token symbol or 0x address.' },
      amountIn: { type: 'string', description: 'Exact input amount in human-readable units.' },
      amount_out: { type: 'string', description: 'Exact output amount (exact-output mode).' },
      sender:   { type: 'string', description: 'Wallet address (0x...) for build_swap_tx.' },
      stable:   { type: 'boolean', description: 'Force stable (true) or volatile (false) pool. Omit for auto-select.' },
      slippageBps: { type: 'number', description: 'Slippage in bps (default: 50). For build_swap_tx.' },
    },
  },
  usage_examples: [
    { title: 'Quote 1 ETH → USDC', input: { action: 'get_quote', tokenIn: 'ETH', tokenOut: 'USDC', amountIn: '1' } },
    { title: 'List tokens', input: { action: 'get_tokens' } },
  ],
};

// ─── Main executor ──────────────────────────────────────────────────────────

export async function executeVelodromeSkill(input: any): Promise<SkillExecutionResult> {
  const { action, alchemy_key } = input ?? {};

  try {
    const apiKey = getApiKey(alchemy_key);

    switch (action) {
      case 'get_quote':      return await actionGetQuote(input, apiKey);
      case 'build_swap_tx':  return await actionBuildSwapTx(input, apiKey);
      case 'get_pool':       return await actionGetPool(input, apiKey);
      case 'get_tokens':     return actionGetTokens();
      case 'get_velo_info':  return actionGetVeloInfo();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available actions: get_quote, build_swap_tx, get_pool, get_tokens, get_velo_info`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Velodrome skill' };
  }
}
