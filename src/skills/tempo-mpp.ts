/**
 * Tempo Machine Payments Protocol (MPP) Skill
 *
 * MPP is an open HTTP standard for machine-to-machine payments, co-authored by
 * Tempo and Stripe. When a client requests a paid resource, the server returns
 * HTTP 402; the client pays and retries automatically.
 *
 * [ARSENAL-HOSTED ✓] Arsenal executes payments server-side using the mppx SDK.
 *
 * Protocol:  HTTP 402 challenge → credential → receipt
 * Settlement: Tempo chain (ID 4217) — ~0.5s finality, <$0.001 fees
 * Currencies: USDC (0x20C000000000000000000000b9537d11c60E8b50)
 *             pathUSD (0x20c0000000000000000000000000000000000000)
 */

import type { SkillExecutionResult } from '@/types/skill';
import { privateKeyToAccount } from 'viem/accounts';
import * as MppxClient from 'mppx/client';

// ── verified on-chain constants ───────────────────────────────────────────────
const TEMPO = {
  chainId: 4217,
  rpc: 'https://rpc.tempo.xyz',
  usdc: '0x20C000000000000000000000b9537d11c60E8b50' as `0x${string}`,
  pathUsd: '0x20c0000000000000000000000000000000000000' as `0x${string}`,
  escrow: '0x33b901018174DDabE4841042ab76ba85D4e24f25',
} as const;

// ── skill metadata ────────────────────────────────────────────────────────────
export const TEMPO_MPP_SKILL_METADATA = {
  name: 'Tempo Machine Payments Protocol',
  description:
    '[ARSENAL-HOSTED ✓] Execute HTTP 402 machine payments on the Tempo blockchain. ' +
    'MPP is the open standard co-authored by Tempo and Stripe for autonomous AI agent payments. ' +
    'Probe any URL for payment requirements, make one-time charge payments in USDC or pathUSD, ' +
    'or look up your Tempo wallet address. Sub-second finality, fees under $0.001.\n\n' +
    'execution_mode: server-side\n' +
    'chain: tempo (id: 4217)\n' +
    'currencies: USDC, pathUSD',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  external_url: 'https://tempo.xyz',
  partner_verified: true,
  tags: [
    'tempo', 'mpp', 'machine-payments', 'payments', 'ai-agent',
    'stablecoin', 'usdc', 'pathusd', 'http402', 'stripe',
  ],
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['probe', 'pay', 'get_account'],
        description:
          'probe: Check if a URL requires MPP payment and return price/currency details (no payment made). ' +
          'pay: Make a one-time charge payment to an MPP endpoint and return the response — requires private_key. ' +
          'get_account: Derive the Tempo wallet address from a private key (useful for funding setup).',
      },
      url: {
        type: 'string',
        description: 'Target URL for probe or pay actions. E.g. "https://api.example.com/paid-endpoint".',
      },
      private_key: {
        type: 'string',
        description:
          'Tempo wallet private key (0x-prefixed hex). Required for pay and get_account. ' +
          'Arsenal uses this server-side to sign the payment credential — it is never logged or stored.',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP method for the pay action (default: GET).',
      },
      body: {
        type: 'object',
        description: 'Request body for POST/PUT pay actions (will be JSON-stringified).',
      },
      headers: {
        type: 'object',
        description: 'Extra HTTP headers to include in the pay request.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Probe a paid endpoint',
      description: 'Check if an API requires MPP payment before committing',
      input: {
        action: 'probe',
        url: 'https://mpp.dev/api/ping/paid',
      },
    },
    {
      title: 'Pay a charge endpoint',
      description: 'Make a one-time payment and fetch the resource',
      input: {
        action: 'pay',
        url: 'https://mpp.dev/api/ping/paid',
        private_key: '0xYOUR_PRIVATE_KEY',
      },
    },
    {
      title: 'Get wallet address',
      description: 'Derive your Tempo wallet address from a private key',
      input: {
        action: 'get_account',
        private_key: '0xYOUR_PRIVATE_KEY',
      },
    },
  ],
};

// ── helpers ───────────────────────────────────────────────────────────────────

/** Parse the WWW-Authenticate header from a 402 response into readable info. */
function parseChallenge(headers: Headers): Record<string, string> {
  const raw = headers.get('www-authenticate') ?? headers.get('WWW-Authenticate') ?? '';
  const result: Record<string, string> = {};
  if (!raw) return result;

  // Format: Payment realm="...", challenge="..."
  const pairs = raw.replace(/^Payment\s+/i, '').matchAll(/(\w+)="([^"]+)"/g);
  for (const [, key, value] of pairs) {
    result[key] = value;
  }

  // Also try JSON body if challenge is base64-encoded JSON
  if (result['challenge']) {
    try {
      const decoded = Buffer.from(result['challenge'], 'base64').toString();
      const parsed = JSON.parse(decoded);
      return { ...result, ...parsed };
    } catch {
      // not JSON, keep raw
    }
  }
  return result;
}

// ── actions ───────────────────────────────────────────────────────────────────

async function probe(input: any): Promise<SkillExecutionResult> {
  const { url } = input;
  if (!url) return { success: false, error: 'url is required for probe' };

  try {
    const res = await fetch(url, { method: 'GET' });

    if (res.status !== 402) {
      return {
        success: true,
        output: {
          requires_payment: false,
          status: res.status,
          message: 'This endpoint does not require MPP payment.',
        },
      };
    }

    const challenge = parseChallenge(res.headers);
    let challengeBody: any = {};
    try {
      challengeBody = await res.json();
    } catch {
      /* ignore if body is not JSON */
    }

    return {
      success: true,
      output: {
        requires_payment: true,
        status: 402,
        challenge: { ...challenge, ...challengeBody },
        hint: 'Use action=pay with your private_key to make the payment.',
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `probe failed for ${url}: ${err.message}`,
    };
  }
}

async function pay(input: any): Promise<SkillExecutionResult> {
  const { url, private_key, method = 'GET', body, headers: extraHeaders } = input;
  if (!url) return { success: false, error: 'url is required for pay' };
  if (!private_key) return { success: false, error: 'private_key is required for pay' };

  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(private_key as `0x${string}`);
  } catch {
    return { success: false, error: 'Invalid private_key — must be a 0x-prefixed 32-byte hex string.' };
  }

  try {
    // polyfill: false — critical to avoid contaminating globalThis.fetch across requests
    const mppx = MppxClient.Mppx.create({
      methods: [MppxClient.tempo({ account })],
      polyfill: false,
    });

    const fetchOptions: RequestInit = { method };
    if (body) {
      (fetchOptions as any).body = JSON.stringify(body);
      fetchOptions.headers = {
        'Content-Type': 'application/json',
        ...(extraHeaders ?? {}),
      };
    } else if (extraHeaders) {
      fetchOptions.headers = extraHeaders;
    }

    const res = await mppx.fetch(url, fetchOptions);
    const responseText = await res.text();

    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return {
      success: true,
      output: {
        status: res.status,
        data: responseData,
        paid: true,
        payer: account.address,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `pay failed for ${url}: ${err.message}`,
    };
  }
}

async function getAccount(input: any): Promise<SkillExecutionResult> {
  const { private_key } = input;
  if (!private_key) return { success: false, error: 'private_key is required for get_account' };

  try {
    const account = privateKeyToAccount(private_key as `0x${string}`);
    return {
      success: true,
      output: {
        address: account.address,
        chain: 'Tempo Mainnet',
        chain_id: TEMPO.chainId,
        rpc: TEMPO.rpc,
        currencies: {
          usdc: TEMPO.usdc,
          pathUsd: TEMPO.pathUsd,
        },
        fund_hint: `Send USDC or pathUSD to ${account.address} on Tempo (chain ID ${TEMPO.chainId}) before making payments.`,
      },
    };
  } catch {
    return {
      success: false,
      error: 'Invalid private_key — must be a 0x-prefixed 32-byte hex string.',
    };
  }
}

// ── main executor ─────────────────────────────────────────────────────────────
export async function executeMppSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input;

  switch (action) {
    case 'probe':      return probe(input);
    case 'pay':        return pay(input);
    case 'get_account': return getAccount(input);
    default:
      return {
        success: false,
        error: `Unknown action "${action}". Valid actions: probe, pay, get_account`,
      };
  }
}
