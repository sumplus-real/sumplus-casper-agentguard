/**
 * Official Skill: ENS — Ethereum Name Service
 *
 * ENS is the decentralized naming system for Ethereum. Users register
 * human-readable names like "vitalik.eth" that resolve to wallet addresses —
 * the Ethereum equivalent of SuiNS on Sui or .sol on Solana.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Resolution strategy:
 *   Forward: viem getEnsAddress({ name: normalize(name) })
 *   Reverse:  viem getEnsName({ address })
 *   Rich info: viem getEnsAvatar + getEnsText for text records
 *
 * ENS Registry (Ethereum mainnet):
 *   0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
 *
 * Website: https://ens.domains
 * Docs:    https://docs.ens.domains
 */

import type { SkillExecutionResult } from '@/types/skill';
import { normalize } from 'viem/ens';
import { getPublicClient } from '@/lib/rpc';

// ── ENS contract addresses ────────────────────────────────────────────────────

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

// ── Client factory ────────────────────────────────────────────────────────────

function getClient() {
  // Central registry: Alchemy first (if keyed), then publicnode, then drpc.
  return getPublicClient('ethereum');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize a name input to the canonical ".eth" form.
 * Accepts "vitalik", "vitalik.eth", "VITALIK.ETH" → "vitalik.eth"
 * Also accepts subnames like "foo.vitalik.eth" — passed through as-is.
 */
function normalizeEthName(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.endsWith('.eth') ? trimmed : `${trimmed}.eth`;
}

/**
 * Validate that a string looks like an Ethereum address (0x + 40 hex chars).
 */
function isValidEthAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:        'ENS',
      full_name:   'Ethereum Name Service',
      chain:       'ethereum',
      website:     'https://ens.domains',
      docs:        'https://docs.ens.domains',
      app:         'https://app.ens.domains',
      description:
        'ENS is the decentralized, censorship-resistant naming layer for Ethereum. ' +
        'It maps human-readable names like "vitalik.eth" to machine-readable Ethereum ' +
        'addresses, content hashes, and arbitrary text records — removing the need to ' +
        'copy-paste 42-character hex strings.',
      contracts: {
        registry:          ENS_REGISTRY,
        chain:             'Ethereum mainnet (chainId 1)',
        public_resolver:   '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
        reverse_registrar: '0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb',
      },
      how_names_work: [
        'Names follow the pattern <label>.eth (e.g. "alice.eth").',
        'Subnames are supported: "wallet.alice.eth", "pay.company.eth".',
        'Each .eth name is an ERC-721 NFT owned by the registrant.',
        'Forward resolution: name → address (via the name\'s resolver contract).',
        'Reverse resolution: address → name (via the reverse registrar, 0x...addr.reverse).',
        'Text records let names store arbitrary metadata: avatar, URL, Twitter, GitHub, email, etc.',
        'Names expire annually and must be renewed; 5-letter+ names cost ~$5/year.',
      ],
      name_pricing: {
        '3 chars':  '~$640/year',
        '4 chars':  '~$160/year',
        '5+ chars': '~$5/year',
        payment_token: 'ETH',
        note: 'Prices are in USD equivalent, paid in ETH at time of registration.',
      },
      resolution_methods: {
        forward:
          'Call getEnsAddress({ name }) on a viem PublicClient (mainnet). ' +
          'Internally calls the ENS registry to find the resolver, then calls addr(namehash).',
        reverse:
          'Call getEnsName({ address }) on a viem PublicClient (mainnet). ' +
          'Queries the reverse registrar at <address>.addr.reverse, then validates forward resolution.',
        text_records:
          'Call getEnsText({ name, key }) for individual text records. ' +
          'Common keys: avatar, url, com.twitter, com.github, description, email.',
        avatar:
          'Call getEnsAvatar({ name }) which resolves NFT avatars and IPFS URIs automatically.',
      },
      highlights: [
        'Decentralized — no central authority can revoke your name',
        'NFT-based — .eth names are ERC-721 tokens, fully transferable',
        'Multi-coin support — store BTC, SOL, and 100+ addresses on one ENS name',
        'Content hashes — link IPFS/IPNS sites directly to a .eth name',
        'Text records — rich identity layer: avatar, social handles, website',
        'Wildcard resolution (ENSIP-10) — subnames without on-chain registration',
        'Used by Coinbase, MetaMask, Uniswap, and most major Ethereum dapps',
        '2M+ registered names',
      ],
    },
  };
}

/**
 * Resolve a .eth name to an Ethereum address.
 * Input: { name: "vitalik.eth" | "vitalik" }
 */
async function actionResolveName(input: any): Promise<SkillExecutionResult> {
  const rawName: string | undefined = input?.name;
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    return {
      success: false,
      error: 'name is required. Provide a .eth name like "vitalik.eth" or just "vitalik".',
    };
  }

  const name   = normalizeEthName(rawName);
  const client = getClient();

  try {
    // viem normalizes and namehashes internally; we also normalize so the
    // returned `name` field is always canonical.
    const normalizedName = normalize(name);
    const address = await client.getEnsAddress({ name: normalizedName });

    if (!address) {
      return {
        success: true,
        output: {
          name,
          resolved: false,
          address:  null,
          note:     `"${name}" is not registered or has no address record set.`,
        },
      };
    }

    return {
      success: true,
      output: {
        name,
        resolved: true,
        address,
        source:   'ENS registry via viem getEnsAddress (Ethereum mainnet)',
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
 * Reverse lookup: find the .eth name associated with an Ethereum address.
 * Input: { address: "0x..." }
 */
async function actionReverseLookup(input: any): Promise<SkillExecutionResult> {
  const rawAddress: string | undefined = input?.address;
  if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
    return {
      success: false,
      error: 'address is required. Provide an Ethereum address (0x + 40 hex chars).',
    };
  }

  const address = rawAddress.trim() as `0x${string}`;
  if (!isValidEthAddress(address)) {
    return {
      success: false,
      error: `"${address}" does not look like a valid Ethereum address. Expected 0x followed by exactly 40 hex characters.`,
    };
  }

  const client = getClient();

  try {
    // getEnsName does the reverse lookup AND validates forward resolution
    // (i.e., it checks that the name points back to the address).
    const ensName = await client.getEnsName({ address });

    if (!ensName) {
      return {
        success: true,
        output: {
          address,
          resolved:     false,
          name:         null,
          note:
            'No ENS primary name is set for this address, or the reverse record ' +
            'does not forward-resolve back to this address.',
        },
      };
    }

    return {
      success: true,
      output: {
        address,
        resolved: true,
        name:     ensName,
        source:   'ENS reverse registrar via viem getEnsName (Ethereum mainnet)',
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
 * Get rich info about an ENS name: address, avatar, and text records.
 * Input: { name: "vitalik.eth" | "vitalik" }
 */
async function actionGetNameInfo(input: any): Promise<SkillExecutionResult> {
  const rawName: string | undefined = input?.name;
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    return {
      success: false,
      error: 'name is required. Provide a .eth name like "vitalik.eth" or just "vitalik".',
    };
  }

  const name   = normalizeEthName(rawName);
  const client = getClient();

  let normalizedName: string;
  try {
    normalizedName = normalize(name);
  } catch (err: any) {
    return {
      success: false,
      error: `"${name}" is not a valid ENS name: ${err?.message ?? String(err)}`,
    };
  }

  // ── 1. Forward resolution ─────────────────────────────────────────────────
  let address: string | null = null;
  try {
    const resolved = await client.getEnsAddress({ name: normalizedName });
    address = resolved ?? null;
  } catch {
    // name may not be registered; continue to report what we can
  }

  if (!address) {
    return {
      success: true,
      output: {
        name,
        registered: false,
        address:    null,
        note:       `"${name}" is not registered or has no address record set on ENS mainnet.`,
      },
    };
  }

  // ── 2. Avatar ─────────────────────────────────────────────────────────────
  let avatar: string | null = null;
  try {
    avatar = await client.getEnsAvatar({ name: normalizedName });
  } catch {
    // avatar is optional
  }

  // ── 3. Text records ───────────────────────────────────────────────────────
  const TEXT_RECORD_KEYS = [
    'url',
    'description',
    'email',
    'avatar',
    'com.twitter',
    'com.github',
    'com.discord',
    'org.telegram',
    'com.linkedin',
    'eth.ens.delegate',
  ];

  const textRecords: Record<string, string | null> = {};
  await Promise.all(
    TEXT_RECORD_KEYS.map(async (key) => {
      try {
        const val = await client.getEnsText({ name: normalizedName, key });
        textRecords[key] = val ?? null;
      } catch {
        textRecords[key] = null;
      }
    }),
  );

  // Collect non-null text records
  const records: Record<string, string> = {};
  for (const [k, v] of Object.entries(textRecords)) {
    if (v !== null && v !== '') records[k] = v;
  }

  return {
    success: true,
    output: {
      name,
      registered: true,
      address,
      avatar:  avatar ?? textRecords['avatar'] ?? null,
      records: Object.keys(records).length > 0 ? records : null,
      contracts: {
        registry: ENS_REGISTRY,
        chain:    'Ethereum mainnet (chainId 1)',
      },
      source: 'ENS registry via viem (getEnsAddress + getEnsAvatar + getEnsText)',
    },
  };
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export const ENS_SKILL_METADATA = {
  name: 'ENS',
  description:
    'Ethereum Name Service — resolve human-readable .eth names to wallet addresses and look up ' +
    'ENS names for addresses. Like SuiNS but for Ethereum. Resolve "vitalik.eth" → 0x... or ' +
    'look up what ENS name owns an address. Also fetch avatar and text records (Twitter, GitHub, URL).',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['ens', 'ethereum', 'name-service', 'domain', 'identity', 'infrastructure'],
  external_url: 'https://ens.domains',
  logo_url: 'https://icons.llamao.fi/icons/protocols/ens?w=48&h=48',
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
          'get_protocol_info: ENS overview, how names work, pricing, contract addresses. ' +
          'resolve_name: resolve a .eth name to an Ethereum address (requires name). ' +
          'reverse_lookup: find the .eth name for an Ethereum address (requires address). ' +
          'get_name_info: rich info about a name — address, avatar, text records like twitter/github/url (requires name).',
      },
      name: {
        type: 'string',
        description:
          'An ENS domain name. Accepts "vitalik", "vitalik.eth", or subnames like "wallet.vitalik.eth". ' +
          'Required for resolve_name and get_name_info.',
      },
      address: {
        type: 'string',
        description:
          'An Ethereum wallet address (0x followed by exactly 40 hex characters). ' +
          'Required for reverse_lookup.',
      },
    },
  },
  usage_examples: [
    { title: 'Resolve ENS name to address', input: { action: 'resolve_name', name: 'vitalik.eth' } },
    { title: 'Reverse lookup address', input: { action: 'reverse_lookup', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' } },
    { title: 'Get name info with avatar and text records', input: { action: 'get_name_info', name: 'nick.eth' } },
    { title: 'ENS protocol overview', input: { action: 'get_protocol_info' } },
  ],
};

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeENSSkill(input: any): Promise<SkillExecutionResult> {
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
