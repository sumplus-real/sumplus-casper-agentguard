/**
 * x402 Payment Protocol Toolkit
 *
 * Helps AI agents navigate x402-gated APIs:
 * - Probe any HTTPS resource to detect x402 payment requirements
 * - Decode raw 402 response bodies into structured payment info
 * - Verify payment headers via any x402 facilitator (Coinbase or Binance)
 * - Get network/asset info for all supported x402 networks
 *
 * x402 spec: https://x402.org
 * Coinbase facilitator: https://x402.org/facilitator
 * Binance x402 (BNB Chain): https://www.binance.com/en/blog/ecosystem/...
 *
 * [ARSENAL-HOSTED ✓] No wallet or private key required — agents sign payments themselves.
 */

import type { SkillExecutionResult } from '@/types/skill';
import { NETWORK_ASSETS, COINBASE_FACILITATOR } from '@/lib/x402';

// SSRF protection — block private/loopback ranges
const BLOCKED_HOSTNAMES = /^(localhost|.*\.local|.*\.internal|.*\.corp)$/i;
const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|0\.|::1$|fd[0-9a-f]{2}:)/i;

// Binance x402 facilitator — URL not publicly disclosed at launch;
// configure via X402_BINANCE_FACILITATOR_URL env var once Binance publishes it.
const BINANCE_FACILITATOR = process.env.X402_BINANCE_FACILITATOR_URL ?? null;

const BSC_NETWORKS = new Set(['bsc', 'bnb', 'bnb-smart-chain', 'binance-smart-chain']);

function assertSafeUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`Invalid URL: ${raw}`); }
  if (u.protocol !== 'https:') throw new Error('Only HTTPS URLs are supported');
  const host = u.hostname;
  if (BLOCKED_HOSTNAMES.test(host) || PRIVATE_IP.test(host)) {
    throw new Error(`Blocked hostname: ${host}`);
  }
  return u;
}

async function httpFetch(url: string, opts: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(12_000) });
  const body = await res.text().catch(() => '');
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return { status: res.status, headers, body };
}

function parseRequirements(body: string): object | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.accepts || parsed?.x402Version != null) return parsed;
    return null;
  } catch {
    return null;
  }
}

function resolveFacilitator(network: string, override?: string): { url: string; note?: string } {
  if (override) return { url: override };
  if (BSC_NETWORKS.has(network.toLowerCase())) {
    if (BINANCE_FACILITATOR) return { url: BINANCE_FACILITATOR };
    return {
      url: COINBASE_FACILITATOR,
      note: 'Binance x402 facilitator URL not yet configured (X402_BINANCE_FACILITATOR_URL). Falling back to Coinbase facilitator — verification may fail for BSC payments. Set the env var once Binance publishes their endpoint.',
    };
  }
  return { url: COINBASE_FACILITATOR };
}

function formatAmount(raw: string | null | undefined, decimals = 6): string | null {
  if (!raw) return null;
  return (parseInt(raw) / Math.pow(10, decimals)).toFixed(decimals);
}

export const X402_PAYMENT_SKILL_METADATA = {
  id: 'b4e7f2a1-8c3d-4f6e-9a2b-5d8e1f4c7a0b',
  name: 'x402 Payment Protocol',
  description:
    '[ARSENAL-HOSTED ✓] x402 payment protocol toolkit for AI agents. ' +
    'Supports Coinbase x402 (USDC on Base/Avalanche) and Binance x402 (USDT/USDC/USD1 on BNB Chain). ' +
    'Probe any HTTPS resource to detect if it requires x402 payment and get exact requirements, ' +
    'decode raw 402 response bodies into structured payment info, ' +
    'verify payment headers via the appropriate facilitator (auto-selected by network), ' +
    'and look up stablecoin contract addresses for any supported network. ' +
    'Agents sign and submit payments themselves — no keys held by Arsenal.',
  category: 'Payments',
  version: '1.1.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['x402', 'payments', 'http-402', 'micropayments', 'usdc', 'usdt', 'coinbase', 'binance', 'bnb-chain', 'bsc', 'agent-payments'],
  external_url: 'https://x402.org',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['probe_resource', 'verify_payment', 'decode_requirements', 'get_network_info'],
        description:
          'probe_resource: Send a request to a URL and detect if it requires x402 payment; returns payment requirements and the correct facilitator to use. ' +
          'verify_payment: Verify a signed X-Payment header via the appropriate facilitator (auto-selects Coinbase for EVM/Base, Binance for BSC). ' +
          'decode_requirements: Parse a raw 402 response body string into structured payment info (amount, network, asset, facilitator, etc.). ' +
          'get_network_info: List all supported x402 networks with their stablecoin contract addresses and facilitator details.',
      },
      url: {
        type: 'string',
        description: 'HTTPS URL to probe. Required for probe_resource.',
      },
      method: {
        type: 'string',
        enum: ['GET', 'HEAD', 'POST'],
        description: 'HTTP method for probe_resource. Defaults to HEAD (cheaper). Use GET if HEAD is not supported.',
      },
      payment_header: {
        type: 'string',
        description: 'The X-Payment header value (signed payment proof). Required for verify_payment.',
      },
      requirements: {
        type: 'object',
        description: 'Payment requirements object (from probe_resource or decode_requirements). Required for verify_payment.',
      },
      facilitator_url: {
        type: 'string',
        description: 'Override the facilitator URL for verify_payment. Optional — Arsenal auto-selects based on network (Coinbase for Base/Avalanche, Binance for BSC).',
      },
      response_body: {
        type: 'string',
        description: 'Raw 402 response body string to parse. Required for decode_requirements.',
      },
    },
  },
  usage_examples: [
    { title: 'Check if a resource is x402-gated',  input: { action: 'probe_resource', url: 'https://some-api.example.com/endpoint' } },
    { title: 'Verify payment before retry',         input: { action: 'verify_payment', payment_header: '<signed-header>', requirements: {} } },
    { title: 'Decode a raw 402 response',           input: { action: 'decode_requirements', response_body: '{"x402Version":1,"accepts":[...]}' } },
    { title: 'List supported x402 networks',        input: { action: 'get_network_info' } },
  ],
};

export async function executeX402PaymentSkill(params: Record<string, unknown>): Promise<SkillExecutionResult> {
  const action = params.action as string;

  try {
    switch (action) {

      case 'probe_resource': {
        const rawUrl = params.url as string;
        if (!rawUrl) return { success: false, error: 'url is required for probe_resource' };

        const url = assertSafeUrl(rawUrl);
        const method = (params.method as string | undefined) ?? 'HEAD';
        const { status, headers, body } = await httpFetch(url.toString(), { method });

        if (status === 402) {
          const requirements = parseRequirements(body);
          const accepts: any[] = (requirements as any)?.accepts ?? [];
          const first = accepts[0] ?? {};
          const network: string = first.network ?? 'unknown';
          const { url: facilitatorUrl, note: facilitatorNote } = resolveFacilitator(network);
          const isBsc = BSC_NETWORKS.has(network.toLowerCase());

          return {
            success: true,
            output: {
              x402_gated: true,
              status: 402,
              x402_version: (requirements as any)?.x402Version ?? 1,
              payment_required: {
                network,
                asset: first.asset ?? 'unknown',
                scheme: first.scheme ?? 'exact',
                amount_raw: first.maxAmountRequired ?? null,
                amount_formatted: formatAmount(first.maxAmountRequired),
                pay_to: first.payTo ?? null,
                resource: first.resource ?? rawUrl,
                timeout_seconds: first.maxTimeoutSeconds ?? null,
              },
              facilitator: {
                url: facilitatorUrl,
                operator: isBsc ? 'Binance' : 'Coinbase',
                ...(facilitatorNote ? { note: facilitatorNote } : {}),
              },
              all_payment_options: accepts.length > 1 ? accepts : undefined,
              full_requirements: requirements,
              next_step: 'Pay on-chain using the asset/network above, then retry with X-Payment: <signed-proof>. Use verify_payment to confirm the proof is valid first.',
            },
          };
        }

        if (status >= 200 && status < 300) {
          return {
            success: true,
            output: {
              x402_gated: false,
              status,
              message: 'Resource is publicly accessible — no payment required.',
              content_type: headers['content-type'] ?? null,
            },
          };
        }

        return {
          success: true,
          output: {
            x402_gated: false,
            status,
            message: `Resource returned HTTP ${status}. Not an x402 gate.`,
          },
        };
      }

      case 'verify_payment': {
        const paymentHeader = params.payment_header as string;
        const requirements = params.requirements as any;
        const facilitatorOverride = params.facilitator_url as string | undefined;
        if (!paymentHeader) return { success: false, error: 'payment_header is required for verify_payment' };
        if (!requirements) return { success: false, error: 'requirements is required for verify_payment' };

        const network: string = requirements.network ?? requirements?.accepts?.[0]?.network ?? '';
        const { url: facilitatorUrl, note: facilitatorNote } = resolveFacilitator(network, facilitatorOverride);

        const res = await fetch(`${facilitatorUrl}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentHeader, paymentRequirements: requirements }),
          signal: AbortSignal.timeout(12_000),
        });

        const result = await res.json().catch(() => ({ isValid: false, invalidReason: 'Unparseable facilitator response' }));

        return {
          success: true,
          output: {
            is_valid: result.isValid ?? false,
            invalid_reason: result.invalidReason ?? null,
            facilitator_used: facilitatorUrl,
            ...(facilitatorNote ? { facilitator_note: facilitatorNote } : {}),
            next_step: result.isValid
              ? 'Payment verified. Retry the original request with the same X-Payment header.'
              : `Payment invalid: ${result.invalidReason ?? 'unknown reason'}.`,
          },
        };
      }

      case 'decode_requirements': {
        const raw = params.response_body as string;
        if (!raw) return { success: false, error: 'response_body is required for decode_requirements' };

        const parsed = parseRequirements(raw);
        if (!parsed) {
          return { success: false, error: 'Could not parse response body as x402 payment requirements.' };
        }

        const accepts: any[] = (parsed as any).accepts ?? [];
        const summary = accepts.map((a: any) => {
          const network: string = a.network ?? '';
          const { url: facilitatorUrl, note } = resolveFacilitator(network);
          return {
            network,
            asset: a.asset,
            scheme: a.scheme,
            amount_raw: a.maxAmountRequired,
            amount_formatted: formatAmount(a.maxAmountRequired),
            pay_to: a.payTo,
            resource: a.resource,
            timeout_seconds: a.maxTimeoutSeconds,
            facilitator: facilitatorUrl,
            ...(note ? { facilitator_note: note } : {}),
          };
        });

        return {
          success: true,
          output: {
            x402_version: (parsed as any).x402Version ?? 1,
            payment_options: summary,
            full_parsed: parsed,
          },
        };
      }

      case 'get_network_info': {
        const networks = Object.entries(NETWORK_ASSETS).map(([network, assets]) => {
          const isBsc = BSC_NETWORKS.has(network);
          return {
            network,
            operator: isBsc ? 'Binance x402' : 'Coinbase x402',
            facilitator: isBsc
              ? (BINANCE_FACILITATOR ?? 'not yet configured — set X402_BINANCE_FACILITATOR_URL')
              : COINBASE_FACILITATOR,
            assets: Object.entries(assets).map(([symbol, address]) => ({ symbol: symbol.toUpperCase(), address })),
            schemes: isBsc ? ['exact', 'eip3009', 'permit2-exact', 'permit2-upto'] : ['exact'],
            notes: isBsc
              ? 'Binance x402 launched May 2026. Facilitator URL not publicly disclosed at launch — check https://www.binance.com for updates.'
              : undefined,
          };
        });

        return {
          success: true,
          output: {
            supported_networks: networks,
            x402_spec: 'https://x402.org',
            coinbase_facilitator: COINBASE_FACILITATOR,
            binance_facilitator_status: BINANCE_FACILITATOR
              ? `Configured: ${BINANCE_FACILITATOR}`
              : 'Not yet configured — set X402_BINANCE_FACILITATOR_URL env var',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
