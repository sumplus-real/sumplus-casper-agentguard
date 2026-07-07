import { createPublicClient, http, type BlockTag } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const ETH_RPC_SKILL_METADATA = {
  name: 'ETH RPC',
  description:
    '[ARSENAL-HOSTED ✓] Safe read-only Ethereum RPC adapter. ' +
    'Supports eth_call, simulate_call (with sender/value), storage slot reads, ' +
    'transaction receipts, and block queries via Alchemy. No API key needed.',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['rpc', 'ethereum', 'mainnet', 'eth_call', 'simulation', 'receipt', 'block'],
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['eth_call', 'simulate_call', 'get_storage_at', 'get_receipt', 'get_block'],
        description:
          'eth_call: read-only contract call (to, data). ' +
          'simulate_call: simulate with sender + value (to, from, data, value). ' +
          'get_storage_at: read raw storage slot (address, slot). ' +
          'get_receipt: fetch transaction receipt (tx_hash). ' +
          'get_block: fetch block info (block_tag: latest/safe/finalized).',
      },
      to:        { type: 'string', description: 'Target contract address (0x...).' },
      from:      { type: 'string', description: 'Caller address for simulate_call (0x...).' },
      data:      { type: 'string', description: 'Encoded calldata (0x...).' },
      value:     { type: 'string', description: 'ETH value in wei (default "0").' },
      address:   { type: 'string', description: 'Contract address for get_storage_at.' },
      slot:      { type: 'string', description: 'Storage slot as bytes32 (0x...).' },
      tx_hash:   { type: 'string', description: 'Transaction hash for get_receipt.' },
      block_tag: { type: 'string', enum: ['latest', 'earliest', 'pending', 'safe', 'finalized'], description: 'Block tag (default: latest).' },
    },
  },
  usage_examples: [
    { title: 'Read contract', input: { action: 'eth_call', to: '0x...', data: '0x...' } },
    { title: 'Get latest block', input: { action: 'get_block', block_tag: 'latest' } },
  ],
};

const TAGS = new Set<BlockTag>(['latest', 'earliest', 'pending', 'safe', 'finalized']);

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function isHex(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x([a-fA-F0-9]{2})*$/.test(v);
}

function isBytes32(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{64}$/.test(v);
}

function normalize(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) out[k] = normalize(vv);
    return out;
  }
  return v;
}

export async function executeEthRpcSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    const c = getClient();
    const blockTag: BlockTag = TAGS.has(input.block_tag) ? input.block_tag : 'latest';

    switch (action) {
      case 'eth_call': {
        if (!isAddress(input.to)) return { success: false, error: 'to must be a valid 0x address' };
        if (!isHex(input.data)) return { success: false, error: 'data must be valid hex (0x...)' };
        const out = await c.call({ to: input.to, data: input.data, blockTag });
        return { success: true, output: normalize(out) as Record<string, any> };
      }

      case 'simulate_call': {
        if (!isAddress(input.to)) return { success: false, error: 'to must be a valid 0x address' };
        if (!isAddress(input.from)) return { success: false, error: 'from must be a valid 0x address' };
        if (!isHex(input.data)) return { success: false, error: 'data must be valid hex (0x...)' };
        const value = BigInt(input.value ?? '0');
        const out = await c.call({ to: input.to, account: input.from, data: input.data, value, blockTag });
        return { success: true, output: normalize(out) as Record<string, any> };
      }

      case 'get_storage_at': {
        if (!isAddress(input.address)) return { success: false, error: 'address must be a valid 0x address' };
        if (!isBytes32(input.slot)) return { success: false, error: 'slot must be a bytes32 hex string (0x + 64 hex chars)' };
        const out = await c.getStorageAt({ address: input.address, slot: input.slot, blockTag });
        return { success: true, output: { slot: input.slot, value: out ?? null } };
      }

      case 'get_receipt': {
        if (!isBytes32(input.tx_hash)) return { success: false, error: 'tx_hash must be a valid bytes32 (0x + 64 hex chars)' };
        const out = await c.getTransactionReceipt({ hash: input.tx_hash });
        return { success: true, output: normalize(out) as Record<string, any> };
      }

      case 'get_block': {
        const tag: BlockTag = TAGS.has(input.block_tag) ? input.block_tag : 'latest';
        const out = await c.getBlock({ blockTag: tag });
        return { success: true, output: normalize(out) as Record<string, any> };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: eth_call, simulate_call, get_storage_at, get_receipt, get_block` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'ETH RPC skill error' };
  }
}
