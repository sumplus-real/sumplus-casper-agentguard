/**
 * CoW Protocol — MEV-Protected DEX Aggregator
 *
 * CoW Protocol uses batch auctions where solvers compete to fill orders,
 * protecting users from MEV (front-running, sandwich attacks). When two
 * users want to trade opposite assets, they can be matched directly
 * (Coincidence of Wants), skipping AMMs entirely and saving on fees.
 *
 * UI:  https://swap.cow.fi
 * API: https://api.cow.fi/mainnet/api/v1
 */

import type { SkillExecutionResult } from '@/types/skill';

const COW_API_BASE = 'https://api.cow.fi/mainnet/api/v1';

// Common ERC-20 addresses on Ethereum mainnet
const TOKEN_ADDRESSES: Record<string, string> = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  ETH:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  DAI:  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  COW:  '0xDEf1CA1fb7FBcDC777520aa7f396b4E015F497aB',
};

/** Resolve a token symbol (e.g. "WETH") or passthrough a 0x address. */
function resolveToken(symbolOrAddress: string): string {
  if (symbolOrAddress.startsWith('0x')) return symbolOrAddress;
  const upper = symbolOrAddress.toUpperCase();
  return TOKEN_ADDRESSES[upper] ?? symbolOrAddress;
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'CoW Protocol',
      tagline: 'MEV-Protected DEX Aggregator via Batch Auctions',
      website: 'https://swap.cow.fi',
      docs: 'https://docs.cow.fi',
      description: [
        'CoW Protocol (Coincidence of Wants) protects users from MEV by batching orders and having solvers compete to fill them.',
        'Solvers can match users directly (CoW — no AMM needed), route through DEX aggregators, or combine both strategies.',
        'Users receive the surplus from the batch clearing price — if the market moves in their favor between quote and settlement, they keep the extra.',
        'The GPv2Settlement contract (0x9008D19f58AAbD9eD0D60971565AA8510560ab41) handles on-chain settlement.',
      ],
      key_concepts: {
        batch_auction: 'Orders are collected and settled together in discrete batches, not one-by-one.',
        solvers: 'Permissioned third parties who compete to find the best execution path for each batch.',
        coincidence_of_wants: 'When a buyer and seller want opposite tokens, they are matched peer-to-peer, avoiding AMM fees.',
        surplus: 'Extra value users receive when the clearing price is better than their limit price.',
        mev_protection: 'Because orders are sealed until settled, front-running and sandwich attacks are structurally prevented.',
      },
      contracts: {
        GPv2Settlement: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
        COW_token: '0xDEf1CA1fb7FBcDC777520aa7f396b4E015F497aB',
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_quote — get a swap quote (sell_token, buy_token, sell_amount required)',
        'get_order_status — look up an existing order by UID',
        'get_protocol_stats — TVL and volume from DefiLlama',
      ],
    },
  };
}

async function actionGetQuote(input: Record<string, any>): Promise<SkillExecutionResult> {
  const {
    sell_token,
    buy_token,
    sell_amount = '1000000000000000000',
    kind = 'sell',
  } = input;

  if (!sell_token) return { success: false, output: { error: 'sell_token is required (address or symbol like WETH)' } };
  if (!buy_token)  return { success: false, output: { error: 'buy_token is required (address or symbol like USDC)' } };

  const sellTokenAddr = resolveToken(sell_token);
  const buyTokenAddr  = resolveToken(buy_token);

  const body: Record<string, unknown> = {
    sellToken: sellTokenAddr,
    buyToken: buyTokenAddr,
    kind: kind === 'buy' ? 'buy' : 'sell',
    from: '0x0000000000000000000000000000000000000000',
    receiver: '0x0000000000000000000000000000000000000000',
    validFor: 1800,
    appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
  };

  if (kind === 'buy') {
    body.buyAmountAfterFee = sell_amount; // reuse param as buy amount when kind=buy
  } else {
    body.sellAmountBeforeFee = sell_amount;
  }

  try {
    const res = await fetch(`${COW_API_BASE}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { success: false, output: { error: `CoW API error ${res.status}: ${errText}` } };
    }

    const data = await res.json() as Record<string, any>;
    const quote = data.quote ?? data;

    return {
      success: true,
      output: {
        sell_token: sellTokenAddr,
        buy_token: buyTokenAddr,
        kind: quote.kind ?? kind,
        sell_amount_before_fee: quote.sellAmountBeforeFee ?? sell_amount,
        buy_amount: quote.buyAmount,
        fee_amount: quote.feeAmount,
        sell_amount_after_fee: quote.sellAmountAfterFee,
        valid_to: quote.validTo,
        note: 'Amounts are in token base units (wei for 18-decimal tokens). The final settlement may give more than buy_amount due to CoW surplus.',
        explorer: 'https://explorer.cow.fi',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetOrderStatus(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { order_uid } = input;
  if (!order_uid) return { success: false, output: { error: 'order_uid is required' } };

  try {
    const res = await fetch(`${COW_API_BASE}/orders/${encodeURIComponent(order_uid)}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) {
      return { success: false, output: { error: `Order UID not found: ${order_uid}` } };
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { success: false, output: { error: `CoW API error ${res.status}: ${errText}` } };
    }

    const order = await res.json() as Record<string, any>;
    return {
      success: true,
      output: {
        uid: order.uid,
        status: order.status,
        kind: order.kind,
        sell_token: order.sellToken,
        buy_token: order.buyToken,
        sell_amount: order.sellAmount,
        buy_amount: order.buyAmount,
        executed_sell_amount: order.executedSellAmountBeforeFees,
        executed_buy_amount: order.executedBuyAmount,
        fee_amount: order.feeAmount,
        executed_fee_amount: order.executedFeeAmount,
        valid_to: order.validTo,
        creation_date: order.creationDate,
        owner: order.owner,
        explorer_url: `https://explorer.cow.fi/orders/${order_uid}`,
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetProtocolStats(): Promise<SkillExecutionResult> {
  try {
    const [llamaRes] = await Promise.all([
      fetch('https://api.llama.fi/protocol/cow-protocol', {
        signal: AbortSignal.timeout(10_000),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const llama = llamaRes as Record<string, any> | null;

    return {
      success: true,
      output: {
        source: 'DefiLlama',
        protocol: 'CoW Protocol',
        tvl_usd: llama?.tvl ?? null,
        chain_tvls: llama?.chainTvls ?? null,
        volume_24h: llama?.volume24h ?? null,
        volume_7d: llama?.volume7d ?? null,
        category: llama?.category ?? 'DEX Aggregator',
        updated_at: new Date().toISOString(),
        links: {
          ui: 'https://swap.cow.fi',
          explorer: 'https://explorer.cow.fi',
          docs: 'https://docs.cow.fi',
          defillama: 'https://defillama.com/protocol/cow-protocol',
        },
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const COW_PROTOCOL_SKILL_METADATA = {
  name: 'CoW Protocol',
  description:
    'CoW Protocol MEV-protected DEX — get swap quotes, order status, and protocol stats. ' +
    'Batch auctions protect users from front-running and sandwich attacks.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['cow', 'cowswap', 'dex', 'mev-protection', 'batch-auction', 'solver', 'ethereum', 'swap', 'clarity-act'],
  external_url: 'https://swap.cow.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/cow-protocol?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_quote', 'get_order_status', 'get_protocol_stats'],
        description:
          'get_protocol_info: Overview of CoW Protocol — batch auctions, MEV protection, solver network, key contracts. ' +
          'get_quote: Get a swap quote via CoW API (requires sell_token, buy_token; optional sell_amount and kind). ' +
          'get_order_status: Look up an existing order by its UID (requires order_uid). ' +
          'get_protocol_stats: TVL and volume data from DefiLlama.',
      },
      sell_token: {
        type: 'string',
        description:
          'Token to sell. Accepts symbol (WETH, USDC, USDT, WBTC, DAI, COW, ETH) or a 0x ERC-20 address. Required for get_quote.',
      },
      buy_token: {
        type: 'string',
        description:
          'Token to buy. Accepts symbol (WETH, USDC, USDT, WBTC, DAI, COW, ETH) or a 0x ERC-20 address. Required for get_quote.',
      },
      sell_amount: {
        type: 'string',
        description:
          'Amount to sell in base units (e.g. "1000000000000000000" = 1 WETH). Defaults to 1e18 if omitted. Used for get_quote.',
      },
      kind: {
        type: 'string',
        enum: ['sell', 'buy'],
        description: 'Order kind for get_quote. "sell" means exact sell amount; "buy" means exact buy amount. Default: "sell".',
      },
      order_uid: {
        type: 'string',
        description: 'CoW Protocol order UID (56-byte hex string). Required for get_order_status.',
      },
    },
  },
};

export async function executeCowProtocolSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info':   return actionGetProtocolInfo();
    case 'get_quote':           return actionGetQuote(input);
    case 'get_order_status':    return actionGetOrderStatus(input);
    case 'get_protocol_stats':  return actionGetProtocolStats();
    default:
      return {
        success: false,
        output: {
          error: `Unknown action: ${input.action}. Available: get_protocol_info, get_quote, get_order_status, get_protocol_stats`,
        },
      };
  }
}
