/**
 * Maria Wallet Query — A2A read-only proxy
 *
 * Proxies read-only wallet/market queries to Maria's DeFi agent.
 * No delegation required; service-key auth only.
 *
 * Arsenal skill ID: f4764725-458c-4256-a5f7-92d50fcb7672
 */

import type { SkillExecutionResult } from '@/types/skill';
import { callMaria } from '@/lib/maria-proxy';

export const MARIA_QUERY_SKILL_METADATA = {
  name: 'Maria Wallet Query',
  description:
    'Read-only queries against Maria\'s DeFi wallet — token prices, on-chain balances, wallet portfolio summary, and transaction history. No user delegation required.',
  category: 'AI/Agent',
  version: '0.1.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['maria', 'wallet', 'query', 'defi', 'a2a', 'prices', 'balance'],
  external_url: 'https://maria.sumplus.xyz',
  partner_verified: true,
  status: 'approved',
  kind: 'agent' as const,
  input_style: 'structured' as const,
  requires_user_session: false,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_prices', 'get_chain_balance', 'get_wallet_summary', 'get_tx_history'],
        description:
          'get_prices: current prices for a list of token symbols (requires symbols[]). ' +
          'get_chain_balance: on-chain balance for an address on a specific chain (requires address + chain). ' +
          'get_wallet_summary: full portfolio view across all chains for an address (requires address). ' +
          'get_tx_history: recent transaction history (requires address + chain; optional limit).',
      },
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description: 'Token symbols, e.g. ["ETH","USDC"]. Required for get_prices.',
      },
      address: {
        type: 'string',
        description: 'Wallet address. Required for get_chain_balance, get_wallet_summary, get_tx_history.',
      },
      chain: {
        type: 'string',
        description: 'Chain identifier, e.g. "ethereum", "base", "solana". Required for get_chain_balance and get_tx_history.',
      },
      limit: {
        type: 'integer',
        default: 20,
        description: 'Max rows returned. Used for get_tx_history.',
      },
    },
  },
};

export async function executeMariaQuerySkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  return callMaria('maria-query', input);
}
