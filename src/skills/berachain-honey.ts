/**
 * Honey (Berachain stablecoin) + BEX (native DEX) — read-only stats
 *
 * Honey is Berachain's native, overcollateralized stablecoin, soft-pegged to
 * USD and minted against approved collateral (e.g. USDC, BYUSD, USDT) through
 * the Berachain "Honey" module. BEX is Berachain's native weighted-pool AMM
 * (the swap venue on hub.berachain.com).
 *
 * This skill is read-only.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Berachain's public RPC + DefiLlama directly. No API key needed.
 *
 * Verified 2026-07:
 *   HONEY token: 0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce (18 dec, ~$1.00)
 *     - on-chain totalSupply() [0x18160ddd]
 *   DefiLlama stablecoins: Honey pegged-asset id 231 (peggedUSD circulating)
 *   DefiLlama protocol: bex (Berachain DEX) TVL + yield pools
 *
 * Actions: get_protocol_info, get_honey_stats, get_bex_stats
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Constants ───────────────────────────────────────────────────────────────
const CHAIN_ID    = 80094;
const DEFAULT_RPC = 'https://rpc.berachain.com';
const HONEY       = '0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce';
const HONEY_STABLECOIN_ID = '231'; // DefiLlama pegged-asset id
const BEX_SLUG    = 'bex';

function getRpcUrl(): string { return process.env.BERACHAIN_RPC_URL || DEFAULT_RPC; }

const SEL = { totalSupply: '18160ddd' } as const;

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
async function llamaGet<T = any>(host: string, path: string): Promise<T> {
  const res = await fetch(`${host}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`DefiLlama ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Utility helpers ───────────────────────────────────────────────────────────
function readU256(hex: string, slot = 0): bigint {
  const h = (hex || '').replace('0x', '');
  return BigInt('0x' + (h.slice(slot * 64, slot * 64 + 64) || '0'));
}
function formatUnits(value: bigint, decimals = 18): string {
  const d = 10n ** BigInt(decimals);
  const whole = value / d, frac = value % d;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}
function fmtUsd(n: number | null): string | null {
  if (n == null) return null;
  return n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${n.toFixed(0)}`;
}

// ── Skill metadata ────────────────────────────────────────────────────────────
export const HONEY_SKILL_METADATA = {
  name: 'Honey Stablecoin & BEX (Berachain)',
  description:
    '[ARSENAL-HOSTED ✓] Read-only stats for Honey, Berachain\'s native overcollateralized USD stablecoin ' +
    '(chain ID 80094), and BEX, Berachain\'s native weighted-pool DEX. Read Honey supply/circulating/peg and TVL, ' +
    'plus BEX TVL and top pool APYs. Honey supply is read on-chain (totalSupply); circulating, peg and TVL come ' +
    'from DefiLlama.\n\n' +
    'execution_mode: server-side\n' +
    'chain: berachain (id: 80094)\n' +
    'rpc: https://rpc.berachain.com\n' +
    'gas_token: BERA\n' +
    'sop_compliance:\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['honey', 'berachain', 'stablecoin', 'bex', 'dex', 'defi', 'bera', 'usd'],
  external_url: 'https://hub.berachain.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/bex?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_honey_stats', 'get_bex_stats'],
        description:
          'get_protocol_info: overview of Honey (native overcollateralized stablecoin) and BEX (native DEX). ' +
          'get_honey_stats: Honey on-chain totalSupply, DefiLlama circulating supply, current peg/price, and TVL. ' +
          'get_bex_stats: BEX TVL and top pools by TVL with APY (via DefiLlama).',
      },
      limit: { type: 'number', description: 'Max pools to return for get_bex_stats (default 10).' },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'Honey stats', input: { action: 'get_honey_stats' } },
    { title: 'BEX stats', input: { action: 'get_bex_stats', limit: 5 } },
  ],
};

// ── Action handlers ───────────────────────────────────────────────────────────

async function getProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      chain: 'berachain', chain_id: CHAIN_ID,
      honey: {
        name: 'Honey',
        type: 'Native overcollateralized USD stablecoin',
        address: HONEY, decimals: 18,
        peg: 'USD (soft peg, ~$1.00)',
        description: 'Honey is minted against approved collateral (e.g. USDC, BYUSD) through Berachain\'s native Honey module and redeemable back to collateral.',
        app: 'https://hub.berachain.com',
      },
      bex: {
        name: 'BEX',
        type: 'Native DEX (weighted-pool AMM)',
        description: 'BEX is Berachain\'s native automated market maker; the default swap venue on the Berachain hub.',
        app: 'https://hub.berachain.com/swap/',
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_honey_stats — Honey supply, circulating, peg, TVL',
        'get_bex_stats — BEX TVL + top pools (DefiLlama)',
      ],
    },
  };
}

async function getHoneyStats(): Promise<SkillExecutionResult> {
  const [supplyRes, stableRes] = await Promise.allSettled([
    ethCall(HONEY, '0x' + SEL.totalSupply),
    llamaGet<any>('https://stablecoins.llama.fi', `/stablecoin/${HONEY_STABLECOIN_ID}`),
  ]);

  let onchainSupply: number | null = null;
  let supplyError: string | null = null;
  if (supplyRes.status === 'fulfilled') {
    const raw = readU256(supplyRes.value);
    onchainSupply = raw > 0n ? Number(formatUnits(raw)) : null;
  } else supplyError = (supplyRes.reason as Error)?.message ?? 'totalSupply read failed';

  let circulating: number | null = null;
  let price: number | null = null;
  let name: string | null = null;
  let chainCirculating: Record<string, number> | null = null;
  let stableError: string | null = null;
  if (stableRes.status === 'fulfilled') {
    const s = stableRes.value;
    name = s?.name ?? 'Honey';
    price = typeof s?.price === 'number' ? s.price : null;
    const totals = Array.isArray(s?.chainBalances?.Berachain?.tokens)
      ? s.chainBalances.Berachain.tokens.at(-1)?.circulating?.peggedUSD
      : null;
    // Prefer the aggregated current circulating if present
    const cur = s?.currentChainBalances ?? null;
    if (cur) {
      chainCirculating = {};
      let sum = 0;
      for (const [chain, bal] of Object.entries<any>(cur)) {
        const v = typeof bal?.peggedUSD === 'number' ? bal.peggedUSD : (typeof bal === 'number' ? bal : 0);
        chainCirculating[chain] = v; sum += v;
      }
      circulating = sum;
    } else if (typeof totals === 'number') {
      circulating = totals;
    }
  } else stableError = (stableRes.reason as Error)?.message ?? 'DefiLlama stablecoin fetch failed';

  return {
    success: true,
    output: {
      stablecoin: name ?? 'Honey', symbol: 'HONEY', address: HONEY, chain: 'berachain', chain_id: CHAIN_ID,
      price_usd: price,
      peg_deviation_pct: price != null ? Number(((price - 1) * 100).toFixed(3)) : null,
      onchain_total_supply: onchainSupply,
      circulating_usd: circulating,
      circulating_formatted: fmtUsd(circulating),
      circulating_by_chain: chainCirculating,
      supply_error: supplyError,
      stablecoin_error: stableError,
      data_sources: ['Berachain RPC (totalSupply)', 'DefiLlama stablecoins (circulating, price)'],
    },
  };
}

async function getBexStats(input: any): Promise<SkillExecutionResult> {
  const limit = Math.max(1, Math.min(50, Number(input.limit) || 10));
  const [proto, yields] = await Promise.allSettled([
    llamaGet<any>('https://api.llama.fi', `/protocol/${BEX_SLUG}`),
    llamaGet<{ data: any[] }>('https://yields.llama.fi', '/pools'),
  ]);

  let tvl: number | null = null;
  let tvlError: string | null = null;
  if (proto.status === 'fulfilled') {
    const p = proto.value;
    tvl = p?.currentChainTvls?.Berachain ?? (typeof p?.tvl === 'number' ? p.tvl : null);
  } else tvlError = (proto.reason as Error)?.message ?? 'TVL fetch failed';

  let pools: any[] = [];
  let poolsError: string | null = null;
  if (yields.status === 'fulfilled') {
    pools = (yields.value.data ?? [])
      .filter((p) => p.chain === 'Berachain' && String(p.project ?? '').toLowerCase() === 'bex')
      .map((p) => ({ pool_id: p.pool, symbol: p.symbol, tvl_usd: p.tvlUsd, apy: p.apy, apy_base: p.apyBase, apy_reward: p.apyReward }))
      .sort((a, b) => (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0))
      .slice(0, limit);
  } else poolsError = (yields.reason as Error)?.message ?? 'Yields fetch failed';

  return {
    success: true,
    output: {
      protocol: 'BEX', chain: 'berachain', chain_id: CHAIN_ID,
      tvl_usd: tvl,
      tvl_formatted: fmtUsd(tvl),
      tvl_error: tvlError,
      top_pools: pools.length ? pools : null,
      pools_error: poolsError,
      data_source: 'DefiLlama (TVL + Yields)',
    },
  };
}

// ── Main executor ─────────────────────────────────────────────────────────────
export async function executeHoneySkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return getProtocolInfo();
      case 'get_honey_stats':   return getHoneyStats();
      case 'get_bex_stats':     return getBexStats(input);
      default:
        return { success: false, error: `Unknown action "${action}". Valid: get_protocol_info, get_honey_stats, get_bex_stats` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Honey/BEX skill execution failed' };
  }
}
