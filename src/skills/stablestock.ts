/**
 * Official Skill: StableStock Finance (stablestock.finance)
 *
 * StableStock is a StockFi protocol on BNB Chain that tokenizes real-world equities.
 * Users can hold, transfer, and approve sTokens (e.g., sTSLA, sAAPL, sNVDA) —
 * ERC-20 tokens backed 1:1 by real shares held via licensed brokers.
 *
 * StableBroker (mint/redeem) and StableVault (stake for yield) are off-chain gated —
 * interact with them via the StableStock web app. This skill covers on-chain
 * ERC-20 operations on all publicly known sToken contracts.
 *
 * Skill UUID: 588aadca-8045-426b-81ae-a7241ba3cf53
 *
 * Actions:
 *   list_supported_stocks  — list all supported sTokens with addresses and metadata
 *   get_balance            — check sToken balance for any address
 *   get_token_info         — get name, symbol, total supply for an sToken
 *   build_transfer_tx      — build ERC-20 transfer transaction
 *   build_approve_tx       — build ERC-20 approve transaction (for DEX / StableVault)
 */

import { encodeFunctionData, parseAbi, formatUnits } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── sToken registry (BNB Chain, all ERC-20 BeaconProxy) ──────────────────────
// Confirmed via BscScan; implementation: 0x37d81c5830082a27cdc10a4fb865a1ee7b075bd4

const STOKENS: Record<string, { address: `0x${string}`; name: string; market: 'US' | 'HK' }> = {
  sTSLA:  { address: '0x0f449452d8c3a3e74b5be73b6a603167b7b257d9', name: 'Tesla',           market: 'US' },
  sNVDA:  { address: '0x097015a0505c628ac747bd4e625396599d2073c5', name: 'NVIDIA',           market: 'US' },
  sAAPL:  { address: '0x84abadcc8035e73f9412360a51eb8483175c6856', name: 'Apple',            market: 'US' },
  sCOIN:  { address: '0xf584421c3dbdeb8fba69e06626c0f408c4d0fb1f', name: 'Coinbase',         market: 'US' },
  sCRCL:  { address: '0x42b448ffc13d9ccc562cd6929cadde4009a60498', name: 'Circle',           market: 'US' },
  sSBET:  { address: '0x1887355bfde7e729419937c0c3bddc31a5b8776d', name: 'Sports Bet',       market: 'US' },
  sGLXY:  { address: '0xa3ed5a4a96ed0f6813e137f4d1edabffe0ddae9d', name: 'Galaxy Digital',   market: 'US' },
  sBMNR:  { address: '0x5d4d45474421a64f04a16da0dd5b74b36957ed77', name: 'Bitmine Immersion', market: 'US' },
  sBNC:   { address: '0xd76952bcbe2c63bdb3a1b78aab27a5e86ed556df', name: 'Binance',          market: 'US' },
  sINTC:  { address: '0xeb106122c288cedf07b062139bb4178cf948b0d8', name: 'Intel',             market: 'US' },
  sQQQ:   { address: '0x7ade93a8c7e24ab6ed1b6b4c27c90e4321ccf7ce', name: 'Invesco QQQ ETF',  market: 'US' },
  sBLSH:  { address: '0x5dc505bea84060223f22eef616bb835dfc52c7e9', name: 'Bleacher Report',  market: 'US' },
  sALTS:  { address: '0x753b805fdacb1582e94fdd4e0fbeee27da9ee2b4', name: 'Alts',             market: 'US' },
  sCOPX:  { address: '0xfc64ac4e697260df48f9020d8a5282aee9e735e6', name: 'Copper',           market: 'US' },
};

const CHAIN_ID = 56; // BNB Smart Chain
const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

// ── RPC ───────────────────────────────────────────────────────────────────────

function getBscRpcUrl(): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (key) return `https://bnb-mainnet.g.alchemy.com/v2/${key}`;
  return 'https://bsc-dataseed1.binance.org';
}

function rpcPost(rpcUrl: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const target  = new URL(rpcUrl);
    const proxy   = process.env.https_proxy || process.env.http_proxy;
    const payload = JSON.stringify(body);
    let options: any;
    let client: typeof https | typeof http;

    if (proxy) {
      const p = new URL(proxy);
      client  = http;
      options = {
        hostname: p.hostname, port: p.port || 7890,
        path: rpcUrl, method: 'POST',
        headers: { Host: target.hostname, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 15000,
      };
    } else {
      client  = target.protocol === 'https:' ? https : http;
      options = {
        hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 15000,
      };
    }

    const req = (client as any).request(options, (res: any) => {
      let data = '';
      res.on('data', (c: string) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data).result); } catch { reject(new Error(`RPC parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('RPC timeout')); });
    req.write(payload);
    req.end();
  });
}

async function ethCall(to: string, data: string): Promise<string> {
  const result = await rpcPost(getBscRpcUrl(), {
    jsonrpc: '2.0', id: 1,
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
  return result ?? '0x';
}

// ── ABI encode helpers ────────────────────────────────────────────────────────

function encodeBalanceOf(addr: string): string {
  return encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [addr as `0x${string}`] });
}

function decodePadded(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

function decodeString(hex: string): string {
  if (!hex || hex === '0x' || hex.length < 130) return '';
  try {
    // ABI-encoded string: offset (32b) + length (32b) + utf8 bytes
    const offset = Number(BigInt('0x' + hex.slice(2, 66)));
    const lenPos  = 2 + offset * 2;
    const len     = Number(BigInt('0x' + hex.slice(lenPos, lenPos + 64)));
    const strHex  = hex.slice(lenPos + 64, lenPos + 64 + len * 2);
    return Buffer.from(strHex, 'hex').toString('utf8');
  } catch { return ''; }
}

// ── Metadata export ───────────────────────────────────────────────────────────

export const STABLESTOCK_SKILL_METADATA = {
  name: 'StableStock',
  description:
    '[ARSENAL-HOSTED ✓] StableStock Finance — tokenized real-world stocks on BNB Chain. ' +
    'sTokens (sTSLA, sAAPL, sNVDA, sQQQ, and 10+ others) are ERC-20 tokens backed 1:1 by real shares ' +
    'held via licensed brokers (U.S. MSB + HK SFC). ' +
    'Check balances and token info, build transfer/approve transactions for any sToken. ' +
    '500+ U.S. equities and 160+ HK stocks supported on stablestock.finance.',
  category: 'Finance',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['stablestock', 'bsc', 'bnb', 'rwa', 'tokenized-stocks', 'equities', 'erc20', 'finance', 'tsla', 'nvda', 'aapl'],
  external_url: 'https://www.stablestock.finance',
  logo_url: 'https://www.stablestock.finance/favicon.ico',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['list_supported_stocks', 'get_balance', 'get_token_info', 'build_transfer_tx', 'build_approve_tx'],
        description:
          'list_supported_stocks: list all known sTokens with addresses, names, and market. ' +
          'get_balance: check how many sTokens an address holds (requires: symbol OR token_address, address). ' +
          'get_token_info: get name, symbol, decimals, totalSupply for an sToken (requires: symbol OR token_address). ' +
          'build_transfer_tx: build ERC-20 transfer tx for sTokens (requires: symbol OR token_address, sender, recipient, amount). ' +
          'build_approve_tx: build ERC-20 approve tx for sTokens — used before staking in StableVault or swapping on DEX (requires: symbol OR token_address, sender, spender, amount).',
      },
      symbol: {
        type: 'string',
        description: 'sToken symbol (e.g. "sTSLA", "sAAPL", "sNVDA", "sQQQ"). Case-insensitive. Use this OR token_address.',
      },
      token_address: {
        type: 'string',
        description: 'sToken contract address on BNB Chain (0x...). Use this OR symbol.',
      },
      address: {
        type: 'string',
        description: 'Wallet address to check balance for (0x..., 40 hex).',
      },
      sender: {
        type: 'string',
        description: 'Address sending the transaction (0x...). Used as the "from" in the built tx.',
      },
      recipient: {
        type: 'string',
        description: 'Recipient address for transfer (0x...).',
      },
      spender: {
        type: 'string',
        description: 'Spender address for approve — typically the StableVault contract or a DEX router (0x...).',
      },
      amount: {
        type: 'string',
        description: 'Amount of sTokens in token units (e.g. "1.5" = 1.5 shares). sTokens have 18 decimals.',
      },
    },
  },
  usage_examples: [
    { title: 'List all supported stocks', input: { action: 'list_supported_stocks' } },
    { title: 'Check sTSLA balance', input: { action: 'get_balance', symbol: 'sTSLA', address: '0xYourAddress' } },
    { title: 'Get sAAPL token info', input: { action: 'get_token_info', symbol: 'sAAPL' } },
    { title: 'Transfer 2 sNVDA shares', input: { action: 'build_transfer_tx', symbol: 'sNVDA', sender: '0xYourAddress', recipient: '0xRecipient', amount: '2' } },
    { title: 'Approve sQQQ for DEX', input: { action: 'build_approve_tx', symbol: 'sQQQ', sender: '0xYourAddress', spender: '0xDexRouter', amount: '5' } },
  ],
};

// ── Executor ─────────────────────────────────────────────────────────────────

function resolveToken(symbol?: string, tokenAddress?: string): { address: `0x${string}`; symbol: string } | null {
  if (symbol) {
    const key = Object.keys(STOKENS).find(k => k.toLowerCase() === symbol.toLowerCase());
    if (key) return { address: STOKENS[key].address, symbol: key };
  }
  if (tokenAddress && /^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
    const entry = Object.entries(STOKENS).find(([, v]) => v.address.toLowerCase() === tokenAddress.toLowerCase());
    if (entry) return { address: entry[1].address, symbol: entry[0] };
    // Unknown sToken address — still usable for ERC-20 ops
    return { address: tokenAddress as `0x${string}`, symbol: tokenAddress };
  }
  return null;
}

function parseAmount(amount: string): bigint {
  // sTokens have 18 decimals
  const parts = amount.split('.');
  const whole  = BigInt(parts[0] ?? '0');
  const fracStr = (parts[1] ?? '').padEnd(18, '0').slice(0, 18);
  return whole * BigInt('1000000000000000000') + BigInt(fracStr);
}

export async function executeStableStockSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {

      case 'list_supported_stocks': {
        const tokens = Object.entries(STOKENS).map(([symbol, meta]) => ({
          symbol,
          name: meta.name,
          market: meta.market,
          chain: 'BNB Chain',
          chain_id: CHAIN_ID,
          contract: meta.address,
          decimals: 18,
          standard: 'ERC-20',
          backed_by: '1:1 real shares via licensed broker',
        }));
        return {
          success: true,
          output: {
            tokens,
            total: tokens.length,
            chain: 'BNB Chain',
            chain_id: CHAIN_ID,
            note: 'StableStock also supports 500+ U.S. equities and 160+ HK stocks; not all have confirmed on-chain addresses yet. Mint/redeem via stablestock.finance.',
          },
        };
      }

      case 'get_balance': {
        const token = resolveToken(input.symbol, input.token_address);
        if (!token) return { success: false, error: 'Provide symbol (e.g. "sTSLA") or token_address' };
        if (!input.address || !/^0x[a-fA-F0-9]{40}$/.test(input.address)) {
          return { success: false, error: 'address must be a valid 0x EVM address' };
        }
        const raw = await ethCall(token.address, encodeBalanceOf(input.address));
        const balance = decodePadded(raw);
        return {
          success: true,
          output: {
            symbol: token.symbol,
            contract: token.address,
            address: input.address,
            balance_raw: balance.toString(),
            balance: formatUnits(balance, 18),
            chain: 'BNB Chain',
            chain_id: CHAIN_ID,
          },
        };
      }

      case 'get_token_info': {
        const token = resolveToken(input.symbol, input.token_address);
        if (!token) return { success: false, error: 'Provide symbol (e.g. "sTSLA") or token_address' };

        const [nameHex, symbolHex, decimalsHex, supplyHex] = await Promise.all([
          ethCall(token.address, encodeFunctionData({ abi: ERC20_ABI, functionName: 'name' })),
          ethCall(token.address, encodeFunctionData({ abi: ERC20_ABI, functionName: 'symbol' })),
          ethCall(token.address, encodeFunctionData({ abi: ERC20_ABI, functionName: 'decimals' })),
          ethCall(token.address, encodeFunctionData({ abi: ERC20_ABI, functionName: 'totalSupply' })),
        ]);

        const decimals   = Number(decodePadded(decimalsHex) || 18n);
        const supply     = decodePadded(supplyHex);
        const meta       = Object.values(STOKENS).find(v => v.address.toLowerCase() === token.address.toLowerCase());

        return {
          success: true,
          output: {
            symbol:       token.symbol,
            name:         decodeString(nameHex) || meta?.name || token.symbol,
            on_chain_symbol: decodeString(symbolHex) || token.symbol,
            contract:     token.address,
            decimals,
            total_supply_raw: supply.toString(),
            total_supply:     formatUnits(supply, decimals),
            chain:        'BNB Chain',
            chain_id:     CHAIN_ID,
            market:       meta?.market ?? 'US',
            standard:     'ERC-20 (BeaconProxy)',
          },
        };
      }

      case 'build_transfer_tx': {
        const token = resolveToken(input.symbol, input.token_address);
        if (!token) return { success: false, error: 'Provide symbol (e.g. "sTSLA") or token_address' };
        if (!input.sender    || !/^0x[a-fA-F0-9]{40}$/.test(input.sender))    return { success: false, error: 'sender must be a valid 0x address' };
        if (!input.recipient || !/^0x[a-fA-F0-9]{40}$/.test(input.recipient)) return { success: false, error: 'recipient must be a valid 0x address' };
        if (!input.amount) return { success: false, error: 'amount is required (e.g. "1.5")' };

        const amountRaw = parseAmount(String(input.amount));
        if (amountRaw === 0n) return { success: false, error: 'amount must be > 0' };

        return {
          success: true,
          output: {
            transactions: [{
              to:          token.address,
              data:        encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [input.recipient as `0x${string}`, amountRaw] }),
              value:       '0x0',
              chain_id:    CHAIN_ID,
              description: `Transfer ${input.amount} ${token.symbol} to ${input.recipient}`,
            }],
            symbol:     token.symbol,
            contract:   token.address,
            sender:     input.sender,
            recipient:  input.recipient,
            amount:     input.amount,
            amount_raw: amountRaw.toString(),
            chain_id:   CHAIN_ID,
          },
        };
      }

      case 'build_approve_tx': {
        const token = resolveToken(input.symbol, input.token_address);
        if (!token) return { success: false, error: 'Provide symbol (e.g. "sTSLA") or token_address' };
        if (!input.sender  || !/^0x[a-fA-F0-9]{40}$/.test(input.sender))  return { success: false, error: 'sender must be a valid 0x address' };
        if (!input.spender || !/^0x[a-fA-F0-9]{40}$/.test(input.spender)) return { success: false, error: 'spender must be a valid 0x address' };
        if (!input.amount) return { success: false, error: 'amount is required (e.g. "1.5"), or use "115792089237316195423570985008687907853269984665640564039457584007913129639935" for unlimited' };

        const amountRaw = String(input.amount).length > 30
          ? BigInt(input.amount)   // already raw (max uint256)
          : parseAmount(String(input.amount));

        return {
          success: true,
          output: {
            transactions: [{
              to:          token.address,
              data:        encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [input.spender as `0x${string}`, amountRaw] }),
              value:       '0x0',
              chain_id:    CHAIN_ID,
              description: `Approve ${input.amount} ${token.symbol} for ${input.spender}`,
            }],
            symbol:     token.symbol,
            contract:   token.address,
            sender:     input.sender,
            spender:    input.spender,
            amount:     input.amount,
            amount_raw: amountRaw.toString(),
            chain_id:   CHAIN_ID,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: list_supported_stocks, get_balance, get_token_info, build_transfer_tx, build_approve_tx` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'StableStock skill error' };
  }
}
