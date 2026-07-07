import type { SkillExecutionResult } from '@/types/skill';

export const PENDLE_V4_MAINNET_SKILL_METADATA = {
  name: 'Pendle v4 Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Pendle Finance on Ethereum mainnet — fixed-yield and yield trading protocol. ' +
    'List active markets, get market details, quote PT/YT buys. ' +
    'Build swap transactions by passing Pendle API calldata to the RouterV4. ' +
    'No API key required for market data.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['pendle', 'yield', 'fixed-yield', 'pt', 'yt', 'defi', 'ethereum', 'mainnet', 'clarity-act'],
  external_url: 'https://app.pendle.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/pendle?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'list_markets', 'get_market', 'quote_pt_buy', 'quote_yt_buy',
          'swap_to_pt', 'swap_to_yt', 'sell_pt', 'sell_yt',
          'redeem_pt_after_expiry', 'redeem_yt',
          'add_liquidity_dual', 'add_liquidity_single',
          'remove_liquidity_dual', 'remove_liquidity_single_pt', 'remove_liquidity_single_token',
          'roll_pt_to_new_expiry',
        ],
        description:
          'list_markets: active Pendle markets. ' +
          'get_market: details for a specific market address. ' +
          'quote_pt_buy/quote_yt_buy: price quotes. ' +
          'swap_to_pt/swap_to_yt/sell_pt/sell_yt/redeem_*: build transaction (requires calldata from Pendle SDK API).',
      },
      market:      { type: 'string', description: 'Pendle market address (0x...). Required for most actions.' },
      calldata:    { type: 'string', description: 'Pre-built calldata from Pendle SDK/API (0x...). Required for tx-building actions.' },
      amount:      { type: 'string', description: 'Amount in wei. Required for tx-building actions.' },
      recipient:   { type: 'string', description: 'Recipient address (0x...). Required for tx-building actions.' },
      value:       { type: 'string', description: 'ETH value in wei (default "0").' },
      tx_deadline: { type: 'number', description: 'Unix timestamp deadline. Required for tx-building actions.' },
    },
  },
  usage_examples: [
    { title: 'List active markets', input: { action: 'list_markets' } },
    { title: 'Get market', input: { action: 'get_market', market: '0x...' } },
    { title: 'Quote PT buy', input: { action: 'quote_pt_buy', market: '0x...', token: '0x...', amount: '1000000000000000000' } },
  ],
};

const ROUTER_V4 = '0x888888888889758F76e7103c6CbF23ABbF58F946';
const API = 'https://api-v2.pendle.finance/core/v1/1';

const TX_ACTIONS = new Set([
  'swap_to_pt', 'swap_to_yt', 'sell_pt', 'sell_yt',
  'redeem_pt_after_expiry', 'redeem_yt', 'redeem_due_interest_and_rewards',
  'add_liquidity_dual', 'add_liquidity_single',
  'remove_liquidity_dual', 'remove_liquidity_single_pt', 'remove_liquidity_single_token',
  'roll_pt_to_new_expiry',
]);

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function isHex(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x([a-fA-F0-9]{2})*$/.test(v);
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
  return q.toString();
}

export async function executePendleV4MainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'list_markets': {
        const r = await fetch(`${API}/markets/active`);
        if (!r.ok) return { success: false, error: `Pendle API error ${r.status}` };
        return { success: true, output: await r.json() };
      }

      case 'get_market': {
        const market = input.market ?? input.address;
        if (!isAddress(market)) return { success: false, error: 'market address is required (0x...)' };
        const r = await fetch(`${API}/markets/${market}`);
        if (!r.ok) return { success: false, error: `Pendle API error ${r.status}` };
        return { success: true, output: await r.json() };
      }

      case 'quote_pt_buy':
      case 'quote_yt_buy': {
        const params = { ...input };
        delete params.action;
        const r = await fetch(`${API}/sdk/quote?${toQuery({ ...params, action })}`);
        if (!r.ok) return { success: false, error: `Pendle API error ${r.status}` };
        return { success: true, output: await r.json() };
      }

      default: {
        if (TX_ACTIONS.has(action)) {
          const calldata = input.calldata ?? input.data;
          if (!isHex(calldata)) return { success: false, error: 'calldata is required for tx-building actions. Use Pendle SDK or API to generate calldata first, then pass it here.' };
          const market = input.market;
          const amount = input.amount;
          const recipient = input.recipient;
          const tx_deadline = input.tx_deadline;
          if (!isAddress(market) || !amount || !isAddress(recipient) || tx_deadline == null) {
            return { success: false, error: 'market, amount, recipient, and tx_deadline are required for tx-building actions' };
          }
          const value = String(input.value ?? '0');
          return {
            success: true,
            output: {
              transactions: [{
                to: ROUTER_V4,
                data: calldata,
                value: `0x${BigInt(value).toString(16)}`,
                chain_id: 1,
                description: `Pendle ${action} on market ${market}`,
              }],
              market,
              amount,
              recipient,
              tx_deadline,
              router: ROUTER_V4,
            },
          };
        }
        return { success: false, error: `Unknown action "${action}". Available: list_markets, get_market, quote_pt_buy, quote_yt_buy, swap_to_pt, swap_to_yt, sell_pt, sell_yt, redeem_pt_after_expiry, redeem_yt, add_liquidity_dual, add_liquidity_single, remove_liquidity_dual, remove_liquidity_single_pt, remove_liquidity_single_token, roll_pt_to_new_expiry` };
      }
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Pendle v4 skill error' };
  }
}
