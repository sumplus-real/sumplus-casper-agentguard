/**
 * Official Skill: ShMonad (Monad liquid staking by FastLane)
 *
 * ShMonad is the largest liquid-staking protocol on Monad. Stake native MON and
 * receive shMON, a yield-bearing ERC-4626 vault share whose MON exchange rate
 * rises as staking rewards accrue. shMON is a standard, fully-liquid ERC-4626
 * vault: redemption is synchronous (no unbonding window) up to available
 * liquidity, so unstaking returns MON immediately.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Monad's public RPC directly. No API key needed.
 *
 * Skill UUID: 207d444c-2918-40c7-8d0e-affa7bceb0bb
 *
 * Contracts on Monad (chain ID 143, verified on-chain + ground-truthed from live txs):
 *   shMON (ERC-4626 vault + share token): 0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c (18 dec)
 *     asset() = 0xEeee…EEeE  → underlying is native MON (deposited via payable)
 *     - stake:   deposit(uint256 assets, address receiver) payable  [0x6e553f65]  (msg.value == assets, confirmed from a live tx)
 *     - unstake: redeem(uint256 shares, address receiver, address owner)  [0xba087652]  (synchronous, returns MON)
 *     - withdraw: withdraw(uint256 assets, address receiver, address owner)  [0xb460af94]
 *
 * Data sources (region-safe):
 *   Monad RPC   https://rpc.monad.xyz        — on-chain reads + tx building
 *   DefiLlama   https://yields.llama.fi      — live shMON staking APY (pool ee40513c…)
 *
 * Actions:
 *   get_stake_info   — shMON exchange rate, total MON staked, shMON supply, APY/TVL
 *   build_stake_tx   — stake MON → shMON (deposit, payable)
 *   build_unstake_tx — unstake shMON → MON (redeem, synchronous)
 *   get_balance      — an owner's shMON balance + redeemable MON
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Constants ───────────────────────────────────────────────────────────────
const SHMON     = '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c';
const CHAIN_ID  = 143;
const DECIMALS  = 18;
const ONE       = 10n ** 18n;
const DEFAULT_RPC = 'https://rpc.monad.xyz';
const LLAMA_POOL  = 'ee40513c-9356-4c53-9f26-446b484a8ae2'; // DefiLlama shMON (shmonad) pool id

function getRpcUrl(): string { return process.env.MONAD_RPC_URL || DEFAULT_RPC; }

// ── ABI selectors ───────────────────────────────────────────────────────────
const SEL = {
  deposit:         '6e553f65', // deposit(uint256,address)          payable
  redeem:          'ba087652', // redeem(uint256,address,address)
  convertToAssets: '07a2d13a', // convertToAssets(uint256)
  totalAssets:     '01e1d114', // totalAssets()
  totalSupply:     '18160ddd', // totalSupply()
  balanceOf:       '70a08231', // balanceOf(address)
  maxRedeem:       'd905777e', // maxRedeem(address)
} as const;

// ── Low-level helpers ─────────────────────────────────────────────────────────

function nodeReq(method: 'GET' | 'POST', urlStr: string, body?: unknown, timeoutMs = 20000): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const bodyStr   = body !== undefined ? JSON.stringify(body) : undefined;
    const baseHeaders: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' };
    if (bodyStr) {
      baseHeaders['Content-Type']   = 'application/json';
      baseHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }
    let options: any;
    let client: typeof https | typeof http;
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method,
        headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: timeoutMs };
    } else {
      client  = targetUrl.protocol === 'http:' ? http : https;
      options = { hostname: targetUrl.hostname, port: targetUrl.port || 443, path: targetUrl.pathname + targetUrl.search, method,
        headers: baseHeaders, timeout: timeoutMs, family: 4 };
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
function parseUnits(value: string, decimals = DECIMALS): bigint {
  const [whole, frac = ''] = String(value).split('.');
  return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
}
function formatUnits(value: bigint, decimals = DECIMALS): string {
  const d = 10n ** BigInt(decimals);
  const whole = value / d, frac = value % d;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}
const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

// Live shMON staking APY from DefiLlama (best-effort; null on failure).
async function fetchApy(): Promise<{ apy: number | null; tvl_usd: number | null }> {
  try {
    const r = await nodeReq('GET', `https://yields.llama.fi/chart/${LLAMA_POOL}`, undefined, 25000);
    const arr = Array.isArray(r?.data) ? r.data : [];
    const last = arr[arr.length - 1];
    return { apy: last?.apy != null ? Number(last.apy) : null, tvl_usd: last?.tvlUsd != null ? Number(last.tvlUsd) : null };
  } catch { return { apy: null, tvl_usd: null }; }
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const SHMONAD_SKILL_METADATA = {
  name: 'ShMonad (Monad liquid staking)',
  description:
    '[ARSENAL-HOSTED ✓] Liquid-stake native MON on ShMonad (FastLane, Monad mainnet chain ID 143) to receive ' +
    'shMON, a yield-bearing ERC-4626 token whose MON exchange rate rises as staking rewards accrue. ShMonad is ' +
    "Monad's largest liquid-staking protocol. Read live staking economics (exchange rate, total MON staked, shMON " +
    'supply, APY) and build stake / unstake transactions. shMON is a standard ERC-4626 vault with synchronous ' +
    'redemption, so unstaking returns MON immediately (no unbonding window) up to available liquidity.\n\n' +
    'execution_mode: server-side\n' +
    'chain: monad (id: 143)\n' +
    'rpc: https://rpc.monad.xyz\n' +
    'gas_token: MON\n' +
    'sop_compliance:\n' +
    '  provides_quote: true\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['shmonad', 'monad', 'liquid-staking', 'shmon', 'staking', 'lst', 'defi', 'evm', 'mon', 'fastlane'],
  external_url: 'https://www.shmonad.xyz',
  logo_url: 'https://icons.llamao.fi/icons/protocols/shmonad?w=48&h=48',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_stake_info', 'build_stake_tx', 'build_unstake_tx', 'get_balance'],
        description:
          'get_stake_info: shMON exchange rate, total MON staked, shMON supply, live APY/TVL. ' +
          'build_stake_tx: stake MON → shMON (needs amount MON, sender). ' +
          'build_unstake_tx: unstake shMON → MON via synchronous redeem (needs amount shMON, sender). ' +
          'get_balance: an owner\'s shMON balance + redeemable MON (needs sender).',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount. For build_stake_tx: MON to stake. For build_unstake_tx: shMON to unstake.',
      },
      sender: {
        type: 'string',
        description: 'Wallet address (0x…, 40 hex). Required for build_* and get_balance; also the signer and the shMON / MON receiver.',
      },
    },
  },
  usage_examples: [
    { title: 'shMON staking info', input: { action: 'get_stake_info' } },
    { title: 'Stake 10 MON', input: { action: 'build_stake_tx', amount: '10', sender: '0xYourAddress' } },
    { title: 'Unstake 5 shMON', input: { action: 'build_unstake_tx', amount: '5', sender: '0xYourAddress' } },
    { title: 'Check shMON balance', input: { action: 'get_balance', sender: '0xYourAddress' } },
  ],
};

// ── Executor ────────────────────────────────────────────────────────────────

export async function executeShmonadSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {

      // ── get_stake_info ──────────────────────────────────────────────────
      case 'get_stake_info': {
        const [assetsHex, totalAssetsHex, supplyHex] = await Promise.all([
          ethCall(SHMON, '0x' + SEL.convertToAssets + p32(ONE)),
          ethCall(SHMON, '0x' + SEL.totalAssets),
          ethCall(SHMON, '0x' + SEL.totalSupply),
        ]);
        const monPerShmon = readU256(assetsHex);
        const totalStaked = readU256(totalAssetsHex);
        const supply = readU256(supplyHex);
        const { apy, tvl_usd } = await fetchApy();
        return {
          success: true,
          output: {
            shmon_address: SHMON,
            mon_per_shmon: Number(formatUnits(monPerShmon)),
            total_mon_staked: Number(formatUnits(totalStaked)),
            shmon_supply: Number(formatUnits(supply)),
            apy: apy != null ? `${apy.toFixed(2)}%` : null,
            tvl_usd,
            chain: 'monad', chain_id: CHAIN_ID,
            note: 'shMON appreciates against MON as staking rewards accrue (mon_per_shmon rises). Standard ERC-4626, synchronous redemption. APY/TVL from DefiLlama.',
          },
        };
      }

      // ── build_stake_tx (MON → shMON) ────────────────────────────────────
      case 'build_stake_tx': {
        const { amount, sender } = input;
        if (!amount) return { success: false, error: 'amount (MON to stake) is required' };
        if (!sender || !isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required' };
        const wei = parseUnits(String(amount));
        if (wei <= 0n) return { success: false, error: 'amount must be greater than 0' };
        // deposit(assets = msg.value, receiver = sender), payable
        const data = '0x' + SEL.deposit + p32(wei) + p32(sender);
        return {
          success: true,
          output: {
            transactions: [
              { to: SHMON, data, value: '0x' + wei.toString(16), chain_id: CHAIN_ID,
                description: `Stake ${amount} MON on ShMonad, receive shMON` },
            ],
            action: 'stake', from: 'MON', to: 'shMON', amount_mon: String(amount),
            chain: 'monad', chain_id: CHAIN_ID, _operation: 'shmonad_stake',
            usage: 'Send the transaction from `sender` on Monad to stake. shMON is minted to `sender`.',
          },
        };
      }

      // ── build_unstake_tx (shMON → MON, synchronous redeem) ──────────────
      case 'build_unstake_tx': {
        const { amount, sender } = input;
        if (!amount) return { success: false, error: 'amount (shMON to unstake) is required' };
        if (!sender || !isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required' };
        const shares = parseUnits(String(amount));
        if (shares <= 0n) return { success: false, error: 'amount must be greater than 0' };
        // Preview MON out + guard against redeeming more than is liquid.
        let assetsOut: bigint | null = null;
        let maxRedeem: bigint | null = null;
        try { assetsOut = readU256(await ethCall(SHMON, '0x' + SEL.convertToAssets + p32(shares))); } catch { /* non-fatal */ }
        try { maxRedeem = readU256(await ethCall(SHMON, '0x' + SEL.maxRedeem + p32(sender))); } catch { /* non-fatal */ }
        if (maxRedeem != null && shares > maxRedeem) {
          return { success: false, error: `Cannot redeem ${amount} shMON: max redeemable for this owner right now is ${formatUnits(maxRedeem)} shMON (balance or available liquidity).` };
        }
        // redeem(shares, receiver = sender, owner = sender)
        const data = '0x' + SEL.redeem + p32(shares) + p32(sender) + p32(sender);
        return {
          success: true,
          output: {
            transactions: [
              { to: SHMON, data, value: '0x0', chain_id: CHAIN_ID,
                description: `Unstake ${amount} shMON on ShMonad, receive MON` },
            ],
            action: 'unstake', from: 'shMON', to: 'MON', amount_shmon: String(amount),
            estimated_mon_out: assetsOut != null ? Number(formatUnits(assetsOut)) : null,
            chain: 'monad', chain_id: CHAIN_ID, _operation: 'shmonad_unstake',
            note: 'Synchronous ERC-4626 redeem: MON is returned in the same transaction (no unbonding window), subject to available vault liquidity.',
            usage: 'Send the transaction from `sender` to receive MON.',
          },
        };
      }

      // ── get_balance ─────────────────────────────────────────────────────
      case 'get_balance': {
        const { sender } = input;
        if (!sender || !isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required' };
        const [balHex, maxHex] = await Promise.all([
          ethCall(SHMON, '0x' + SEL.balanceOf + p32(sender)),
          ethCall(SHMON, '0x' + SEL.maxRedeem + p32(sender)),
        ]);
        const bal = readU256(balHex);
        const maxR = readU256(maxHex);
        let redeemableMon: bigint | null = null;
        try { redeemableMon = readU256(await ethCall(SHMON, '0x' + SEL.convertToAssets + p32(maxR))); } catch { /* non-fatal */ }
        return {
          success: true,
          output: {
            owner: sender,
            shmon_balance: Number(formatUnits(bal)),
            max_redeemable_shmon: Number(formatUnits(maxR)),
            redeemable_mon: redeemableMon != null ? Number(formatUnits(redeemableMon)) : null,
            chain: 'monad', chain_id: CHAIN_ID,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Valid: get_stake_info, build_stake_tx, build_unstake_tx, get_balance` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'ShMonad skill execution failed' };
  }
}
