/**
 * Official Skill: Agni Finance (agni.finance)
 *
 * Agni Finance is the leading concentrated-liquidity DEX on Mantle Network.
 * Uniswap V3 fork — same QuoterV2 ABI, Mantle (chain ID 5000) contracts.
 *
 * ⚠ Router note: Agni deploys the *original* Uniswap V3 SwapRouter (with a
 * `deadline` field), NOT SwapRouter02. exactInputSingle selector is 0x414bf389
 * and the params struct carries a deadline — unlike PancakeSwap's SmartRouter.
 *
 * Skill UUID: 7be7edc6-4553-42df-9474-9e849337892e
 *
 * Actions:
 *   get_quote      — best-price quote via QuoterV2 (tries all fee tiers)
 *   build_swap_tx  — build EVM transaction(s) for SwapRouter (approve + swap)
 *
 * Contracts on Mantle (chain ID 5000, verified on-chain 2026-06-15):
 *   Factory:     0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035
 *   QuoterV2:    0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb
 *   SwapRouter:  0x319B69888b0d11cEC22caA5034e25FfFBDc88421
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Mantle contracts (Agni Finance V3) ─────────────────────────────────────────
const SWAP_ROUTER = '0x319B69888b0d11cEC22caA5034e25FfFBDc88421';
const QUOTER_V2   = '0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb';

const CHAIN_ID = 5000;

// Fee tiers available on Agni V3 (verified live: 100/500/2500/10000 exist; 3000 does NOT)
const FEE_TIERS = [500, 2500, 100, 10000];

// ── Mantle token registry (verified on-chain) ──────────────────────────────────
// MNT is the native gas token (18 dec); WMNT is its ERC-20 wrapper.
// USDC/USDT are standard 6-decimal stablecoins on Mantle.
const MANTLE_TOKENS: Record<string, { address: string; decimals: number }> = {
  MNT:  { address: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8', decimals: 18 }, // WMNT (native wrapper)
  WMNT: { address: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8', decimals: 18 },
  USDC: { address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', decimals: 6  },
  USDT: { address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE', decimals: 6  },
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
      client  = targetUrl.protocol === 'http:' ? http : https;
      options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || 443,
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
          if (parsed.error) reject(new Error(`Mantle RPC error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`));
          else resolve(parsed.result);
        } catch { reject(new Error(`Mantle RPC parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Mantle RPC timeout')); });
    req.write(payload);
    req.end();
  });
}

function getMantleRpcUrl(): string {
  return process.env.MANTLE_RPC_URL || 'https://rpc.mantle.xyz';
}

async function ethCall(to: string, data: string): Promise<string> {
  const result = await rpcPost(getMantleRpcUrl(), {
    jsonrpc: '2.0', id: 1,
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
  return result ?? '0x';
}

// ── ABI encoding helpers ───────────────────────────────────────────────────────

const SEL = {
  quoteExactInput:  'c6a5026a', // QuoterV2.quoteExactInputSingle((tokenIn,tokenOut,amountIn,fee,sqrtPriceLimitX96))
  swapExactInput:   '414bf389', // SwapRouter.exactInputSingle((tokenIn,tokenOut,fee,recipient,deadline,amountIn,amountOutMinimum,sqrtPriceLimitX96))
  erc20Decimals:    '313ce567', // ERC20.decimals()
  erc20Allowance:   'dd62ed3e', // ERC20.allowance(owner, spender)
  erc20Approve:     '095ea7b3', // ERC20.approve(spender, amount)
};

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}

function readU256(hex: string, slot = 0): bigint {
  const s = slot * 64;
  const h = hex.replace('0x', '');
  return BigInt('0x' + (h.slice(s, s + 64) || '0'));
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
  isNative: boolean; // true for MNT (send as msg.value, swap via WMNT internally)
}

async function resolveToken(raw: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  const known = MANTLE_TOKENS[upper];

  if (known) {
    return { ...known, symbol: upper, isNative: upper === 'MNT' };
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(
      `Unknown token "${raw}" on Mantle. ` +
      `Supported symbols: ${Object.keys(MANTLE_TOKENS).join(', ')}. Or pass a full 0x contract address.`
    );
  }

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
    if (!hex || hex === '0'.repeat(hex.length)) return null;
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

async function getAllowance(token: string, owner: string, spender: string): Promise<bigint> {
  try { return readU256(await ethCall(token, '0x' + SEL.erc20Allowance + p32(owner) + p32(spender))); }
  catch { return 0n; }
}

// ── Skill executor ────────────────────────────────────────────────────────────

export async function executeAgniSkill(input: any): Promise<SkillExecutionResult> {
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
          return { success: false, error: 'amount_in is required (human-readable string, e.g. "1")' };
        }

        const tIn  = await resolveToken(token_in);
        const tOut = await resolveToken(token_out);

        const amountInRaw = parseUnits(String(amount_in), tIn.decimals);
        const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw);

        if (!best) {
          return {
            success: false,
            error: `No Agni V3 pool found for ${tIn.symbol}→${tOut.symbol} on Mantle. ` +
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
            gas_estimate: best.gasEstimate.toString(),
            chain:        'mantle',
            chain_id:     CHAIN_ID,
            _operation:   'agni_swap',
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
            error: `No Agni V3 pool found for ${tIn.symbol}→${tOut.symbol} on Mantle.`,
          };
        }

        // amountOutMinimum = quote * (1 - slippage)
        const slippageBps  = BigInt(Math.round(slippage * 10000));
        const amountOutMin = best.amountOut * (10000n - slippageBps) / 10000n;

        // deadline = now + 30 min (router enforces block.timestamp <= deadline)
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

        // SwapRouter.exactInputSingle params (original Uniswap V3 — WITH deadline)
        // (address tokenIn, address tokenOut, uint24 fee, address recipient,
        //  uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)
        const swapCalldata = '0x' + SEL.swapExactInput
          + p32(tIn.address)    // tokenIn  (WMNT addr even when paying native MNT)
          + p32(tOut.address)   // tokenOut
          + p32(best.fee)       // fee
          + p32(sender)         // recipient
          + p32(deadline)       // deadline
          + p32(amountInRaw)    // amountIn (exact)
          + p32(amountOutMin)   // amountOutMinimum
          + p32(0n);            // sqrtPriceLimitX96 = 0

        const valueHex = tIn.isNative
          ? '0x' + amountInRaw.toString(16)
          : '0x0';

        const amountOutEstimated = formatUnits(best.amountOut, tOut.decimals);

        const swapTx = {
          to:          SWAP_ROUTER,
          data:        swapCalldata,
          value:       valueHex,
          chain_id:    CHAIN_ID,
          description: `Swap ${amount_in} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via Agni Finance on Mantle`,
        };

        let transactions;
        if (tIn.isNative) {
          transactions = [swapTx];
        } else {
          const allowance = await getAllowance(tIn.address, sender, SWAP_ROUTER);
          transactions = [];
          if (allowance < amountInRaw) {
            transactions.push({
              to:          tIn.address,
              data:        '0x' + SEL.erc20Approve + p32(SWAP_ROUTER) + p32(amountInRaw),
              value:       '0x0',
              chain_id:    CHAIN_ID,
              description: `Approve ${amount_in} ${tIn.symbol} for Agni SwapRouter`,
            });
          }
          transactions.push(swapTx);
        }

        return {
          success: true,
          output: {
            transactions,
            amount_out_estimated: amountOutEstimated,
            amount_out_minimum:   formatUnits(amountOutMin, tOut.decimals),
            fee:                  `${best.fee / 10000}%`,
            router:               SWAP_ROUTER,
            chain:                'mantle',
            chain_id:             CHAIN_ID,
            _operation:           'agni_swap',
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
    return { success: false, error: err.message ?? 'Agni skill execution failed' };
  }
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const AGNI_SKILL_METADATA = {
  name: 'Agni Finance',
  description:
    'Agni Finance swap on Mantle Network (chain ID 5000, native gas MNT). ' +
    'Agni is the leading concentrated-liquidity DEX on Mantle (Uniswap V3 fork). ' +
    'Get best-price swap quotes via QuoterV2 (tries fee tiers 0.01%, 0.05%, 0.25%, 1%), ' +
    'and build ready-to-sign EVM swap transactions via the Agni SwapRouter. ' +
    'Only supports exact-input swaps (specify amount_in). Exact-output is NOT supported. ' +
    'Supports MNT (native), WMNT, USDC, USDT, and any ERC-20 on Mantle by address.\n\n' +
    'execution_mode: server-side\n' +
    'chain: mantle (id: 5000)\n' +
    'rpc: https://rpc.mantle.xyz\n' +
    'gas_token: MNT\n' +
    'sop_compliance:\n' +
    '  provides_quote: true\n' +
    '  returns_price_impact: true\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['agni', 'mantle', 'mnt', 'dex', 'swap', 'defi', 'evm', 'v3', 'clmm'],
  external_url: 'https://agni.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/agni-finance?w=48&h=48',
  partner_verified: false,
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
          'build_swap_tx: build approve + swap transaction(s) for the Agni SwapRouter. ' +
          'Both actions require amount_in (exact-input only; exact-output is not supported).',
      },
      token_in: {
        type: 'string',
        description: 'Input token symbol (MNT, WMNT, USDC, USDT) or ERC-20 contract address on Mantle.',
      },
      token_out: {
        type: 'string',
        description: 'Output token symbol or ERC-20 contract address on Mantle.',
      },
      amount_in: {
        type: 'string',
        description: 'Human-readable input amount, e.g. "1" for 1 USDC. Required. Exact-output (amount_out) is not supported.',
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
        enum: ['mantle'],
        description: 'Always "mantle". Agni Finance is deployed on Mantle Network (chain ID 5000).',
      },
    },
  },
  usage_examples: [
    { title: 'Quote 1 USDC → MNT', input: { action: 'get_quote', token_in: 'USDC', token_out: 'MNT', amount_in: '1' } },
    { title: 'Quote USDC → USDT', input: { action: 'get_quote', token_in: 'USDC', token_out: 'USDT', amount_in: '100' } },
    { title: 'Build swap MNT → USDC', input: { action: 'build_swap_tx', token_in: 'MNT', token_out: 'USDC', amount_in: '5', sender: '0xYourAddress' } },
  ],
};
