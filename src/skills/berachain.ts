/**
 * Berachain Chain Toolkit — Server-side execution
 *
 * Berachain is an EVM Layer-1 (chain ID 80094) with a Proof-of-Liquidity
 * consensus. Native gas token is BERA; the canonical wrapped form is WBERA
 * (a standard WETH9 at 0x6969…6969). This skill provides core chain
 * primitives: chain info, balances, gas price, transfers, and BERA<>WBERA
 * wrapping.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Berachain's public RPC directly. No API key needed.
 *
 * Verified on-chain (2026-07, chain ID 80094 = 0x138de):
 *   RPC:   https://rpc.berachain.com  (eth_chainId → 0x138de)
 *   WBERA: 0x6969696969696969696969696969696969696969 (18 dec, WETH9)
 *          - wrap:   deposit()            [0xd0e30db0]  payable (msg.value == amount)
 *          - unwrap: withdraw(uint256)    [0x2e1a7d4d]
 *   Token addresses & decimals confirmed via DefiLlama coins API.
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Constants ───────────────────────────────────────────────────────────────
const CHAIN_ID    = 80094;
const DEFAULT_RPC = 'https://rpc.berachain.com';
const EXPLORER    = 'https://berascan.com';
const WBERA       = '0x6969696969696969696969696969696969696969';

function getRpcUrl(): string { return process.env.BERACHAIN_RPC_URL || DEFAULT_RPC; }

/** Well-known Berachain tokens (addresses + decimals verified via DefiLlama coins API). */
const TOKENS: Record<string, { address: string; decimals: number }> = {
  WBERA:  { address: '0x6969696969696969696969696969696969696969', decimals: 18 },
  HONEY:  { address: '0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce', decimals: 18 },
  USDC:   { address: '0x549943e04f40284185054145c6E4e9568C1D3241', decimals: 6  }, // USDC.e
  USDT:   { address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', decimals: 6  }, // USDT0
  WETH:   { address: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590', decimals: 18 },
  WBTC:   { address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8  },
  IBGT:   { address: '0xac03CABA51e17c86c921E1f6CBFBdC91F8BB2E6b', decimals: 18 },
  IBERA:  { address: '0x9b6761bf2397Bb5a6624a856cC84A3A14DcD3fe5', decimals: 18 },
  BGT:    { address: '0x656b95E550C07a9ffe548bd4085c72418Ceb1dba', decimals: 18 },
  BYUSD:  { address: '0x688e72142674041f8f6Af4c808a4045cA1D6aC82', decimals: 6  },
};

// ── ABI selectors ───────────────────────────────────────────────────────────
const SEL = {
  balanceOf:     '70a08231', // balanceOf(address)
  decimals:      '313ce567', // decimals()
  transfer:      'a9059cbb', // transfer(address,uint256)
  wrap:          'd0e30db0', // deposit()  payable
  unwrap:        '2e1a7d4d', // withdraw(uint256)
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

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  return rpcPost({ jsonrpc: '2.0', id: 1, method, params });
}
async function ethCall(to: string, data: string): Promise<string> {
  return (await rpcCall('eth_call', [{ to, data }, 'latest'])) ?? '0x';
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
function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = String(value).split('.');
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
  const decimals = Number(readU256(await ethCall(raw, '0x' + SEL.decimals)));
  return { address: raw, decimals, symbol: raw.slice(0, 8) + '…' };
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const BERACHAIN_SKILL_METADATA = {
  name: 'Berachain Chain Toolkit',
  description:
    '[ARSENAL-HOSTED ✓] Core chain primitives for Berachain (EVM L1, chain ID 80094, native gas token BERA). ' +
    'Read chain info, native BERA + ERC-20 balances, and live gas price; build native/ERC-20 transfer transactions; ' +
    'wrap BERA into WBERA and unwrap WBERA back into BERA (WBERA is a standard WETH9 at 0x6969…6969).\n\n' +
    'execution_mode: server-side\n' +
    'chain: berachain (id: 80094)\n' +
    'rpc: https://rpc.berachain.com\n' +
    'gas_token: BERA\n' +
    'sop_compliance:\n' +
    '  uses_authoritative_contracts: true',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['berachain', 'bera', 'wbera', 'evm', 'chain', 'toolkit', 'transfer', 'wrap', 'infrastructure'],
  external_url: 'https://www.berachain.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/berachain?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_chain_info', 'get_balance', 'get_gas_price', 'build_transfer_tx', 'wrap_bera', 'unwrap_wbera'],
        description:
          'get_chain_info: chain ID, native/wrapped token, RPC, explorer, live gas price and latest block. ' +
          'get_balance: native BERA balance, or ERC-20 balance when `token` is given (needs sender/address). ' +
          'get_gas_price: current gas price on Berachain. ' +
          'build_transfer_tx: transfer BERA (or an ERC-20 when `token` given) to `to` (needs sender, to, amount). ' +
          'wrap_bera: wrap BERA into WBERA via deposit() (needs sender, amount). ' +
          'unwrap_wbera: unwrap WBERA back into BERA via withdraw() (needs sender, amount).',
      },
      sender:  { type: 'string', description: 'Wallet address (0x…, 40 hex) — the tx originator / signer. Required for build_transfer_tx, wrap_bera, unwrap_wbera, and get_balance.' },
      address: { type: 'string', description: 'Alias for the address to query in get_balance (use sender or address).' },
      to:      { type: 'string', description: 'Destination address for build_transfer_tx (0x…, 40 hex).' },
      amount:  { type: 'string', description: 'Human-readable amount (e.g. "1.5"). For build_transfer_tx: amount of BERA or the ERC-20 token. For wrap/unwrap: amount of BERA/WBERA.' },
      token:   { type: 'string', description: 'Optional token symbol (WBERA, HONEY, USDC, USDT, WETH, WBTC, IBGT, IBERA, BGT, BYUSD) or 0x address. Omit for native BERA.' },
    },
  },
  usage_examples: [
    { title: 'Chain info', input: { action: 'get_chain_info' } },
    { title: 'Native BERA balance', input: { action: 'get_balance', address: '0xYourAddress' } },
    { title: 'HONEY balance', input: { action: 'get_balance', address: '0xYourAddress', token: 'HONEY' } },
    { title: 'Gas price', input: { action: 'get_gas_price' } },
    { title: 'Transfer 5 BERA', input: { action: 'build_transfer_tx', sender: '0xYourAddress', to: '0xDest', amount: '5' } },
    { title: 'Transfer 100 HONEY', input: { action: 'build_transfer_tx', sender: '0xYourAddress', to: '0xDest', amount: '100', token: 'HONEY' } },
    { title: 'Wrap 10 BERA', input: { action: 'wrap_bera', sender: '0xYourAddress', amount: '10' } },
    { title: 'Unwrap 10 WBERA', input: { action: 'unwrap_wbera', sender: '0xYourAddress', amount: '10' } },
  ],
};

// ── Action handlers ───────────────────────────────────────────────────────────

async function getChainInfo(): Promise<SkillExecutionResult> {
  let gasPrice: string | null = null;
  let latestBlock: number | null = null;
  try {
    const [gp, bn] = await Promise.all([
      rpcCall('eth_gasPrice', []),
      rpcCall('eth_blockNumber', []),
    ]);
    if (gp) gasPrice = formatUnits(BigInt(gp), 9) + ' gwei';
    if (bn) latestBlock = Number(BigInt(bn));
  } catch { /* non-fatal */ }
  return {
    success: true,
    output: {
      name: 'Berachain',
      chain_id: CHAIN_ID,
      native_token: 'BERA',
      wrapped_native: { symbol: 'WBERA', address: WBERA, decimals: 18 },
      rpc: getRpcUrl(),
      explorer: EXPLORER,
      consensus: 'Proof-of-Liquidity (PoL)',
      gas_price: gasPrice,
      latest_block: latestBlock,
      well_known_tokens: TOKENS,
      website: 'https://www.berachain.com',
    },
  };
}

async function getBalance(input: any): Promise<SkillExecutionResult> {
  const who = input.sender ?? input.address;
  if (!isAddr(who)) return { success: false, error: 'A valid sender/address (0x…, 40 hex) is required.' };
  try {
    if (!input.token) {
      const balHex = await rpcCall('eth_getBalance', [who, 'latest']);
      const raw = BigInt(balHex ?? '0x0');
      return { success: true, output: { address: who, token: 'BERA', native: true, balance: formatUnits(raw, 18), balance_raw: raw.toString(), decimals: 18, chain: 'berachain', chain_id: CHAIN_ID } };
    }
    const t = await resolveToken(String(input.token));
    const raw = readU256(await ethCall(t.address, '0x' + SEL.balanceOf + p32(who)));
    return { success: true, output: { address: who, token: t.symbol, token_address: t.address, native: false, balance: formatUnits(raw, t.decimals), balance_raw: raw.toString(), decimals: t.decimals, chain: 'berachain', chain_id: CHAIN_ID } };
  } catch (err: any) { return { success: false, error: `get_balance failed: ${err.message}` }; }
}

async function getGasPrice(): Promise<SkillExecutionResult> {
  try {
    const gp = await rpcCall('eth_gasPrice', []);
    const wei = BigInt(gp ?? '0x0');
    return { success: true, output: { gas_price_wei: wei.toString(), gas_price_gwei: formatUnits(wei, 9), chain: 'berachain', chain_id: CHAIN_ID } };
  } catch (err: any) { return { success: false, error: `get_gas_price failed: ${err.message}` }; }
}

async function buildTransferTx(input: any): Promise<SkillExecutionResult> {
  const { sender, to, amount, token } = input;
  if (!isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required.' };
  if (!isAddr(to))     return { success: false, error: 'A valid destination `to` address (0x…, 40 hex) is required.' };
  if (!amount)         return { success: false, error: 'amount is required.' };
  try {
    if (!token) {
      const wei = parseUnits(String(amount), 18);
      if (wei <= 0n) return { success: false, error: 'amount must be greater than 0' };
      return {
        success: true,
        output: {
          transactions: [ { to, data: '0x', value: '0x' + wei.toString(16), chain_id: CHAIN_ID, description: `Transfer ${amount} BERA to ${to}` } ],
          action: 'transfer', token: 'BERA', amount: String(amount), from: sender, recipient: to, chain: 'berachain', chain_id: CHAIN_ID,
        },
      };
    }
    const t = await resolveToken(String(token));
    const raw = parseUnits(String(amount), t.decimals);
    if (raw <= 0n) return { success: false, error: 'amount must be greater than 0' };
    const data = '0x' + SEL.transfer + p32(to) + p32(raw);
    return {
      success: true,
      output: {
        transactions: [ { to: t.address, data, value: '0x0', chain_id: CHAIN_ID, description: `Transfer ${amount} ${t.symbol} to ${to}` } ],
        action: 'transfer', token: t.symbol, token_address: t.address, amount: String(amount), from: sender, recipient: to, chain: 'berachain', chain_id: CHAIN_ID,
      },
    };
  } catch (err: any) { return { success: false, error: `build_transfer_tx failed: ${err.message}` }; }
}

async function wrapBera(input: any): Promise<SkillExecutionResult> {
  const { sender, amount } = input;
  if (!isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required.' };
  if (!amount) return { success: false, error: 'amount (BERA to wrap) is required.' };
  const wei = parseUnits(String(amount), 18);
  if (wei <= 0n) return { success: false, error: 'amount must be greater than 0' };
  return {
    success: true,
    output: {
      transactions: [ { to: WBERA, data: '0x' + SEL.wrap, value: '0x' + wei.toString(16), chain_id: CHAIN_ID, description: `Wrap ${amount} BERA into WBERA` } ],
      action: 'wrap', from: 'BERA', to: 'WBERA', amount: String(amount), sender, chain: 'berachain', chain_id: CHAIN_ID,
    },
  };
}

async function unwrapWbera(input: any): Promise<SkillExecutionResult> {
  const { sender, amount } = input;
  if (!isAddr(sender)) return { success: false, error: 'A valid sender address (0x…, 40 hex) is required.' };
  if (!amount) return { success: false, error: 'amount (WBERA to unwrap) is required.' };
  const wei = parseUnits(String(amount), 18);
  if (wei <= 0n) return { success: false, error: 'amount must be greater than 0' };
  return {
    success: true,
    output: {
      transactions: [ { to: WBERA, data: '0x' + SEL.unwrap + p32(wei), value: '0x0', chain_id: CHAIN_ID, description: `Unwrap ${amount} WBERA into BERA` } ],
      action: 'unwrap', from: 'WBERA', to: 'BERA', amount: String(amount), sender, chain: 'berachain', chain_id: CHAIN_ID,
    },
  };
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeBerachainSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_chain_info':    return getChainInfo();
      case 'get_balance':       return getBalance(input);
      case 'get_gas_price':     return getGasPrice();
      case 'build_transfer_tx': return buildTransferTx(input);
      case 'wrap_bera':         return wrapBera(input);
      case 'unwrap_wbera':      return unwrapWbera(input);
      default:
        return { success: false, error: `Unknown action "${action}". Valid: get_chain_info, get_balance, get_gas_price, build_transfer_tx, wrap_bera, unwrap_wbera` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Berachain skill execution failed' };
  }
}
