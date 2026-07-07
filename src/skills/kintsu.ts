/**
 * Official Skill: Kintsu (Monad liquid staking) — READ-ONLY
 *
 * Kintsu is a liquid-staking protocol on Monad. Stake native MON to receive sMON,
 * a yield-bearing token whose MON exchange rate rises as staking rewards accrue.
 * Kintsu is Monad's #2 LST by TVL.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Monad's public RPC directly. No API key needed.
 *
 * WHY READ-ONLY (deliberate): sMON is a NON-standard vault. The ERC-4626 views
 * `convertToAssets`, `asset`, and `totalAssets` all REVERT on-chain, so the
 * exchange rate is not readable via the vault; and `deposit(uint96,address)`
 * reverts under every simulated argument/msg.value combination (it is gated by
 * conditions only visible in the verified source, which was not obtainable at
 * build time — Sourcify has no source for chain 143 and no Etherscan key was
 * reachable from the build environment). Per Arsenal policy we ship reliable
 * reads rather than guess unsafe stake/unstake calldata. Live economics come from
 * DefiLlama (APY / TVL / price-per-share). Balances come from the sMON ERC-20.
 *
 * Contracts on Monad (chain ID 143, verified on-chain):
 *   sMON (vault + share token): 0xA3227C5969757783154C60bF0bC1944180ed81B9 (18 dec)
 *     EIP-1967 proxy, implementation 0x6a4593babdf617d5d8d6fbc04b53435d08baf21f
 *     Working reads: symbol() / decimals() / totalSupply() / balanceOf(address)
 *     Reverting reads: convertToAssets() / totalAssets() / asset()
 *
 * Data sources (region-safe):
 *   Monad RPC   https://rpc.monad.xyz        — on-chain reads
 *   DefiLlama   https://yields.llama.fi      — live sMON staking APY / TVL / pricePerShare
 *
 * Actions:
 *   get_stake_info — sMON supply, live APY / TVL, MON-per-sMON exchange rate
 *   get_balance    — an owner's sMON balance + estimated MON value
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Constants ───────────────────────────────────────────────────────────────
const SMON        = '0xA3227C5969757783154C60bF0bC1944180ed81B9';
const CHAIN_ID    = 143;
const DECIMALS    = 18;
const DEFAULT_RPC = 'https://rpc.monad.xyz';
const LLAMA_POOL  = '73c511a9-4dc0-4397-babe-e578fd75f0dd'; // DefiLlama Kintsu sMON pool id

function getRpcUrl(): string { return process.env.MONAD_RPC_URL || DEFAULT_RPC; }

// ── ABI selectors ───────────────────────────────────────────────────────────
const SEL = {
  totalSupply: '18160ddd', // totalSupply()
  balanceOf:   '70a08231', // balanceOf(address)
} as const;

// ── Low-level helpers (proxy-aware) ───────────────────────────────────────────
function nodeReq(method: 'GET' | 'POST', urlStr: string, body?: unknown, timeoutMs = 20000): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const bodyStr   = body !== undefined ? JSON.stringify(body) : undefined;
    const baseHeaders: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' };
    if (bodyStr) { baseHeaders['Content-Type'] = 'application/json'; baseHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr)); }
    let options: any; let client: typeof https | typeof http;
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method, headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: timeoutMs };
    } else {
      client = targetUrl.protocol === 'http:' ? http : https;
      options = { hostname: targetUrl.hostname, port: targetUrl.port || 443, path: targetUrl.pathname + targetUrl.search, method, headers: baseHeaders, timeout: timeoutMs, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 160)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  const r = await nodeReq('POST', getRpcUrl(), { jsonrpc: '2.0', id: 1, method, params });
  if (r?.error) throw new Error(`Monad RPC error: ${r.error.message ?? JSON.stringify(r.error)}`);
  return r?.result;
}
async function ethCall(to: string, data: string): Promise<string> {
  return (await rpcCall('eth_call', [{ to, data }, 'latest'])) ?? '0x';
}

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}
function readU256(hex: string, slot = 0): bigint {
  const h = (hex || '').replace('0x', '');
  return BigInt('0x' + (h.slice(slot * 64, slot * 64 + 64) || '0'));
}
function formatUnits(value: bigint, decimals = DECIMALS): string {
  const d = 10n ** BigInt(decimals);
  const whole = value / d, frac = value % d;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}
const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

// Live sMON staking economics from DefiLlama (APY / TVL / price-per-share).
async function fetchPoolStats(): Promise<{ apy: number | null; tvl_usd: number | null; price_per_share: number | null }> {
  try {
    const r = await nodeReq('GET', `https://yields.llama.fi/chart/${LLAMA_POOL}`, undefined, 25000);
    const arr = Array.isArray(r?.data) ? r.data : [];
    const last = arr[arr.length - 1];
    return {
      apy: last?.apy != null ? Number(last.apy) : null,
      tvl_usd: last?.tvlUsd != null ? Number(last.tvlUsd) : null,
      price_per_share: last?.pricePerShare != null ? Number(last.pricePerShare) : null,
    };
  } catch { return { apy: null, tvl_usd: null, price_per_share: null }; }
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const KINTSU_SKILL_METADATA = {
  name: 'Kintsu (Monad liquid staking)',
  description:
    '[ARSENAL-HOSTED ✓] Read live Kintsu liquid-staking economics on Monad mainnet (chain ID 143). Kintsu lets ' +
    'you stake native MON for sMON, a yield-bearing token whose MON exchange rate rises as staking rewards accrue; ' +
    "it is Monad's #2 LST by TVL. This skill reads sMON supply, live APY / TVL, the MON-per-sMON exchange rate, and " +
    'an owner\'s sMON balance. It is read-only: sMON is a non-standard vault whose deposit path could not be ' +
    'ground-truthed from a verified source at build time, so stake / unstake calldata is intentionally not built ' +
    '(use the Kintsu app to stake). Exchange rate, APY and TVL come from DefiLlama; balances from the sMON token.\n\n' +
    'execution_mode: server-side\n' +
    'chain: monad (id: 143)\n' +
    'rpc: https://rpc.monad.xyz\n' +
    'gas_token: MON\n' +
    'sop_compliance:\n' +
    '  read_only: true\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['kintsu', 'monad', 'liquid-staking', 'smon', 'staking', 'lst', 'defi', 'evm', 'mon'],
  external_url: 'https://kintsu.xyz',
  logo_url: 'https://icons.llamao.fi/icons/protocols/kintsu?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_stake_info', 'get_balance'],
        description:
          'get_stake_info: sMON supply, live APY / TVL, MON-per-sMON exchange rate (from DefiLlama). ' +
          "get_balance: an owner's sMON balance + estimated MON value (needs sender).",
      },
      sender: {
        type: 'string',
        description: 'Wallet address (0x…, 40 hex). Required for get_balance.',
      },
    },
  },
  usage_examples: [
    { title: 'sMON staking info', input: { action: 'get_stake_info' } },
    { title: 'Check sMON balance', input: { action: 'get_balance', sender: '0xYourAddress' } },
  ],
};

// ── Executor ────────────────────────────────────────────────────────────────

export async function executeKintsuSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {

      // ── get_stake_info ──────────────────────────────────────────────────
      case 'get_stake_info': {
        const [supplyHex, stats] = await Promise.all([
          ethCall(SMON, '0x' + SEL.totalSupply),
          fetchPoolStats(),
        ]);
        const supply = readU256(supplyHex);
        return {
          success: true,
          output: {
            smon_address: SMON,
            smon_supply: Number(formatUnits(supply)),
            mon_per_smon: stats.price_per_share,
            apy: stats.apy != null ? `${stats.apy.toFixed(2)}%` : null,
            tvl_usd: stats.tvl_usd,
            chain: 'monad', chain_id: CHAIN_ID,
            read_only: true,
            note: 'sMON appreciates against MON as staking rewards accrue (mon_per_smon rises). sMON is a non-standard vault: on-chain convertToAssets/totalAssets revert, so exchange rate, APY and TVL are sourced from DefiLlama. This skill is read-only; stake/unstake on the Kintsu app.',
          },
        };
      }

      // ── get_balance ─────────────────────────────────────────────────────
      case 'get_balance': {
        const { sender } = input;
        if (!sender || !isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required' };
        const [balHex, stats] = await Promise.all([
          ethCall(SMON, '0x' + SEL.balanceOf + p32(sender)),
          fetchPoolStats(),
        ]);
        const bal = readU256(balHex);
        const smonBalance = Number(formatUnits(bal));
        const estimatedMon = stats.price_per_share != null ? smonBalance * stats.price_per_share : null;
        return {
          success: true,
          output: {
            owner: sender,
            smon_balance: smonBalance,
            mon_per_smon: stats.price_per_share,
            estimated_mon_value: estimatedMon,
            chain: 'monad', chain_id: CHAIN_ID,
            read_only: true,
            note: 'estimated_mon_value uses the DefiLlama price-per-share (sMON is a non-standard vault; on-chain convertToAssets reverts).',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Valid: get_stake_info, get_balance` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Kintsu skill execution failed' };
  }
}
