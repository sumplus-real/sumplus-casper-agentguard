/**
 * Uniswap V3 on Tempo — Server-side execution
 *
 * Uniswap V2/V3/V4 are all live on Tempo (Stripe/Paradigm payments chain).
 * This skill covers V3 — get quotes and build swap transactions.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Tempo's public RPC directly. No API key needed.
 *
 * Contracts on Tempo (chain ID 4217) — verified via eth_getCode + on-chain calls:
 *   UniswapV3Factory:          0x24a3d4757e330890a8b8978028c9e58e04611fd6
 *   QuoterV2:                  0x53ab5d7a69db158f621b43ee70423da1e1403c2a  (verified: factory() = above)
 *   SwapRouter02:              0x7e9d53081e961201837336bcd81f52ae92691a8f  (verified: factory() = above)
 *   UniversalRouter:           0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91
 *
 * Native tokens on Tempo:
 *   USDC (USDC.e):   0x20C000000000000000000000b9537d11c60E8b50  (6 decimals)
 *   pathUSD:         0x20c0000000000000000000000000000000000000  (6 decimals)
 *
 * Known pools:
 *   USDC/pathUSD fee=100:  0x6d682b729773e26296b0df9ffef1d2ae2710cd2f  ✅ active
 *   USDC/pathUSD fee=3000: 0x704214be4982ccec66c5d538f2721085414320ee
 */

import type { SkillExecutionResult } from '@/types/skill';

// ── Verified contract addresses ───────────────────────────────────────────────
const CONTRACTS = {
  factory:    '0x24a3d4757e330890a8b8978028c9e58e04611fd6', // verified: source of all pools
  quoterV2:   '0x53ab5d7a69db158f621b43ee70423da1e1403c2a', // verified: factory() matches above
  swapRouter: '0x7e9d53081e961201837336bcd81f52ae92691a8f', // verified: factory() matches above
} as const;

const RPC = 'https://rpc.tempo.xyz';

// ── Well-known Tempo tokens ───────────────────────────────────────────────────
const TOKENS: Record<string, { address: string; decimals: number }> = {
  USDC:    { address: '0x20C000000000000000000000b9537d11c60E8b50', decimals: 6 },
  PATHUSD: { address: '0x20c0000000000000000000000000000000000000', decimals: 6 },
};

// ── Precomputed selectors (verified in Phase 3) ───────────────────────────────
// SEL values are raw hex, no '0x' prefix
const SEL = {
  quoteExactInput:  'c6a5026a', // QuoterV2.quoteExactInputSingle((address,address,uint256,uint24,uint160))
  quoteExactOutput: 'bd21704a', // QuoterV2.quoteExactOutputSingle((address,address,uint256,uint24,uint160))
  swapExactInput:   '04e45aaf', // SwapRouter02.exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
  swapExactOutput:  '5023b4df', // SwapRouter02.exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))
  getPool:          '1698ee82', // V3Factory.getPool(address,address,uint24)
  erc20Decimals:    '313ce567', // ERC20.decimals()
  erc20Allowance:   'dd62ed3e', // ERC20.allowance(address,address)
} as const;

// Fee tiers to try (100 is primary for Tempo stablecoins)
const FEE_TIERS = [100, 500, 3000, 10000];

// ── Low-level helpers ─────────────────────────────────────────────────────────

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  if (!res.ok) throw new Error(`Tempo RPC error: ${res.status}`);
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`eth_call failed: ${json.error.message}`);
  return json.result ?? '0x';
}

/** Pad address/bigint/number to 32-byte ABI word (64 hex chars, no 0x) */
function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}

function readU256(hex: string, slot = 0): bigint {
  const h = hex.replace('0x', '');
  return BigInt('0x' + h.slice(slot * 64, slot * 64 + 64));
}

function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * (10n ** BigInt(decimals))
       + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
}

function formatUnits(value: bigint, decimals: number): string {
  const d = BigInt(decimals);
  const whole = value / (10n ** d);
  const frac  = value % (10n ** d);
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

// ── Token resolution ──────────────────────────────────────────────────────────

interface TokenInfo { address: string; decimals: number; symbol: string }

async function resolveToken(raw: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  if (TOKENS[upper]) return { ...TOKENS[upper], symbol: upper };

  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(
      `Unknown token "${raw}". Use a symbol (${Object.keys(TOKENS).join(', ')}) or a full 0x address.`
    );
  }
  const result = await ethCall(raw, '0x' + SEL.erc20Decimals);
  const decimals = Number(readU256(result));
  return { address: raw, decimals, symbol: raw.slice(0, 8) + '…' };
}

// ── QuoterV2 helpers ──────────────────────────────────────────────────────────

async function quoteExactIn(
  tokenIn: string, tokenOut: string, amountIn: bigint, fee: number,
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  const data = '0x' + SEL.quoteExactInput
    + p32(tokenIn) + p32(tokenOut) + p32(amountIn) + p32(fee) + p32(0n);
  try {
    const hex = (await ethCall(CONTRACTS.quoterV2, data)).replace('0x', '');
    if (!hex) return null;
    return { amountOut: readU256(hex, 0), gasEstimate: readU256(hex, 3) };
  } catch { return null; }
}

async function quoteExactOut(
  tokenIn: string, tokenOut: string, amountOut: bigint, fee: number,
): Promise<{ amountIn: bigint; gasEstimate: bigint } | null> {
  const data = '0x' + SEL.quoteExactOutput
    + p32(tokenIn) + p32(tokenOut) + p32(amountOut) + p32(fee) + p32(0n);
  try {
    const hex = (await ethCall(CONTRACTS.quoterV2, data)).replace('0x', '');
    if (!hex) return null;
    return { amountIn: readU256(hex, 0), gasEstimate: readU256(hex, 3) };
  } catch { return null; }
}

async function bestQuoteIn(tokenIn: string, tokenOut: string, amountIn: bigint, feeTiers = FEE_TIERS) {
  let best: { amountOut: bigint; gasEstimate: bigint; fee: number } | null = null;
  for (const fee of feeTiers) {
    const q = await quoteExactIn(tokenIn, tokenOut, amountIn, fee);
    if (q && (!best || q.amountOut > best.amountOut)) best = { ...q, fee };
  }
  return best;
}

async function bestQuoteOut(tokenIn: string, tokenOut: string, amountOut: bigint, feeTiers = FEE_TIERS) {
  let best: { amountIn: bigint; gasEstimate: bigint; fee: number } | null = null;
  for (const fee of feeTiers) {
    const q = await quoteExactOut(tokenIn, tokenOut, amountOut, fee);
    if (q && (!best || q.amountIn < best.amountIn)) best = { ...q, fee };
  }
  return best;
}

async function getAllowance(token: string, owner: string, spender: string): Promise<bigint> {
  try {
    const result = await ethCall(token, '0x' + SEL.erc20Allowance + p32(owner) + p32(spender));
    return readU256(result);
  } catch { return 0n; }
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const UNISWAP_TEMPO_SKILL_METADATA = {
  name: 'Uniswap V3 on Tempo',
  description:
    '[ARSENAL-HOSTED ✓] Swap tokens on Uniswap V3 deployed on Tempo — Stripe and Paradigm\'s ' +
    'payments-first blockchain (chain ID 4217). Get live quotes and build swap transactions ' +
    'for USDC, pathUSD, and any TIP-20 token. Sub-second finality, stablecoin gas fees.\n\n' +
    'execution_mode: server-side\n' +
    'chain: tempo (id: 4217)\n' +
    'rpc: https://rpc.tempo.xyz\n' +
    'sop_compliance:\n' +
    '  provides_quote: true\n' +
    '  returns_price_impact: true\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['uniswap', 'tempo', 'swap', 'defi', 'usdc', 'pathusd', 'stablecoin', 'payments', 'v3'],
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
          'get_quote: Get live swap quote from QuoterV2 — returns amountOut/amountIn and price impact. ' +
          'build_swap_tx: Build a signed-ready swap calldata using SwapRouter02 — returns transactions array to sign. ' +
          'get_pools: Check which fee-tier pools exist for a token pair.',
      },
      tokenIn: {
        type: 'string',
        description: 'Input token. Use symbol (USDC, PATHUSD) or a 0x token address.',
      },
      tokenOut: {
        type: 'string',
        description: 'Output token. Use symbol (USDC, PATHUSD) or a 0x token address.',
      },
      amountIn: {
        type: 'string',
        description: 'Human-readable input amount (e.g. "100" for 100 USDC). Use with get_quote or build_swap_tx for exact-input swaps.',
      },
      amountOut: {
        type: 'string',
        description: 'Human-readable output amount for exact-output swaps.',
      },
      sender: {
        type: 'string',
        description: 'Sender wallet address (0x…). Required for build_swap_tx.',
      },
      slippageBps: {
        type: 'number',
        description: 'Slippage tolerance in basis points (default: 50 = 0.5%). Used in build_swap_tx.',
      },
      feeTier: {
        type: 'number',
        enum: [100, 500, 3000, 10000],
        description: 'Specific fee tier to use. If omitted, all tiers are tried and the best is returned.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Quote USDC → pathUSD',
      description: 'Get live quote for 100 USDC to pathUSD on Tempo',
      input: { action: 'get_quote', tokenIn: 'USDC', tokenOut: 'PATHUSD', amountIn: '100' },
    },
    {
      title: 'Build swap transaction',
      description: 'Build calldata to swap 50 USDC for pathUSD',
      input: {
        action: 'build_swap_tx',
        tokenIn: 'USDC', tokenOut: 'PATHUSD',
        amountIn: '50',
        sender: '0xYourWalletAddress',
        slippageBps: 50,
      },
    },
    {
      title: 'Check available pools',
      description: 'See which fee-tier pools exist for USDC/pathUSD',
      input: { action: 'get_pools', tokenIn: 'USDC', tokenOut: 'PATHUSD' },
    },
  ],
};

// ── Action handlers ───────────────────────────────────────────────────────────

async function getQuote(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut, amountIn, amountOut, feeTier } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountIn && !amountOut) return { success: false, error: 'Provide amountIn or amountOut.' };

  try {
    const tIn  = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const tiers = feeTier ? [Number(feeTier)] : FEE_TIERS;

    if (amountIn) {
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw, tiers);
      if (!best) return { success: false, error: `No Uniswap V3 pool found for ${tIn.symbol}→${tOut.symbol} on Tempo.` };

      const amountOutStr = formatUnits(best.amountOut, tOut.decimals);
      const execPrice    = Number(amountOutStr) / Number(amountIn);

      let priceImpactPct: number | null = null;
      try {
        const oneUnit = 10n ** BigInt(tIn.decimals);
        const spot = await quoteExactIn(tIn.address, tOut.address, oneUnit, best.fee);
        if (spot) {
          const spotPrice = Number(formatUnits(spot.amountOut, tOut.decimals));
          if (spotPrice > 0) priceImpactPct = Math.max(0, Number(((spotPrice - execPrice) / spotPrice * 100).toFixed(4)));
        }
      } catch { /* non-fatal */ }

      return {
        success: true,
        output: {
          amountIn:       String(amountIn),
          amountOut:      amountOutStr,
          fee:            `${best.fee / 10000}%`,
          route:          [tIn.symbol, tOut.symbol],
          executionPrice: execPrice.toFixed(6),
          price_impact:   priceImpactPct,
          gasEstimate:    best.gasEstimate.toString(),
          chain:          'tempo',
          _mock:          false,
          _operation:     'uniswap_v3_swap',
        },
      };
    } else {
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, tiers);
      if (!best) return { success: false, error: `No Uniswap V3 pool found for ${tIn.symbol}→${tOut.symbol} on Tempo.` };

      const amountInStr = formatUnits(best.amountIn, tIn.decimals);
      const execPrice   = Number(amountOut) / Number(amountInStr);

      let priceImpactPct: number | null = null;
      try {
        const oneUnit = 10n ** BigInt(tIn.decimals);
        const spot = await quoteExactIn(tIn.address, tOut.address, oneUnit, best.fee);
        if (spot) {
          const spotPrice = Number(formatUnits(spot.amountOut, tOut.decimals));
          if (spotPrice > 0) priceImpactPct = Math.max(0, Number(((spotPrice - execPrice) / spotPrice * 100).toFixed(4)));
        }
      } catch { /* non-fatal */ }

      return {
        success: true,
        output: {
          amountIn:       amountInStr,
          amountOut:      String(amountOut),
          fee:            `${best.fee / 10000}%`,
          route:          [tIn.symbol, tOut.symbol],
          executionPrice: execPrice.toFixed(6),
          price_impact:   priceImpactPct,
          gasEstimate:    best.gasEstimate.toString(),
          chain:          'tempo',
          _mock:          false,
          _operation:     'uniswap_v3_swap',
        },
      };
    }
  } catch (err: any) {
    return { success: false, error: `get_quote failed: ${err.message}` };
  }
}

async function buildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut, amountIn, amountOut, sender, slippageBps = 50, feeTier } = input;

  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) return { success: false, error: 'A valid sender address (0x…) is required.' };
  if (!amountIn && !amountOut) return { success: false, error: 'Provide amountIn or amountOut.' };

  try {
    const tIn  = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const slip = BigInt(slippageBps);
    const tiers = feeTier ? [Number(feeTier)] : FEE_TIERS;

    if (amountOut) {
      // Exact-output
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, tiers);
      if (!best) return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on Tempo.` };

      const amountInMax = best.amountIn * (10000n + slip) / 10000n;
      const calldata = SEL.swapExactOutput
        + p32(tIn.address) + p32(tOut.address) + p32(best.fee)
        + p32(sender) + p32(amountOutRaw) + p32(amountInMax) + p32(0n);

      const swapTx = {
        to: CONTRACTS.swapRouter,
        data: '0x' + calldata,
        value: '0x0',
        description: `Swap at most ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for exactly ${amountOut} ${tOut.symbol} via Uniswap V3 on Tempo`,
      };

      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.swapRouter);
      const transactions = [
        ...(allowance < amountInMax ? [{
          to: tIn.address,
          data: '0x095ea7b3' + p32(CONTRACTS.swapRouter) + p32(amountInMax),
          value: '0x0',
          description: `Approve ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for Uniswap SwapRouter02`,
        }] : []),
        swapTx,
      ];

      return {
        success: true,
        output: {
          transactions,
          amountOut:    String(amountOut),
          amountInMax:  formatUnits(amountInMax, tIn.decimals),
          fee:          `${best.fee / 10000}%`,
          chain:        'tempo',
          chain_id:     4217,
          _operation:   'uniswap_v3_swap',
        },
      };
    } else {
      // Exact-input
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw, tiers);
      if (!best) return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on Tempo.` };

      const amountOutMin = best.amountOut * (10000n - slip) / 10000n;
      const calldata = SEL.swapExactInput
        + p32(tIn.address) + p32(tOut.address) + p32(best.fee)
        + p32(sender) + p32(amountInRaw) + p32(amountOutMin) + p32(0n);

      const swapTx = {
        to: CONTRACTS.swapRouter,
        data: '0x' + calldata,
        value: '0x0',
        description: `Swap exactly ${amountIn} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via Uniswap V3 on Tempo`,
      };

      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.swapRouter);
      const transactions = [
        ...(allowance < amountInRaw ? [{
          to: tIn.address,
          data: '0x095ea7b3' + p32(CONTRACTS.swapRouter) + p32(amountInRaw),
          value: '0x0',
          description: `Approve ${amountIn} ${tIn.symbol} for Uniswap SwapRouter02`,
        }] : []),
        swapTx,
      ];

      return {
        success: true,
        output: {
          transactions,
          amountIn:     String(amountIn),
          amountOutMin: formatUnits(amountOutMin, tOut.decimals),
          fee:          `${best.fee / 10000}%`,
          chain:        'tempo',
          chain_id:     4217,
          _operation:   'uniswap_v3_swap',
        },
      };
    }
  } catch (err: any) {
    return { success: false, error: `build_swap_tx failed: ${err.message}` };
  }
}

async function getPools(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };

  try {
    const tIn  = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const results: Array<{ fee: number; fee_label: string; pool: string; exists: boolean }> = [];

    for (const fee of FEE_TIERS) {
      const calldata = '0x' + SEL.getPool + p32(tIn.address) + p32(tOut.address) + p32(fee);
      const result = await ethCall(CONTRACTS.factory, calldata);
      const pool = '0x' + result.replace('0x', '').slice(24);
      const exists = pool !== '0x0000000000000000000000000000000000000000';
      results.push({ fee, fee_label: `${fee / 10000}%`, pool: exists ? pool : '—', exists });
    }

    return {
      success: true,
      output: {
        tokenIn:  { symbol: tIn.symbol,  address: tIn.address },
        tokenOut: { symbol: tOut.symbol, address: tOut.address },
        pools:    results,
        chain:    'tempo',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_pools failed: ${err.message}` };
  }
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeUniswapTempoSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'get_quote':     return getQuote(input);
    case 'build_swap_tx': return buildSwapTx(input);
    case 'get_pools':     return getPools(input);
    default:
      return { success: false, error: `Unknown action "${action}". Valid: get_quote, build_swap_tx, get_pools` };
  }
}
