/**
 * Uniswap V3 Skills — Server-side execution
 *
 * Arsenal provides Alchemy RPC for these skills.
 * Agents call /api/execute directly — no API key setup needed.
 *
 * If Arsenal RPC access is discontinued, pass `alchemy_key` in the request input.
 *
 * Contracts used:
 *   - QuoterV2 (for quotes, no gas)
 *   - SwapRouter02 (for calldata generation)
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Chain config ──────────────────────────────────────────────────────────

const ALCHEMY_URLS: Record<string, string> = {
  ethereum: 'https://eth-mainnet.g.alchemy.com/v2',
  optimism: 'https://opt-mainnet.g.alchemy.com/v2',
  arbitrum: 'https://arb-mainnet.g.alchemy.com/v2',
  base:     'https://base-mainnet.g.alchemy.com/v2',
  polygon:  'https://polygon-mainnet.g.alchemy.com/v2',
};

// SwapRouter02 — same on all chains except Base
const SWAP_ROUTER: Record<string, string> = {
  ethereum: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  optimism: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  arbitrum: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  base:     '0x2626664c2603336E57B271c5C0b26F421741e481',
  polygon:  '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
};

// QuoterV2 — same on all chains except Base
const QUOTER_V2: Record<string, string> = {
  ethereum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  optimism: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  arbitrum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  base:     '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  polygon:  '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
};

// Well-known tokens per chain — symbol → {address, decimals}
// ETH maps to the chain's WETH address (SwapRouter02 handles native ETH wrapping)
const TOKENS: Record<string, Record<string, { address: string; decimals: number }>> = {
  ethereum: {
    ETH:  { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    DAI:  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
    WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  },
  optimism: {
    ETH:  { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
    DAI:  { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    WBTC: { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8 },
    OP:   { address: '0x4200000000000000000000000000000000000042', decimals: 18 },
  },
  arbitrum: {
    ETH:  { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    ARB:  { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
    WBTC: { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
  },
  base: {
    ETH:   { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    WETH:  { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    USDC:  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    DAI:   { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
    cbBTC: { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
  },
  polygon: {
    MATIC:  { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
    WMATIC: { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
    ETH:    { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    WETH:   { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    USDC:   { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
    USDT:   { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
  },
};

// Fee tiers to try in order (most to least liquid for most pairs)
const FEE_TIERS = [500, 3000, 100, 10000];

// Precomputed function selectors (keccak256 of canonical ABI signature, first 4 bytes)
// These are for immutable deployed contracts — will never change
// NOTE: selectors are raw hex (no '0x' prefix) — callers add '0x' when composing data
const SEL = {
  // QuoterV2.quoteExactInputSingle((address,address,uint256,uint24,uint160))
  quoteExactInput:  'c6a5026a',
  // QuoterV2.quoteExactOutputSingle((address,address,uint256,uint24,uint160))
  quoteExactOutput: 'bd21704a',
  // SwapRouter02.exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
  swapExactInput:   '04e45aaf',
  // SwapRouter02.exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))
  swapExactOutput:  '5023b4df',
  // SwapRouter02.unwrapWETH9(uint256 amountMinimum, address recipient)
  unwrapWETH9:      '49404b7c',
  // SwapRouter02.multicall(bytes[] data)
  multicall:        'ac9650d8',
  // ERC20.decimals()
  erc20Decimals:    '313ce567',
};

/** unwrapWETH9(uint256 amountMinimum, address recipient) — router sweeps its WETH → native to recipient. */
function encodeUnwrapWETH9(amountMin: bigint, recipient: string): string {
  return SEL.unwrapWETH9 + p32(amountMin) + p32(recipient);
}

/**
 * Encode multicall(bytes[] data). Layout: selector | offset(0x20) | length |
 * offsets[]× | (length+data)× …, per the Solidity ABI spec. Calldatas WITHOUT 0x.
 */
function encodeMulticall(calls: string[]): string {
  const raws = calls.map(c => (c.startsWith('0x') ? c.slice(2) : c));
  const n = raws.length;
  const offsets: bigint[] = [];
  let cursor = BigInt(n * 32);
  for (const r of raws) {
    offsets.push(cursor);
    const padded = ((BigInt(r.length / 2) + 31n) / 32n) * 32n;
    cursor += 32n + padded;
  }
  let body = p32(n);
  for (const off of offsets) body += p32(off);
  for (const r of raws) {
    const bytesLen = r.length / 2;
    body += p32(bytesLen) + r.padEnd(Math.ceil(bytesLen / 32) * 64, '0');
  }
  return SEL.multicall + p32(0x20) + body;
}

// ─── Low-level helpers ─────────────────────────────────────────────────────

function getApiKey(override?: string): string {
  const key = override ?? process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error(
    'No Alchemy API key available. Arsenal provides one by default. ' +
    'If you see this error, pass your own key as "alchemy_key" in the request input.'
  );
  return key;
}

/** ERC20.allowance(owner, spender) → uint256 */
async function getAllowance(
  tokenAddr: string, owner: string, spender: string, chain: string, apiKey: string,
): Promise<bigint> {
  const data = '0xdd62ed3e' + p32(owner) + p32(spender);
  try {
    const result = await ethCall(chain, tokenAddr, data, apiKey);
    return readU256(result);
  } catch {
    return 0n;
  }
}

async function ethCall(chain: string, to: string, data: string, apiKey: string): Promise<string> {
  const url = `${ALCHEMY_URLS[chain]}/${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  if (!res.ok) throw new Error(`Alchemy error: ${res.status}`);
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`eth_call failed: ${json.error.message}`);
  return json.result ?? '0x';
}

/**
 * Pad a value (address string, bigint, or number) to 32 ABI-encoded bytes (64 hex chars).
 * Addresses are right-aligned (left-zero-padded). Numbers are big-endian.
 */
function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) {
    return v.slice(2).toLowerCase().padStart(64, '0');
  }
  return BigInt(v).toString(16).padStart(64, '0');
}

/** Read first 32-byte word from ABI-encoded hex result */
function readU256(hex: string, slot = 0): bigint {
  const start = slot * 64;
  return BigInt('0x' + hex.replace('0x', '').slice(start, start + 64));
}

/** Human-readable decimal → bigint (raw units) */
function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(fracPadded || '0');
}

/** bigint (raw units) → human-readable decimal string */
function formatUnits(value: bigint, decimals: number): string {
  const d = BigInt(decimals);
  const divisor = 10n ** d;
  const whole = value / divisor;
  const frac = value % divisor;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

// ─── Token resolution ──────────────────────────────────────────────────────

interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  isNative: boolean; // true for ETH (send as msg.value)
}

async function resolveToken(raw: string, chain: string, apiKey: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  const registry = TOKENS[chain];

  if (registry?.[upper]) {
    // Native token: ETH on ethereum/optimism/arbitrum/base; MATIC on polygon
    const nativeSymbol = chain === 'polygon' ? 'MATIC' : 'ETH';
    return {
      ...registry[upper],
      symbol: upper,
      isNative: upper === nativeSymbol,
    };
  }

  // Treat as contract address
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    const known = registry ? Object.keys(registry).join(', ') : 'none';
    throw new Error(
      `Unknown token "${raw}" on ${chain}. ` +
      `Use a symbol (${known}) or a full 0x address.`
    );
  }

  // Fetch decimals from ERC20
  const result = await ethCall(chain, raw, '0x' + SEL.erc20Decimals, apiKey);
  const decimals = Number(readU256(result));
  return { address: raw, decimals, symbol: raw.slice(0, 8) + '…', isNative: false };
}

// ─── QuoterV2 helpers ──────────────────────────────────────────────────────

/**
 * QuoterV2.quoteExactInputSingle params: (address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)
 * Returns: (uint256 amountOut, uint160 sqrtPriceX96After, uint32 ticksCrossed, uint256 gasEstimate)
 */
async function quoteExactIn(
  tokenIn: string, tokenOut: string, amountIn: bigint, fee: number, chain: string, apiKey: string,
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  const data = '0x' + SEL.quoteExactInput + p32(tokenIn) + p32(tokenOut) + p32(amountIn) + p32(fee) + p32(0n);
  try {
    const hex = (await ethCall(chain, QUOTER_V2[chain], data, apiKey)).replace('0x', '');
    if (!hex || hex === '') return null;
    return { amountOut: readU256(hex, 0), gasEstimate: readU256(hex, 3) };
  } catch {
    return null; // pool doesn't exist or insufficient liquidity at this fee tier
  }
}

/**
 * QuoterV2.quoteExactOutputSingle params: (address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)
 * Returns: (uint256 amountIn, uint160 sqrtPriceX96After, uint32 ticksCrossed, uint256 gasEstimate)
 */
async function quoteExactOut(
  tokenIn: string, tokenOut: string, amountOut: bigint, fee: number, chain: string, apiKey: string,
): Promise<{ amountIn: bigint; gasEstimate: bigint } | null> {
  const data = '0x' + SEL.quoteExactOutput + p32(tokenIn) + p32(tokenOut) + p32(amountOut) + p32(fee) + p32(0n);
  try {
    const hex = (await ethCall(chain, QUOTER_V2[chain], data, apiKey)).replace('0x', '');
    if (!hex || hex === '') return null;
    return { amountIn: readU256(hex, 0), gasEstimate: readU256(hex, 3) };
  } catch {
    return null;
  }
}

/** Try all fee tiers and return the best quote for exact-input */
async function bestQuoteIn(
  tokenIn: string, tokenOut: string, amountIn: bigint, chain: string, apiKey: string, feeTiers = FEE_TIERS,
): Promise<{ amountOut: bigint; gasEstimate: bigint; fee: number } | null> {
  let best: { amountOut: bigint; gasEstimate: bigint; fee: number } | null = null;
  for (const fee of feeTiers) {
    const q = await quoteExactIn(tokenIn, tokenOut, amountIn, fee, chain, apiKey);
    if (q && (!best || q.amountOut > best.amountOut)) best = { ...q, fee };
  }
  return best;
}

/** Try all fee tiers and return the best quote for exact-output (least tokenIn needed) */
async function bestQuoteOut(
  tokenIn: string, tokenOut: string, amountOut: bigint, chain: string, apiKey: string, feeTiers = FEE_TIERS,
): Promise<{ amountIn: bigint; gasEstimate: bigint; fee: number } | null> {
  let best: { amountIn: bigint; gasEstimate: bigint; fee: number } | null = null;
  for (const fee of feeTiers) {
    const q = await quoteExactOut(tokenIn, tokenOut, amountOut, fee, chain, apiKey);
    if (q && (!best || q.amountIn < best.amountIn)) best = { ...q, fee };
  }
  return best;
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const UNISWAP_GET_QUOTE_SKILL_METADATA = {
  name: 'Uniswap Get Quote',
  description:
    'Get live Uniswap V3 swap quotes and build swap transactions via Arsenal-hosted Alchemy RPC. ' +
    'Supports exact-input and exact-output modes across Ethereum, Optimism, Arbitrum, Base, and Polygon. ' +
    'Returns best price across all fee tiers (0.01%, 0.05%, 0.3%, 1%) with price impact calculation. ' +
    'build_swap_tx returns transactions array (approve + swap) ready for wallet signing.',
  category: 'DeFi',
  version: '1.1.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['uniswap', 'defi', 'price', 'quote', 'dex', 'ethereum', 'swap', 'evm'],
  external_url: 'https://app.uniswap.org',
  logo_url: 'https://icons.llamao.fi/icons/protocols/uniswap?w=48&h=48',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['chain', 'tokenIn', 'tokenOut'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'build_swap_tx'],
        description: 'get_quote: live swap quote with price impact (default). build_swap_tx: build unsigned swap calldata — returns transactions array.',
      },
      chain: {
        type: 'string',
        enum: ['ethereum', 'optimism', 'arbitrum', 'base', 'polygon'],
        description: 'EVM chain to query or transact on.',
      },
      tokenIn:  { type: 'string', description: 'Input token symbol (ETH, USDC, WBTC) or 0x address.' },
      tokenOut: { type: 'string', description: 'Output token symbol or 0x address.' },
      amountIn:  { type: 'number', description: 'Exact input amount (human-readable). Provide amountIn OR amountOut.' },
      amountOut: { type: 'number', description: 'Exact output amount (human-readable). Provide amountIn OR amountOut.' },
      sender: { type: 'string', description: 'Wallet address (0x...). Required for build_swap_tx.' },
      slippageBps: { type: 'number', description: 'Slippage tolerance in bps (default: 50 = 0.5%). Used by build_swap_tx.' },
      feeTier: {
        type: 'number',
        enum: [100, 500, 3000, 10000],
        description: 'Fee tier in bps (optional — best tier selected automatically).',
      },
    },
  },
  usage_examples: [
    { title: 'Quote 1 ETH → USDC on Ethereum', input: { chain: 'ethereum', tokenIn: 'ETH', tokenOut: 'USDC', amountIn: 1 } },
    { title: 'Quote on Base', input: { chain: 'base', tokenIn: 'ETH', tokenOut: 'USDC', amountIn: 0.5 } },
    { title: 'Build swap 0.1 ETH → USDC on Base', input: { action: 'build_swap_tx', chain: 'base', tokenIn: 'ETH', tokenOut: 'USDC', amountIn: 0.1, sender: '0xYourAddress' } },
  ],
};

export const UNISWAP_BUILD_TX_SKILL_METADATA = {
  name: 'Uniswap Build Transaction',
  description:
    'Build an unsigned Uniswap V3 swap transaction via Arsenal-hosted Alchemy RPC. ' +
    'Returns complete calldata for SwapRouter02 ready to sign and submit. ' +
    'Supports exact-input and exact-output swaps with configurable slippage.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['uniswap', 'defi', 'swap', 'transaction', 'calldata', 'dex', 'evm'],
  status: 'approved',
  schema: {
    type: 'object',
    required: ['chain', 'tokenIn', 'tokenOut', 'sender'],
    properties: {
      chain: {
        type: 'string',
        enum: ['ethereum', 'optimism', 'arbitrum', 'base', 'polygon'],
        description: 'EVM chain for the swap.',
      },
      tokenIn:    { type: 'string', description: 'Input token symbol or 0x address.' },
      tokenOut:   { type: 'string', description: 'Output token symbol or 0x address.' },
      sender:     { type: 'string', description: 'Wallet address (0x...) that will sign the transaction.' },
      amountIn:   { type: 'number', description: 'Exact input amount. Provide amountIn OR amountOut.' },
      amountOut:  { type: 'number', description: 'Exact output amount. Provide amountIn OR amountOut.' },
      slippageBps: { type: 'number', description: 'Slippage tolerance in bps (default: 50 = 0.5%).' },
    },
  },
  usage_examples: [
    { title: 'Swap 0.1 ETH → USDC on Base', input: { chain: 'base', tokenIn: 'ETH', tokenOut: 'USDC', amountIn: 0.1, sender: '0xYourAddress' } },
  ],
};

// ─── Exported skill executors ──────────────────────────────────────────────

/**
 * Uniswap Get Quote — server-side executor
 * Skill ID: 86702f0a-5487-4959-b21a-6de879b9decd
 */
export async function executeUniswapGetQuote(input: any): Promise<SkillExecutionResult> {
  if ((input?.action ?? 'get_quote') === 'build_swap_tx') {
    return executeUniswapBuildTx(input);
  }
  try {
    const { chain, tokenIn: rawIn, tokenOut: rawOut, amountIn, amountOut, feeTier, alchemy_key } = input ?? {};

    if (!chain || !ALCHEMY_URLS[chain]) {
      return { success: false, error: `Unsupported chain: "${chain}". Valid: ${Object.keys(ALCHEMY_URLS).join(', ')}` };
    }
    if (!rawIn || !rawOut) {
      return { success: false, error: 'tokenIn and tokenOut are required.' };
    }
    if (!amountIn && !amountOut) {
      return { success: false, error: 'Provide either amountIn (exact-input) or amountOut (exact-output).' };
    }

    const apiKey = getApiKey(alchemy_key);
    const tIn  = await resolveToken(rawIn,  chain, apiKey);
    const tOut = await resolveToken(rawOut, chain, apiKey);
    const tiers = feeTier ? [Number(feeTier)] : FEE_TIERS;

    if (amountIn) {
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw, chain, apiKey, tiers);
      if (!best) {
        return { success: false, error: `No Uniswap V3 pool found for ${tIn.symbol}→${tOut.symbol} on ${chain}.` };
      }
      const amountOutStr    = formatUnits(best.amountOut, tOut.decimals);
      const executionPrice  = Number(amountOutStr) / Number(amountIn);

      // Price impact: compare execution price vs spot price (1-unit reference quote, same fee tier).
      // Maria's Layer 3 price guard blocks swaps with price_impact > 10%.
      let priceImpactPct: number | null = null;
      try {
        const oneUnit = 10n ** BigInt(tIn.decimals);
        const spot = await quoteExactIn(tIn.address, tOut.address, oneUnit, best.fee, chain, apiKey);
        if (spot) {
          const spotPrice = Number(formatUnits(spot.amountOut, tOut.decimals));
          if (spotPrice > 0) {
            priceImpactPct = Number(((spotPrice - executionPrice) / spotPrice * 100).toFixed(4));
            if (priceImpactPct < 0) priceImpactPct = 0;
          }
        }
      } catch { /* non-fatal */ }

      return {
        success: true,
        output: {
          amountIn:       String(amountIn),
          amountOut:      amountOutStr,
          fee:            `${best.fee / 10000}%`,
          route:          [tIn.symbol, tOut.symbol],
          executionPrice: executionPrice.toFixed(6),
          price_impact:   priceImpactPct,   // % — null if not computable; >10% will be blocked by Maria
          gasEstimate:    best.gasEstimate.toString(),
          _mock:          false,
          _operation:     'uniswap_swap',
        },
      };
    } else {
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, chain, apiKey, tiers);
      if (!best) {
        return { success: false, error: `No Uniswap V3 pool found for ${tIn.symbol}→${tOut.symbol} on ${chain}.` };
      }
      const amountInStr    = formatUnits(best.amountIn, tIn.decimals);
      const executionPrice = Number(amountOut) / Number(amountInStr);

      let priceImpactPct: number | null = null;
      try {
        const oneUnit = 10n ** BigInt(tIn.decimals);
        const spot = await quoteExactIn(tIn.address, tOut.address, oneUnit, best.fee, chain, apiKey);
        if (spot) {
          const spotPrice = Number(formatUnits(spot.amountOut, tOut.decimals));
          if (spotPrice > 0) {
            priceImpactPct = Number(((spotPrice - executionPrice) / spotPrice * 100).toFixed(4));
            if (priceImpactPct < 0) priceImpactPct = 0;
          }
        }
      } catch { /* non-fatal */ }

      return {
        success: true,
        output: {
          amountIn:       amountInStr,
          amountOut:      String(amountOut),
          fee:            `${best.fee / 10000}%`,
          route:          [tIn.symbol, tOut.symbol],
          executionPrice: executionPrice.toFixed(6),
          price_impact:   priceImpactPct,
          gasEstimate:    best.gasEstimate.toString(),
          _mock:          false,
          _operation:     'uniswap_swap',
        },
      };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Uniswap Get Quote' };
  }
}

/**
 * Uniswap Build Transaction — server-side executor
 * Skill ID: 2384dbf7-10a3-4cf7-9935-62f345e38ebc
 *
 * Returns { transactions } array for SwapRouter02. Does NOT sign or broadcast.
 *
 * ETH input:  transactions = [swapTx]          (value = amountIn as msg.value)
 * ERC-20 input: transactions = [approveTx, swapTx]
 *   approveTx = approve(SwapRouter02, amount) on tokenIn contract
 *   swapTx    = exactInputSingle / exactOutputSingle calldata
 */
export async function executeUniswapBuildTx(input: any): Promise<SkillExecutionResult> {
  try {
    const {
      chain, tokenIn: rawIn, tokenOut: rawOut,
      amountIn, amountOut,
      sender, slippageBps = 50,
      alchemy_key,
    } = input ?? {};

    if (!chain || !ALCHEMY_URLS[chain]) {
      return { success: false, error: `Unsupported chain: "${chain}". Valid: ${Object.keys(ALCHEMY_URLS).join(', ')}` };
    }
    if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
      return { success: false, error: 'A valid "sender" address (0x...) is required.' };
    }
    if (!amountIn && !amountOut) {
      return { success: false, error: 'Provide either amountIn (exact-input) or amountOut (exact-output).' };
    }

    const apiKey = getApiKey(alchemy_key);
    const tIn  = await resolveToken(rawIn,  chain, apiKey);
    const tOut = await resolveToken(rawOut, chain, apiKey);
    const slip = BigInt(slippageBps);

    if (amountOut) {
      // ── Exact-output swap ──────────────────────────────────────────────
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, chain, apiKey);
      if (!best) {
        return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on ${chain}.` };
      }

      // amountInMaximum = quote * (1 + slippageBps / 10000)
      const amountInMax = best.amountIn * (10000n + slip) / 10000n;

      // SwapRouter02.exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))
      // Native-output: route to the router, then unwrapWETH9 sweeps the exact
      // amountOut of WETH → native to the user (atomic via multicall).
      const swapRecipient = tOut.isNative ? SWAP_ROUTER[chain] : sender;
      const exactOutputSingle = SEL.swapExactOutput
        + p32(tIn.address)  // tokenIn
        + p32(tOut.address) // tokenOut (WETH when out is native)
        + p32(best.fee)     // fee
        + p32(swapRecipient)// recipient (router when unwrapping, else user)
        + p32(amountOutRaw) // amountOut (exact)
        + p32(amountInMax)  // amountInMaximum
        + p32(0n);          // sqrtPriceLimitX96 = 0

      const calldata = tOut.isNative
        ? encodeMulticall([exactOutputSingle, encodeUnwrapWETH9(amountOutRaw, sender)])
        : exactOutputSingle;

      const value  = tIn.isNative ? '0x' + amountInMax.toString(16) : '0x0';
      const swapTx = {
        to: SWAP_ROUTER[chain], data: '0x' + calldata, value,
        description: `Swap at most ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for exactly ${amountOut} ${tOut.symbol} via Uniswap V3`,
      };

      let transactions;
      if (tIn.isNative) {
        transactions = [swapTx];
      } else {
        const allowance = await getAllowance(tIn.address, sender, SWAP_ROUTER[chain], chain, apiKey);
        transactions = [
          ...(allowance < amountInMax ? [{
            to: tIn.address,
            data: '0x095ea7b3' + p32(SWAP_ROUTER[chain]) + p32(amountInMax),
            value: '0x0',
            description: `Approve ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for Uniswap SwapRouter02`,
          }] : []),
          swapTx,
        ];
      }

      return {
        success: true,
        output: {
          transactions,
          amountOut:   String(amountOut),
          amountInMax: formatUnits(amountInMax, tIn.decimals),
          fee:         `${best.fee / 10000}%`,
          router:      'SwapRouter02',
        },
      };
    } else {
      // ── Exact-input swap ───────────────────────────────────────────────
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw, chain, apiKey);
      if (!best) {
        return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on ${chain}.` };
      }

      // amountOutMinimum = quote * (1 - slippageBps / 10000)
      const amountOutMin = best.amountOut * (10000n - slip) / 10000n;

      // SwapRouter02.exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
      // Native-output (tokenOut = ETH/native): swap recipient must be the router,
      // then unwrapWETH9 sweeps WETH → native to the user. Wrapped in multicall so
      // both run atomically. Otherwise the user would receive WETH, not native ETH.
      const swapRecipient = tOut.isNative ? SWAP_ROUTER[chain] : sender;
      const exactInputSingle = SEL.swapExactInput
        + p32(tIn.address)   // tokenIn
        + p32(tOut.address)  // tokenOut (WETH when out is native)
        + p32(best.fee)      // fee
        + p32(swapRecipient) // recipient (router when unwrapping, else user)
        + p32(amountInRaw)   // amountIn (exact)
        + p32(amountOutMin)  // amountOutMinimum
        + p32(0n);           // sqrtPriceLimitX96 = 0

      const calldata = tOut.isNative
        ? encodeMulticall([exactInputSingle, encodeUnwrapWETH9(amountOutMin, sender)])
        : exactInputSingle;

      const value  = tIn.isNative ? '0x' + amountInRaw.toString(16) : '0x0';
      const swapTx = {
        to: SWAP_ROUTER[chain], data: '0x' + calldata, value,
        description: `Swap ${amountIn} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via Uniswap V3`,
      };

      let transactions;
      if (tIn.isNative) {
        transactions = [swapTx];
      } else {
        const allowance = await getAllowance(tIn.address, sender, SWAP_ROUTER[chain], chain, apiKey);
        transactions = [
          ...(allowance < amountInRaw ? [{
            to: tIn.address,
            data: '0x095ea7b3' + p32(SWAP_ROUTER[chain]) + p32(amountInRaw),
            value: '0x0',
            description: `Approve ${amountIn} ${tIn.symbol} for Uniswap SwapRouter02`,
          }] : []),
          swapTx,
        ];
      }

      return {
        success: true,
        output: {
          transactions,
          amountIn:     String(amountIn),
          amountOutMin: formatUnits(amountOutMin, tOut.decimals),
          fee:          `${best.fee / 10000}%`,
          router:       'SwapRouter02',
        },
      };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Uniswap Build Transaction' };
  }
}
