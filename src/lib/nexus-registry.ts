/**
 * Nexus Tool Registry
 *
 * Maps Nexus slug → Arsenal skill UUID + metadata for the Talus Nexus Gateway.
 * Each entry exposes an Arsenal skill as a Nexus-compatible Tool.
 *
 * URL pattern: https://arsenal.sumplus.xyz/tools/{slug}
 * FQN pattern:  xyz.sumplus.arsenal.{slug}@1
 */

import { SUI_SKILL_METADATA }           from '@/skills/sui-blockchain';
import { CETUS_SKILL_METADATA }         from '@/skills/cetus';
import { BLUEFIN_EMBER_SKILL_METADATA } from '@/skills/bluefin-ember';
import { NAVI_SKILL_METADATA }          from '@/skills/navi';
import { SCALLOP_SKILL_METADATA }       from '@/skills/scallop';
import { SUILEND_SKILL_METADATA }       from '@/skills/suilend';
import { AFTERMATH_SKILL_METADATA }     from '@/skills/aftermath';
import { SAFEROUTER_SKILL_METADATA }    from '@/skills/saferouter';

export const BASE_URL = 'https://arsenal.sumplus.xyz';

export interface NexusSkillEntry {
  slug:        string;   // URL segment and FQN suffix
  uuid:        string;   // Arsenal skill UUID (for executeSkillById)
  fqn:         string;   // Fully-qualified Nexus tool name
  name:        string;
  description: string;
  inputSchema: object;   // JSON Schema for /invoke request body
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Standard Nexus output schema — every tool returns { ok: {...} } | { err: { reason } } */
export const NEXUS_OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      required: ['ok'],
      properties: {
        ok: { type: 'object', description: 'Successful execution result' },
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
          properties: {
            reason: { type: 'string', description: 'Human-readable error message' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  ],
};

function fqn(slug: string) {
  return `xyz.sumplus.arsenal.${slug}@1`;
}

function toolUrl(slug: string) {
  return `${BASE_URL}/tools/${slug}`;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const REGISTRY_ARRAY: NexusSkillEntry[] = [
  {
    slug:        'sui',
    uuid:        'ac6ac13c-e04a-441d-ac0f-ae80231aad2d',
    fqn:         fqn('sui'),
    name:        SUI_SKILL_METADATA.name,
    description: SUI_SKILL_METADATA.description,
    inputSchema: SUI_SKILL_METADATA.schema,
  },
  {
    slug:        'cetus',
    uuid:        '2744ff56-cede-460a-8f1b-c7ae77c328f1',
    fqn:         fqn('cetus'),
    name:        CETUS_SKILL_METADATA.name,
    description: CETUS_SKILL_METADATA.description,
    inputSchema: CETUS_SKILL_METADATA.schema,
  },
  {
    slug:        'bluefin-ember',
    uuid:        'e3b7f1a2-8c4d-4e9f-b5a6-3d2c1e0f7b8a',
    fqn:         fqn('bluefin-ember'),
    name:        BLUEFIN_EMBER_SKILL_METADATA.name,
    description: BLUEFIN_EMBER_SKILL_METADATA.description,
    inputSchema: BLUEFIN_EMBER_SKILL_METADATA.schema,
  },
  {
    slug:        'navi',
    uuid:        '879d3a33-c5e5-4a1f-b5d6-549dfccd0f41',
    fqn:         fqn('navi'),
    name:        NAVI_SKILL_METADATA.name,
    description: NAVI_SKILL_METADATA.description,
    inputSchema: NAVI_SKILL_METADATA.schema,
  },
  {
    slug:        'scallop',
    uuid:        '768a3623-cf83-43f3-a94c-28c4a1a49c70',
    fqn:         fqn('scallop'),
    name:        SCALLOP_SKILL_METADATA.name,
    description: SCALLOP_SKILL_METADATA.description,
    inputSchema: SCALLOP_SKILL_METADATA.schema,
  },
  {
    slug:        'suilend',
    uuid:        '907d0c31-54db-48cd-b67b-5311d713873a',
    fqn:         fqn('suilend'),
    name:        SUILEND_SKILL_METADATA.name,
    description: SUILEND_SKILL_METADATA.description,
    inputSchema: SUILEND_SKILL_METADATA.schema,
  },
  {
    slug:        'aftermath',
    uuid:        '1a2568da-e586-4a25-b520-529b2d0d1609',
    fqn:         fqn('aftermath'),
    name:        AFTERMATH_SKILL_METADATA.name,
    description: AFTERMATH_SKILL_METADATA.description,
    inputSchema: AFTERMATH_SKILL_METADATA.schema,
  },
  {
    slug:        'saferouter',
    uuid:        'b8e9f1a3-4c5d-4d2e-8f7a-9b1c2d3e4f50',
    fqn:         fqn('saferouter'),
    name:        SAFEROUTER_SKILL_METADATA.name,
    description: SAFEROUTER_SKILL_METADATA.description,
    inputSchema: SAFEROUTER_SKILL_METADATA.schema,
  },
];

/** Lookup by slug. Returns undefined for unknown tools. */
export const NEXUS_REGISTRY: Record<string, NexusSkillEntry> =
  Object.fromEntries(REGISTRY_ARRAY.map((e) => [e.slug, e]));

/** All registered tool slugs */
export const NEXUS_SLUGS = REGISTRY_ARRAY.map((e) => e.slug);

/** Build the /meta response for a given entry */
export function buildMeta(entry: NexusSkillEntry) {
  return {
    fqn:           entry.fqn,
    type:          'offchain',
    url:           toolUrl(entry.slug),
    name:          entry.name,
    description:   entry.description,
    input_schema:  entry.inputSchema,
    output_schema: NEXUS_OUTPUT_SCHEMA,
  };
}
