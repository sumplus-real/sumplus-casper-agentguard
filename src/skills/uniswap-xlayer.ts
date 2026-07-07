/**
 * Uniswap V3 on XLayer — Server-side execution
 *
 * Uniswap V3 is the primary DEX on XLayer (OKX's L2, chain ID 196).
 * Get live swap quotes and build unsigned swap transactions.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls XLayer's public RPC directly. No API key needed.
 *
 * Contracts on XLayer (chain ID 196):
 *   UniswapV3Factory:  0x1F98431c8aD98523631AE4a59f267346ea31F984
 *   QuoterV2:          0x61fFE014bA17989E743c5F6cB21bF9697530B21e
 *   SwapRouter02:      0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
 *
 * Key tokens on XLayer:
 *   WOKB:  0xe538905cf8410324e03a5a23c1c177a474d59b2b  (18 dec) — native gas token wrapper
 *   USDT:  0x1e4a5963abfd975d8c9021ce480b42188849d41d  (6 dec)
 *   USDC:  0x74b7f16337b8972027f6196a17a631ac6de26d22  (6 dec)
 *   ETH:   0x5a77f1443d16ee5761d310e38b62f77f726bc71c  (18 dec) — bridged
 *   WBTC:  0x236eca1ab4e4f0b5553ee7b1da9a1b99af8ed706  (8 dec)
 */

import type { SkillExecutionResult } from '@/types/skill';

// ── Contracts ─────────────────────────────────────────────────────────────────

const CONTRACTS = {
  factory:    '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  quoterV2:   '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
} as const;

const RPC      = 'https://rpc.xlayer.tech';
const CHAIN_ID = 196;

// ── Well-known XLayer tokens ──────────────────────────────────────────────────

const TOKENS: Record<string, { address: string; decimals: number }> = {
  WOKB:  { address: '0xe538905cf8410324e03a5a23c1c177a474d59b2b', decimals: 18 },
  USDT:  { address: '0x1e4a5963abfd975d8c9021ce480b42188849d41d', decimals: 6  },
  USDC:  { address: '0x74b7f16337b8972027f6196a17a631ac6de26d22', decimals: 6  },
  ETH:   { address: '0x5a77f1443d16ee5761d310e38b62f77f726bc71c', decimals: 18 },
  WBTC:  { address: '0x236eca1ab4e4f0b5553ee7b1da9a1b99af8ed706', decimals: 8  },
};

// ── ABI selectors ─────────────────────────────────────────────────────────────

const SEL = {
  quoteExactInput:  'c6a5026a', // QuoterV2.quoteExactInputSingle
  quoteExactOutput: 'bd21704a', // QuoterV2.quoteExactOutputSingle
  swapExactInput:   '04e45aaf', // SwapRouter02.exactInputSingle
  swapExactOutput:  '5023b4df', // SwapRouter02.exactOutputSingle
  getPool:          '1698ee82', // V3Factory.getPool
  erc20Decimals:    '313ce567', // ERC20.decimals
  erc20Allowance:   'dd62ed3e', // ERC20.allowance
} as const;

const FEE_TIERS = [500, 3000, 10000]; // XLayer: 100bps pools less common

// ── Low-level helpers ─────────────────────────────────────────────────────────

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  if (!res.ok) throw new Error(`XLayer RPC error: ${res.status}`);
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`eth_call failed: ${json.error.message}`);
  return json.result ?? '0x';
}

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
      `Unknown token "${raw}". Use a symbol (${Object.keys(TOKENS).join(', ')}) or a 0x address.`
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
    if (!hex || hex === '0'.repeat(hex.length)) return null;
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
    if (!hex || hex === '0'.repeat(hex.length)) return null;
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

export const UNISWAP_XLAYER_SKILL_METADATA = {
  name: 'Uniswap V3 on XLayer',
  description:
    '[ARSENAL-HOSTED ✓] Swap tokens on Uniswap V3 deployed on XLayer — OKX\'s L2 chain ' +
    '(chain ID 196, Polygon CDK / zkEVM). Get live quotes and build swap transactions ' +
    'for OKB, USDT, USDC, ETH, WBTC and any ERC-20 on XLayer.\n\n' +
    'execution_mode: server-side\n' +
    'chain: xlayer (id: 196)\n' +
    'rpc: https://rpc.xlayer.tech\n' +
    'gas_token: OKB (NOT ETH)\n' +
    'sop_compliance:\n' +
    '  provides_quote: true\n' +
    '  returns_price_impact: true\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['uniswap', 'xlayer', 'okx', 'okb', 'swap', 'defi', 'evm', 'zkevm', 'v3'],
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
      tokenIn: {
        type: 'string',
        description: 'Input token symbol (WOKB, USDT, USDC, ETH, WBTC) or 0x address.',
      },
      tokenOut: {
        type: 'string',
        description: 'Output token symbol or 0x address.',
      },
      amountIn: {
        type: 'string',
        description: 'Exact input amount in human-readable units (e.g. "100" for 100 USDT).',
      },
      amountOut: {
        type: 'string',
        description: 'Exact output amount for exact-output mode.',
      },
      sender: {
        type: 'string',
        description: 'Wallet address (0x…). Required for build_swap_tx.',
      },
      slippageBps: {
        type: 'number',
        description: 'Slippage tolerance in basis points (default: 50 = 0.5%).',
      },
      feeTier: {
        type: 'number',
        enum: [500, 3000, 10000],
        description: 'Specific fee tier in bps. If omitted, best tier is selected automatically.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Quote WOKB → USDT',
      input: { action: 'get_quote', tokenIn: 'WOKB', tokenOut: 'USDT', amountIn: '10' },
    },
    {
      title: 'Quote USDT → USDC',
      input: { action: 'get_quote', tokenIn: 'USDT', tokenOut: 'USDC', amountIn: '100' },
    },
    {
      title: 'Build swap transaction',
      input: { action: 'build_swap_tx', tokenIn: 'WOKB', tokenOut: 'USDT', amountIn: '5', sender: '0xYourAddress' },
    },
    {
      title: 'Check available pools',
      input: { action: 'get_pools', tokenIn: 'WOKB', tokenOut: 'USDT' },
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
      if (!best) return { success: false, error: `No Uniswap V3 pool found for ${tIn.symbol}→${tOut.symbol} on XLayer.` };

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
          chain:          'xlayer',
          chain_id:       CHAIN_ID,
          _mock:          false,
          _operation:     'uniswap_v3_swap',
        },
      };
    } else {
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, tiers);
      if (!best) return { success: false, error: `No Uniswap V3 pool found for ${tIn.symbol}→${tOut.symbol} on XLayer.` };

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
          chain:          'xlayer',
          chain_id:       CHAIN_ID,
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
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, tiers);
      if (!best) return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on XLayer.` };

      const amountInMax = best.amountIn * (10000n + slip) / 10000n;
      const calldata = SEL.swapExactOutput
        + p32(tIn.address) + p32(tOut.address) + p32(best.fee)
        + p32(sender) + p32(amountOutRaw) + p32(amountInMax) + p32(0n);

      const swapTx = {
        to: CONTRACTS.swapRouter,
        data: '0x' + calldata,
        value: '0x0',
        chain_id: CHAIN_ID,
        description: `Swap at most ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for exactly ${amountOut} ${tOut.symbol} via Uniswap V3 on XLayer`,
      };

      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.swapRouter);
      const transactions = [
        ...(allowance < amountInMax ? [{
          to: tIn.address,
          data: '0x095ea7b3' + p32(CONTRACTS.swapRouter) + p32(amountInMax),
          value: '0x0',
          chain_id: CHAIN_ID,
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
          chain:        'xlayer',
          chain_id:     CHAIN_ID,
          _operation:   'uniswap_v3_swap',
        },
      };
    } else {
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw, tiers);
      if (!best) return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on XLayer.` };

      const amountOutMin = best.amountOut * (10000n - slip) / 10000n;
      const calldata = SEL.swapExactInput
        + p32(tIn.address) + p32(tOut.address) + p32(best.fee)
        + p32(sender) + p32(amountInRaw) + p32(amountOutMin) + p32(0n);

      const swapTx = {
        to: CONTRACTS.swapRouter,
        data: '0x' + calldata,
        value: '0x0',
        chain_id: CHAIN_ID,
        description: `Swap exactly ${amountIn} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via Uniswap V3 on XLayer`,
      };

      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.swapRouter);
      const transactions = [
        ...(allowance < amountInRaw ? [{
          to: tIn.address,
          data: '0x095ea7b3' + p32(CONTRACTS.swapRouter) + p32(amountInRaw),
          value: '0x0',
          chain_id: CHAIN_ID,
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
          chain:        'xlayer',
          chain_id:     CHAIN_ID,
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
        chain:    'xlayer',
        chain_id: CHAIN_ID,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_pools failed: ${err.message}` };
  }
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeUniswapXLayerSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'get_quote':     return getQuote(input);
    case 'build_swap_tx': return buildSwapTx(input);
    case 'get_pools':     return getPools(input);
    default:
      return { success: false, error: `Unknown action "${action}". Valid: get_quote, build_swap_tx, get_pools` };
  }
}
