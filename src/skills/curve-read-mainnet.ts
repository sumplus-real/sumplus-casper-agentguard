import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const CURVE_READ_MAINNET_SKILL_METADATA = {
  name: 'Curve Read Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Read-only Curve Finance data for Ethereum mainnet. ' +
    'List all Curve pools, get pool details (virtual price, coins, balances), ' +
    'and quote exchange amounts (dy for given dx). Used for routing and yield decisions. ' +
    'No API key required.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['curve', 'defi', 'stablecoin', 'amm', 'mainnet', 'ethereum', 'read'],
  external_url: 'https://curve.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/curve?w=48&h=48',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['list_pools', 'get_pool', 'quote_exchange_multiple', 'get_virtual_price'],
        description:
          'list_pools: all mainnet Curve pools from API. ' +
          'get_pool: pool details (address, virtual_price, coins, balances). ' +
          'quote_exchange_multiple: get dy for given dx between coin indices i and j. ' +
          'get_virtual_price: LP token virtual price for a pool.',
      },
      pool:    { type: 'string', description: 'Pool contract address (0x...). Required for get_pool, quote_exchange_multiple, get_virtual_price.' },
      i:       { type: 'number', description: 'Input coin index for quote_exchange_multiple.' },
      j:       { type: 'number', description: 'Output coin index for quote_exchange_multiple.' },
      dx:      { type: 'string', description: 'Input amount in wei for quote_exchange_multiple.' },
    },
  },
  usage_examples: [
    { title: 'List pools', input: { action: 'list_pools' } },
    { title: 'USDC→USDT quote', input: { action: 'quote_exchange_multiple', pool: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7', i: 1, j: 2, dx: '1000000' } },
  ],
};

const CURVE_API = 'https://api.curve.fi/api/getPools/ethereum/main';
const POOL_ABI = parseAbi([
  'function coins(uint256) view returns (address)',
  'function balances(uint256) view returns (uint256)',
  'function get_virtual_price() view returns (uint256)',
  'function get_dy(int128 i,int128 j,uint256 dx) view returns (uint256)',
]);

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
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

async function readIndexed(pool: `0x${string}`, fn: 'coins' | 'balances'): Promise<unknown[]> {
  const c = getClient();
  const out: unknown[] = [];
  for (let i = 0; i < 8; i++) {
    try {
      out.push(await c.readContract({ address: pool, abi: POOL_ABI, functionName: fn, args: [BigInt(i)] }));
    } catch {
      break;
    }
  }
  return out;
}

export async function executeCurveReadMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'list_pools': {
        const r = await fetch(CURVE_API);
        if (!r.ok) return { success: false, error: `Curve API error ${r.status}` };
        const data = await r.json();
        return { success: true, output: normalize(data) as Record<string, any> };
      }

      case 'get_pool': {
        const pool = input.pool ?? input.address;
        if (!isAddress(pool)) return { success: false, error: 'pool must be a valid 0x address' };
        const c = getClient();
        const [virtualPrice, coins, balances] = await Promise.all([
          c.readContract({ address: pool, abi: POOL_ABI, functionName: 'get_virtual_price' }),
          readIndexed(pool, 'coins'),
          readIndexed(pool, 'balances'),
        ]);
        return { success: true, output: { address: pool, virtual_price: normalize(virtualPrice), coins: normalize(coins), balances: normalize(balances) } };
      }

      case 'quote_exchange_multiple': {
        const pool = input.pool;
        if (!isAddress(pool)) return { success: false, error: 'pool must be a valid 0x address' };
        const i = input.i; const j = input.j; const dx = input.dx;
        if (i == null || j == null || !dx) return { success: false, error: 'i, j, and dx are required' };
        const c = getClient();
        const dy = await c.readContract({ address: pool, abi: POOL_ABI, functionName: 'get_dy', args: [BigInt(i), BigInt(j), BigInt(dx)] });
        return { success: true, output: { dy: dy.toString() } };
      }

      case 'get_virtual_price': {
        const pool = input.pool ?? input.address;
        if (!isAddress(pool)) return { success: false, error: 'pool must be a valid 0x address' };
        const c = getClient();
        const data = await c.readContract({ address: pool, abi: POOL_ABI, functionName: 'get_virtual_price' });
        return { success: true, output: { virtual_price: data.toString() } };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: list_pools, get_pool, quote_exchange_multiple, get_virtual_price` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Curve Read skill error' };
  }
}
