/**
 * Arc Chain Skill — Server-side execution against Arc Testnet
 *
 * Arc (https://docs.arc.network) is Circle's USDC-native EVM L1 — every transaction
 * pays gas in USDC rather than ETH/BNB/SOL. The chain is EVM-compatible (Foundry,
 * Hardhat, viem, ethers all work unmodified) with sub-second finality.
 *
 * Skill UUID: c8e3a5d2-7f91-4b6e-9d24-3a8f5c7e1b09
 *
 * Chain: Arc Testnet, chain ID 5042002 (0x4CEF52), CCTP domain 26.
 *   - Native gas: USDC (18 decimals in gas-form, 6 decimals as ERC-20)
 *   - Public RPC: https://rpc.testnet.arc.network  (no auth)
 *   - Canteen RPC: https://rpc.testnet.arc-node.thecanteenapp.com/v1/<token>  (Bearer auth, run `arc-canteen login` to mint)
 *   - WebSocket:   wss://rpc.testnet.arc.network
 *   - Explorer:    https://testnet.arcscan.app
 *   - Faucet:      https://faucet.circle.com
 *
 * Token contracts (verified on-chain):
 *   USDC (ERC-20)  : 0x3600000000000000000000000000000000000000  (decimals 6)
 *   EURC (ERC-20)  : 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a  (decimals 6)
 *
 * To route through Canteen (higher rate limits, per-user telemetry), set the
 * ARC_RPC_URL env var on Vercel to the URL printed by `arc-canteen rpc-url`.
 * Otherwise the skill uses the unauthenticated public Circle endpoint.
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ─── Chain config ────────────────────────────────────────────────────────────

const CHAIN_ID         = 5042002;
const CHAIN_ID_HEX     = '0x4CEF52';
const NATIVE_SYMBOL    = 'USDC';
const NATIVE_DECIMALS  = 18;            // gas-form, like ETH wei
const CCTP_DOMAIN      = 26;

const DEFAULT_RPC      = 'https://rpc.testnet.arc.network';
const WS_RPC           = 'wss://rpc.testnet.arc.network';
const EXPLORER         = 'https://testnet.arcscan.app';
const FAUCET           = 'https://faucet.circle.com';

function getArcRpcUrl(): string {
  return process.env.ARC_RPC_URL || DEFAULT_RPC;
}

// ERC-20 tokens on Arc Testnet
const TOKENS: Record<string, { address: string; decimals: number; name: string }> = {
  USDC: { address: '0x3600000000000000000000000000000000000000', decimals: 6, name: 'USD Coin' },
  EURC: { address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', decimals: 6, name: 'Euro Coin' },
};

// ERC-20 selectors
const SEL = {
  balanceOf: '70a08231', // balanceOf(address)
  transfer:  'a9059cbb', // transfer(address,uint256)
  decimals:  '313ce567',
  symbol:    '95d89b41',
};

// ─── JSON-RPC helper (mirrors daoaas-swap.ts pattern, supports proxy) ────────

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
          if (parsed.error) reject(new Error(`Arc RPC error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`));
          else resolve(parsed.result);
        } catch { reject(new Error(`Arc RPC parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Arc RPC timeout')); });
    req.write(payload);
    req.end();
  });
}

async function ethCall(to: string, data: string): Promise<string> {
  const result = await rpcPost(getArcRpcUrl(), {
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

function isTxHash(v: unknown): v is string {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{64}$/.test(v);
}

function resolveToken(input: string): { address: string; decimals: number; symbol: string } | null {
  // Symbol path
  const upper = input.toUpperCase();
  if (TOKENS[upper]) return { ...TOKENS[upper], symbol: upper };

  // Address path
  if (isAddress(input)) {
    // Match against known map first
    for (const [sym, t] of Object.entries(TOKENS)) {
      if (t.address.toLowerCase() === input.toLowerCase()) {
        return { address: t.address, decimals: t.decimals, symbol: sym };
      }
    }
    // Unknown ERC-20: caller must supply decimals separately or use known tokens
    return null;
  }
  return null;
}

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const ARC_CHAIN_SKILL_METADATA = {
  id: 'c8e3a5d2-7f91-4b6e-9d24-3a8f5c7e1b09',
  name: 'Arc Chain',
  description:
    '[ARSENAL-HOSTED ✓] Direct access to Arc Testnet — Circle\'s USDC-native EVM L1 ' +
    '(chain ID 5042002) where every transaction pays gas in USDC instead of ETH. ' +
    'Query balances (native gas-form USDC at 18 decimals, ERC-20 USDC/EURC at 6 decimals), ' +
    'check chain state (block, gas price, tx receipts), and build transfer transactions. ' +
    'Uses the public Circle-operated RPC by default; falls back to the Canteen-hosted ' +
    'authenticated RPC via the ARC_RPC_URL env var. Get testnet USDC from faucet.circle.com.',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['arc', 'arc-testnet', 'circle', 'usdc', 'evm', 'cctp', 'stablecoin-l1', 'agent-payments'],
  external_url: 'https://docs.arc.network',
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
          'get_balance',
          'get_token_balance',
          'get_block_number',
          'get_gas_price',
          'get_tx_status',
          'build_transfer_tx',
          'build_token_transfer_tx',
        ],
        description:
          'get_chain_info: chain metadata, RPC URLs, USDC/EURC addresses, explorer, faucet. ' +
          'get_balance: native USDC-gas balance of `address` (18-decimal gas-form). ' +
          'get_token_balance: ERC-20 USDC or EURC balance of `address` (6-decimal). ' +
          'get_block_number: current head block height. ' +
          'get_gas_price: current gas price in USDC-gas wei (18 dec). ' +
          'get_tx_status: transaction receipt by `tx_hash` (status, gas used, logs). ' +
          'build_transfer_tx: build native USDC-gas transfer — params: sender, recipient, amount (in 18-dec USDC). ' +
          'build_token_transfer_tx: build ERC-20 USDC or EURC transfer — params: sender, recipient, amount (in 6-dec), token (USDC or EURC, default USDC).',
      },
      address:   { type: 'string', description: 'EVM address (0x + 40 hex) — for get_balance / get_token_balance.' },
      sender:    { type: 'string', description: 'Transaction sender address (0x + 40 hex) — for build_* actions.' },
      recipient: { type: 'string', description: 'Transfer recipient address (0x + 40 hex) — for build_* actions.' },
      amount:    { type: 'string', description: 'Human-readable amount (e.g. "1.5"). Native build_transfer_tx uses 18-dec USDC-gas; token transfer uses 6-dec ERC-20.' },
      token:     { type: 'string', description: 'Token symbol or address for token actions — USDC or EURC (default: USDC).' },
      tx_hash:   { type: 'string', description: 'Transaction hash (0x + 64 hex) for get_tx_status.' },
    },
  },
  usage_examples: [
    { title: 'Chain info',           input: { action: 'get_chain_info' } },
    { title: 'Native USDC balance',  input: { action: 'get_balance', address: '0x0000000000000000000000000000000000000000' } },
    { title: 'ERC-20 USDC balance',  input: { action: 'get_token_balance', address: '0x...', token: 'USDC' } },
    { title: 'Build USDC transfer',  input: { action: 'build_token_transfer_tx', sender: '0x...', recipient: '0x...', amount: '1.0', token: 'USDC' } },
  ],
};

// ─── Action handlers ─────────────────────────────────────────────────────────

export async function executeArcChainSkill(input: any): Promise<SkillExecutionResult> {
  const action = input?.action as string;
  try {
    switch (action) {

      case 'get_chain_info': {
        const usingCanteen = !!process.env.ARC_RPC_URL;
        return {
          success: true,
          output: {
            chain: 'Arc Testnet',
            chain_id: CHAIN_ID,
            chain_id_hex: CHAIN_ID_HEX,
            cctp_domain: CCTP_DOMAIN,
            native_token: {
              symbol: NATIVE_SYMBOL,
              decimals_gas_form: NATIVE_DECIMALS,
              note: 'Native gas uses 18 decimals (like ETH wei). The same USDC as ERC-20 uses 6 decimals — do not mix.',
            },
            tagline: "Circle's USDC-native EVM L1 — gas paid in USDC, sub-second finality, full EVM tooling support.",
            evm_compatible: true,
            tooling: ['Foundry', 'Hardhat', 'viem (arcTestnet built-in)', 'wagmi', 'ethers'],
            rpc: {
              public:    DEFAULT_RPC,
              websocket: WS_RPC,
              canteen:   'https://rpc.testnet.arc-node.thecanteenapp.com/v1/<token> — run `arc-canteen login` to mint, then set ARC_RPC_URL env var',
              active:    usingCanteen ? 'canteen (env)' : 'public',
            },
            explorer:  EXPLORER,
            faucet:    FAUCET,
            tokens:    Object.entries(TOKENS).map(([sym, t]) => ({ symbol: sym, ...t })),
            mainnet_status: 'testnet only — Arc mainnet not yet provisioned',
            docs:      'https://docs.arc.network',
          },
        };
      }

      case 'get_block_number': {
        const r = await rpcPost(getArcRpcUrl(), { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] });
        const bn = BigInt(r as string);
        return { success: true, output: { block_number: bn.toString(), block_number_hex: r } };
      }

      case 'get_gas_price': {
        const r = await rpcPost(getArcRpcUrl(), { jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] });
        const wei = BigInt(r as string);
        return {
          success: true,
          output: {
            gas_price_wei: wei.toString(),
            gas_price_usdc_gas: `${formatUnits(wei, NATIVE_DECIMALS)} USDC (gas-form, 18 dec)`,
            note: 'Gas is denominated in 18-dec gas-form USDC; 1 USDC = 1e18 gas-wei.',
          },
        };
      }

      case 'get_balance': {
        if (!isAddress(input.address)) {
          return { success: false, error: 'address must be a valid EVM address (0x + 40 hex)' };
        }
        const r = await rpcPost(getArcRpcUrl(), {
          jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
          params: [input.address, 'latest'],
        });
        const wei = BigInt(r as string);
        return {
          success: true,
          output: {
            address: input.address,
            balance_wei: wei.toString(),
            balance_usdc_gas: formatUnits(wei, NATIVE_DECIMALS),
            unit: 'USDC (native gas-form, 18 decimals)',
            note: 'This is the chain\'s native balance used to pay gas. For the ERC-20 USDC balance held by the account, use get_token_balance.',
          },
        };
      }

      case 'get_token_balance': {
        if (!isAddress(input.address)) {
          return { success: false, error: 'address must be a valid EVM address (0x + 40 hex)' };
        }
        const tokenInput = (input.token as string) || 'USDC';
        const tok = resolveToken(tokenInput);
        if (!tok) {
          return {
            success: false,
            error: `Unknown token "${tokenInput}". Known: ${Object.keys(TOKENS).join(', ')}. ` +
                   `For arbitrary ERC-20s, supply the contract address — Arc currently has only USDC and EURC issued by Circle.`,
          };
        }
        const data = '0x' + SEL.balanceOf + p32(input.address);
        const r = await ethCall(tok.address, data);
        const bal = readU256(r);
        return {
          success: true,
          output: {
            address: input.address,
            token: tok.symbol,
            token_address: tok.address,
            balance_raw: bal.toString(),
            balance: formatUnits(bal, tok.decimals),
            decimals: tok.decimals,
          },
        };
      }

      case 'get_tx_status': {
        if (!isTxHash(input.tx_hash)) {
          return { success: false, error: 'tx_hash must be a valid 0x + 64-hex string' };
        }
        const receipt = await rpcPost(getArcRpcUrl(), {
          jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt',
          params: [input.tx_hash],
        });
        if (!receipt) {
          return {
            success: true,
            output: {
              tx_hash: input.tx_hash,
              status: 'pending_or_unknown',
              note: 'No receipt yet — either the transaction is still pending or it does not exist on this chain.',
            },
          };
        }
        const r = receipt as any;
        const statusInt = r.status ? parseInt(r.status, 16) : null;
        return {
          success: true,
          output: {
            tx_hash:        r.transactionHash,
            block_number:   r.blockNumber ? BigInt(r.blockNumber).toString() : null,
            from:           r.from,
            to:             r.to,
            contract_address: r.contractAddress ?? null,
            status:         statusInt === 1 ? 'success' : statusInt === 0 ? 'failed' : 'unknown',
            gas_used:       r.gasUsed ? BigInt(r.gasUsed).toString() : null,
            effective_gas_price: r.effectiveGasPrice ? BigInt(r.effectiveGasPrice).toString() : null,
            log_count:      Array.isArray(r.logs) ? r.logs.length : 0,
            explorer_url:   `${EXPLORER}/tx/${r.transactionHash}`,
          },
        };
      }

      case 'build_transfer_tx': {
        if (!isAddress(input.sender))    return { success: false, error: 'sender must be a valid EVM address' };
        if (!isAddress(input.recipient)) return { success: false, error: 'recipient must be a valid EVM address' };
        if (typeof input.amount !== 'string') return { success: false, error: 'amount must be a decimal string in 18-dec USDC (e.g. "0.5")' };
        let valueWei: bigint;
        try { valueWei = parseUnits(input.amount, NATIVE_DECIMALS); }
        catch { return { success: false, error: `Invalid amount: "${input.amount}"` }; }

        return {
          success: true,
          output: {
            transactions: [{
              kind:     'native_transfer',
              chainId:  CHAIN_ID,
              from:     input.sender,
              to:       input.recipient,
              value:    '0x' + valueWei.toString(16),
              data:     '0x',
              description: `Send ${input.amount} native USDC (gas-form) from ${input.sender} to ${input.recipient} on Arc Testnet`,
            }],
            amount_human: `${input.amount} USDC (native gas-form, 18 dec)`,
            note: 'This sends the chain\'s native USDC — the same asset used to pay gas. To send ERC-20 USDC (6 dec) used by Circle products, use build_token_transfer_tx.',
          },
        };
      }

      case 'build_token_transfer_tx': {
        if (!isAddress(input.sender))    return { success: false, error: 'sender must be a valid EVM address' };
        if (!isAddress(input.recipient)) return { success: false, error: 'recipient must be a valid EVM address' };
        if (typeof input.amount !== 'string') return { success: false, error: 'amount must be a decimal string (e.g. "1.5")' };
        const tok = resolveToken((input.token as string) || 'USDC');
        if (!tok) {
          return { success: false, error: `Unknown token "${input.token}". Known: ${Object.keys(TOKENS).join(', ')}.` };
        }
        let amountRaw: bigint;
        try { amountRaw = parseUnits(input.amount, tok.decimals); }
        catch { return { success: false, error: `Invalid amount: "${input.amount}"` }; }

        const data = '0x' + SEL.transfer + p32(input.recipient) + p32(amountRaw);
        return {
          success: true,
          output: {
            transactions: [{
              kind:     'erc20_transfer',
              chainId:  CHAIN_ID,
              from:     input.sender,
              to:       tok.address,
              value:    '0x0',
              data,
              description: `Transfer ${input.amount} ${tok.symbol} (ERC-20, ${tok.decimals} dec) from ${input.sender} to ${input.recipient} on Arc Testnet`,
            }],
            token:        tok.symbol,
            token_address: tok.address,
            amount_human: `${input.amount} ${tok.symbol}`,
            amount_raw:   amountRaw.toString(),
            note:         'Gas for this transfer is paid in native (gas-form) USDC — ensure the sender holds some.',
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_chain_info, get_balance, get_token_balance, get_block_number, get_gas_price, get_tx_status, build_transfer_tx, build_token_transfer_tx`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}
