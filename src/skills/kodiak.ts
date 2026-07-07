/**
 * Kodiak Finance — Berachain's leading DEX (Uniswap V3-style CLMM)
 *
 * Kodiak is the native liquidity hub on Berachain, running a Uniswap V3 fork
 * (concentrated liquidity, CLMM) alongside V2 pools and "Kodiak Islands"
 * (managed liquidity). This skill provides read-only protocol/pool stats and
 * live V3 swap quotes + swap transaction building.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Berachain's public RPC directly. No API key needed.
 *
 * Contracts on Berachain (chain ID 80094) — VERIFIED on-chain 2026-07:
 *   UniswapV3Factory: 0xD84CBf0B02636E7f53dB9E5e45A616E05d710990  (getPool returns live pools)
 *   QuoterV2:         0x644C8D6E501f7C994B74F5ceA96abe65d0BA662B  (quoteExactInputSingle confirmed)
 *   SwapRouter02:     0xe301E48F77963D3F7DbD2a4796962Bd7f3867Fb4  (bytecode has 0x04e45aaf / 0x5023b4df, no-deadline)
 *   Source: https://documentation.kodiak.finance/overview/kodiak-contracts (cross-checked on-chain)
 *
 * Fee tiers present on Berachain: 100 (0.01%), 500 (0.05%), 3000 (0.3%), 10000 (1%).
 *
 * Data sources (region-safe): Berachain RPC + DefiLlama (yields/pools, coins).
 *
 * Actions: get_protocol_info, get_top_pools, get_quote, build_swap_tx
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Contracts (verified on-chain) ─────────────────────────────────────────────
const CONTRACTS = {
  factory:    '0xD84CBf0B02636E7f53dB9E5e45A616E05d710990',
  quoterV2:   '0x644C8D6E501f7C994B74F5ceA96abe65d0BA662B',
  swapRouter: '0xe301E48F77963D3F7DbD2a4796962Bd7f3867Fb4', // SwapRouter02 (no deadline)
} as const;

const DEFAULT_RPC = 'https://rpc.berachain.com';
const CHAIN_ID    = 80094;
const FEE_TIERS   = [100, 500, 3000, 10000];

function getRpcUrl(): string { return process.env.BERACHAIN_RPC_URL || DEFAULT_RPC; }

// ── Well-known Berachain tokens (verified via DefiLlama coins API) ─────────────
const TOKENS: Record<string, { address: string; decimals: number }> = {
  WBERA: { address: '0x6969696969696969696969696969696969696969', decimals: 18 },
  HONEY: { address: '0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce', decimals: 18 },
  USDC:  { address: '0x549943e04f40284185054145c6E4e9568C1D3241', decimals: 6  }, // USDC.e
  USDT:  { address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', decimals: 6  }, // USDT0
  WETH:  { address: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590', decimals: 18 },
  WBTC:  { address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8  },
  IBGT:  { address: '0xac03CABA51e17c86c921E1f6CBFBdC91F8BB2E6b', decimals: 18 },
  IBERA: { address: '0x9b6761bf2397Bb5a6624a856cC84A3A14DcD3fe5', decimals: 18 },
  BYUSD: { address: '0x688e72142674041f8f6Af4c808a4045cA1D6aC82', decimals: 6  },
};

// ── ABI selectors ─────────────────────────────────────────────────────────────
const SEL = {
  quoteExactInput:  'c6a5026a', // QuoterV2.quoteExactInputSingle((address,address,uint256,uint24,uint160))
  quoteExactOutput: 'bd21704a', // QuoterV2.quoteExactOutputSingle
  swapExactInput:   '04e45aaf', // SwapRouter02.exactInputSingle (no deadline)
  swapExactOutput:  '5023b4df', // SwapRouter02.exactOutputSingle (no deadline)
  getPool:          '1698ee82', // V3Factory.getPool(address,address,uint24)
  erc20Decimals:    '313ce567',
  erc20Allowance:   'dd62ed3e',
} as const;

// ── Low-level JSON-RPC (proxy-aware) ──────────────────────────────────────────
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
          if (parsed.error) reject(new Error(`Berachain RPC error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`));
          else resolve(parsed.result);
        } catch { reject(new Error(`Berachain RPC parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Berachain RPC timeout')); });
    req.write(payload);
    req.end();
  });
}
async function ethCall(to: string, data: string): Promise<string> {
  const r = await rpcPost({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] });
  return (r as string) ?? '0x';
}

// DefiLlama fetch (global fetch, region-safe).
async function llamaGet<T = any>(host: string, path: string): Promise<T> {
  const res = await fetch(`${host}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`DefiLlama ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Utility helpers ───────────────────────────────────────────────────────────
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
const isAddr = (s: unknown): s is string => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);

interface TokenInfo { address: string; decimals: number; symbol: string }
async function resolveToken(raw: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  if (TOKENS[upper]) return { ...TOKENS[upper], symbol: upper };
  if (!isAddr(raw)) throw new Error(`Unknown token "${raw}". Use a symbol (${Object.keys(TOKENS).join(', ')}) or a 0x address.`);
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
export const KODIAK_SKILL_METADATA = {
  name: 'Kodiak Finance (Berachain DEX)',
  description:
    "[ARSENAL-HOSTED ✓] Swap on Kodiak Finance, Berachain's leading DEX (Uniswap V3-style concentrated liquidity, " +
    'chain ID 80094, native gas BERA). Read protocol/pool stats, get live quotes from QuoterV2, and build swap ' +
    'transactions via SwapRouter02 for WBERA, HONEY, USDC, USDT, WETH, WBTC, iBGT, iBERA and any ERC-20 on Berachain.\n\n' +
    'execution_mode: server-side\n' +
    'chain: berachain (id: 80094)\n' +
    'rpc: https://rpc.berachain.com\n' +
    'gas_token: BERA\n' +
    'sop_compliance:\n' +
    '  provides_quote: true\n' +
    '  returns_price_impact: true\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['kodiak', 'berachain', 'dex', 'swap', 'defi', 'evm', 'v3', 'clmm', 'bera'],
  external_url: 'https://app.kodiak.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/kodiak?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_top_pools', 'get_quote', 'build_swap_tx'],
        description:
          'get_protocol_info: Kodiak overview, verified contract addresses, and fee tiers. ' +
          'get_top_pools: top Kodiak pools on Berachain by TVL with APY (via DefiLlama). ' +
          'get_quote: live swap quote from QuoterV2 — returns amountOut/amountIn and price impact. ' +
          'build_swap_tx: build unsigned swap calldata via SwapRouter02 — returns transactions array (approve + swap).',
      },
      tokenIn:     { type: 'string', description: 'Input token symbol (WBERA, HONEY, USDC, USDT, WETH, WBTC, IBGT, IBERA, BYUSD) or 0x address.' },
      tokenOut:    { type: 'string', description: 'Output token symbol or 0x address.' },
      amountIn:    { type: 'string', description: 'Exact input amount in human-readable units (e.g. "10" for 10 WBERA).' },
      amountOut:   { type: 'string', description: 'Exact output amount for exact-output mode.' },
      sender:      { type: 'string', description: 'Wallet address (0x…). Required for build_swap_tx.' },
      slippageBps: { type: 'number', description: 'Slippage tolerance in basis points (default: 50 = 0.5%).' },
      feeTier:     { type: 'number', enum: [100, 500, 3000, 10000], description: 'Specific fee tier in bps. If omitted, best tier is selected automatically.' },
      limit:       { type: 'number', description: 'Max pools to return for get_top_pools (default 10).' },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'Top pools', input: { action: 'get_top_pools', limit: 5 } },
    { title: 'Quote WBERA → HONEY', input: { action: 'get_quote', tokenIn: 'WBERA', tokenOut: 'HONEY', amountIn: '10' } },
    { title: 'Build swap', input: { action: 'build_swap_tx', tokenIn: 'WBERA', tokenOut: 'HONEY', amountIn: '5', sender: '0xYourAddress' } },
  ],
};

// ── Action handlers ───────────────────────────────────────────────────────────

async function getProtocolInfo(): Promise<SkillExecutionResult> {
  let tvl: number | null = null;
  try {
    const p = await llamaGet<any>('https://api.llama.fi', '/protocol/kodiak-v3');
    tvl = p?.currentChainTvls?.Berachain ?? (typeof p?.tvl === 'number' ? p.tvl : null);
  } catch { /* non-fatal */ }
  return {
    success: true,
    output: {
      name: 'Kodiak Finance',
      tagline: "Berachain's native liquidity hub",
      type: 'DEX (Uniswap V3-style CLMM + V2 + Kodiak Islands)',
      chain: 'berachain', chain_id: CHAIN_ID,
      website: 'https://kodiak.finance',
      app: 'https://app.kodiak.finance',
      contracts: CONTRACTS,
      fee_tiers_bps: FEE_TIERS,
      v3_tvl_usd: tvl,
      well_known_tokens: TOKENS,
      available_actions: [
        'get_protocol_info — this overview',
        'get_top_pools — top Kodiak pools by TVL/APY (DefiLlama)',
        'get_quote — live V3 swap quote',
        'build_swap_tx — build V3 swap transaction (approve + swap)',
      ],
      note: 'Contract addresses verified on-chain against the Berachain RPC (factory getPool + QuoterV2 quote + SwapRouter02 selectors).',
    },
  };
}

async function getTopPools(input: any): Promise<SkillExecutionResult> {
  const limit = Math.max(1, Math.min(50, Number(input.limit) || 10));
  try {
    const resp = await llamaGet<{ data: any[] }>('https://yields.llama.fi', '/pools');
    const pools = (resp.data ?? [])
      .filter((p) => p.chain === 'Berachain' && String(p.project ?? '').toLowerCase().includes('kodiak'))
      .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .slice(0, limit)
      .map((p) => ({
        pool_id: p.pool, symbol: p.symbol, project: p.project,
        tvl_usd: p.tvlUsd, apy: p.apy, apy_base: p.apyBase, apy_reward: p.apyReward,
        il_risk: p.ilRisk,
      }));

    if (pools.length > 0) {
      return {
        success: true,
        output: {
          protocol: 'Kodiak Finance', chain: 'berachain', pools, count: pools.length,
          data_source: 'DefiLlama Yields API',
          note: 'APYs may lag real-time by up to 1 hour.',
        },
      };
    }

    // DefiLlama Yields does not index individual Kodiak pools. Fall back to the
    // per-product TVL breakdown (Kodiak V3 / V2 / Islands) so callers still get
    // real, live liquidity figures instead of an empty list.
    const slugs = [
      { slug: 'kodiak-v3', label: 'Kodiak V3 (CLMM)' },
      { slug: 'kodiak-v2', label: 'Kodiak V2' },
      { slug: 'kodiak-islands', label: 'Kodiak Islands (managed LP)' },
    ];
    const breakdown = await Promise.all(slugs.map(async ({ slug, label }) => {
      try {
        const p = await llamaGet<any>('https://api.llama.fi', `/protocol/${slug}`);
        const tvl = p?.currentChainTvls?.Berachain ?? (typeof p?.tvl === 'number' ? p.tvl : null);
        return { product: label, slug, tvl_usd: tvl };
      } catch { return { product: label, slug, tvl_usd: null }; }
    }));
    breakdown.sort((a, b) => (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0));
    const totalTvl = breakdown.reduce((s, b) => s + (b.tvl_usd ?? 0), 0);

    return {
      success: true,
      output: {
        protocol: 'Kodiak Finance', chain: 'berachain',
        pools: [], count: 0,
        tvl_breakdown: breakdown,
        total_tvl_usd: totalTvl || null,
        data_source: 'DefiLlama Protocol TVL',
        note: 'DefiLlama Yields does not index individual Kodiak pools; returning per-product TVL (V3/V2/Islands) instead. Use get_quote for live pair pricing.',
      },
    };
  } catch (err: any) { return { success: false, error: `get_top_pools failed: ${err.message}` }; }
}

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
      if (!best) return { success: false, error: `No Kodiak V3 pool found for ${tIn.symbol}→${tOut.symbol} on Berachain.` };
      const amountOutStr = formatUnits(best.amountOut, tOut.decimals);
      const execPrice = Number(amountOutStr) / Number(amountIn);
      let priceImpactPct: number | null = null;
      try {
        const spot = await quoteExactIn(tIn.address, tOut.address, 10n ** BigInt(tIn.decimals), best.fee);
        if (spot) { const sp = Number(formatUnits(spot.amountOut, tOut.decimals)); if (sp > 0) priceImpactPct = Math.max(0, Number(((sp - execPrice) / sp * 100).toFixed(4))); }
      } catch { /* non-fatal */ }
      return { success: true, output: { amountIn: String(amountIn), amountOut: amountOutStr, fee: `${best.fee / 10000}%`, route: [tIn.symbol, tOut.symbol], executionPrice: execPrice.toFixed(6), price_impact: priceImpactPct, gasEstimate: best.gasEstimate.toString(), chain: 'berachain', chain_id: CHAIN_ID, _operation: 'kodiak_v3_swap' } };
    } else {
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, tiers);
      if (!best) return { success: false, error: `No Kodiak V3 pool found for ${tIn.symbol}→${tOut.symbol} on Berachain.` };
      const amountInStr = formatUnits(best.amountIn, tIn.decimals);
      const execPrice = Number(amountOut) / Number(amountInStr);
      return { success: true, output: { amountIn: amountInStr, amountOut: String(amountOut), fee: `${best.fee / 10000}%`, route: [tIn.symbol, tOut.symbol], executionPrice: execPrice.toFixed(6), gasEstimate: best.gasEstimate.toString(), chain: 'berachain', chain_id: CHAIN_ID, _operation: 'kodiak_v3_swap' } };
    }
  } catch (err: any) { return { success: false, error: `get_quote failed: ${err.message}` }; }
}

async function buildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { tokenIn: rawIn, tokenOut: rawOut, amountIn, amountOut, sender, slippageBps = 50, feeTier } = input;
  if (!rawIn || !rawOut) return { success: false, error: 'tokenIn and tokenOut are required.' };
  if (!isAddr(sender)) return { success: false, error: 'A valid sender address (0x…) is required.' };
  if (!amountIn && !amountOut) return { success: false, error: 'Provide amountIn or amountOut.' };
  try {
    const tIn = await resolveToken(rawIn);
    const tOut = await resolveToken(rawOut);
    const slip = BigInt(slippageBps);
    const tiers = feeTier ? [Number(feeTier)] : FEE_TIERS;

    if (amountOut) {
      const amountOutRaw = parseUnits(String(amountOut), tOut.decimals);
      const best = await bestQuoteOut(tIn.address, tOut.address, amountOutRaw, tiers);
      if (!best) return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on Berachain.` };
      const amountInMax = best.amountIn * (10000n + slip) / 10000n;
      const calldata = SEL.swapExactOutput + p32(tIn.address) + p32(tOut.address) + p32(best.fee) + p32(sender) + p32(amountOutRaw) + p32(amountInMax) + p32(0n);
      const swapTx = { to: CONTRACTS.swapRouter, data: '0x' + calldata, value: '0x0', chain_id: CHAIN_ID, description: `Swap at most ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for exactly ${amountOut} ${tOut.symbol} via Kodiak V3 on Berachain` };
      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.swapRouter);
      const transactions = [
        ...(allowance < amountInMax ? [{ to: tIn.address, data: '0x095ea7b3' + p32(CONTRACTS.swapRouter) + p32(amountInMax), value: '0x0', chain_id: CHAIN_ID, description: `Approve ${formatUnits(amountInMax, tIn.decimals)} ${tIn.symbol} for Kodiak SwapRouter02` }] : []),
        swapTx,
      ];
      return { success: true, output: { transactions, amountOut: String(amountOut), amountInMax: formatUnits(amountInMax, tIn.decimals), fee: `${best.fee / 10000}%`, chain: 'berachain', chain_id: CHAIN_ID, _operation: 'kodiak_v3_swap' } };
    } else {
      const amountInRaw = parseUnits(String(amountIn), tIn.decimals);
      const best = await bestQuoteIn(tIn.address, tOut.address, amountInRaw, tiers);
      if (!best) return { success: false, error: `No pool found for ${tIn.symbol}→${tOut.symbol} on Berachain.` };
      const amountOutMin = best.amountOut * (10000n - slip) / 10000n;
      const calldata = SEL.swapExactInput + p32(tIn.address) + p32(tOut.address) + p32(best.fee) + p32(sender) + p32(amountInRaw) + p32(amountOutMin) + p32(0n);
      const swapTx = { to: CONTRACTS.swapRouter, data: '0x' + calldata, value: '0x0', chain_id: CHAIN_ID, description: `Swap exactly ${amountIn} ${tIn.symbol} for at least ${formatUnits(amountOutMin, tOut.decimals)} ${tOut.symbol} via Kodiak V3 on Berachain` };
      const allowance = await getAllowance(tIn.address, sender, CONTRACTS.swapRouter);
      const transactions = [
        ...(allowance < amountInRaw ? [{ to: tIn.address, data: '0x095ea7b3' + p32(CONTRACTS.swapRouter) + p32(amountInRaw), value: '0x0', chain_id: CHAIN_ID, description: `Approve ${amountIn} ${tIn.symbol} for Kodiak SwapRouter02` }] : []),
        swapTx,
      ];
      return { success: true, output: { transactions, amountIn: String(amountIn), amountOutMin: formatUnits(amountOutMin, tOut.decimals), fee: `${best.fee / 10000}%`, chain: 'berachain', chain_id: CHAIN_ID, _operation: 'kodiak_v3_swap' } };
    }
  } catch (err: any) { return { success: false, error: `build_swap_tx failed: ${err.message}` }; }
}

// ── Main executor ─────────────────────────────────────────────────────────────
export async function executeKodiakSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'get_protocol_info': return getProtocolInfo();
    case 'get_top_pools':     return getTopPools(input);
    case 'get_quote':         return getQuote(input);
    case 'build_swap_tx':     return buildSwapTx(input);
    default:
      return { success: false, error: `Unknown action "${action}". Valid: get_protocol_info, get_top_pools, get_quote, build_swap_tx` };
  }
}
