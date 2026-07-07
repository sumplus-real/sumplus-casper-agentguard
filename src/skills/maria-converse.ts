/**
 * Maria Converse — natural-language A2A proxy
 *
 * Natural-language entry point into Maria's DeFi agent.
 * Send a free-text instruction; Maria's LLM routes it to the appropriate
 * structured skill (maria-query / maria-swap / maria-transfer) and runs
 * the same policy + wallet gates. Requires user delegation for write actions.
 *
 * Arsenal skill ID: 899a806a-d4d0-4fba-acc3-4f7cd02ca622
 */

import type { SkillExecutionResult } from '@/types/skill';
import { callMaria } from '@/lib/maria-proxy';

export const MARIA_CONVERSE_SKILL_METADATA = {
  name: 'Maria Converse',
  description:
    'Natural-language DeFi execution via Maria\'s AI agent. Send a plain-English instruction ("swap 100 USDC for ETH on Base") and Maria routes it to the right structured skill. Same policy gates apply.',
  category: 'AI/Agent',
  version: '0.1.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['maria', 'converse', 'nlp', 'defi', 'a2a', 'intent'],
  external_url: 'https://maria.sumplus.xyz',
  partner_verified: true,
  status: 'approved',
  kind: 'agent' as const,
  input_style: 'intent' as const,
  requires_user_session: true,
  schema: {
    type: 'object',
    required: ['action', 'intent'],
    properties: {
      action: {
        type: 'string',
        enum: ['execute'],
        description: 'execute: route the intent to the appropriate Maria skill.',
      },
      intent: {
        type: 'string',
        description:
          'Free-form natural-language instruction, e.g. "swap 100 USDC for ETH on Base" or "show my ETH balance on mainnet".',
      },
      _delegated_user_token: {
        type: 'string',
        description: 'Maria-issued JWT for the user. Required for write actions (swap, transfer).',
      },
      _calling_agent_id: {
        type: 'string',
        description: 'Arsenal UUID of the calling agent (audit hint).',
      },
    },
  },
};

export async function executeMariaConverseSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  return callMaria('maria-converse', input);
}
