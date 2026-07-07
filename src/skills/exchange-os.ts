/**
 * Exchange OS Skill — OKX Exchange OS pre-launch toolkit on X Layer
 *
 * Exchange OS (announced 2026-05-26) is OKX's open market infrastructure on
 * X Layer. The protocol upgrade splits X Layer into two zones:
 *   - EVM zone     — standard EVM (chain ID 196), holds asset custody, OKB staking,
 *                    venue governance, escape-hatch withdrawals
 *   - TradeZone    — purpose-built non-EVM execution environment, ms-level matching,
 *                    300k TPS, gas-free for end users
 *
 * As of the announcement, the venue factory, OKB-staking-for-venue contract, and
 * TradeZone matching API are described in the whitepaper but NOT YET DEPLOYED to
 * mainnet. The first venue (World Cup Outcomes) is slated for June 2026.
 *
 * This v1 skill ships the X Layer EVM primitives that Exchange OS will sit on top
 * of: native OKB queries, WOKB (wrapped) querying + wrap/unwrap, and chain status.
 * Venue / stake / order actions will be added once Exchange OS contracts publish.
 *
 * Skill UUID: f4a82c19-3d6e-4b85-9c71-8e2f5a1d6b04
 *
 * Chain: X Layer mainnet, chain ID 196 (0xc4)
 *   - Native gas: OKB (18 decimals)
 *   - Public RPC: https://rpc.xlayer.tech         (no auth)
 *   - Alt RPC:    https://xlayerrpc.okx.com
 *   - Explorer:   https://www.oklink.com/x-layer
 *
 * Verified token contracts:
 *   WOKB (ERC-20 wrap)  : 0xe538905cf8410324e03a5a23c1c177a474d59b2b  (decimals 18)
 *
 * Override RPC via XLAYER_RPC_URL env var.
 *
 * Whitepaper: https://web3.okx.com/whitepaper/okx-exchange-os.pdf
 * Landing:    https://web3.okx.com/xlayer
 * Builder waitlist: https://form.typeform.com/to/gCWfCxuu
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ─── Chain config ────────────────────────────────────────────────────────────

const CHAIN_ID         = 196;
const CHAIN_ID_HEX     = '0xc4';
const NATIVE_SYMBOL    = 'OKB';
const NATIVE_DECIMALS  = 18;

const DEFAULT_RPC      = 'https://rpc.xlayer.tech';
const ALT_RPC          = 'https://xlayerrpc.okx.com';
const EXPLORER         = 'https://www.oklink.com/x-layer';

function getXLayerRpcUrl(): string {
  return process.env.XLAYER_RPC_URL || DEFAULT_RPC;
}

// Verified ERC-20 tokens on X Layer mainnet
const TOKENS: Record<string, { address: string; decimals: number; name: string }> = {
  WOKB: { address: '0xe538905cf8410324e03a5a23c1c177a474d59b2b', decimals: 18, name: 'Wrapped OKB' },
};

// ERC-20 / WETH9-style selectors
const SEL = {
  balanceOf: '70a08231', // balanceOf(address)
  transfer:  'a9059cbb', // transfer(address,uint256)
  deposit:   'd0e30db0', // deposit()                — WETH9 wrap
  withdraw:  '2e1a7d4d', // withdraw(uint256)        — WETH9 unwrap
};

// ─── JSON-RPC helper (mirrors arc-chain.ts pattern, supports proxy) ──────────

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
        port:     targetUrl.port || (targetUrl.protocol === 'http:' ? 80 : 443),
        path:     targetUrl.pathname + targetUrl.search,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout:  20000,
        family:   4,
      };
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(`X Layer RPC error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`));
          else resolve(parsed.result);
        } catch { reject(new Error(`X Layer RPC parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('X Layer RPC timeout')); });
    req.write(payload);
    req.end();
  });
}

async function ethCall(to: string, data: string): Promise<string> {
  const result = await rpcPost(getXLayerRpcUrl(), {
    jsonrpc: '2.0', id: 1,
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
  return (result as string) ?? '0x';
}

// ─── ABI / hex helpers ───────────────────────────────────────────────────────

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) {
    return v.slice(2).toLowerCase().padStart(64, '0');
  }
  return BigInt(v).toString(16).padStart(64, '0');
}

function readU256(hex: string): bigint {
  const h = hex.replace(/^0x/, '');
  return BigInt('0x' + (h.slice(0, 64) || '0'));
}

function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(fracPadded || '0');
}

function formatUnits(value: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole   = value / divisor;
  const frac    = value % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

function isAddress(v: unknown): v is string {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const EXCHANGE_OS_SKILL_METADATA = {
  id: 'f4a82c19-3d6e-4b85-9c71-8e2f5a1d6b04',
  name: 'Exchange OS',
  description:
    '[ARSENAL-HOSTED ✓] Pre-launch toolkit for OKX Exchange OS on X Layer (chain ID 196). ' +
    'Exchange OS is OKX\'s open market infrastructure — anyone can stake OKB to deploy ' +
    'spot/perps/RWA venues sharing a unified margin account. As of 2026-05-26 only the ' +
    'whitepaper is published; venue/staking/matching contracts go live with the first venue ' +
    '(World Cup Outcomes) in June 2026. This skill ships the X Layer EVM primitives Exchange OS ' +
    'sits on: chain info, native OKB balance, WOKB (wrapped OKB) ERC-20 balance, and ' +
    'wrap/unwrap transaction builders. Venue / stake / order actions will land once Exchange OS ' +
    'contracts publish.',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['exchange-os', 'okx', 'xlayer', 'okb', 'wokb', 'evm', 'market-infrastructure', 'pre-launch'],
  external_url: 'https://web3.okx.com/xlayer',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_chain_info',
          'get_okb_balance',
          'get_wokb_balance',
          'build_wrap_okb_tx',
          'build_unwrap_okb_tx',
        ],
        description:
          'get_chain_info: X Layer chain metadata, RPC URLs, WOKB address, Exchange OS launch status, links. ' +
          'get_okb_balance: native OKB balance of `address` (18 decimals — native gas token on X Layer). ' +
          'get_wokb_balance: WOKB ERC-20 balance of `address` (18 decimals). ' +
          'build_wrap_okb_tx: wrap native OKB into WOKB — params: sender, amount (human, 18-dec). ' +
          'build_unwrap_okb_tx: unwrap WOKB back to native OKB — params: sender, amount (human, 18-dec).',
      },
      address: { type: 'string', description: 'EVM address (0x + 40 hex) — for get_okb_balance / get_wokb_balance.' },
      sender:  { type: 'string', description: 'Transaction sender address (0x + 40 hex) — for build_* actions.' },
      amount:  { type: 'string', description: 'Human-readable amount in OKB / WOKB (e.g. "1.5") — for build_* actions.' },
    },
  },
  usage_examples: [
    { title: 'Chain info',          input: { action: 'get_chain_info' } },
    { title: 'Native OKB balance',  input: { action: 'get_okb_balance', address: '0x0000000000000000000000000000000000000000' } },
    { title: 'WOKB balance',        input: { action: 'get_wokb_balance', address: '0x0000000000000000000000000000000000000000' } },
    { title: 'Wrap 1 OKB',          input: { action: 'build_wrap_okb_tx', sender: '0x...', amount: '1.0' } },
    { title: 'Unwrap 1 WOKB',       input: { action: 'build_unwrap_okb_tx', sender: '0x...', amount: '1.0' } },
  ],
};

// ─── Action handlers ─────────────────────────────────────────────────────────

export async function executeExchangeOsSkill(input: any): Promise<SkillExecutionResult> {
  const action = input?.action as string;
  try {
    switch (action) {

      case 'get_chain_info': {
        const usingEnvRpc = !!process.env.XLAYER_RPC_URL;
        return {
          success: true,
          output: {
            chain: 'X Layer mainnet',
            chain_id: CHAIN_ID,
            chain_id_hex: CHAIN_ID_HEX,
            native_token: { symbol: NATIVE_SYMBOL, decimals: NATIVE_DECIMALS, role: 'native gas + venue-deploy staking asset' },
            tagline: 'OKX\'s L2 — now multi-zone (EVM + TradeZone) host for Exchange OS market infrastructure.',
            multi_zone: {
              evm: { purpose: 'asset custody, OKB staking, venue governance, escape-hatch withdrawals', rpc: DEFAULT_RPC },
              tradezone: { purpose: 'ms-level matching, 300k TPS, gas-free trading', api: 'not yet published (as of 2026-05-26)' },
            },
            rpc: { primary: DEFAULT_RPC, alt: ALT_RPC, active: usingEnvRpc ? 'env (XLAYER_RPC_URL)' : 'public' },
            explorer: EXPLORER,
            wokb_address: TOKENS.WOKB.address,
            exchange_os: {
              status: 'announced — first venue (World Cup Outcomes) targeted June 2026',
              whitepaper: 'https://web3.okx.com/whitepaper/okx-exchange-os.pdf',
              landing: 'https://web3.okx.com/xlayer',
              builder_waitlist: 'https://form.typeform.com/to/gCWfCxuu',
              pending_contracts: ['OKB venue-staking contract', 'Venue factory', 'Unified margin / deposit contract', 'TradeZone matching API'],
            },
            evm_compatible: true,
            tooling: ['Foundry', 'Hardhat', 'viem', 'wagmi', 'ethers'],
          },
        };
      }

      case 'get_okb_balance': {
        if (!isAddress(input.address)) {
          return { success: false, error: 'address must be a valid EVM address (0x + 40 hex)' };
        }
        const r = await rpcPost(getXLayerRpcUrl(), {
          jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
          params: [input.address, 'latest'],
        });
        const wei = BigInt(r as string);
        return {
          success: true,
          output: {
            address: input.address,
            balance_wei: wei.toString(),
            balance_okb: formatUnits(wei, NATIVE_DECIMALS),
            unit: 'OKB (native gas, 18 decimals)',
            note: 'This is X Layer\'s native gas token. Use get_wokb_balance for the ERC-20 wrapped form.',
          },
        };
      }

      case 'get_wokb_balance': {
        if (!isAddress(input.address)) {
          return { success: false, error: 'address must be a valid EVM address (0x + 40 hex)' };
        }
        const data = '0x' + SEL.balanceOf + p32(input.address);
        const r = await ethCall(TOKENS.WOKB.address, data);
        const bal = readU256(r);
        return {
          success: true,
          output: {
            address: input.address,
            token: 'WOKB',
            token_address: TOKENS.WOKB.address,
            balance_raw: bal.toString(),
            balance: formatUnits(bal, TOKENS.WOKB.decimals),
            decimals: TOKENS.WOKB.decimals,
          },
        };
      }

      case 'build_wrap_okb_tx': {
        if (!isAddress(input.sender)) return { success: false, error: 'sender must be a valid EVM address' };
        if (typeof input.amount !== 'string') return { success: false, error: 'amount must be a decimal string (e.g. "1.5")' };
        let valueWei: bigint;
        try { valueWei = parseUnits(input.amount, NATIVE_DECIMALS); }
        catch { return { success: false, error: `Invalid amount: "${input.amount}"` }; }
        if (valueWei <= 0n) return { success: false, error: 'amount must be positive' };

        return {
          success: true,
          output: {
            transactions: [{
              kind:    'wokb_wrap',
              chainId: CHAIN_ID,
              from:    input.sender,
              to:      TOKENS.WOKB.address,
              value:   '0x' + valueWei.toString(16),
              data:    '0x' + SEL.deposit,
              description: `Wrap ${input.amount} native OKB into WOKB on X Layer`,
            }],
            amount_human: `${input.amount} OKB → ${input.amount} WOKB`,
            amount_wei:   valueWei.toString(),
            wokb_address: TOKENS.WOKB.address,
            note: 'Sender must hold at least `amount` native OKB plus a small extra for gas.',
          },
        };
      }

      case 'build_unwrap_okb_tx': {
        if (!isAddress(input.sender)) return { success: false, error: 'sender must be a valid EVM address' };
        if (typeof input.amount !== 'string') return { success: false, error: 'amount must be a decimal string (e.g. "1.5")' };
        let amountWei: bigint;
        try { amountWei = parseUnits(input.amount, TOKENS.WOKB.decimals); }
        catch { return { success: false, error: `Invalid amount: "${input.amount}"` }; }
        if (amountWei <= 0n) return { success: false, error: 'amount must be positive' };

        const data = '0x' + SEL.withdraw + p32(amountWei);
        return {
          success: true,
          output: {
            transactions: [{
              kind:    'wokb_unwrap',
              chainId: CHAIN_ID,
              from:    input.sender,
              to:      TOKENS.WOKB.address,
              value:   '0x0',
              data,
              description: `Unwrap ${input.amount} WOKB into native OKB on X Layer`,
            }],
            amount_human: `${input.amount} WOKB → ${input.amount} OKB`,
            amount_raw:   amountWei.toString(),
            wokb_address: TOKENS.WOKB.address,
            note: 'Sender must hold at least `amount` WOKB. Gas is paid in native OKB; ensure a small balance for that.',
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_chain_info, get_okb_balance, get_wokb_balance, build_wrap_okb_tx, build_unwrap_okb_tx`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}
