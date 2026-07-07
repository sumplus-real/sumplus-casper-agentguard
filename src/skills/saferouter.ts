/**
 * SafeRouter Skill — verified-inference gateway discovery (read-only)
 *
 * SafeRouter is a confidential-verifiable LLM routing gateway. Its differentiator
 * is a per-request hardware attestation (TEE): an agent can cryptographically
 * prove that SafeRouter never saw plaintext.
 *
 * ⚠️ This skill is DISCOVERY ONLY. Arsenal does not proxy chat completions and
 *    does not provision API keys. The skill returns the SafeRouter base URL,
 *    its public model catalog, the three attestation endpoints, and a verify
 *    recipe. Agents go to SafeRouter directly for everything else (key signup
 *    via SafeRouter's own UI/API, chat traffic, top-ups).
 *
 *    Rationale: the attestation only covers SafeRouter's enclave. If Arsenal
 *    sat in the call path the agent would have to trust Arsenal as a middleman
 *    and the verifiability story collapses.
 *
 * Actions:
 *   - get_connection_info : returns base_url, /v1/chat/completions endpoint, live
 *                           model catalog, the three public attestation endpoints,
 *                           a verify recipe, and the proxy-warning note.
 *                           No side effects. No admin key. No write paths.
 *
 * Config (env):
 *   SAFEROUTER_BASE_URL  — base URL (default: http://127.0.0.1:8787 dev / prod TBD)
 *
 * Skill UUID: b8e9f1a3-4c5d-4d2e-8f7a-9b1c2d3e4f50
 *
 * SafeRouter docs: ~/Documents/GitHub/saferouter/docs/API.md
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';

function getBaseUrl(): string {
  return (process.env.SAFEROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

/**
 * Minimal HTTP(S) GET helper. Read-only; this skill never POSTs.
 *
 * Errors only surface message + status — no request/response bodies are logged.
 */
function httpGet(url: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client: typeof https | typeof http =
      target.protocol === 'http:' ? http : https;

    const reqOptions: any = {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'http:' ? 80 : 443),
      path: target.pathname + target.search,
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeout: 15000,
      family: 4,
    };

    const req = client.request(reqOptions, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let data: any = null;
        try { data = JSON.parse(buf); } catch { /* leave null */ }
        resolve({ status: res.statusCode ?? 0, data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('SafeRouter request timeout')); });
    req.end();
  });
}

// ─── Shared output fragments ─────────────────────────────────────────────────

function attestationEndpoints(baseUrl: string) {
  return {
    identity: {
      method: 'GET',
      url: `${baseUrl}/attestation`,
      description: 'TEE identity card — measurement, verifying key, root cert, providers.',
    },
    fresh_quote: {
      method: 'POST',
      url: `${baseUrl}/attestation/quote`,
      body_schema: { nonce: 'hex string, recommended ≥32 bytes' },
      description:
        'Fresh signed AttestationBundle bound to a caller-supplied nonce. Use this every time you want a live proof; verify the ed25519 signature against the identity card.',
    },
    transparency_log: {
      method: 'GET',
      url: `${baseUrl}/attestation/transparency`,
      description:
        'Append-only hash-chained log of gateway-identity events. Used to detect split-view / equivocation — confirm the latest entry payload matches the live quote.',
    },
  };
}

const HOW_TO_VERIFY =
  'Before sending any prompt: (1) GET {base_url}/attestation to fetch the gateway identity card (measurement + verifying_key_hex + root_cert_pem). ' +
  '(2) Generate a fresh nonce (≥32 random bytes, hex-encoded) and POST it to {base_url}/attestation/quote — verify the returned bundle\'s ed25519 signature against verifying_key_hex from step 1 and confirm report_data_hex binds your nonce. ' +
  '(3) GET {base_url}/attestation/transparency and confirm the latest entry\'s payload matches the quote. ' +
  'Only after the attestation verifies should you call /v1/chat/completions. Call SafeRouter DIRECTLY — never proxy chat traffic through Arsenal, or the attestation no longer covers the actual request path.';

const PROXY_WARNING =
  'Arsenal does NOT proxy /v1/chat/completions and does NOT provision SafeRouter API keys. ' +
  'Agents must obtain a key from SafeRouter directly and connect to SafeRouter directly with the Bearer key. ' +
  'If chat traffic were routed through Arsenal, the per-request TEE attestation would only cover SafeRouter\'s enclave, not the path through Arsenal — the verifiability guarantee would be lost.';

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const SAFEROUTER_SKILL_METADATA = {
  id: 'b8e9f1a3-4c5d-4d2e-8f7a-9b1c2d3e4f50',
  name: 'SafeRouter Verified Inference',
  description:
    '[ARSENAL-HOSTED ✓] Discovery entry point for SafeRouter, a confidential-verifiable LLM routing gateway. ' +
    'SafeRouter is OpenAI-compatible (POST /v1/chat/completions with SSE streaming, multi-provider fallback across OpenAI / DeepSeek / GLM / Anthropic) ' +
    'and emits a per-request hardware attestation (TEE) so callers can verify the gateway never saw plaintext. ' +
    'This skill is READ-ONLY DISCOVERY — it returns the base URL, live model catalog, and the three attestation endpoints. ' +
    'Arsenal deliberately does NOT proxy chat traffic and does NOT provision keys: agents obtain a SafeRouter key directly from SafeRouter and call /v1/chat/completions DIRECTLY against SafeRouter, because proxying would break the end-to-end attestation guarantee.',
  category: 'Infrastructure',
  version: '1.1.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: [
    'saferouter', 'llm', 'inference', 'tee', 'attestation', 'verifiable',
    'confidential', 'openai-compatible', 'router', 'discovery', 'ai',
  ],
  external_url: 'https://saferouter.ai',
  partner_verified: true,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_connection_info'],
        description:
          'get_connection_info: returns the SafeRouter base URL, /v1/chat/completions endpoint, live model catalog, and the three TEE attestation endpoints plus a verify recipe. No side effects, no key needed. This is the only action — Arsenal does not proxy chat traffic and does not mint keys.',
      },
    },
  },
  usage_examples: [
    { title: 'Discover endpoints + models', input: { action: 'get_connection_info' } },
  ],
};

// ─── Action handlers ─────────────────────────────────────────────────────────

export async function executeSafeRouterSkill(input: any): Promise<SkillExecutionResult> {
  const action = input?.action as string;
  const baseUrl = getBaseUrl();

  try {
    switch (action) {

      case 'get_connection_info': {
        // GET /v1/models is public on SafeRouter — no auth required.
        let models: any[] = [];
        let models_warning: string | undefined;
        try {
          const r = await httpGet(`${baseUrl}/v1/models`);
          if (r.status === 200 && r.data && Array.isArray(r.data.data)) {
            models = r.data.data.map((m: any) => ({
              id: m.id,
              owned_by: m.owned_by,
              name: m.name,
              description: m.description,
              context: m.context,
              max_output: m.max_output,
              input_per_million: m.input_per_million,
              output_per_million: m.output_per_million,
              cache_hit_per_million: m.cache_hit_per_million,
              tags: m.tags,
            }));
          } else {
            models_warning = `Model catalog fetch returned HTTP ${r.status}; the agent can re-fetch directly at ${baseUrl}/v1/models.`;
          }
        } catch (e: any) {
          models_warning = `Arsenal could not reach ${baseUrl}/v1/models (${e?.message ?? String(e)}). The agent should fetch the catalog itself.`;
        }

        return {
          success: true,
          output: {
            base_url: baseUrl,
            chat_endpoint: `${baseUrl}/v1/chat/completions`,
            models_endpoint: `${baseUrl}/v1/models`,
            models,
            ...(models_warning ? { models_warning } : {}),
            attestation: attestationEndpoints(baseUrl),
            how_to_verify: HOW_TO_VERIFY,
            credentials: {
              auth_header: 'Authorization: Bearer sk-sr-...',
              note:
                'Arsenal does not provision SafeRouter keys. Obtain a key from SafeRouter directly (its own signup / admin surface) and authenticate every direct call to /v1/chat/completions with `Authorization: Bearer <secret>`.',
            },
            important_proxy_note: PROXY_WARNING,
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_connection_info`,
        };
    }
  } catch (e: any) {
    // Only the error message — never input or HTTP body.
    return { success: false, error: e?.message ?? String(e) };
  }
}
