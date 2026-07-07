import type { SkillExecutionResult } from '@/types/skill';

export const ONEINCH_MAINNET_SKILL_METADATA = {
  name: '1inch Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] 1inch DEX aggregator on Ethereum mainnet. ' +
    'Get swap quotes, spender address, token allowances, and build swap transactions. ' +
    'Requires ONEINCH_API_KEY on the server (already configured).',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['1inch', 'swap', 'aggregator', 'dex', 'ethereum', 'mainnet'],
  external_url: 'https://app.1inch.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/1inch?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['quote', 'get_spender', 'get_allowance', 'build_swap_tx'],
        description:
          'quote: get swap quote (src, dst, amount). ' +
          'get_spender: get the 1inch AggregationRouter address to approve. ' +
          'get_allowance: check token allowance for a wallet. ' +
          'build_swap_tx: build swap calldata (src, dst, amount, from/sender).',
      },
      src:      { type: 'string', description: 'Source token address (0x...).' },
      dst:      { type: 'string', description: 'Destination token address (0x...).' },
      amount:   { type: 'string', description: 'Amount in wei.' },
      from:     { type: 'string', description: 'Wallet address for build_swap_tx (0x...).' },
      sender:   { type: 'string', description: 'Alias for from.' },
      tokenAddress:  { type: 'string', description: 'Token address for get_allowance.' },
      walletAddress: { type: 'string', description: 'Wallet for get_allowance.' },
      slippage:      { type: 'number', description: 'Slippage % for build_swap_tx (default 1).' },
    },
  },
  usage_examples: [
    { title: 'Quote ETH→USDC', input: { action: 'quote', src: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', dst: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000000000000000' } },
    { title: 'Get spender', input: { action: 'get_spender' } },
  ],
};

const BASE = 'https://api.1inch.dev/swap/v6.0/1';
const ROUTER = '0x111111125421cA6dc452d289314280a0f8842A65';

function isAddress(v: unknown): boolean {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function isHex(v: unknown): boolean {
  return typeof v === 'string' && /^0x([a-fA-F0-9]{2})*$/.test(v);
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
  return q.toString();
}

async function apiGet(path: string, key: string): Promise<{ status: number; ok: boolean; data: unknown }> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  let data: unknown;
  try { data = await r.json(); } catch { data = await r.text().catch(() => ''); }
  return { status: r.status, ok: r.ok, data };
}

export async function executeOneInchMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  const key = process.env.ONEINCH_API_KEY;
  if (!key) return { success: false, error: 'ONEINCH_API_KEY is not configured on the server' };

  try {
    switch (action) {
      case 'quote': {
        const { src, dst, amount } = input;
        if (!src || !dst || !amount) return { success: false, error: 'src, dst, and amount are required' };
        const r = await apiGet(`/quote?${toQuery({ src, dst, amount })}`, key);
        if (!r.ok) return { success: false, error: `1inch quote error ${r.status}: ${JSON.stringify(r.data)}` };
        return { success: true, output: r.data as Record<string, unknown> };
      }

      case 'get_spender': {
        const r = await apiGet('/approve/spender', key);
        if (!r.ok) return { success: false, error: `1inch spender error ${r.status}` };
        return { success: true, output: r.data as Record<string, unknown> };
      }

      case 'get_allowance': {
        const { tokenAddress, walletAddress } = input;
        if (!tokenAddress || !walletAddress) return { success: false, error: 'tokenAddress and walletAddress are required' };
        const r = await apiGet(`/approve/allowance?${toQuery({ tokenAddress, walletAddress })}`, key);
        if (!r.ok) return { success: false, error: `1inch allowance error ${r.status}` };
        return { success: true, output: r.data as Record<string, unknown> };
      }

      case 'build_swap_tx': {
        const from = input.from ?? input.sender ?? input.walletAddress ?? input.wallet_address;
        if (!isAddress(from)) return { success: false, error: 'from (or sender) address is required (0x...)' };
        const { src, dst, amount } = input;
        if (!src || !dst || !amount) return { success: false, error: 'src, dst, and amount are required' };
        const slippage = input.slippage ?? 1;
        const q = toQuery({ src, dst, amount, from, walletAddress: from, slippage, disableEstimate: 'true' });
        const r = await fetch(`${BASE}/swap?${q}`, { headers: { Authorization: `Bearer ${key}` } });
        const data = await r.json() as { tx?: { to?: string; value?: string; data?: string }; dstAmount?: string };
        if (r.status === 401 || r.status === 403) return { success: false, error: '1inch API unauthorized' };
        if (!r.ok) return { success: false, error: `1inch swap error ${r.status}: ${JSON.stringify(data)}` };
        if (!data.tx?.to || !isHex(data.tx.data)) return { success: false, error: '1inch response missing tx' };
        const txTo = data.tx.to.toLowerCase();
        if (txTo !== ROUTER.toLowerCase()) return { success: false, error: `1inch router mismatch: expected ${ROUTER}, got ${data.tx.to}` };
        return {
          success: true,
          output: {
            transactions: [{
              to: data.tx.to,
              data: data.tx.data,
              value: `0x${BigInt(data.tx.value ?? '0').toString(16)}`,
              chain_id: 1,
              description: `1inch swap ${src} → ${dst}`,
            }],
            dst_amount: data.dstAmount,
            router: ROUTER,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: quote, get_spender, get_allowance, build_swap_tx` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? '1inch skill error' };
  }
}
