/**
 * XPower Finance — SOP Skill
 *
 * XPower is a decentralized mutual finance protocol in the OKB ecosystem,
 * deployed on X Layer (chain ID 196). Users participate by purchasing tickets
 * with OKB, receiving proportional shares in a pooled capital structure.
 * Capital is deployed through AI-optimized on-chain strategies with yields
 * auto-distributed proportionally.
 *
 * This is an information-only skill — XPower's backend API (api.xpower.cc)
 * is fully auth-gated with no public endpoints, and no smart contract
 * addresses are publicly exposed. When public APIs or contract addresses
 * become available, this skill will be upgraded to return live data.
 *
 * Chain: XLayer (chain ID 196)
 * DApp:  https://dapp.xpower.cc/
 * Docs:  https://xpower-finance.gitbook.io/xpower-finance-docs/
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Actions ────────────────────────────────────────────────────────────────

function actionGetProtocolInfo(): SkillExecutionResult {
  return {
    success: true,
    output: {
      name: 'XPower Finance',
      tagline: 'AI-powered cooperative finance standard',
      chain: 'XLayer (OKX L2, chain ID 196)',
      native_token: 'OKB',
      status: 'Live',

      description:
        'XPower Finance is a decentralized mutual financial protocol built within the OKB ecosystem ' +
        'and deployed on X Layer. It delivers sustainable yield through transparent on-chain execution, ' +
        'AI-assisted strategy optimization, and a shared risk framework. The protocol integrates AI modeling ' +
        'and predictive market mechanisms to create an adaptive financial system capable of responding ' +
        'dynamically to market conditions.',

      key_features: [
        'Liquidity freedom — enter or exit at any time per protocol rules, no manual approval',
        'Predictable yield — generated through verifiable on-chain strategies',
        'Distributed risk — mutual pool structure prevents concentration in a single account',
        'Verifiable mechanism — all rules enforced by smart contracts',
        'AI-driven predictive engine — adaptive strategy optimization',
        'XPower Trust — embedded on-chain risk reserve layer',
      ],

      how_it_works: [
        '1. Users purchase participation tickets (OKB) to deposit assets into the protocol pool',
        '2. Protocol issues fractional ownership certificates representing user shares',
        '3. Pooled capital is deployed through AI-optimized on-chain strategies to generate yield',
        '4. Returns are automatically settled and distributed proportionally',
        '5. Risk is collectively shared and absorbed through the mutual mechanism',
      ],

      links: {
        website: 'https://www.xpower.cc/',
        dapp:    'https://dapp.xpower.cc/',
        docs:    'https://xpower-finance.gitbook.io/xpower-finance-docs/',
        twitter: 'https://x.com/XPowerFinance',
        roadmap: 'https://xpower-finance.gitbook.io/xpower-finance-docs/roadmap/planning',
      },

      partners: [
        'OKX Wallet / XLayer',
        'Soin',
        'Insight Genesis',
        'Wag3s',
        'Aylab',
        'OneWave',
        'AIliquid',
        'MES',
        'INTO',
        'MEGX',
      ],
    },
  };
}

function actionGetTicketInfo(): SkillExecutionResult {
  return {
    success: true,
    output: {
      protocol: 'XPower Finance',
      chain: 'XLayer (chain ID 196)',
      currency: 'OKB',

      ticket_denominations: [
        { amount: '1.00 OKB', description: 'Entry-level participation ticket' },
        { amount: '2.00 OKB', description: 'Standard participation ticket' },
        { amount: '5.00 OKB', description: 'Enhanced participation ticket' },
        { amount: '8.00 OKB', description: 'Premium participation ticket' },
      ],

      fee: '0.001 OKB per transaction',

      participation_flow: [
        '1. Connect wallet to DApp (dapp.xpower.cc)',
        '2. Select a ticket denomination (1 / 2 / 5 / 8 OKB)',
        '3. Confirm purchase — OKB is transferred from wallet to the protocol pool',
        '4. Receive proportional share certificate representing your stake in the pool',
        '5. Capital is deployed through AI-optimized on-chain strategies',
        '6. Yield accrues and is distributed proportionally based on share allocation',
        '7. Exit at any time according to protocol rules — no centralized approval required',
      ],

      dapp: 'https://dapp.xpower.cc/',

      notes: [
        'All capital flows, share adjustments, and reward distributions are recorded on-chain',
        'Liquidity flexibility without centralized approval',
        'Strategy transparency through verifiable execution',
      ],
    },
  };
}

function actionGetTrustInfo(): SkillExecutionResult {
  return {
    success: true,
    output: {
      name: 'XPower Trust',
      protocol: 'XPower Finance',

      description:
        'XPower Trust is an embedded on-chain security layer that functions as an actively managed ' +
        'systemic buffer — not a passive insurance pool. It transforms XPower from a simple yield ' +
        'instrument into a structured financial system with built-in shock absorption.',

      mechanism: {
        principal_split: {
          instant_reimbursement: '30% of principal is instantly reimbursed',
          computing_power: '70% is automatically converted into computing power for the ecosystem',
        },
        ecosystem_effect:
          'Every new participant strengthens the XPower ecosystem, reinforcing a collective ' +
          'wealth moat built on mutual protection.',
      },

      operational_features: [
        'Continuous reserve accumulation from protocol revenue',
        'Dynamic scaling aligned with total protocol size',
        'Automated intervention during extreme volatility',
        'Mutualized protection against concentrated losses',
        'Liquidity stabilization during panic-driven withdrawals',
        'Long-term resilience across market cycles',
      ],

      risk_management: [
        'Smart contract-enforced rules reduce human intervention and trust costs',
        'Distributed risk absorption through mutual pool structure',
        'AI-driven predictive engine for proactive risk management',
        'On-chain transparency — all operations verifiable',
      ],
    },
  };
}

// ─── Skill metadata ─────────────────────────────────────────────────────────

export const XPOWER_SKILL_METADATA = {
  name: 'XPower Finance',
  description:
    'XPower Finance is a decentralized mutual financial protocol in the OKB ecosystem on X Layer (chain ID 196). ' +
    'Get protocol overview, ticket participation details, and XPower Trust risk module information. ' +
    'AI-powered cooperative finance with sustainable yield through on-chain strategies and shared risk.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['xpower', 'xlayer', 'okb', 'okx', 'yield', 'defi', 'mutual-finance', 'ai', 'cooperative'],
  partner_verified: true,
  external_url: 'https://dapp.xpower.cc/',
  logo_url: 'https://dapp.xpower.cc/nexus/img/logo.svg',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_ticket_info', 'get_trust_info'],
        description:
          'get_protocol_info: XPower Finance overview — features, mechanism, links, partners. ' +
          'get_ticket_info: ticket denominations (1/2/5/8 OKB), fees, and step-by-step participation flow. ' +
          'get_trust_info: XPower Trust risk reserve module — 30/70 principal split, operational features, risk management.',
      },
    },
  },
  usage_examples: [
    { title: 'Protocol overview', input: { action: 'get_protocol_info' } },
    { title: 'How to participate', input: { action: 'get_ticket_info' } },
    { title: 'Risk module details', input: { action: 'get_trust_info' } },
  ],
};

// ─── Main executor ──────────────────────────────────────────────────────────

export async function executeXPowerSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return actionGetProtocolInfo();
      case 'get_ticket_info':   return actionGetTicketInfo();
      case 'get_trust_info':    return actionGetTrustInfo();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_ticket_info, get_trust_info`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in XPower Finance skill' };
  }
}
