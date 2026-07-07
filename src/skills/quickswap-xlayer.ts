/**
 * QuickSwap on XLayer — Server-side execution
 *
 * QuickSwap is a Uniswap V3 fork deployed on XLayer with ~$2.7M TVL.
 * Provides swap quotes and unsigned swap transactions on XLayer (chain ID 196).
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls XLayer RPC directly. No API key needed.
 *
 * QuickSwap contracts on XLayer (chain ID 196):
 *   Factory:    0x4B9f4d2435Ef65559567e5DbFC1BbB37abC43B57
 *   Router:     0xfCB24F95C6A7cda70Bcd67d64372Ce02Fa3e9f78
 *   QuoterV2:   0x55BeE1bD3Eb9986f6d2d963278de09eE92a3eF1d
 *
 * Key tokens: same as XLayer (WOKB, USDT, USDC, ETH, WBTC)
 *
 * Note: QuickSwap uses Algebra protocol (tick-based, dynamic fees),
 * not standard Uniswap V3 fixed fee tiers. Pools auto-select best fee.
 */

import type { SkillExecutionResult } from '@/types/skill';

// ── Contracts ─────────────────────────────────────────────────────────────────

const CONTRACTS = {
  factory:   '0x4B9f4d2435Ef65559567e5DbFC1BbB37abC43B57',
  router:    '0xfCB24F95C6A7cda70Bcd67d64372Ce02Fa3e9f78',
  quoterV2:  '0x55BeE1bD3Eb9986f6d2d963278de09eE92a3eF1d',
} as const;

const RPC      = 'https://rpc.xlayer.tech';
const CHAIN    = 'xlayer';
const CHAIN_ID = 196;

// ── Well-known XLayer tokens (same as uniswap-xlayer) ─────────────────────────

const TOKENS: Record<string, { address: string; decimals: number }> = {
  WOKB:  { address: '0xe538905cf8410324e03a5a23c1c177a474d59b2b', decimals: 18 },
  USDT:  { address: '0x1e4a5963abfd975d8c9021ce480b42188849d41d', decimals: 6  },
  USDC:  { address: '0x74b7f16337b8972027f6196a17a631ac6de26d22', decimals: 6  },
  ETH:   { address: '0x5a77f1443d16ee5761d310e38b62f77f726bc71c', decimals: 18 },
  WBTC:  { address: '0x236eca1ab4e4f0b5553ee7b1da9a1b99af8ed706', decimals: 8  },
};

// ── Algebra ABI selectors ─────────────────────────────────────────────────────
// QuickSwap/Algebra V3 uses a different quoting interface than Uniswap V3

const SEL = {
  // Algebra QuoterV2: quoteExactInputSingle((address,address,uint256,uint160)) → (uint256,uint16,uint256,uint256)
  quoteExactInput:  'c45a0155',
  // Algebra QuoterV2: quoteExactOutputSingle((address,address,uint256,uint160))
  quoteExactOutput: '8b9a8a95',
  // Algebra Router: exactInputSingle((address,address,address,uint256,uint256,uint160))
  swapExactInput:   'bc651188',
  // Algebra Router: exactOutputSingle((address,address,address,uint256,uint256,uint160))
  swapExactOutput:  '85b7df0f',
  // ERC20
  erc20Decimals:    '313ce567',
  erc20Allowance:   'dd62ed3e',
} as const;

// ── Skill metadata ────────────────────────────────────────────────────────────

export const QUICKSWAP_XLAYER_SKILL_METADATA = {
  name: 'QuickSwap on XLayer',
  description:
    '[ARSENAL-HOSTED ✓] Swap tokens on QuickSwap deployed on XLayer (chain ID 196). ' +
    'QuickSwap is the #2 DEX on XLayer with ~$2.7M TVL, using Algebra protocol (dynamic fees). ' +
    'Get live swap quotes and build unsigned swap transactions for WOKB, USDT, USDC, ETH, WBTC and any XLayer ERC-20.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['quickswap', 'xlayer', 'okx', 'okb', 'swap', 'defi', 'algebra', 'dex'],
  external_url: 'https://quickswap.exchange',
  logo_url: 'https://icons.llamao.fi/icons/protocols/quickswap?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'build_swap_tx', 'get_pool'],
        description:
          'get_quote: live swap quote via Algebra QuoterV2 (requires tokenIn, tokenOut, amountIn or amountOut). ' +
          'build_swap_tx: build unsigned swap calldata for signing (requires tokenIn, tokenOut, amountIn, sender). ' +
          'get_pool: check if a pool exists for a token pair.',
      },
      tokenIn:  { type: 'string', description: 'Input token symbol (WOKB, USDT, USDC, ETH, WBTC) or 0x address.' },
      tokenOut: { type: 'string', description: 'Output token symbol or 0x address.' },
      amountIn:  { type: 'string', description: 'Exact input amount in human-readable units.' },
      amountOut: { type: 'string', description: 'Exact output amount (exact-output mode).' },
      sender:    { type: 'string', description: 'Wallet address (0x…). Required for build_swap_tx.' },
      slippageBps: { type: 'number', description: 'Slippage in basis points (default: 50 = 0.5%).' },
    },
  },
  usage_examples: [
    { title: 'Quote WOKB → USDT', input: { action: 'get_quote', tokenIn: 'WOKB', tokenOut: 'USDT', amountIn: '10' } },
    { title: 'Build swap tx',     input: { action: 'build_swap_tx', tokenIn: 'USDT', tokenOut: 'USDC', amountIn: '100', sender: '0xYourAddress' } },
    { title: 'Check pool',        input: { action: 'get_pool', tokenIn: 'WOKB', tokenOut: 'USDT' } },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const json = await res.json() as any;
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

interface TokenInfo { address: string; decimals: number; symbol: string }

async function resolveToken(raw: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  if (TOKENS[upper]) return { ...TOKENS[upper], symbol: upper };
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(`Unknown token "${raw}". Use a symbol (${Object.keys(TOKENS).join(', ')}) or a 0x address.`);
  }
  const result = await ethCall(raw, '0x' + SEL.erc20Decimals);
  const decimals = Number(readU256(result));
  return { address: raw, decimals, symbol: raw.slice(0, 8) + '…' };
}

async function getAllowance(token: string, owner: string, spender: string): Promise<bigint> {
  try {
    return readU256(await ethCall(token, '0x' + SEL.erc20Allowance + p32(owner) + p32(spender)));
  } catch { return 0n; }
}

// ── Algebra quoting ───────────────────────────────────────────────────────────
// Algebra QuoterV2.quoteExactInputSingle takes a struct: (tokenIn, tokenOut, amountIn, limitSqrtPrice=0)

async function quoteExactIn(
  tokenIn: string, tokenOut: string, amountIn: bigint,
): Promise<{ amountOut: bigint } | null> {
  // Encode struct: (address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice)
  const data = '0x' + SEL.quoteExactInput
    + p32(tokenIn) + p32(tokenOut) + p32(amountIn) + p32(0n);
  try {
    const hex = (await ethCall(CONTRACTS.quoterV2, data)).replace('0x', '');
    if (!hex || hex.length < 64) return null;
    return { amountOut: readU256(hex, 0) };
  } catch { return null; }
}

async function quoteExactOut(
  tokenIn: string, tokenOut: string, amountOut: bigint,
): Promise<{ amountIn: bigint } | null> {
  const data = '0x' + SEL.quoteExactOutput
    + p32(tokenIn) + p32(tokenOut) + p32(amountOut) + p32(0n);
  try {
    const hex = (await ethCall(CONTRACTS.quoterV2, data)).replace('0x', '');
    if (!hex || hex.length < 64) return null;
    return { amountIn: readU256(hex, 0) };
  } catch { return null; }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function getQuote(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut, amountIn, amountOut } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!amountIn && !amountOut) return { success: false, error: 'Provide amountIn or amountOut.' };

  try {
    const tIn  = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);

    if (amountIn) {
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const q = await quoteExactIn(tIn.address, tOut.address, amountInRaw);
      if (!q) return { success: false, error: `No QuickSwap pool found for ${tIn.symbol}→${tOut.symbol} on XLayer.` };

      const amountOutStr  = formatUnits(q.amountOut, tOut.decimals);
      const effectivePrice = Number(amountOutStr) / Number(amountIn);

      return {
        success: true,
        output: {
          tokenIn:        tIn.symbol,
          tokenOut:       tOut.symbol,
          amountIn:       String(amountIn),
          amountOut:      amountOutStr,
          effectivePrice: effectivePrice.toFixed(6),
          protocol:       'QuickSwap (Algebra)',
          chain:          CHAIN,
          chain_id:       CHAIN_ID,
          _mock:          false,
          _operation:     'quickswap_swap',
        },
      };
    } else {
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const q = await quoteExactOut(tIn.address, tOut.address, amountOutRaw);
      if (!q) return { success: false, error: `No QuickSwap pool found for ${tIn.symbol}→${tOut.symbol} on XLayer.` };

      const amountInStr   = formatUnits(q.amountIn, tIn.decimals);
      const effectivePrice = Number(amountOut) / Number(amountInStr);

      return {
        success: true,
        output: {
          tokenIn:        tIn.symbol,
          tokenOut:       tOut.symbol,
          amountIn:       amountInStr,
          amountOut:      String(amountOut),
          effectivePrice: effectivePrice.toFixed(6),
          protocol:       'QuickSwap (Algebra)',
          chain:          CHAIN,
          chain_id:       CHAIN_ID,
          _mock:          false,
          _operation:     'quickswap_swap',
        },
      };
    }
  } catch (err: any) {
    return { success: false, error: `get_quote failed: ${err.message}` };
  }
}

async function buildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut, amountIn, amountOut, sender, slippageBps = 50 } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) return { success: false, error: 'A valid sender address (0x…) is required.' };
  if (!amountIn && !amountOut) return { success: false, error: 'Provide amountIn or amountOut.' };

  try {
    const tIn  = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const slip = BigInt(slippageBps);

    if (amountIn) {
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const q = await quoteExactIn(tIn.address, tOut.address, amountInRaw);
      if (!q) return { success: false, error: `No QuickSwap pool found for ${tIn.symbol}→${tOut.symbol}.` };

      const amountOutMin = q.amountOut * (10000n - slip) / 10000n;
      // Algebra Router exactInputSingle: (tokenIn, tokenOut, recipient, amountIn, amountOutMin, limitSqrtPrice)
      const calldata = SEL.swapExactInput
        + p32(tIn.address) + p32(tOut.address) + p32(sender)
        + p32(amountInRaw) + p32(amountOutMin) + p32(0n);

      const swapTx = {
        to:       CONTRACTS.router,
        data:     '0x' + calldata,
        value:    '0x0',
        chain_id: CHAIN_ID,
        description: `Swap ${amountIn} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via QuickSwap on XLayer`,
      };

      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.router);
      const transactions = [
        ...(allowance < amountInRaw ? [{
          to:       tIn.address,
          data:     '0x095ea7b3' + p32(CONTRACTS.router) + p32(amountInRaw),
          value:    '0x0',
          chain_id: CHAIN_ID,
          description: `Approve ${amountIn} ${tIn.symbol} for QuickSwap Router`,
        }] : []),
        swapTx,
      ];

      return {
        success: true,
        output: {
          transactions,
          amountIn:     String(amountIn),
          amountOutMin: formatUnits(amountOutMin, tOut.decimals),
          protocol:     'QuickSwap (Algebra)',
          chain:        CHAIN,
          chain_id:     CHAIN_ID,
          _operation:   'quickswap_swap',
        },
      };
    } else {
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const q = await quoteExactOut(tIn.address, tOut.address, amountOutRaw);
      if (!q) return { success: false, error: `No QuickSwap pool found for ${tIn.symbol}→${tOut.symbol}.` };

      const amountInMax = q.amountIn * (10000n + slip) / 10000n;
      const calldata = SEL.swapExactOutput
        + p32(tIn.address) + p32(tOut.address) + p32(sender)
        + p32(amountOutRaw) + p32(amountInMax) + p32(0n);

      const swapTx = {
        to:       CONTRACTS.router,
        data:     '0x' + calldata,
        value:    '0x0',
        chain_id: CHAIN_ID,
        description: `Swap at most ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for exactly ${amountOut} ${tOut.symbol} via QuickSwap on XLayer`,
      };

      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.router);
      const transactions = [
        ...(allowance < amountInMax ? [{
          to:       tIn.address,
          data:     '0x095ea7b3' + p32(CONTRACTS.router) + p32(amountInMax),
          value:    '0x0',
          chain_id: CHAIN_ID,
          description: `Approve ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for QuickSwap Router`,
        }] : []),
        swapTx,
      ];

      return {
        success: true,
        output: {
          transactions,
          amountInMax:  formatUnits(amountInMax, tIn.decimals),
          amountOut:    String(amountOut),
          protocol:     'QuickSwap (Algebra)',
          chain:        CHAIN,
          chain_id:     CHAIN_ID,
          _operation:   'quickswap_swap',
        },
      };
    }
  } catch (err: any) {
    return { success: false, error: `build_swap_tx failed: ${err.message}` };
  }
}

async function getPool(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };

  try {
    const tIn  = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);

    // Algebra Factory.poolByPair(address,address) → 0xd9a641e1
    const data = '0xd9a641e1' + p32(tIn.address) + p32(tOut.address);
    const result = await ethCall(CONTRACTS.factory, data);
    const pool = '0x' + result.replace('0x', '').slice(24);
    const exists = pool !== '0x0000000000000000000000000000000000000000';

    return {
      success: true,
      output: {
        tokenIn:  { symbol: tIn.symbol,  address: tIn.address },
        tokenOut: { symbol: tOut.symbol, address: tOut.address },
        pool:     exists ? pool : null,
        exists,
        protocol: 'QuickSwap (Algebra)',
        chain:    CHAIN,
        chain_id: CHAIN_ID,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_pool failed: ${err.message}` };
  }
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeQuickSwapXLayerSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'get_quote':     return getQuote(input);
    case 'build_swap_tx': return buildSwapTx(input);
    case 'get_pool':      return getPool(input);
    default:
      return { success: false, error: `Unknown action "${action}". Valid: get_quote, build_swap_tx, get_pool` };
  }
}
