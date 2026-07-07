/**
 * Infrared Finance — Berachain liquid staking (iBGT / iBERA)
 *
 * Infrared is the leading liquid-staking layer on Berachain. It issues:
 *   - iBGT:  liquid, tokenized BGT (Berachain governance/reward token). Wrapped
 *            1:1 with BGT; rewards are auto-compounded / claimable via Infrared.
 *   - iBERA: liquid-staked BERA. An ERC-4626-style vault whose BERA exchange
 *            rate rises as staking rewards accrue (verified: convertToAssets(1e18)
 *            > 1e18 on-chain).
 *
 * This skill is read-only.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Berachain's public RPC directly. No API key needed.
 *
 * Contracts on Berachain (chain ID 80094) — addresses verified via DefiLlama coins API:
 *   iBGT:  0xac03CABA51e17c86c921E1f6CBFBdC91F8BB2E6b (18 dec)
 *   iBERA: 0x9b6761bf2397Bb5a6624a856cC84A3A14DcD3fe5 (18 dec, ERC-4626 vault)
 *   BGT:   0x656b95E550C07a9ffe548bd4085c72418Ceb1dba (18 dec)
 *
 * Data sources (region-safe): Berachain RPC + DefiLlama (protocol TVL, yields, coins).
 *
 * Actions: get_protocol_info, get_stats, get_exchange_rate, get_ibgt_balance
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Constants ───────────────────────────────────────────────────────────────
const CHAIN_ID    = 80094;
const DEFAULT_RPC = 'https://rpc.berachain.com';
const IBGT   = '0xac03CABA51e17c86c921E1f6CBFBdC91F8BB2E6b';
const IBERA  = '0x9b6761bf2397Bb5a6624a856cC84A3A14DcD3fe5';
const BGT    = '0x656b95E550C07a9ffe548bd4085c72418Ceb1dba';
const WBERA  = '0x6969696969696969696969696969696969696969';
const LLAMA_SLUG = 'infrared-finance';

function getRpcUrl(): string { return process.env.BERACHAIN_RPC_URL || DEFAULT_RPC; }

// ── ABI selectors ───────────────────────────────────────────────────────────
const SEL = {
  balanceOf:       '70a08231', // balanceOf(address)
  totalSupply:     '18160ddd', // totalSupply()
  totalAssets:     '01e1d114', // totalAssets()          (ERC-4626)
  convertToAssets: '07a2d13a', // convertToAssets(uint256) (ERC-4626)
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
  const h = (hex || '').replace('0x', '');
  return BigInt('0x' + (h.slice(slot * 64, slot * 64 + 64) || '0'));
}
function formatUnits(value: bigint, decimals = 18): string {
  const d = 10n ** BigInt(decimals);
  const whole = value / d, frac = value % d;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}
const ONE = 10n ** 18n;
const isAddr = (s: unknown): s is string => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);

async function fetchPrices(): Promise<Record<string, number>> {
  try {
    const ids = [IBERA, IBGT, BGT, WBERA].map((a) => `berachain:${a}`).join(',');
    const r = await llamaGet<any>('https://coins.llama.fi', `/prices/current/${ids}`);
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries<any>(r.coins ?? {})) out[k.split(':')[1].toLowerCase()] = v.price;
    return out;
  } catch { return {}; }
}

// ── Skill metadata ────────────────────────────────────────────────────────────
export const INFRARED_SKILL_METADATA = {
  name: 'Infrared Finance (Berachain liquid staking)',
  description:
    '[ARSENAL-HOSTED ✓] Read-only data for Infrared Finance, the leading liquid-staking layer on Berachain ' +
    '(chain ID 80094). Infrared issues iBGT (liquid, tokenized BGT) and iBERA (liquid-staked BERA, an ERC-4626 vault ' +
    'whose BERA exchange rate rises as rewards accrue). Read protocol info, TVL/APY stats, live exchange rates, and ' +
    'an address\'s iBGT / iBERA balances.\n\n' +
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
  tags: ['infrared', 'berachain', 'liquid-staking', 'ibgt', 'ibera', 'bgt', 'lst', 'defi', 'bera'],
  external_url: 'https://infrared.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/infrared-finance?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_stats', 'get_exchange_rate', 'get_ibgt_balance'],
        description:
          'get_protocol_info: Infrared overview, token addresses, and how iBGT/iBERA work. ' +
          'get_stats: protocol TVL and Infrared pool APYs (via DefiLlama). ' +
          'get_exchange_rate: live iBERA→BERA rate (ERC-4626 convertToAssets) and iBGT↔BGT (1:1), plus price-implied rates. ' +
          'get_ibgt_balance: an address\'s iBGT and iBERA balances (needs sender/address).',
      },
      sender:  { type: 'string', description: 'Wallet address (0x…, 40 hex). Required for get_ibgt_balance.' },
      address: { type: 'string', description: 'Alias for the address to query in get_ibgt_balance.' },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'TVL / APY stats', input: { action: 'get_stats' } },
    { title: 'Exchange rates', input: { action: 'get_exchange_rate' } },
    { title: 'iBGT/iBERA balance', input: { action: 'get_ibgt_balance', address: '0xYourAddress' } },
  ],
};

// ── Action handlers ───────────────────────────────────────────────────────────

async function getProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Infrared Finance',
      tagline: 'Liquid staking for Berachain',
      chain: 'berachain', chain_id: CHAIN_ID,
      website: 'https://infrared.finance',
      tokens: {
        iBGT:  { address: IBGT,  decimals: 18, description: 'Liquid, tokenized BGT. Wrapped 1:1 with BGT; Infrared auto-compounds/claims the underlying rewards.' },
        iBERA: { address: IBERA, decimals: 18, description: 'Liquid-staked BERA. ERC-4626 vault whose BERA exchange rate rises as staking rewards accrue.' },
        BGT:   { address: BGT,   decimals: 18, description: 'Berachain governance/reward token (soulbound); Infrared holds validator BGT and issues liquid iBGT.' },
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_stats — protocol TVL + pool APYs (DefiLlama)',
        'get_exchange_rate — live iBERA→BERA and iBGT↔BGT rates',
        'get_ibgt_balance — iBGT/iBERA balances for an address',
      ],
    },
  };
}

async function getStats(): Promise<SkillExecutionResult> {
  const [proto, yields] = await Promise.allSettled([
    llamaGet<any>('https://api.llama.fi', `/protocol/${LLAMA_SLUG}`),
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
      .filter((p) => p.chain === 'Berachain' && String(p.project ?? '').toLowerCase().includes('infrared'))
      .map((p) => ({ pool_id: p.pool, symbol: p.symbol, tvl_usd: p.tvlUsd, apy: p.apy, apy_base: p.apyBase, apy_reward: p.apyReward }))
      .sort((a, b) => (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0));
  } else poolsError = (yields.reason as Error)?.message ?? 'Yields fetch failed';

  return {
    success: true,
    output: {
      protocol: 'Infrared Finance', chain: 'berachain',
      tvl_usd: tvl,
      tvl_formatted: tvl != null ? (tvl >= 1e9 ? `$${(tvl / 1e9).toFixed(2)}B` : tvl >= 1e6 ? `$${(tvl / 1e6).toFixed(2)}M` : `$${tvl.toFixed(0)}`) : null,
      tvl_error: tvlError,
      pools: pools.length ? pools : null,
      pools_error: poolsError,
      data_source: 'DefiLlama (TVL + Yields)',
    },
  };
}

async function getExchangeRate(): Promise<SkillExecutionResult> {
  const [assetsHex, totalAssetsHex, iberaSupplyHex, ibgtSupplyHex] = await Promise.all([
    ethCall(IBERA, '0x' + SEL.convertToAssets + p32(ONE)).catch(() => '0x'),
    ethCall(IBERA, '0x' + SEL.totalAssets).catch(() => '0x'),
    ethCall(IBERA, '0x' + SEL.totalSupply).catch(() => '0x'),
    ethCall(IBGT, '0x' + SEL.totalSupply).catch(() => '0x'),
  ]);
  const prices = await fetchPrices();

  const iberaRate = readU256(assetsHex);           // BERA per 1 iBERA
  const iberaTotalAssets = readU256(totalAssetsHex);
  const iberaSupply = readU256(iberaSupplyHex);
  const ibgtSupply = readU256(ibgtSupplyHex);

  const pIbera = prices[IBERA.toLowerCase()] ?? null;
  const pIbgt  = prices[IBGT.toLowerCase()] ?? null;
  const pBgt   = prices[BGT.toLowerCase()] ?? null;
  const pWbera = prices[WBERA.toLowerCase()] ?? null;

  return {
    success: true,
    output: {
      protocol: 'Infrared Finance', chain: 'berachain', chain_id: CHAIN_ID,
      iBERA: {
        address: IBERA,
        bera_per_ibera: iberaRate > 0n ? Number(formatUnits(iberaRate)) : null,
        total_bera_staked: iberaTotalAssets > 0n ? Number(formatUnits(iberaTotalAssets)) : null,
        ibera_supply: iberaSupply > 0n ? Number(formatUnits(iberaSupply)) : null,
        price_implied_rate: pIbera != null && pWbera ? Number((pIbera / pWbera).toFixed(6)) : null,
        method: 'on-chain ERC-4626 convertToAssets(1e18)',
        note: 'iBERA appreciates against BERA as staking rewards accrue (bera_per_ibera rises).',
      },
      iBGT: {
        address: IBGT,
        bgt_per_ibgt: 1.0,
        ibgt_supply: ibgtSupply > 0n ? Number(formatUnits(ibgtSupply)) : null,
        price_implied_rate: pIbgt != null && pBgt ? Number((pIbgt / pBgt).toFixed(6)) : null,
        method: 'fixed 1:1 (iBGT is wrapped BGT, not a yield-accruing vault)',
        note: 'iBGT is redeemable 1:1 for BGT; rewards accrue as separately claimable/auto-compounded incentives, not via a rising share price.',
      },
      prices_usd: { iBERA: pIbera, iBGT: pIbgt, BGT: pBgt, WBERA: pWbera },
      data_sources: ['Berachain RPC (convertToAssets/totalSupply)', 'DefiLlama coins (prices)'],
    },
  };
}

async function getIbgtBalance(input: any): Promise<SkillExecutionResult> {
  const who = input.sender ?? input.address;
  if (!isAddr(who)) return { success: false, error: 'A valid sender/address (0x…, 40 hex) is required.' };
  try {
    const [ibgtHex, iberaHex, redeemHex] = await Promise.all([
      ethCall(IBGT, '0x' + SEL.balanceOf + p32(who)),
      ethCall(IBERA, '0x' + SEL.balanceOf + p32(who)),
      // preview BERA value of the iBERA balance via convertToAssets(balance)
      ethCall(IBERA, '0x' + SEL.balanceOf + p32(who)).then((b) => ethCall(IBERA, '0x' + SEL.convertToAssets + p32(readU256(b)))).catch(() => '0x'),
    ]);
    const ibgt = readU256(ibgtHex);
    const ibera = readU256(iberaHex);
    const iberaBera = readU256(redeemHex);
    return {
      success: true,
      output: {
        address: who, chain: 'berachain', chain_id: CHAIN_ID,
        iBGT:  { balance: Number(formatUnits(ibgt)), raw: ibgt.toString(), address: IBGT },
        iBERA: { balance: Number(formatUnits(ibera)), raw: ibera.toString(), address: IBERA, redeemable_bera: iberaBera > 0n ? Number(formatUnits(iberaBera)) : null },
      },
    };
  } catch (err: any) { return { success: false, error: `get_ibgt_balance failed: ${err.message}` }; }
}

// ── Main executor ─────────────────────────────────────────────────────────────
export async function executeInfraredSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return getProtocolInfo();
      case 'get_stats':         return getStats();
      case 'get_exchange_rate': return getExchangeRate();
      case 'get_ibgt_balance':  return getIbgtBalance(input);
      default:
        return { success: false, error: `Unknown action "${action}". Valid: get_protocol_info, get_stats, get_exchange_rate, get_ibgt_balance` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Infrared skill execution failed' };
  }
}
