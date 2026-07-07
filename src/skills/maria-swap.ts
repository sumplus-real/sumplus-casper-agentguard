/**
 * Maria Swap — A2A token swap proxy
 *
 * Proxies swap quotes and executions to Maria's DeFi agent.
 * Maria picks the optimal DEX (Uniswap, Jupiter, Cetus, etc.) and broadcasts
 * the tx. Requires a user delegation (X-Delegated-User-Token in input).
 *
 * While MARIA_SKILLS_TX_ENABLED is off, execute_swap returns a dry-run with
 * the quote and prepared tx payload — no funds move. Flip the flag for live.
 *
 * Arsenal skill ID: 36d4289b-0db8-4c3c-9ab0-e01bc93ee70d
 */

import type { SkillExecutionResult } from '@/types/skill';
import { callMaria } from '@/lib/maria-proxy';

export const MARIA_SWAP_SKILL_METADATA = {
  name: 'Maria Swap',
  description:
    'Swap tokens via Maria\'s DeFi agent — multi-DEX, multi-chain. Maria auto-routes to best DEX (Uniswap/Jupiter/Cetus/etc.), gets a quote, builds and broadcasts the tx. Use get_quote for a preview. Requires user delegation.',
  category: 'AI/Agent',
  version: '0.1.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['maria', 'swap', 'defi', 'a2a', 'dex', 'trade'],
  external_url: 'https://maria.sumplus.xyz',
  partner_verified: true,
  status: 'approved',
  kind: 'agent' as const,
  input_style: 'structured' as const,
  requires_user_session: true,
  schema: {
    type: 'object',
    required: ['action', 'from_token', 'to_token', 'amount', 'chain'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'execute_swap'],
        description:
          'get_quote: price preview without signing. ' +
          'execute_swap: build and broadcast the swap tx (or dry-run if MARIA_SKILLS_TX_ENABLED is off).',
      },
      from_token: {
        type: 'string',
        description: 'Token to sell — symbol (USDC) or contract address.',
      },
      to_token: {
        type: 'string',
        description: 'Token to buy — symbol or contract address.',
      },
      amount: {
        type: 'string',
        description: 'Human-readable sell amount, e.g. "100" for 100 USDC.',
      },
      chain: {
        type: 'string',
        enum: ['ethereum', 'base', 'polygon', 'optimism', 'sui', 'solana'],
      },
      slippage_bps: {
        type: 'integer',
        default: 50,
        description: 'Max slippage in basis points (50 = 0.5%).',
      },
      _delegated_user_token: {
        type: 'string',
        description: 'Maria-issued JWT for the user. Required for execute_swap; omit for get_quote.',
      },
      _calling_agent_id: {
        type: 'string',
        description: 'Arsenal UUID of the calling agent (audit hint).',
      },
    },
  },
};

export async function executeMariaSwapSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  return callMaria('maria-swap', input);
}
