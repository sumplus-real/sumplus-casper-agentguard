/**
 * Tempo Token Info Skill
 *
 * Query and interact with TIP-20 tokens on Tempo mainnet (chain ID 4217).
 * All official tokens use 6 decimals. Token list sourced from:
 *   https://tokenlist.tempo.xyz/list/4217
 *
 * Actions:
 *   list_tokens   — all tokens from the official Tempo token list
 *   get_balance   — ERC20 balance for one token + address
 *   get_balances  — all token balances for an address
 *   transfer      — build a TIP-20 transfer transaction (unsigned)
 */

import type { SkillExecutionResult } from '@/types/skill';
import { formatUnits, parseUnits } from 'viem';

// ── constants ─────────────────────────────────────────────────────────────────

const RPC          = 'https://rpc.tempo.xyz';
const TOKEN_LIST_URL = 'https://tokenlist.tempo.xyz/list/4217';
const DECIMALS     = 6; // all TIP-20 tokens on Tempo use 6 decimals

// Verified selectors
const SEL = {
  balanceOf: '70a08231', // balanceOf(address)
  transfer:  'a9059cbb', // transfer(address,uint256)
  symbol:    '95d89b41', // symbol()
  name:      '06fdde03', // name()
} as const;

// ── static token list (from tokenlist.tempo.xyz, updated 2026-04-06) ─────────

interface TokenEntry {
  symbol:    string;
  name:      string;
  address:   string;
  decimals:  number;
  logoURI?:  string;
  coingeckoId?: string;
  bridgeSourceChain?: number;
  bridgeSourceAddress?: string;
}

const STATIC_TOKENS: TokenEntry[] = [
  { symbol: 'pathUSD', name: 'PathUSD',              address: '0x20c0000000000000000000000000000000000000', decimals: 6, coingeckoId: 'pathusd' },
  { symbol: 'USDC.e',  name: 'Bridged USDC (Stargate)', address: '0x20c000000000000000000000b9537d11c60e8b50', decimals: 6, coingeckoId: 'usd-coin',   bridgeSourceChain: 1, bridgeSourceAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
  { symbol: 'EURC.e',  name: 'Bridged EURC (Stargate)', address: '0x20c0000000000000000000001621e21f71cf12fb', decimals: 6, coingeckoId: 'euro-coin',  bridgeSourceChain: 1, bridgeSourceAddress: '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c' },
  { symbol: 'USDT0',   name: 'USDT0',                address: '0x20c00000000000000000000014f22ca97301eb73', decimals: 6, coingeckoId: 'usdt0',      bridgeSourceChain: 1, bridgeSourceAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
  { symbol: 'frxUSD',  name: 'Frax USD',             address: '0x20c0000000000000000000003554d28269e0f3c2', decimals: 6, coingeckoId: 'frax-usd',   bridgeSourceChain: 1 },
  { symbol: 'cUSD',    name: 'Cap USD',               address: '0x20c0000000000000000000000520792dcccccccc', decimals: 6, coingeckoId: 'cap-usd' },
  { symbol: 'stcUSD',  name: 'Staked Cap USD',        address: '0x20c0000000000000000000008ee4fcff88888888', decimals: 6, coingeckoId: 'staked-cap-usd' },
  { symbol: 'GUSD',    name: 'Generic USD',           address: '0x20c0000000000000000000005c0bac7cef389a11', decimals: 6, coingeckoId: 'generic-usd' },
  { symbol: 'rUSD',    name: 'Reservoir Stablecoin',  address: '0x20c0000000000000000000007f7ba549dd0251b9', decimals: 6, coingeckoId: 'reservoir-rusd' },
  { symbol: 'wsrUSD',  name: 'Wrapped Savings rUSD',  address: '0x20c000000000000000000000aeed2ec36a54d0e5', decimals: 6 },
  { symbol: 'EURAU',   name: 'AllUnity EUR',           address: '0x20c0000000000000000000009a4a4b17e0dc6651', decimals: 6, coingeckoId: 'allunity-eur' },
  { symbol: 'reUSD',   name: 'Re Protocol reUSD',      address: '0x20c000000000000000000000383a23bacb546ab9', decimals: 6, coingeckoId: 're-protocol-reusd', bridgeSourceChain: 1, bridgeSourceAddress: '0x5086bf358635b81d8c47c66d1c8b9e567db70c72' },
];

// ── skill metadata ────────────────────────────────────────────────────────────

export const TEMPO_TOKENS_SKILL_METADATA = {
  name: 'Tempo Token Info',
  description:
    'Query TIP-20 tokens on Tempo mainnet (chain ID 4217). ' +
    'List all official tokens, check ERC20 balances, or build unsigned transfer transactions. ' +
    'All Tempo tokens use 6 decimals. Token list sourced from the official Tempo token registry.\n\n' +
    'chain: tempo (id: 4217)\n' +
    'standard: TIP-20 (ERC20-compatible)',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['tempo', 'tokens', 'tip20', 'balance', 'stablecoin', 'erc20', 'pathusd', 'usdc'],
  external_url: 'https://tempo.xyz',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['list_tokens', 'get_balance', 'get_balances', 'transfer'],
        description:
          'list_tokens: Return all tokens from the official Tempo token registry. ' +
          'get_balance: Get the balance of one token for a wallet address. ' +
          'get_balances: Get balances of all known tokens for a wallet address (skips zero balances by default). ' +
          'transfer: Build an unsigned TIP-20 transfer transaction (returns calldata, not signed).',
      },
      address: {
        type: 'string',
        description: 'Wallet address (0x-prefixed) to query balances for. Required for get_balance and get_balances.',
      },
      token: {
        type: 'string',
        description: 'Token symbol (e.g. "USDC.e", "pathUSD") or token contract address. Required for get_balance and transfer.',
      },
      to: {
        type: 'string',
        description: 'Recipient address for transfer action.',
      },
      amount: {
        type: 'string',
        description: 'Amount in human-readable units (e.g. "10" for 10 USDC.e). Required for transfer.',
      },
      sender: {
        type: 'string',
        description: 'Sender address for transfer action (used as the from field in the returned transaction).',
      },
      include_zero: {
        type: 'boolean',
        description: 'For get_balances: include tokens with zero balance (default: false).',
      },
    },
  },
  usage_examples: [
    {
      title: 'List all Tempo tokens',
      input: { action: 'list_tokens' },
    },
    {
      title: 'Get USDC.e balance',
      input: { action: 'get_balance', token: 'USDC.e', address: '0xYourAddress' },
    },
    {
      title: 'Get all token balances',
      input: { action: 'get_balances', address: '0xYourAddress' },
    },
    {
      title: 'Build USDC.e transfer',
      input: { action: 'transfer', token: 'USDC.e', to: '0xRecipient', amount: '5.00', sender: '0xYourAddress' },
    },
  ],
};

// ── helpers ───────────────────────────────────────────────────────────────────

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result as string;
}

function pad32(hex: string): string {
  return hex.replace('0x', '').padStart(64, '0');
}

/** Resolve token address from symbol or raw address */
function resolveToken(token: string): TokenEntry | undefined {
  if (token.startsWith('0x')) {
    return STATIC_TOKENS.find(t => t.address.toLowerCase() === token.toLowerCase());
  }
  return STATIC_TOKENS.find(t => t.symbol.toLowerCase() === token.toLowerCase());
}

// ── actions ───────────────────────────────────────────────────────────────────

async function listTokens(): Promise<SkillExecutionResult> {
  try {
    // Try live fetch first, fall back to static list
    let tokens = STATIC_TOKENS;
    try {
      const res = await fetch(TOKEN_LIST_URL, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.tokens)) {
          tokens = (json.tokens as any[]).map(t => ({
            symbol:               t.symbol,
            name:                 t.name,
            address:              t.address,
            decimals:             t.decimals,
            logoURI:              t.logoURI,
            coingeckoId:          t.extensions?.coingeckoId,
            bridgeSourceChain:    t.extensions?.bridgeInfo?.sourceChainId,
            bridgeSourceAddress:  t.extensions?.bridgeInfo?.sourceAddress,
          }));
        }
      }
    } catch {
      // use static list
    }

    return {
      success: true,
      output: {
        chain_id: 4217,
        chain: 'Tempo Mainnet',
        token_count: tokens.length,
        tokens: tokens.map(t => ({
          symbol:   t.symbol,
          name:     t.name,
          address:  t.address,
          decimals: t.decimals,
          coingeckoId: t.coingeckoId ?? null,
          bridge:   t.bridgeSourceChain
            ? { source_chain: t.bridgeSourceChain, source_address: t.bridgeSourceAddress }
            : null,
        })),
      },
    };
  } catch (err: any) {
    return { success: false, error: `list_tokens failed: ${err.message}` };
  }
}

async function getBalance(input: any): Promise<SkillExecutionResult> {
  const { token, address } = input;
  if (!token)   return { success: false, error: 'token is required (symbol or address)' };
  if (!address) return { success: false, error: 'address is required' };

  const entry = resolveToken(token);
  if (!entry) {
    return { success: false, error: `Unknown token "${token}". Use list_tokens to see all available tokens.` };
  }

  try {
    const data = `0x${SEL.balanceOf}${pad32(address)}`;
    const raw = await ethCall(entry.address, data);
    const balanceRaw = BigInt(raw);
    const balance = formatUnits(balanceRaw, entry.decimals);

    return {
      success: true,
      output: {
        token:       entry.symbol,
        name:        entry.name,
        address:     entry.address,
        wallet:      address,
        balance,
        balance_raw: balanceRaw.toString(),
        decimals:    entry.decimals,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_balance failed: ${err.message}` };
  }
}

async function getBalances(input: any): Promise<SkillExecutionResult> {
  const { address, include_zero = false } = input;
  if (!address) return { success: false, error: 'address is required' };

  try {
    const results = await Promise.all(
      STATIC_TOKENS.map(async (entry) => {
        try {
          const data = `0x${SEL.balanceOf}${pad32(address)}`;
          const raw = await ethCall(entry.address, data);
          const balanceRaw = BigInt(raw);
          return {
            symbol:      entry.symbol,
            name:        entry.name,
            address:     entry.address,
            balance:     formatUnits(balanceRaw, entry.decimals),
            balance_raw: balanceRaw.toString(),
          };
        } catch {
          return null;
        }
      })
    );

    const balances = results
      .filter(r => r !== null)
      .filter(r => include_zero || BigInt(r!.balance_raw) > 0n);

    return {
      success: true,
      output: {
        wallet:  address,
        chain:   'Tempo Mainnet (4217)',
        balances,
        total_tokens_with_balance: balances.length,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_balances failed: ${err.message}` };
  }
}

async function transfer(input: any): Promise<SkillExecutionResult> {
  const { token, to, amount, sender } = input;
  if (!token)  return { success: false, error: 'token is required' };
  if (!to)     return { success: false, error: 'to (recipient address) is required' };
  if (!amount) return { success: false, error: 'amount is required (human-readable, e.g. "10")' };

  const entry = resolveToken(token);
  if (!entry) {
    return { success: false, error: `Unknown token "${token}". Use list_tokens to see all available tokens.` };
  }

  try {
    const amountRaw = parseUnits(amount, entry.decimals);
    const calldata = `0x${SEL.transfer}${pad32(to)}${pad32('0x' + amountRaw.toString(16))}`;

    return {
      success: true,
      output: {
        transaction: {
          to:       entry.address,
          data:     calldata,
          value:    '0x0',
          from:     sender ?? null,
          chain_id: 4217,
        },
        token:      entry.symbol,
        recipient:  to,
        amount,
        amount_raw: amountRaw.toString(),
        note: 'Sign and submit this transaction to Tempo RPC (https://rpc.tempo.xyz)',
      },
    };
  } catch (err: any) {
    return { success: false, error: `transfer failed: ${err.message}` };
  }
}

// ── main executor ─────────────────────────────────────────────────────────────

export async function executeTempoTokensSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'list_tokens':  return listTokens();
    case 'get_balance':  return getBalance(input);
    case 'get_balances': return getBalances(input);
    case 'transfer':     return transfer(input);
    default:
      return { success: false, error: `Unknown action "${action}". Valid: list_tokens, get_balance, get_balances, transfer` };
  }
}
