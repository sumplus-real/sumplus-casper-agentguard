/**
 * Tempo MPP Sessions Skill
 *
 * MPP Sessions are payment channels on Tempo: deposit once, pay many times
 * via off-chain signed vouchers (no per-payment chain tx).
 *
 * Lifecycle:
 *   open_session → get channel_id + new_cumulative
 *   pay_voucher  → send signed voucher, get response + new_cumulative
 *   check_channel → query on-chain state (deposit, settled, finalized)
 *
 * The calling agent must track `channel_id` and `cumulative_amount` across calls.
 *
 * [ARSENAL-HOSTED ✓] Arsenal signs vouchers server-side using mppx SDK.
 *
 * Escrow: 0x33b901018174DDabE4841042ab76ba85D4e24f25 (Tempo mainnet)
 * Chain:  Tempo (ID 4217), settlement <$0.001, ~0.5s finality
 */

import type { SkillExecutionResult } from '@/types/skill';
import { privateKeyToAccount } from 'viem/accounts';
import { parseUnits, formatUnits } from 'viem';
import * as MppxClient from 'mppx/client';

// ── constants ─────────────────────────────────────────────────────────────────

const RPC    = 'https://rpc.tempo.xyz';
const ESCROW = '0x33b901018174DDabE4841042ab76ba85D4e24f25' as const;
const DECIMALS = 6;

// Verified ABI selectors
const SEL = {
  channels: '7a7ebd7b', // channels(bytes32) → (finalized,closeRequestedAt,payer,payee,token,authorizedSigner,deposit,settled)
} as const;

// ── skill metadata ────────────────────────────────────────────────────────────

export const TEMPO_SESSIONS_SKILL_METADATA = {
  name: 'Tempo MPP Sessions',
  description:
    '[ARSENAL-HOSTED ✓] Manage MPP payment channels on Tempo for high-frequency streaming payments. ' +
    'Sessions deposit stablecoin once into escrow, then pay via off-chain signed vouchers — no per-payment chain transaction. ' +
    'Use open_session to start a channel, pay_voucher for each subsequent payment, check_channel to inspect on-chain state.\n\n' +
    'execution_mode: server-side\n' +
    'chain: tempo (id: 4217)\n' +
    'escrow: 0x33b901018174DDabE4841042ab76ba85D4e24f25',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['tempo', 'mpp', 'sessions', 'payment-channel', 'streaming', 'voucher', 'escrow', 'ai-agent'],
  external_url: 'https://tempo.xyz',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['open_session', 'pay_voucher', 'check_channel'],
        description:
          'open_session: Open a payment channel with a deposit and make the first request. Returns channel_id and new_cumulative to track for future vouchers. ' +
          'pay_voucher: Send a signed off-chain voucher to an MPP session endpoint. Requires channel_id and prev_cumulative (from previous call). Returns response and new_cumulative. ' +
          'check_channel: Query on-chain state of a payment channel (deposit, settled, finalized status).',
      },
      url: {
        type: 'string',
        description: 'Target URL for open_session or pay_voucher. Must be an MPP-enabled endpoint that returns HTTP 402.',
      },
      private_key: {
        type: 'string',
        description: 'Tempo wallet private key (0x-prefixed hex). Required for open_session and pay_voucher.',
      },
      deposit: {
        type: 'string',
        description: 'Deposit amount in human-readable units (e.g. "10" for 10 USDC). Required for open_session. This amount is locked into escrow and consumed by vouchers.',
      },
      channel_id: {
        type: 'string',
        description: 'Payment channel ID (0x-prefixed bytes32 hex). Required for pay_voucher and check_channel. Returned by open_session.',
      },
      prev_cumulative: {
        type: 'string',
        description: 'Previous cumulative amount paid (human-readable, e.g. "0.01"). Required for pay_voucher. Use "0" for the first voucher on an existing channel. Returned by open_session and pay_voucher as new_cumulative.',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP method for open_session or pay_voucher (default: GET).',
      },
      body: {
        type: 'object',
        description: 'Request body for POST/PUT actions.',
      },
      headers: {
        type: 'object',
        description: 'Extra HTTP headers to include in the request.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Open a payment channel and make first request',
      input: {
        action: 'open_session',
        url: 'https://api.example.com/stream',
        deposit: '10',
        private_key: '0xYOUR_PRIVATE_KEY',
      },
    },
    {
      title: 'Pay with voucher (subsequent requests)',
      input: {
        action: 'pay_voucher',
        url: 'https://api.example.com/stream',
        channel_id: '0xCHANNEL_ID',
        prev_cumulative: '0.01',
        private_key: '0xYOUR_PRIVATE_KEY',
      },
    },
    {
      title: 'Check payment channel state',
      input: {
        action: 'check_channel',
        channel_id: '0xCHANNEL_ID',
      },
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

function parseFetchOptions(input: any): RequestInit {
  const { method = 'GET', body, headers: extraHeaders } = input;
  const opts: RequestInit = { method };
  if (body) {
    (opts as any).body = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) };
  } else if (extraHeaders) {
    opts.headers = extraHeaders;
  }
  return opts;
}

// ── actions ───────────────────────────────────────────────────────────────────

async function openSession(input: any): Promise<SkillExecutionResult> {
  const { url, deposit, private_key } = input;
  if (!url)         return { success: false, error: 'url is required' };
  if (!deposit)     return { success: false, error: 'deposit is required (e.g. "10" for 10 USDC)' };
  if (!private_key) return { success: false, error: 'private_key is required' };

  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(private_key as `0x${string}`);
  } catch {
    return { success: false, error: 'Invalid private_key — must be 0x-prefixed 32-byte hex.' };
  }

  let capturedChannelId: string | undefined;
  let capturedCumulative: bigint = 0n;

  try {
    const mppx = MppxClient.Mppx.create({
      methods: [
        MppxClient.session({
          account,
          deposit,
          onChannelUpdate: (entry) => {
            capturedChannelId = entry.channelId;
            capturedCumulative = entry.cumulativeAmount;
          },
        }),
      ],
      polyfill: false,
    });

    const res = await mppx.fetch(url, parseFetchOptions(input));
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    return {
      success: true,
      output: {
        status: res.status,
        data,
        channel_id: capturedChannelId,
        new_cumulative: formatUnits(capturedCumulative, DECIMALS),
        payer: account.address,
        deposit,
        hint: 'Store channel_id and new_cumulative. Pass new_cumulative as prev_cumulative in the next pay_voucher call.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `open_session failed: ${err.message}` };
  }
}

async function payVoucher(input: any): Promise<SkillExecutionResult> {
  const { url, channel_id, prev_cumulative, private_key } = input;
  if (!url)             return { success: false, error: 'url is required' };
  if (!channel_id)      return { success: false, error: 'channel_id is required (from open_session)' };
  if (prev_cumulative === undefined) return { success: false, error: 'prev_cumulative is required (use "0" for first voucher)' };
  if (!private_key)     return { success: false, error: 'private_key is required' };

  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(private_key as `0x${string}`);
  } catch {
    return { success: false, error: 'Invalid private_key — must be 0x-prefixed 32-byte hex.' };
  }

  let capturedNewCumulative: string = prev_cumulative;
  let capturedCumulativeRaw: bigint = parseUnits(prev_cumulative, DECIMALS);

  try {
    const mppx = MppxClient.Mppx.create({
      methods: [MppxClient.session({ account })],
      polyfill: false,
      onChallenge: async (challenge, { createCredential }) => {
        // challenge.request.amount is raw units (e.g. "1000" = 0.001 USDC)
        const req = challenge.request as Record<string, unknown>;
        const deltaRaw = BigInt((req.amount as string) ?? '0');
        const prevRaw = parseUnits(prev_cumulative, DECIMALS);
        capturedCumulativeRaw = prevRaw + deltaRaw;
        capturedNewCumulative = formatUnits(capturedCumulativeRaw, DECIMALS);

        return await createCredential({
          action: 'voucher',
          channelId: channel_id,
          cumulativeAmountRaw: capturedCumulativeRaw.toString(),
        });
      },
    });

    const res = await mppx.fetch(url, parseFetchOptions(input));
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    return {
      success: true,
      output: {
        status: res.status,
        data,
        channel_id,
        new_cumulative: capturedNewCumulative,
        hint: 'Pass new_cumulative as prev_cumulative in the next pay_voucher call.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `pay_voucher failed: ${err.message}` };
  }
}

async function checkChannel(input: any): Promise<SkillExecutionResult> {
  const { channel_id } = input;
  if (!channel_id) return { success: false, error: 'channel_id is required' };

  const channelIdHex = channel_id.startsWith('0x') ? channel_id : `0x${channel_id}`;

  try {
    // channels(bytes32) → (finalized, closeRequestedAt, payer, payee, token, authorizedSigner, deposit, settled)
    const data = `0x${SEL.channels}${pad32(channelIdHex)}`;
    const raw = await ethCall(ESCROW, data);

    if (!raw || raw === '0x') {
      return { success: false, error: 'Channel not found or escrow returned empty response.' };
    }

    // Strip 0x and parse 8 × 32-byte slots
    const hex = raw.slice(2);
    const slot = (i: number) => hex.slice(i * 64, (i + 1) * 64);

    const finalized         = slot(0).endsWith('1');
    const closeRequestedAt  = parseInt(slot(1), 16);
    const payer             = '0x' + slot(2).slice(24);
    const payee             = '0x' + slot(3).slice(24);
    const token             = '0x' + slot(4).slice(24);
    const authorizedSigner  = '0x' + slot(5).slice(24);
    const deposit           = BigInt('0x' + slot(6));
    const settled           = BigInt('0x' + slot(7));
    const remaining         = deposit - settled;

    // Identify token name
    const TOKEN_NAMES: Record<string, string> = {
      '0x20c000000000000000000000b9537d11c60e8b50': 'USDC.e',
      '0x20c0000000000000000000000000000000000000': 'pathUSD',
      '0x20c00000000000000000000014f22ca97301eb73': 'USDT0',
    };
    const tokenName = TOKEN_NAMES[token.toLowerCase()] ?? token;

    const status =
      finalized           ? 'finalized' :
      closeRequestedAt > 0 ? 'close_requested' :
      deposit > 0n        ? 'open' :
                            'not_found';

    return {
      success: true,
      output: {
        channel_id,
        status,
        finalized,
        close_requested_at: closeRequestedAt > 0 ? new Date(closeRequestedAt * 1000).toISOString() : null,
        payer,
        payee,
        token: tokenName,
        deposit: formatUnits(deposit, DECIMALS),
        settled: formatUnits(settled, DECIMALS),
        remaining: formatUnits(remaining, DECIMALS),
      },
    };
  } catch (err: any) {
    return { success: false, error: `check_channel failed: ${err.message}` };
  }
}

// ── main executor ─────────────────────────────────────────────────────────────

export async function executeTempoSessionsSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'open_session':  return openSession(input);
    case 'pay_voucher':   return payVoucher(input);
    case 'check_channel': return checkChannel(input);
    default:
      return { success: false, error: `Unknown action "${action}". Valid: open_session, pay_voucher, check_channel` };
  }
}
