/**
 * Maria Transfer — A2A token transfer proxy
 *
 * Proxies native and ERC-20 token transfers to Maria's DeFi agent.
 * EVM chains only for now. Gated by the user's delegation policy.
 * Dry-run while MARIA_SKILLS_TX_ENABLED is off.
 *
 * Arsenal skill ID: 3e32d737-f2d1-41ca-a102-3e5ddcedb93f
 */

import type { SkillExecutionResult } from '@/types/skill';
import { callMaria } from '@/lib/maria-proxy';

export const MARIA_TRANSFER_SKILL_METADATA = {
  name: 'Maria Transfer',
  description:
    'Send native tokens or ERC-20s from the wallet to an address via Maria\'s DeFi agent. EVM chains only. Gated by user delegation policy. Dry-run by default until MARIA_SKILLS_TX_ENABLED is set.',
  category: 'AI/Agent',
  version: '0.1.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['maria', 'transfer', 'defi', 'a2a', 'send', 'evm'],
  external_url: 'https://maria.sumplus.xyz',
  partner_verified: true,
  status: 'approved',
  kind: 'agent' as const,
  input_style: 'structured' as const,
  requires_user_session: true,
  schema: {
    type: 'object',
    required: ['action', 'to', 'amount', 'chain'],
    properties: {
      action: {
        type: 'string',
        enum: ['execute_transfer'],
        description: 'execute_transfer: broadcast the transfer (or dry-run if MARIA_SKILLS_TX_ENABLED is off).',
      },
      to: {
        type: 'string',
        description: 'Recipient address.',
      },
      token: {
        type: 'string',
        description: 'Symbol (USDC) or ERC-20 contract address. Omit for native token transfer.',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount, e.g. "1.5" for 1.5 ETH.',
      },
      chain: {
        type: 'string',
        enum: ['ethereum', 'base', 'polygon', 'optimism'],
      },
      token_decimals: {
        type: 'integer',
        default: 18,
        description: 'Decimals for ERC-20 token (e.g. 6 for USDC). Only relevant for ERC-20 transfers.',
      },
      _delegated_user_token: {
        type: 'string',
        description: 'Maria-issued JWT for the user. Required.',
      },
      _calling_agent_id: {
        type: 'string',
        description: 'Arsenal UUID of the calling agent (audit hint).',
      },
    },
  },
};

export async function executeMariaTransferSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  return callMaria('maria-transfer', input);
}
