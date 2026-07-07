/**
 * Nexus Gateway — Talus × SumPlus Stream 2
 *
 * Wraps Arsenal Sui skills as Talus Nexus off-chain tools. Each entry here
 * becomes a Nexus Tool with its own FQN, discoverable by any Talus DAG.
 *
 * Protocol spec: https://docs.talus.network/developer-docs/index/tool
 * Hard rule: Nexus output_schema top-level MUST be `oneOf` — DAG edges route
 * off variants. We use a generic ok/err variant shape for all 5 MVP tools.
 */

import { executeCetusSkill,          CETUS_SKILL_METADATA }          from '@/skills/cetus';
import { executeBlueFinEmberSkill,   BLUEFIN_EMBER_SKILL_METADATA }  from '@/skills/bluefin-ember';
import { executeAftermathSkill,      AFTERMATH_SKILL_METADATA }      from '@/skills/aftermath';
import { executeNaviSkill,           NAVI_SKILL_METADATA }           from '@/skills/navi';
import { executeScallopSkill,        SCALLOP_SKILL_METADATA }        from '@/skills/scallop';

export interface NexusToolSpec {
  slug:        string;
  fqn:         string;
  description: string;
  inputSchema: Record<string, unknown>;
  executor:    (input: unknown) => Promise<unknown>;
  /**
   * Fields to force-merge into the invoke input before calling the executor.
   * Used by testnet tool variants that wrap a mainnet executor and pin the
   * `chain` field to `"sui:testnet"` so every invocation goes to Sui testnet.
   */
  inputOverride?: Record<string, unknown>;
  /**
   * Which Nexus networks this tool should be advertised in via `GET /api/tools`.
   * Tools not listed here are still reachable at their individual URLs (health /
   * meta / invoke) for inspection, but do not appear in the batch index used by
   * `nexus tool register offchain --batch`. This prevents a testnet batch
   * registration from accidentally registering mainnet-only tools.
   */
  registeredNetworks: Array<'testnet' | 'mainnet'>;
}

export interface NexusToolMeta {
  fqn:           string;
  type:          'offchain';
  url:           string;
  description:   string;
  /** Max invocation timeout in milliseconds. Nexus SDK's `ToolMeta` struct
   *  requires this field (deserialized as `Duration` from u64 millis) — the
   *  CLI's `validate offchain` command will fail decoding the response without it. */
  timeout:       number;
  input_schema:  Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

/** Default `/invoke` timeout in ms advertised to Nexus Leader nodes. Matches
 *  the Next.js route `maxDuration` ceiling for the invoke handler. */
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;

const JSON_SCHEMA_URI = 'https://json-schema.org/draft/2020-12/schema';

/** Attach draft-2020-12 $schema to an existing Arsenal skill input schema. */
function withSchemaTag(schema: Record<string, unknown>): Record<string, unknown> {
  return { $schema: JSON_SCHEMA_URI, ...schema };
}

/**
 * Generic Nexus output schema — top-level oneOf with ok/err variants.
 *
 * MVP uses an open-object `ok` so we don't have to hand-write a schema per skill;
 * post-MVP, each tool can define a tighter variant structure so DAG authors
 * get stronger guarantees.
 */
const GENERIC_OUTPUT_SCHEMA: Record<string, unknown> = {
  $schema: JSON_SCHEMA_URI,
  oneOf: [
    {
      type: 'object',
      required: ['ok'],
      properties: {
        ok: { type: 'object', additionalProperties: true },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['err'],
      properties: {
        err: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string' } },
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    },
  ],
};

// ── Registry ────────────────────────────────────────────────────────────────

// Tight input schema for the testnet Cetus variant. Advertises only the
// action verified to work end-to-end on Sui testnet: `get_swap_quote`.
// Hides the `chain` field because the gateway force-injects
// `"sui:testnet"` on every invocation.
//
// `build_swap_tx` is intentionally omitted: the Cetus Aggregator SDK's PTB
// construction path references a Sui package (0x721d9…) that does not exist
// on Sui testnet, causing `txb.build()` to fail at serialization time.
// Once the SDK ships end-to-end testnet support, we can reintroduce it here.
const CETUS_TESTNET_INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['get_swap_quote'],
      description:
        'Cetus action on Sui testnet. get_swap_quote: preview swap output using the live Cetus Aggregator routed through Sui testnet. Returns amount_out, price impact, and the multi-hop route via Cetus and DeepBook pools.',
    },
    token_in:  { type: 'string', description: 'Input token symbol (e.g. SUI) or full coin type' },
    token_out: { type: 'string', description: 'Output token symbol or full coin type' },
    amount_in: { type: 'string', description: 'Human-readable input amount, e.g. "1.5"' },
    slippage:  { type: 'number', description: 'Max slippage as a percentage (e.g. 0.5 = 0.5%)' },
  },
};

export const NEXUS_TOOLS: Record<string, NexusToolSpec> = {
  // ── Sui-mainnet-backed tools, advertised for Nexus testnet registration ────
  // These tools execute against Sui mainnet RPC and return mainnet data / build
  // mainnet PTBs. Advertising them for Nexus *testnet* registration is safe
  // because a testnet DAG cannot sign a mainnet PTB with real funds — but DAG
  // authors should be aware that responses reflect mainnet state. `cetus` is
  // withheld from the batch index because FQN `xyz.sumplus.cetus@1` is already
  // registered on testnet by a Talus engineer's test call and the FQN primary
  // key is taken. A future `xyz.sumplus.cetus@2` owned by us will replace it.
  cetus: {
    slug:        'cetus',
    fqn:         'xyz.sumplus.cetus@1',
    description: CETUS_SKILL_METADATA.description,
    inputSchema: withSchemaTag(CETUS_SKILL_METADATA.schema as Record<string, unknown>),
    executor:    executeCetusSkill as (input: unknown) => Promise<unknown>,
    registeredNetworks: [],
  },
  'bluefin-ember': {
    slug:        'bluefin-ember',
    fqn:         'xyz.sumplus.bluefin-ember@1',
    description: BLUEFIN_EMBER_SKILL_METADATA.description,
    inputSchema: withSchemaTag(BLUEFIN_EMBER_SKILL_METADATA.schema as Record<string, unknown>),
    executor:    executeBlueFinEmberSkill as (input: unknown) => Promise<unknown>,
    registeredNetworks: ['testnet'],
  },
  aftermath: {
    slug:        'aftermath',
    fqn:         'xyz.sumplus.aftermath@1',
    description: AFTERMATH_SKILL_METADATA.description,
    inputSchema: withSchemaTag(AFTERMATH_SKILL_METADATA.schema as Record<string, unknown>),
    executor:    executeAftermathSkill as (input: unknown) => Promise<unknown>,
    registeredNetworks: ['testnet'],
  },
  navi: {
    slug:        'navi',
    fqn:         'xyz.sumplus.navi@1',
    description: NAVI_SKILL_METADATA.description,
    inputSchema: withSchemaTag(NAVI_SKILL_METADATA.schema as Record<string, unknown>),
    executor:    executeNaviSkill as (input: unknown) => Promise<unknown>,
    registeredNetworks: ['testnet'],
  },
  scallop: {
    slug:        'scallop',
    fqn:         'xyz.sumplus.scallop@1',
    description: SCALLOP_SKILL_METADATA.description,
    inputSchema: withSchemaTag(SCALLOP_SKILL_METADATA.schema as Record<string, unknown>),
    executor:    executeScallopSkill as (input: unknown) => Promise<unknown>,
    registeredNetworks: ['testnet'],
  },

  // ── Testnet tools (advertised for Nexus testnet registration) ──────────────
  'cetus-testnet': {
    slug:        'cetus-testnet',
    fqn:         'xyz.sumplus.cetus-testnet@1',
    description:
      'Cetus CLMM on Sui testnet. Get live swap quotes routed through the Cetus Aggregator against Sui testnet pools (Cetus + DeepBook providers). Every invocation is pinned to Sui testnet, so no mainnet funds are ever at risk — safe for Nexus DAG testing. Read-only for now; transaction construction will be added once the Cetus Aggregator SDK supports Sui testnet PTB serialization end-to-end.',
    inputSchema: withSchemaTag(CETUS_TESTNET_INPUT_SCHEMA),
    executor:    executeCetusSkill as (input: unknown) => Promise<unknown>,
    inputOverride: { chain: 'sui:testnet' },
    registeredNetworks: ['testnet'],
  },
};

export function getNexusTool(slug: string): NexusToolSpec | undefined {
  return NEXUS_TOOLS[slug];
}

export function listNexusTools(): NexusToolSpec[] {
  return Object.values(NEXUS_TOOLS);
}

/**
 * Tools advertised in `GET /api/tools` — the batch index consumed by
 * `nexus tool register offchain --batch`. By default, we only expose tools
 * that have `"testnet"` in their `registeredNetworks`, because Nexus mainnet
 * is not live yet and we don't want mainnet-only tools to be accidentally
 * registered to the testnet Tool Registry.
 */
export function listRegistrableTools(
  network: 'testnet' | 'mainnet' = 'testnet',
): NexusToolSpec[] {
  return listNexusTools().filter((t) => t.registeredNetworks.includes(network));
}

/**
 * Merge a tool's `inputOverride` fields onto a user-supplied invoke input.
 * The override wins — this is how testnet variants pin `chain: "sui:testnet"`
 * regardless of what the caller sent.
 */
export function applyInputOverride(tool: NexusToolSpec, input: unknown): unknown {
  if (!tool.inputOverride) return input;
  if (input === null || typeof input !== 'object') return input;
  return { ...(input as Record<string, unknown>), ...tool.inputOverride };
}

/**
 * Derive the list of allowed `action` values from a tool's input schema.
 * This is what `/meta` advertises — the gateway enforces this at invoke time
 * so callers cannot bypass the schema and reach executor code paths we
 * intentionally restricted (e.g. omitting `build_swap_tx` from the
 * cetus-testnet tool).
 *
 * Returns `null` if the tool's schema doesn't declare an `action` enum —
 * in which case no enforcement happens and the executor receives the input
 * as-is.
 */
export function getAllowedActions(tool: NexusToolSpec): string[] | null {
  const schema = tool.inputSchema as {
    properties?: { action?: { enum?: unknown } };
  };
  const list = schema?.properties?.action?.enum;
  return Array.isArray(list) && list.every((v) => typeof v === 'string')
    ? (list as string[])
    : null;
}

// ── Meta / URL helpers ──────────────────────────────────────────────────────

/**
 * Derive the public base URL from an incoming request. Honors the
 * `NEXUS_TOOL_PUBLIC_BASE_URL` env var when set (useful when Arsenal sits
 * behind a proxy that rewrites the host), otherwise falls back to the
 * request's origin.
 */
export function getPublicBaseUrl(requestUrl: string): string {
  const override = process.env.NEXUS_TOOL_PUBLIC_BASE_URL;
  if (override) return override.replace(/\/$/, '');
  return new URL(requestUrl).origin;
}

export function toolBaseUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/api/tools/${slug}`;
}

export function buildToolMeta(spec: NexusToolSpec, baseUrl: string): NexusToolMeta {
  return {
    fqn:           spec.fqn,
    type:          'offchain',
    url:           toolBaseUrl(baseUrl, spec.slug),
    description:   spec.description,
    timeout:       DEFAULT_TOOL_TIMEOUT_MS,
    input_schema:  spec.inputSchema,
    output_schema: GENERIC_OUTPUT_SCHEMA,
  };
}

// ── Invoke response normalization ───────────────────────────────────────────

export type NexusInvokeResult =
  | { ok:  Record<string, unknown> }
  | { err: { reason: string; [k: string]: unknown } };

/**
 * Map an Arsenal skill executor return value to a Nexus ok/err variant.
 *
 * Arsenal skills are inconsistent: most return `{success, output|error}`,
 * but some (e.g. several Cetus read actions) return a bare payload.
 *
 * Rules:
 *   - `{success: false, error}`           → `{err: {reason}}`
 *   - `{success: true,  output}`          → `{ok: output}`
 *   - `{success: true}` with no output    → `{ok: {}}`
 *   - anything else (bare object/value)   → `{ok: <value as object>}`
 */
export function normalizeExecutorResult(result: unknown): NexusInvokeResult {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if ('success' in r) {
      if (r.success === false) {
        const reason =
          typeof r.error === 'string'
            ? r.error
            : r.error != null
              ? JSON.stringify(r.error)
              : 'Unknown error';
        return { err: { reason } };
      }
      if (r.success === true) {
        const output = (r.output ?? {}) as Record<string, unknown>;
        return { ok: output };
      }
    }
    return { ok: r };
  }
  return { ok: { value: result } };
}
