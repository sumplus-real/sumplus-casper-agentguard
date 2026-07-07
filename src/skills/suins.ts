/**
 * Official Skill: SuiNS — Sui Name Service
 *
 * SuiNS is the official name service for Sui. Users register human-readable
 * names like "alice.sui" that resolve to wallet addresses — analogous to ENS
 * on Ethereum or .sol on Solana.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Resolution strategy:
 *   1. Primary: SuiClient.resolveNameServiceAddress / resolveNameServiceNames
 *      (native Sui RPC methods, no extra deps required)
 *   2. Fallback: @mysten/suins SuinsClient.getNameRecord for richer metadata
 *
 * Contracts (Sui mainnet):
 *   Package (latest): 0x71af035413ed499710980ed8adb010bbf2cc5cacf4ab37c7710a4bb87eb58ba5
 *   Package (v1):     0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0
 *   SuiNS Object:     0x6e0ddefc0ad98889c04bab9639e512c21766c5e6366f89e696956d9be6952871
 *   Registry Table:   0xe64cd9db9f829c6cc405d9790bd71567ae07259855f4fba6f02c84f52298c106
 *
 * Website: https://suins.io
 * Docs:    https://docs.suins.io
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';

// ── Mainnet contract addresses ───────────────────────────────────────────────

const SUINS_PACKAGE_LATEST = '0x71af035413ed499710980ed8adb010bbf2cc5cacf4ab37c7710a4bb87eb58ba5';
const SUINS_PACKAGE_V1     = '0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0';
const SUINS_OBJECT_ID      = '0x6e0ddefc0ad98889c04bab9639e512c21766c5e6366f89e696956d9be6952871';
const REGISTRY_TABLE_ID    = '0xe64cd9db9f829c6cc405d9790bd71567ae07259855f4fba6f02c84f52298c106';

// ── Client factory ────────────────────────────────────────────────────────────

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize a name input to the canonical ".sui" form.
 * Accepts "alice", "alice.sui", "alice.SUI" → "alice.sui"
 */
function normalizeName(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.endsWith('.sui') ? trimmed : `${trimmed}.sui`;
}

/**
 * Validate that a string looks like a Sui address (0x + up to 64 hex chars).
 */
function isValidSuiAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(addr);
}

/**
 * Pad a Sui address to canonical 0x + 64 hex chars format.
 */
function canonicalAddress(addr: string): string {
  return '0x' + addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:           'SuiNS',
      full_name:      'Sui Name Service',
      chain:          'sui',
      website:        'https://suins.io',
      docs:           'https://docs.suins.io',
      app:            'https://suins.io/names',
      description:
        'SuiNS is the official human-readable naming layer for the Sui blockchain. ' +
        'It lets users register memorable names like "alice.sui" that map to wallet ' +
        'addresses, removing the need to copy-paste 64-character hex strings.',
      contracts: {
        package_latest:  SUINS_PACKAGE_LATEST,
        package_v1:      SUINS_PACKAGE_V1,
        suins_object:    SUINS_OBJECT_ID,
        registry_table:  REGISTRY_TABLE_ID,
      },
      how_names_work: [
        'Names follow the pattern <label>.sui (e.g. "satoshi.sui").',
        'Subnames are also supported: "dev.satoshi.sui".',
        'Each registered name is an NFT owned by the registrant.',
        'A name can point its "target address" to any Sui wallet.',
        'A wallet can set one name as its default (primary name) for reverse lookup.',
        'Names expire and must be renewed; registration costs vary by name length.',
      ],
      name_lengths_and_pricing: {
        '3 chars':  'highest price tier',
        '4 chars':  'mid-tier price',
        '5+ chars': 'lowest price tier',
        accepted_coins: ['SUI', 'NS (SuiNS token)', 'USDC'],
        max_registration_years: 5,
      },
      resolution_methods: {
        rpc:
          'The Sui RPC natively supports resolveNameServiceAddress (name → address) ' +
          'and resolveNameServiceNames (address → names).',
        sdk:
          'Use @mysten/suins SuinsClient.getNameRecord(name) for full record metadata ' +
          'including expiration, avatar, content hash, and Walrus site ID.',
      },
      highlights: [
        'Official Mysten Labs-backed naming service',
        'NFT-based ownership — names are transferable assets',
        'Subname delegation: parent owners can create <label>.parent.sui',
        'Reverse lookup: find what name an address is known by',
        'Integration with Sui wallets (Slipstream, Sui Wallet, etc.)',
        'Move Registry (MVR) uses SuiNS names to identify Move packages',
      ],
    },
  };
}

/**
 * Resolve a .sui name to a wallet address.
 * Input: { name: "alice" | "alice.sui" }
 */
async function actionResolveName(input: any): Promise<SkillExecutionResult> {
  const rawName: string | undefined = input?.name;
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    return {
      success: false,
      error: 'name is required. Provide a .sui name like "alice.sui" or just "alice".',
    };
  }

  const name = normalizeName(rawName);
  const client = getClient();

  try {
    // The Sui RPC has a built-in method for this — no custom contract calls needed.
    const result = await client.resolveNameServiceAddress({ name });

    if (!result) {
      return {
        success: true,
        output: {
          name,
          resolved: false,
          address: null,
          note: `"${name}" is not registered or has no target address set.`,
        },
      };
    }

    return {
      success: true,
      output: {
        name,
        resolved:   true,
        address:    result,
        source:     'sui-rpc resolveNameServiceAddress',
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to resolve "${name}": ${err?.message ?? String(err)}`,
    };
  }
}

/**
 * Reverse lookup: find the .sui name(s) associated with an address.
 * Input: { address: "0x..." }
 */
async function actionReverseLookup(input: any): Promise<SkillExecutionResult> {
  const rawAddress: string | undefined = input?.address;
  if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
    return {
      success: false,
      error: 'address is required. Provide a Sui wallet address (0x...).',
    };
  }

  const trimmed = rawAddress.trim();
  if (!isValidSuiAddress(trimmed)) {
    return {
      success: false,
      error: `"${trimmed}" does not look like a valid Sui address. Expected 0x followed by up to 64 hex characters.`,
    };
  }

  const address = canonicalAddress(trimmed);
  const client  = getClient();

  try {
    // resolveNameServiceNames returns { data: string[], nextCursor, hasNextPage }
    const result = await client.resolveNameServiceNames({ address });

    const names: string[] = result?.data ?? [];

    if (names.length === 0) {
      return {
        success: true,
        output: {
          address,
          resolved:     false,
          names:        [],
          primary_name: null,
          note: 'No .sui names are associated with this address.',
        },
      };
    }

    return {
      success: true,
      output: {
        address,
        resolved:     true,
        names,
        primary_name: names[0],
        count:        names.length,
        source:       'sui-rpc resolveNameServiceNames',
        note: names.length > 1
          ? `${names.length} names found. primary_name is the default name set by the owner.`
          : undefined,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Reverse lookup failed for "${address}": ${err?.message ?? String(err)}`,
    };
  }
}

/**
 * Get detailed on-chain info about a .sui name registration.
 * Returns the full name record including expiration, NFT ID, metadata.
 * Input: { name: "alice" | "alice.sui" }
 */
async function actionGetNameInfo(input: any): Promise<SkillExecutionResult> {
  const rawName: string | undefined = input?.name;
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    return {
      success: false,
      error: 'name is required. Provide a .sui name like "alice.sui" or just "alice".',
    };
  }

  const name   = normalizeName(rawName);
  const client = getClient();

  // ── Strategy 1: try @mysten/suins SuinsClient for full record ──────────────
  try {
    // @ts-expect-error — @mysten/suins is an optional peer dependency; falls back to RPC if absent
    const { SuinsClient } = await import('@mysten/suins');

    const suinsClient = new SuinsClient({
      client,
      network: 'mainnet',
    });

    const record = await suinsClient.getNameRecord(name);

    if (!record) {
      return {
        success: true,
        output: {
          name,
          registered: false,
          note: `"${name}" is not registered on SuiNS mainnet.`,
        },
      };
    }

    const now = Date.now();
    const expiresMs   = record.expirationTimestampMs ?? 0;
    const isExpired   = expiresMs > 0 && now > expiresMs;
    const expiresDate = expiresMs > 0
      ? new Date(expiresMs).toISOString()
      : null;

    const daysUntilExpiry = expiresMs > 0
      ? Math.floor((expiresMs - now) / 86_400_000)
      : null;

    return {
      success: true,
      output: {
        name,
        registered:     true,
        nft_id:         record.nftId,
        target_address: record.targetAddress || null,
        expiration: {
          timestamp_ms:      expiresMs || null,
          iso:               expiresDate,
          expired:           isExpired,
          days_until_expiry: isExpired ? 0 : daysUntilExpiry,
        },
        metadata: {
          avatar:          record.avatar       ?? null,
          content_hash:    record.contentHash  ?? null,
          walrus_site_id:  record.walrusSiteId ?? null,
          ...(record.data && Object.keys(record.data).length > 0 ? { extra: record.data } : {}),
        },
        contracts: {
          package_latest: SUINS_PACKAGE_LATEST,
          suins_object:   SUINS_OBJECT_ID,
        },
        source: '@mysten/suins SuinsClient.getNameRecord',
      },
    };
  } catch (_sdkErr) {
    // @mysten/suins may not be installed — fall back to raw RPC address lookup
  }

  // ── Strategy 2: fallback — just resolve the address via RPC ────────────────
  try {
    const address = await client.resolveNameServiceAddress({ name });

    if (!address) {
      return {
        success: true,
        output: {
          name,
          registered: false,
          note: `"${name}" could not be resolved. It may not be registered or @mysten/suins is unavailable for full record details.`,
        },
      };
    }

    return {
      success: true,
      output: {
        name,
        registered:     true,
        target_address: address,
        note:
          'Only target_address is available. Install @mysten/suins for full name record details ' +
          '(expiration, NFT ID, avatar, content hash).',
        source: 'sui-rpc resolveNameServiceAddress (fallback)',
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to fetch name info for "${name}": ${err?.message ?? String(err)}`,
    };
  }
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export const SUINS_SKILL_METADATA = {
  name: 'SuiNS',
  description:
    'Sui Name Service — resolve human-readable .sui names to wallet addresses and perform ' +
    'reverse lookups. Like ENS but for Sui. Resolve "alice.sui" → 0x... or look up what ' +
    'name owns an address. Also fetch full name record details: expiration, NFT ID, avatar.',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['suins', 'sui', 'name-service', 'ens', 'domain', 'identity', 'infrastructure'],
  external_url: 'https://suins.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/suins?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'resolve_name', 'reverse_lookup', 'get_name_info'],
        description:
          'get_protocol_info: SuiNS overview, how names work, registration info, contract addresses. ' +
          'resolve_name: resolve a .sui name to a wallet address (requires name). ' +
          'reverse_lookup: find the .sui name(s) for a wallet address (requires address). ' +
          'get_name_info: full registration details for a name — expiration, NFT ID, avatar, metadata (requires name).',
      },
      name: {
        type: 'string',
        description:
          'A .sui domain name. Accepts "alice", "alice.sui", or subnames like "dev.alice.sui". ' +
          'Required for resolve_name and get_name_info.',
      },
      address: {
        type: 'string',
        description:
          'A Sui wallet address (0x followed by up to 64 hex characters). ' +
          'Required for reverse_lookup.',
      },
    },
  },
  usage_examples: [
    { title: 'Resolve name to address', input: { action: 'resolve_name', name: 'alice.sui' } },
    { title: 'Reverse lookup address', input: { action: 'reverse_lookup', address: '0x...' } },
    { title: 'Get name registration info', input: { action: 'get_name_info', name: 'satoshi.sui' } },
    { title: 'SuiNS protocol overview', input: { action: 'get_protocol_info' } },
  ],
};

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeSuiNSSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  if (!action) {
    return {
      success: false,
      error: 'action is required. Available: get_protocol_info, resolve_name, reverse_lookup, get_name_info.',
    };
  }

  switch (action) {
    case 'get_protocol_info': return actionGetProtocolInfo();
    case 'resolve_name':      return actionResolveName(input);
    case 'reverse_lookup':    return actionReverseLookup(input);
    case 'get_name_info':     return actionGetNameInfo(input);
    default:
      return {
        success: false,
        error: `Unknown action "${action}". Available: get_protocol_info, resolve_name, reverse_lookup, get_name_info.`,
      };
  }
}
