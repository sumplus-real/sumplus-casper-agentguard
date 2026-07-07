/**
 * Official Skill: Magma (Monad liquid staking)
 *
 * Magma is a liquid-staking protocol on Monad. Stake native MON and receive
 * gMON, a yield-bearing ERC-7540 vault share that accrues staking rewards (its
 * MON-per-gMON exchange rate rises over time). gMON stays liquid and usable
 * across Monad DeFi while it earns.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Monad's public RPC directly. No API key needed.
 *
 * Skill UUID: 05f0de62-9363-4ebd-b0e8-8b3b32287311
 *
 * Contracts on Monad (chain ID 143, verified on-chain):
 *   gMON (vault + share token): 0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081 (18 dec)
 *     - stake:   depositMON(address receiver, uint256 referralId) payable   [0x5f3896d3]
 *     - unstake: requestRedeem(uint256 shares, address controller, address owner) [0x7d41c86e]
 *     - claim:   redeemMON(uint256 requestId, address controller, address receiver) [0x54c8cbd2]
 *   gMON is an ERC-7540 async-redeem vault: unstaking is two steps (request, then
 *   claim after the unbonding window). requestRedeem emits the requestId used by claim.
 *
 * Data sources (region-safe):
 *   Monad RPC   https://rpc.monad.xyz        — on-chain reads + tx building
 *   DefiLlama   https://yields.llama.fi      — live gMON staking APY
 *
 * Actions:
 *   get_stake_info     — gMON exchange rate, total MON staked, gMON supply, APY
 *   build_stake_tx     — stake MON → gMON (depositMON, payable)
 *   build_unstake_tx   — request unstake gMON → MON (requestRedeem); returns a requestId via event
 *   build_claim_tx     — claim MON after the unbonding window (redeemMON, needs requestId)
 *   get_unstake_status — pending / claimable amounts for a given requestId + owner
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Constants ───────────────────────────────────────────────────────────────
const GMON      = '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081';
const CHAIN_ID  = 143;
const DECIMALS  = 18;
const ONE       = 10n ** 18n;
const DEFAULT_RPC = 'https://rpc.monad.xyz';
const LLAMA_POOL  = '96f74061-dc9a-4ef7-8117-6cd3935230de'; // DefiLlama gMON (magma-staking) pool id

function getRpcUrl(): string { return process.env.MONAD_RPC_URL || DEFAULT_RPC; }

// ── ABI selectors ───────────────────────────────────────────────────────────
const SEL = {
  depositMON:             '5f3896d3', // depositMON(address,uint256)            payable
  requestRedeem:          '7d41c86e', // requestRedeem(uint256,address,address)
  redeemMON:              '54c8cbd2', // redeemMON(uint256,address,address)
  convertToAssets:        '07a2d13a', // convertToAssets(uint256)
  totalAssets:            '01e1d114', // totalAssets()
  totalSupply:            '18160ddd', // totalSupply()
  balanceOf:              '70a08231', // balanceOf(address)
  pendingRedeemRequest:   'f5a23d8d', // pendingRedeemRequest(uint256,address)
  claimableRedeemRequest: 'eaed1d07', // claimableRedeemRequest(uint256,address)
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

// Live gMON staking APY from DefiLlama (best-effort; null on failure).
async function fetchApy(): Promise<{ apy: number | null; tvl_usd: number | null }> {
  try {
    const r = await nodeReq('GET', `https://yields.llama.fi/chart/${LLAMA_POOL}`, undefined, 25000);
    const arr = Array.isArray(r?.data) ? r.data : [];
    const last = arr[arr.length - 1];
    return { apy: last?.apy != null ? Number(last.apy) : null, tvl_usd: last?.tvlUsd != null ? Number(last.tvlUsd) : null };
  } catch { return { apy: null, tvl_usd: null }; }
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const MAGMA_SKILL_METADATA = {
  name: 'Magma (Monad liquid staking)',
  description:
    '[ARSENAL-HOSTED ✓] Liquid-stake native MON on Magma (Monad mainnet, chain ID 143) to receive gMON, ' +
    'a yield-bearing token whose MON exchange rate rises as staking rewards accrue. Read live staking ' +
    'economics (exchange rate, total MON staked, gMON supply, APY) and build stake, unstake-request, and ' +
    'claim transactions. gMON is an ERC-7540 async-redeem vault, so unstaking is request-then-claim.\n\n' +
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
  tags: ['magma', 'monad', 'liquid-staking', 'gmon', 'staking', 'lst', 'defi', 'evm', 'mon'],
  external_url: 'https://www.magmastaking.xyz',
  logo_url: 'https://icons.llamao.fi/icons/protocols/magma-staking?w=48&h=48',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_stake_info', 'build_stake_tx', 'build_unstake_tx', 'build_claim_tx', 'get_unstake_status'],
        description:
          'get_stake_info: gMON exchange rate, total MON staked, gMON supply, live APY. ' +
          'build_stake_tx: stake MON → gMON (needs amount MON, sender). ' +
          'build_unstake_tx: request unstake gMON → MON (needs amount gMON, sender); returns a requestId via the requestRedeem event. ' +
          'build_claim_tx: claim MON after the unbonding window (needs requestId, sender). ' +
          'get_unstake_status: pending / claimable amounts for a requestId + owner.',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount. For build_stake_tx: MON to stake. For build_unstake_tx: gMON to unstake.',
      },
      sender: {
        type: 'string',
        description: 'Wallet address (0x…, 40 hex). Required for all build_* and get_unstake_status actions; also the signer and the gMON / MON receiver.',
      },
      requestId: {
        type: 'string',
        description: 'The redeem request id from a prior build_unstake_tx (emitted by requestRedeem). Required for build_claim_tx and get_unstake_status.',
      },
    },
  },
  usage_examples: [
    { title: 'gMON staking info', input: { action: 'get_stake_info' } },
    { title: 'Stake 10 MON', input: { action: 'build_stake_tx', amount: '10', sender: '0xYourAddress' } },
    { title: 'Request unstake 5 gMON', input: { action: 'build_unstake_tx', amount: '5', sender: '0xYourAddress' } },
    { title: 'Check unstake status', input: { action: 'get_unstake_status', requestId: '0', sender: '0xYourAddress' } },
    { title: 'Claim unstaked MON', input: { action: 'build_claim_tx', requestId: '0', sender: '0xYourAddress' } },
  ],
};

// ── Executor ────────────────────────────────────────────────────────────────

export async function executeMagmaSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {

      // ── get_stake_info ──────────────────────────────────────────────────
      case 'get_stake_info': {
        const [assetsHex, totalAssetsHex, supplyHex] = await Promise.all([
          ethCall(GMON, '0x' + SEL.convertToAssets + p32(ONE)),
          ethCall(GMON, '0x' + SEL.totalAssets),
          ethCall(GMON, '0x' + SEL.totalSupply),
        ]);
        const monPerGmon = readU256(assetsHex);          // MON returned for 1e18 gMON
        const totalStaked = readU256(totalAssetsHex);    // total MON backing the vault
        const supply = readU256(supplyHex);              // gMON supply
        const { apy, tvl_usd } = await fetchApy();
        return {
          success: true,
          output: {
            gmon_address: GMON,
            mon_per_gmon: Number(formatUnits(monPerGmon)),
            total_mon_staked: Number(formatUnits(totalStaked)),
            gmon_supply: Number(formatUnits(supply)),
            apy: apy != null ? `${apy.toFixed(2)}%` : null,
            tvl_usd,
            chain: 'monad', chain_id: CHAIN_ID,
            note: 'gMON appreciates against MON as staking rewards accrue (mon_per_gmon rises). APY/TVL from DefiLlama.',
          },
        };
      }

      // ── build_stake_tx (MON → gMON) ─────────────────────────────────────
      case 'build_stake_tx': {
        const { amount, sender } = input;
        if (!amount) return { success: false, error: 'amount (MON to stake) is required' };
        if (!sender || !isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required' };
        const wei = parseUnits(String(amount));
        if (wei <= 0n) return { success: false, error: 'amount must be greater than 0' };
        // depositMON(receiver = sender, referralId = 0), payable with msg.value = MON
        const data = '0x' + SEL.depositMON + p32(sender) + p32(0n);
        return {
          success: true,
          output: {
            transactions: [
              { to: GMON, data, value: '0x' + wei.toString(16), chain_id: CHAIN_ID,
                description: `Stake ${amount} MON on Magma, receive gMON` },
            ],
            action: 'stake', from: 'MON', to: 'gMON', amount_mon: String(amount),
            chain: 'monad', chain_id: CHAIN_ID, _operation: 'magma_stake',
            usage: 'Send the transaction from `sender` on Monad to stake. gMON is minted to `sender`.',
          },
        };
      }

      // ── build_unstake_tx (request gMON → MON) ───────────────────────────
      case 'build_unstake_tx': {
        const { amount, sender } = input;
        if (!amount) return { success: false, error: 'amount (gMON to unstake) is required' };
        if (!sender || !isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required' };
        const shares = parseUnits(String(amount));
        if (shares <= 0n) return { success: false, error: 'amount must be greater than 0' };
        // requestRedeem(shares, controller = sender, owner = sender). No ERC-20 approval needed (owner == caller).
        const data = '0x' + SEL.requestRedeem + p32(shares) + p32(sender) + p32(sender);
        return {
          success: true,
          output: {
            transactions: [
              { to: GMON, data, value: '0x0', chain_id: CHAIN_ID,
                description: `Request to unstake ${amount} gMON from Magma` },
            ],
            action: 'unstake_request', from: 'gMON', to: 'MON', amount_gmon: String(amount),
            chain: 'monad', chain_id: CHAIN_ID, _operation: 'magma_unstake_request',
            note: 'gMON uses ERC-7540 async redemption: this only REQUESTS the unstake. The requestRedeem event returns a requestId. After the unbonding window, call build_claim_tx with that requestId to receive MON.',
            usage: 'Send the transaction from `sender`. Read the requestId from the requestRedeem event, then use get_unstake_status / build_claim_tx.',
          },
        };
      }

      // ── build_claim_tx (claim MON after unbonding) ──────────────────────
      case 'build_claim_tx': {
        const { requestId, sender } = input;
        if (requestId === undefined || requestId === null || requestId === '') return { success: false, error: 'requestId (from your unstake request) is required' };
        if (!sender || !isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required' };
        let reqId: bigint;
        try { reqId = BigInt(requestId); } catch { return { success: false, error: 'requestId must be an integer' }; }
        // redeemMON(requestId, controller = sender, receiver = sender)
        const data = '0x' + SEL.redeemMON + p32(reqId) + p32(sender) + p32(sender);
        return {
          success: true,
          output: {
            transactions: [
              { to: GMON, data, value: '0x0', chain_id: CHAIN_ID,
                description: `Claim unstaked MON from Magma (request ${reqId.toString()})` },
            ],
            action: 'claim', request_id: reqId.toString(),
            chain: 'monad', chain_id: CHAIN_ID, _operation: 'magma_claim',
            note: 'Only succeeds after the unbonding window has elapsed and the request is claimable. Check get_unstake_status first.',
            usage: 'Send the transaction from `sender` to receive MON.',
          },
        };
      }

      // ── get_unstake_status ──────────────────────────────────────────────
      case 'get_unstake_status': {
        const { requestId, sender } = input;
        if (requestId === undefined || requestId === null || requestId === '') return { success: false, error: 'requestId is required' };
        if (!sender || !isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required' };
        let reqId: bigint;
        try { reqId = BigInt(requestId); } catch { return { success: false, error: 'requestId must be an integer' }; }
        const [pendingHex, claimableHex] = await Promise.all([
          ethCall(GMON, '0x' + SEL.pendingRedeemRequest   + p32(reqId) + p32(sender)),
          ethCall(GMON, '0x' + SEL.claimableRedeemRequest + p32(reqId) + p32(sender)),
        ]);
        const pending = readU256(pendingHex);
        const claimable = readU256(claimableHex);
        return {
          success: true,
          output: {
            request_id: reqId.toString(), owner: sender,
            pending_shares: Number(formatUnits(pending)),
            claimable_shares: Number(formatUnits(claimable)),
            claimable: claimable > 0n,
            chain: 'monad', chain_id: CHAIN_ID,
            note: 'pending_shares are still in the unbonding window; claimable_shares can be redeemed now via build_claim_tx.',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Valid: get_stake_info, build_stake_tx, build_unstake_tx, build_claim_tx, get_unstake_status` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Magma skill execution failed' };
  }
}
