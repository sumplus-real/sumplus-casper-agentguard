/**
 * Monad Chain Skill — Server-side execution against Monad mainnet
 *
 * Monad (https://monad.xyz) is a high-performance parallel-EVM L1 (mainnet live
 * since 2025-11-24). Fully EVM-compatible (Foundry, Hardhat, viem, ethers work
 * unmodified) with high throughput and short block times.
 *
 * Skill UUID: 4c5e5018-7b9f-4abf-93bc-552289936f7b
 *
 * Chain: Monad mainnet, chain ID 143 (0x8f).
 *   - Native gas: MON (18 decimals, like ETH wei)
 *   - Public RPC: https://rpc.monad.xyz (no auth; rpc1/rpc2/rpc3.monad.xyz are fallbacks)
 *   - Explorer:   https://monadexplorer.com
 *   - Override the RPC via the MONAD_RPC_URL env var.
 *
 * Token contracts (verified on-chain, symbol + decimals confirmed):
 *   WMON (wrapped native) : 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A  (18) — standard WETH9
 *   USDC                  : 0x754704Bc059F8C67012fEd69BC8A327a5aafb603  (6)
 *   USDT                  : 0xe7cd86e13AC4309349F30B3435a9d337750fC82D  (6)
 *   WETH                  : 0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242  (18)
 *   WBTC                  : 0x0555E30da8f98308EdB960aa94C0Db47230d2B9c  (8)
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ─── Chain config ────────────────────────────────────────────────────────────

const CHAIN_ID        = 143;
const CHAIN_ID_HEX    = '0x8f';
const NATIVE_SYMBOL   = 'MON';
const NATIVE_DECIMALS = 18;

const DEFAULT_RPC = 'https://rpc.monad.xyz';
const EXPLORER    = 'https://monadexplorer.com';

function getMonadRpcUrl(): string {
  return process.env.MONAD_RPC_URL || DEFAULT_RPC;
}

const TOKENS: Record<string, { address: string; decimals: number; name: string }> = {
  WMON: { address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', decimals: 18, name: 'Wrapped Monad' },
  USDC: { address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6,  name: 'USD Coin' },
  USDT: { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6,  name: 'Tether USD' },
  WETH: { address: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', decimals: 18, name: 'Wrapped Ether' },
  WBTC: { address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8,  name: 'Wrapped BTC' },
};
const WMON = TOKENS.WMON.address;

const SEL = {
  balanceOf: '70a08231', // balanceOf(address)
  transfer:  'a9059cbb', // transfer(address,uint256)
  decimals:  '313ce567',
  deposit:   'd0e30db0', // WETH9 deposit()
  withdraw:  '2e1a7d4d', // WETH9 withdraw(uint256)
};

// ─── JSON-RPC helper (proxy-aware) ───────────────────────────────────────────

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
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: rpcUrl, method: 'POST',
        headers: { Host: targetUrl.hostname, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 20000 };
    } else {
      client  = targetUrl.protocol === 'http:' ? http : https;
      options = { hostname: targetUrl.hostname, port: targetUrl.port || (targetUrl.protocol === 'http:' ? 80 : 443),
        path: targetUrl.pathname + targetUrl.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 20000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(`Monad RPC error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`));
          else resolve(parsed.result);
        } catch { reject(new Error(`Monad RPC parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Monad RPC timeout')); });
    req.write(payload);
    req.end();
  });
}

async function ethCall(to: string, data: string): Promise<string> {
  const result = await rpcPost(getMonadRpcUrl(), { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] });
  return (result as string) ?? '0x';
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}
function readU256(hex: string): bigint {
  const h = hex.replace(/^0x/, '');
  return BigInt('0x' + (h.slice(0, 64) || '0'));
}
function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
}
function formatUnits(value: bigint, decimals: number): string {
  const d = 10n ** BigInt(decimals);
  const whole = value / d, frac = value % d;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}
function isAddress(v: unknown): v is string { return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v); }
function isTxHash(v: unknown): v is string { return typeof v === 'string' && /^0x[a-fA-F0-9]{64}$/.test(v); }

async function resolveToken(input: string): Promise<{ address: string; decimals: number; symbol: string } | null> {
  const upper = input.toUpperCase();
  if (TOKENS[upper]) return { address: TOKENS[upper].address, decimals: TOKENS[upper].decimals, symbol: upper };
  if (isAddress(input)) {
    for (const [sym, t] of Object.entries(TOKENS)) if (t.address.toLowerCase() === input.toLowerCase()) return { address: t.address, decimals: t.decimals, symbol: sym };
    // unknown ERC-20: read decimals on-chain
    try { const d = Number(readU256(await ethCall(input, '0x' + SEL.decimals))); return { address: input, decimals: d, symbol: input.slice(0, 8) + '…' }; }
    catch { return null; }
  }
  return null;
}

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const MONAD_CHAIN_SKILL_METADATA = {
  id: '4c5e5018-7b9f-4abf-93bc-552289936f7b',
  name: 'Monad Chain',
  description:
    '[ARSENAL-HOSTED ✓] Direct access to Monad mainnet — a high-performance parallel-EVM L1 ' +
    '(chain ID 143, native gas MON). Query native MON and ERC-20 balances (USDC/USDT/WMON/WETH/WBTC), ' +
    'read chain state (block, gas price, tx receipts), build native and ERC-20 transfers, and wrap/unwrap ' +
    'MON ⇄ WMON. Uses the public no-auth Monad RPC (override via MONAD_RPC_URL).',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['monad', 'evm', 'parallel-evm', 'l1', 'mon', 'infrastructure', 'mainnet'],
  external_url: 'https://monad.xyz',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_chain_info', 'get_balance', 'get_token_balance', 'get_block_number', 'get_gas_price', 'get_tx_status', 'build_transfer_tx', 'build_token_transfer_tx', 'build_wrap_tx', 'build_unwrap_tx'],
        description:
          'get_chain_info: chain metadata, RPC, token addresses, explorer. ' +
          'get_balance: native MON balance of `address` (18 dec). ' +
          'get_token_balance: ERC-20 balance of `address` for `token` (symbol or address). ' +
          'get_block_number / get_gas_price / get_tx_status (by tx_hash). ' +
          'build_transfer_tx: native MON transfer (sender, recipient, amount). ' +
          'build_token_transfer_tx: ERC-20 transfer (sender, recipient, amount, token). ' +
          'build_wrap_tx: wrap MON → WMON (sender, amount). build_unwrap_tx: unwrap WMON → MON (sender, amount).',
      },
      address:   { type: 'string', description: 'EVM address (0x + 40 hex) — for get_balance / get_token_balance.' },
      sender:    { type: 'string', description: 'Transaction sender address — for build_* actions.' },
      recipient: { type: 'string', description: 'Transfer recipient address — for build_transfer_tx / build_token_transfer_tx.' },
      amount:    { type: 'string', description: 'Human-readable amount (e.g. "1.5"). Native MON + WMON use 18 dec; USDC/USDT use 6 dec.' },
      token:     { type: 'string', description: 'Token symbol (WMON/USDC/USDT/WETH/WBTC) or 0x address. Default USDC for token balance.' },
      tx_hash:   { type: 'string', description: 'Transaction hash (0x + 64 hex) for get_tx_status.' },
    },
  },
  usage_examples: [
    { title: 'Chain info',          input: { action: 'get_chain_info' } },
    { title: 'Native MON balance',  input: { action: 'get_balance', address: '0x0000000000000000000000000000000000000000' } },
    { title: 'USDC balance',        input: { action: 'get_token_balance', address: '0x...', token: 'USDC' } },
    { title: 'Wrap 1 MON',          input: { action: 'build_wrap_tx', sender: '0x...', amount: '1' } },
  ],
};

// ─── Action handlers ─────────────────────────────────────────────────────────

export async function executeMonadChainSkill(input: any): Promise<SkillExecutionResult> {
  const action = input?.action as string;
  try {
    switch (action) {

      case 'get_chain_info': {
        return {
          success: true,
          output: {
            chain: 'Monad', chain_id: CHAIN_ID, chain_id_hex: CHAIN_ID_HEX,
            native_token: { symbol: NATIVE_SYMBOL, decimals: NATIVE_DECIMALS },
            tagline: 'High-performance parallel-EVM L1 — full EVM compatibility, high throughput, short block times.',
            evm_compatible: true,
            tooling: ['Foundry', 'Hardhat', 'viem', 'wagmi', 'ethers'],
            rpc: { public: DEFAULT_RPC, fallbacks: ['https://rpc1.monad.xyz', 'https://rpc2.monad.xyz', 'https://rpc3.monad.xyz'], active: getMonadRpcUrl() },
            explorer: EXPLORER,
            tokens: Object.entries(TOKENS).map(([sym, t]) => ({ symbol: sym, ...t })),
            mainnet_status: 'mainnet live (since 2025-11-24)',
            docs: 'https://docs.monad.xyz',
          },
        };
      }

      case 'get_block_number': {
        const r = await rpcPost(getMonadRpcUrl(), { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] });
        return { success: true, output: { block_number: BigInt(r as string).toString(), block_number_hex: r } };
      }

      case 'get_gas_price': {
        const r = await rpcPost(getMonadRpcUrl(), { jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] });
        const wei = BigInt(r as string);
        return { success: true, output: { gas_price_wei: wei.toString(), gas_price_mon: `${formatUnits(wei, NATIVE_DECIMALS)} MON` } };
      }

      case 'get_balance': {
        if (!isAddress(input.address)) return { success: false, error: 'address must be a valid EVM address (0x + 40 hex)' };
        const r = await rpcPost(getMonadRpcUrl(), { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [input.address, 'latest'] });
        const wei = BigInt(r as string);
        return { success: true, output: { address: input.address, balance_wei: wei.toString(), balance_mon: formatUnits(wei, NATIVE_DECIMALS), unit: 'MON (native, 18 dec)' } };
      }

      case 'get_token_balance': {
        if (!isAddress(input.address)) return { success: false, error: 'address must be a valid EVM address (0x + 40 hex)' };
        const tok = await resolveToken((input.token as string) || 'USDC');
        if (!tok) return { success: false, error: `Unknown token "${input.token}". Known: ${Object.keys(TOKENS).join(', ')}, or pass a 0x address.` };
        const bal = readU256(await ethCall(tok.address, '0x' + SEL.balanceOf + p32(input.address)));
        return { success: true, output: { address: input.address, token: tok.symbol, token_address: tok.address, balance_raw: bal.toString(), balance: formatUnits(bal, tok.decimals), decimals: tok.decimals } };
      }

      case 'get_tx_status': {
        if (!isTxHash(input.tx_hash)) return { success: false, error: 'tx_hash must be a valid 0x + 64-hex string' };
        const receipt = await rpcPost(getMonadRpcUrl(), { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [input.tx_hash] });
        if (!receipt) return { success: true, output: { tx_hash: input.tx_hash, status: 'pending_or_unknown', note: 'No receipt yet — pending or does not exist.' } };
        const r = receipt as any;
        const statusInt = r.status ? parseInt(r.status, 16) : null;
        return {
          success: true,
          output: {
            tx_hash: r.transactionHash, block_number: r.blockNumber ? BigInt(r.blockNumber).toString() : null,
            from: r.from, to: r.to, contract_address: r.contractAddress ?? null,
            status: statusInt === 1 ? 'success' : statusInt === 0 ? 'failed' : 'unknown',
            gas_used: r.gasUsed ? BigInt(r.gasUsed).toString() : null,
            log_count: Array.isArray(r.logs) ? r.logs.length : 0,
            explorer_url: `${EXPLORER}/tx/${r.transactionHash}`,
          },
        };
      }

      case 'build_transfer_tx': {
        if (!isAddress(input.sender))    return { success: false, error: 'sender must be a valid EVM address' };
        if (!isAddress(input.recipient)) return { success: false, error: 'recipient must be a valid EVM address' };
        if (typeof input.amount !== 'string') return { success: false, error: 'amount must be a decimal string (e.g. "0.5")' };
        let valueWei: bigint;
        try { valueWei = parseUnits(input.amount, NATIVE_DECIMALS); } catch { return { success: false, error: `Invalid amount: "${input.amount}"` }; }
        return {
          success: true,
          output: {
            transactions: [{ kind: 'native_transfer', chainId: CHAIN_ID, from: input.sender, to: input.recipient, value: '0x' + valueWei.toString(16), data: '0x', description: `Send ${input.amount} MON from ${input.sender} to ${input.recipient} on Monad` }],
            amount_human: `${input.amount} MON`,
          },
        };
      }

      case 'build_token_transfer_tx': {
        if (!isAddress(input.sender))    return { success: false, error: 'sender must be a valid EVM address' };
        if (!isAddress(input.recipient)) return { success: false, error: 'recipient must be a valid EVM address' };
        if (typeof input.amount !== 'string') return { success: false, error: 'amount must be a decimal string (e.g. "1.5")' };
        const tok = await resolveToken((input.token as string) || 'USDC');
        if (!tok) return { success: false, error: `Unknown token "${input.token}". Known: ${Object.keys(TOKENS).join(', ')}.` };
        let amountRaw: bigint;
        try { amountRaw = parseUnits(input.amount, tok.decimals); } catch { return { success: false, error: `Invalid amount: "${input.amount}"` }; }
        const data = '0x' + SEL.transfer + p32(input.recipient) + p32(amountRaw);
        return {
          success: true,
          output: {
            transactions: [{ kind: 'erc20_transfer', chainId: CHAIN_ID, from: input.sender, to: tok.address, value: '0x0', data, description: `Transfer ${input.amount} ${tok.symbol} (${tok.decimals} dec) from ${input.sender} to ${input.recipient} on Monad` }],
            token: tok.symbol, token_address: tok.address, amount_human: `${input.amount} ${tok.symbol}`, amount_raw: amountRaw.toString(),
          },
        };
      }

      case 'build_wrap_tx': {
        if (!isAddress(input.sender)) return { success: false, error: 'sender must be a valid EVM address' };
        if (typeof input.amount !== 'string') return { success: false, error: 'amount must be a decimal string (e.g. "1")' };
        let valueWei: bigint;
        try { valueWei = parseUnits(input.amount, NATIVE_DECIMALS); } catch { return { success: false, error: `Invalid amount: "${input.amount}"` }; }
        return {
          success: true,
          output: {
            transactions: [{ kind: 'wrap', chainId: CHAIN_ID, from: input.sender, to: WMON, value: '0x' + valueWei.toString(16), data: '0x' + SEL.deposit, description: `Wrap ${input.amount} MON → WMON` }],
            amount_human: `${input.amount} MON → WMON`,
          },
        };
      }

      case 'build_unwrap_tx': {
        if (!isAddress(input.sender)) return { success: false, error: 'sender must be a valid EVM address' };
        if (typeof input.amount !== 'string') return { success: false, error: 'amount must be a decimal string (e.g. "1")' };
        let amountRaw: bigint;
        try { amountRaw = parseUnits(input.amount, NATIVE_DECIMALS); } catch { return { success: false, error: `Invalid amount: "${input.amount}"` }; }
        return {
          success: true,
          output: {
            transactions: [{ kind: 'unwrap', chainId: CHAIN_ID, from: input.sender, to: WMON, value: '0x0', data: '0x' + SEL.withdraw + p32(amountRaw), description: `Unwrap ${input.amount} WMON → MON` }],
            amount_human: `${input.amount} WMON → MON`,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_chain_info, get_balance, get_token_balance, get_block_number, get_gas_price, get_tx_status, build_transfer_tx, build_token_transfer_tx, build_wrap_tx, build_unwrap_tx` };
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}
