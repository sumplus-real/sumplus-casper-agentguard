import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const TX_SIM_MAINNET_SKILL_METADATA = {
  name: 'Transaction Simulation Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Simulate Ethereum mainnet transactions before signing. ' +
    'Uses Tenderly (if configured) or Alchemy simulate as fallback. ' +
    'Simulate single or bundled unsigned transactions. Decode function selectors. ' +
    'Pass unsigned_tx objects from any Arsenal build_*_tx action.',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['simulation', 'ethereum', 'mainnet', 'tenderly', 'alchemy', 'debug'],
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['simulate', 'simulate_bundle', 'decode_call'],
        description:
          'simulate: simulate one unsigned_tx (to, data, value) with optional from_override. ' +
          'simulate_bundle: simulate array of unsigned_txs. ' +
          'decode_call: decode function selector from calldata.',
      },
      unsigned_tx:   { type: 'object', description: 'Single tx to simulate: { to, data, value? }. Required for simulate.' },
      unsigned_txs:  { type: 'array', description: 'Array of txs for simulate_bundle.' },
      from_override: { type: 'string', description: 'Override the from/sender address for simulation.' },
      sender:        { type: 'string', description: 'Sender address used as from when from_override is not set.' },
      to:            { type: 'string', description: 'Target address for decode_call.' },
      data:          { type: 'string', description: 'Calldata for decode_call.' },
    },
  },
  usage_examples: [
    { title: 'Simulate tx', input: { action: 'simulate', unsigned_tx: { to: '0x...', data: '0x...', value: '0' }, sender: '0x...' } },
    { title: 'Decode calldata', input: { action: 'decode_call', to: '0x...', data: '0xa9059cbb...' } },
  ],
};

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

async function simulateOne(tx: unknown, from: unknown): Promise<unknown> {
  const t = tx as Record<string, unknown>;
  if (!isAddress(t.to) || !isHex(t.data)) throw new Error('invalid tx: to/data required');
  const fromAddr = isAddress(from) ? from : undefined;
  const value = BigInt(String(t.value ?? '0'));

  const tenderly = process.env.TENDERLY_API_KEY;
  const account = process.env.TENDERLY_ACCOUNT;
  const project = process.env.TENDERLY_PROJECT;

  if (tenderly && account && project) {
    const r = await fetch(`https://api.tenderly.co/api/v1/account/${account}/project/${project}/simulate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Access-Key': tenderly },
      body: JSON.stringify({
        network_id: '1',
        from: fromAddr ?? '0x0000000000000000000000000000000000000001',
        to: t.to,
        input: t.data,
        value: value.toString(),
        save: false,
        save_if_fails: false,
        simulation_type: 'quick',
      }),
    });
    if (r.status === 402 || r.status === 429) throw new Error('Tenderly quota exhausted');
    if (!r.ok) throw new Error(`Tenderly error ${r.status}`);
    return await r.json();
  }

  const c = getClient();
  try {
    const result = await c.call({ to: t.to, data: t.data, value, account: fromAddr });
    return normalize(result);
  } catch (e: any) {
    return { reverted: true, message: e.message };
  }
}

export async function executeTxSimMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'simulate': {
        if (!input.unsigned_tx) return { success: false, error: 'unsigned_tx is required' };
        const from = input.from_override ?? input.sender;
        const result = await simulateOne(input.unsigned_tx, from);
        return { success: true, output: result as Record<string, unknown> };
      }

      case 'simulate_bundle': {
        const txs = Array.isArray(input.unsigned_txs) ? input.unsigned_txs : [];
        if (!txs.length) return { success: false, error: 'unsigned_txs array is required and must not be empty' };
        const from = input.from_override ?? input.sender;
        const results: unknown[] = [];
        for (const tx of txs) results.push(await simulateOne(tx, from));
        return { success: true, output: { results } };
      }

      case 'decode_call': {
        if (!isAddress(input.to) || !isHex(input.data)) return { success: false, error: 'to and data are required' };
        return { success: true, output: { to: input.to, function_selector: input.data.slice(0, 10), data: input.data } };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: simulate, simulate_bundle, decode_call` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'TX Sim skill error' };
  }
}
