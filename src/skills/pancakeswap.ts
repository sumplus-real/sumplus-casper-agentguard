/**
 * Official Skill: PancakeSwap V3 (pancakeswap.finance)
 *
 * PancakeSwap V3 is the leading DEX on BNB Smart Chain (BSC).
 * Concentrated liquidity AMM, forked from Uniswap V3 — same ABI, BSC contracts.
 *
 * Skill UUID: d5a3f2b1-9c4e-4d07-8b5a-1e3c2f6d9a70
 *
 * Actions:
 *   get_quote      — best-price quote via QuoterV2 (tries all fee tiers)
 *   build_swap_tx  — build EVM transaction(s) for SmartRouter (approve + swap)
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── BSC contracts (PancakeSwap V3) ────────────────────────────────────────────
const SMART_ROUTER = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4';
const QUOTER_V2    = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';

// Fee tiers available on PancakeSwap V3 (same as Uniswap V3)
const FEE_TIERS = [500, 2500, 100, 10000]; // try 0.05% first (most liquid for BNB pairs)

// ── BSC token registry ────────────────────────────────────────────────────────
// ⚠ BSC note: most stablecoins (USDC, USDT, BUSD) have 18 decimals on BSC,
// unlike their Ethereum counterparts (6 decimals). WBTC equivalent (BTCB) has 18.
const BSC_TOKENS: Record<string, { address: string; decimals: number }> = {
  BNB:   { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 }, // WBNB (native)
  WBNB:  { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
  USDC:  { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 }, // Binance-Peg USDC
  USDT:  { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }, // Binance-Peg USDT
  BUSD:  { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 },
  ETH:   { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 }, // Binance-Peg ETH
  BTCB:  { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 }, // Binance-Peg BTC
  CAKE:  { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18 },
};

// ── RPC helper (node https, proxy-aware) ──────────────────────────────────────

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
        path: targetUrl.pathname + targetUrl.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 20000,
        family: 4,
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

function getBscRpcUrl(): string {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  // Alchemy BSC endpoint (if key available), fallback to public BSC RPC
  if (alchemyKey) return `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  return 'https://bsc-dataseed1.binance.org';
}

async function ethCall(to: string, data: string): Promise<string> {
  const result = await rpcPost(getBscRpcUrl(), {
    jsonrpc: '2.0', id: 1,
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
  return result ?? '0x';
}


// ── ABI encoding helpers (same as uniswap.ts) ─────────────────────────────────

// Precomputed selectors — PancakeSwap V3 uses identical ABI to Uniswap V3
const SEL = {
  quoteExactInput:  'c6a5026a', // QuoterV2.quoteExactInputSingle
  swapExactInput:   '04e45aaf', // SmartRouter.exactInputSingle
  unwrapWETH9:      '49404b7c', // SmartRouter.unwrapWETH9(uint256 amountMinimum, address recipient)
  multicall:        'ac9650d8', // SmartRouter.multicall(bytes[] data)
  erc20Decimals:    '313ce567', // ERC20.decimals()
  erc20Allowance:   'dd62ed3e', // ERC20.allowance(owner, spender)
  erc20Approve:     '095ea7b3', // ERC20.approve(spender, amount)
};

/** unwrapWETH9(uint256 amountMinimum, address recipient) — router sweeps its WBNB → native BNB to recipient. */
function encodeUnwrapWETH9(amountMin: bigint, recipient: string): string {
  return SEL.unwrapWETH9 + p32(amountMin) + p32(recipient);
}

/**
 * Encode multicall(bytes[] data).
 * Layout: selector | offset(0x20) | length | offsets[]× | (length+data)× …
 * Per-element offsets are relative to the start of the bytes[] body (right after
 * the length word), per the Solidity ABI spec. Calldatas are passed WITHOUT 0x.
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

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}

function readU256(hex: string, slot = 0): bigint {
  const s = slot * 64;
  return BigInt('0x' + hex.replace('0x', '').slice(s, s + 64));
}

function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * (10n ** BigInt(decimals))
       + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
}

function formatUnits(value: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const frac  = value % divisor;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

// ── Token resolution ──────────────────────────────────────────────────────────

interface TokenInfo {
  address:  string;
  decimals: number;
  symbol:   string;
  isNative: boolean; // true for BNB (send as msg.value)
}

async function resolveToken(raw: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  const known = BSC_TOKENS[upper];

  if (known) {
    return { ...known, symbol: upper, isNative: upper === 'BNB' };
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(
      `Unknown token "${raw}" on BSC. ` +
      `Supported symbols: ${Object.keys(BSC_TOKENS).join(', ')}. Or pass a full 0x contract address.`
    );
  }

  // Fetch decimals from on-chain ERC20
  const result = await ethCall(raw, '0x' + SEL.erc20Decimals);
  const decimals = Number(readU256(result));
  return { address: raw, decimals, symbol: raw.slice(0, 8) + '…', isNative: false };
}

// ── QuoterV2 ─────────────────────────────────────────────────────────────────

async function quoteExactIn(
  tokenIn: string, tokenOut: string, amountIn: bigint, fee: number,
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  const data = '0x' + SEL.quoteExactInput + p32(tokenIn) + p32(tokenOut) + p32(amountIn) + p32(fee) + p32(0n);
  try {
    const hex = (await ethCall(QUOTER_V2, data)).replace('0x', '');
    if (!hex) return null;
    return { amountOut: readU256(hex, 0), gasEstimate: readU256(hex, 3) };
  } catch { return null; }
}

async function bestQuoteIn(
  tokenIn: string, tokenOut: string, amountIn: bigint,
): Promise<{ amountOut: bigint; gasEstimate: bigint; fee: number } | null> {
  let best: { amountOut: bigint; gasEstimate: bigint; fee: number } | null = null;
  for (const fee of FEE_TIERS) {
    const q = await quoteExactIn(tokenIn, tokenOut, amountIn, fee);
    if (q && (!best || q.amountOut > best.amountOut)) best = { ...q, fee };
  }
  return best;
}

// ── Skill executor ────────────────────────────────────────────────────────────

export async function executePancakeSwapSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {

      // ── get_quote ──────────────────────────────────────────────────────────
      case 'get_quote': {
        const { token_in, token_out, amount_in } = input;

        if (!token_in || !token_out) {
          return { success: false, error: 'token_in and token_out are required' };
        }
        if (!amount_in) {
          return { success: false, error: 'amount_in is required (human-readable string, e.g. "0.1")' };
        }

        const tIn  = await resolveToken(token_in);
        const tOut = await resolveToken(token_out);

        const amountInRaw = parseUnits(String(amount_in), tIn.decimals);
        const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw);

        if (!best) {
          return {
            success: false,
            error: `No PancakeSwap V3 pool found for ${tIn.symbol}→${tOut.symbol} on BSC. ` +
                   `Tried fee tiers: ${FEE_TIERS.map(f => f/10000+'%').join(', ')}.`,
          };
        }

        const amountOutStr = formatUnits(best.amountOut, tOut.decimals);

        // Price impact: compare execution price vs 1-unit spot price at same fee tier
        let priceImpact = 0;
        try {
          const oneUnit   = 10n ** BigInt(tIn.decimals);
          const spotQuote = await quoteExactIn(tIn.address, tOut.address, oneUnit, best.fee);
          if (spotQuote) {
            const spotPrice = Number(formatUnits(spotQuote.amountOut, tOut.decimals));
            const execPrice = Number(amountOutStr) / Number(amount_in);
            if (spotPrice > 0) {
              priceImpact = Math.max(0, (spotPrice - execPrice) / spotPrice);
            }
          }
        } catch { /* non-fatal */ }

        return {
          success: true,
          output: {
            amount_in:    String(amount_in),
            amount_out:   amountOutStr,
            price_impact: parseFloat(priceImpact.toFixed(6)),  // 0–1, not %
            fee:          `${best.fee / 10000}%`,
            route:        [tIn.symbol, tOut.symbol],
            token_in:     tIn.symbol,
            token_out:    tOut.symbol,
            chain:        'bsc',
            _operation:   'pancakeswap_swap',
          },
        };
      }

      // ── build_swap_tx ──────────────────────────────────────────────────────
      case 'build_swap_tx': {
        const { token_in, token_out, amount_in, sender, slippage = 0.01 } = input;

        if (!token_in || !token_out) {
          return { success: false, error: 'token_in and token_out are required' };
        }
        if (!amount_in) {
          return { success: false, error: 'amount_in is required' };
        }
        if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
          return { success: false, error: 'sender must be a valid 0x EVM address' };
        }

        const tIn  = await resolveToken(token_in);
        const tOut = await resolveToken(token_out);

        const amountInRaw = parseUnits(String(amount_in), tIn.decimals);
        const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw);

        if (!best) {
          return {
            success: false,
            error: `No PancakeSwap V3 pool found for ${tIn.symbol}→${tOut.symbol} on BSC.`,
          };
        }

        // amountOutMinimum = quote * (1 - slippage)
        const slippageBps  = BigInt(Math.round(slippage * 10000));
        const amountOutMin = best.amountOut * (10000n - slippageBps) / 10000n;

        // SmartRouter.exactInputSingle params (identical to Uniswap V3 SwapRouter02)
        // (address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)
        //
        // Native-output (token_out = BNB): the router swaps into WBNB. For the user
        // to receive native BNB (not the wrapped token), the swap's recipient must
        // be the router itself, then unwrapWETH9 sweeps WBNB → BNB to the user. We
        // wrap both calls in multicall so they execute atomically in one tx.
        const swapRecipient = tOut.isNative ? SMART_ROUTER : sender;
        const exactInputSingle = SEL.swapExactInput
          + p32(tIn.address)       // tokenIn
          + p32(tOut.address)      // tokenOut (WBNB when out is native)
          + p32(best.fee)          // fee
          + p32(swapRecipient)     // recipient (router when unwrapping, else user)
          + p32(amountInRaw)       // amountIn (exact)
          + p32(amountOutMin)      // amountOutMinimum
          + p32(0n);               // sqrtPriceLimitX96 = 0

        const swapCalldata = tOut.isNative
          ? '0x' + encodeMulticall([exactInputSingle, encodeUnwrapWETH9(amountOutMin, sender)])
          : '0x' + exactInputSingle;

        const valueHex = tIn.isNative
          ? '0x' + amountInRaw.toString(16)
          : '0x0';

        const amountOutEstimatedEarly = formatUnits(best.amountOut, tOut.decimals);

        const swapTx = {
          to:          SMART_ROUTER,
          data:        swapCalldata,
          value:       valueHex,
          description: `Swap ${amount_in} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via PancakeSwap V3`,
        };

        let transactions;
        if (tIn.isNative) {
          transactions = [swapTx];
        } else {
          // Check existing allowance; prepend approve tx only if needed
          const allowanceHex = await ethCall(
            tIn.address,
            '0x' + SEL.erc20Allowance + p32(sender) + p32(SMART_ROUTER),
          );
          const allowance = readU256(allowanceHex);

          transactions = [];
          if (allowance < amountInRaw) {
            transactions.push({
              to:          tIn.address,
              data:        '0x' + SEL.erc20Approve + p32(SMART_ROUTER) + p32(amountInRaw),
              value:       '0x0',
              description: `Approve ${amount_in} ${tIn.symbol} for PancakeSwap SmartRouter`,
            });
          }
          transactions.push(swapTx);
        }

        const amountOutEstimated = amountOutEstimatedEarly;

        return {
          success: true,
          output: {
            transactions,
            amount_out_estimated: amountOutEstimated,
            amount_out_minimum:   formatUnits(amountOutMin, tOut.decimals),
            fee:                  `${best.fee / 10000}%`,
            router:               SMART_ROUTER,
            chain:                'bsc',
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported: get_quote, build_swap_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'PancakeSwap skill execution failed' };
  }
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const PANCAKESWAP_SKILL_METADATA = {
  name: 'PancakeSwap V3',
  description:
    'PancakeSwap V3 swap on BSC (BNB Smart Chain). ' +
    'Get best-price swap quotes via QuoterV2 (tries all fee tiers: 0.01%, 0.05%, 0.25%, 1%), ' +
    'and build ready-to-sign EVM swap transactions via PancakeSwap SmartRouter. ' +
    'Only supports exact-input swaps (specify amount_in). Exact-output (amount_out) is NOT supported. ' +
    'Supports BNB (native), USDC, USDT, BUSD, BTCB, ETH, CAKE, and any BEP-20 by address.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['pancakeswap', 'bsc', 'bnb', 'dex', 'swap', 'defi', 'evm', 'v3', 'clmm'],
  external_url: 'https://pancakeswap.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/pancakeswap?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'build_swap_tx'],
        description:
          'get_quote: live best-price quote via QuoterV2 (no gas). ' +
          'build_swap_tx: build approve + swap transaction(s) for SmartRouter. ' +
          'Both actions require amount_in (exact-input only; exact-output is not supported).',
      },
      token_in: {
        type: 'string',
        description: 'Input token symbol (BNB, USDC, USDT, BUSD, ETH, BTCB, CAKE) or BEP-20 contract address.',
      },
      token_out: {
        type: 'string',
        description: 'Output token symbol or BEP-20 contract address.',
      },
      amount_in: {
        type: 'string',
        description: 'Human-readable input amount, e.g. "0.1" for 0.1 BNB. Required. Exact-output (amount_out) is not supported.',
      },
      sender: {
        type: 'string',
        description: 'EVM wallet address (0x...). Required for build_swap_tx.',
      },
      slippage: {
        type: 'number',
        description: 'Max slippage as decimal (e.g. 0.01 = 1%). Default: 0.01. Used in build_swap_tx.',
      },
      chain: {
        type: 'string',
        enum: ['bsc'],
        description: 'Always "bsc". PancakeSwap V3 is deployed on BNB Smart Chain (chain ID 56).',
      },
    },
  },
};
