/**
 * DeepBook V3 — Native Orderbook DEX on Sui
 *
 * DeepBook is Sui's native central limit order book (CLOB), built by Mysten Labs.
 * Unlike AMMs, it supports limit orders, market orders, and precise price discovery
 * through a full bid/ask orderbook.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: deepbook.xyz
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';

// DeepBook V3 mainnet addresses
const DEEPBOOK_PACKAGE  = '0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497';
const REGISTRY_ID       = '0xaf16199a2dff736e9f07a845f23c5da6df6f756eddb631aed9d24a93efc4549d';

// Known mainnet pools (poolKey → objectId)
const KNOWN_POOLS: Record<string, { id: string; base: string; quote: string; baseDecimals: number; quoteDecimals: number }> = {
  'SUI_USDC': {
    id:            '0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407',
    base:          '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    quote:         '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    baseDecimals:  9,
    quoteDecimals: 6,
  },
  'DEEP_SUI': {
    id:            '0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22',
    base:          '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    quote:         '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    baseDecimals:  6,
    quoteDecimals: 9,
  },
  'DEEP_USDC': {
    id:            '0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce',
    base:          '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    quote:         '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    baseDecimals:  6,
    quoteDecimals: 6,
  },
};

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:     'DeepBook V3',
      chain:    'sui',
      type:     'Central Limit Order Book (CLOB)',
      website:  'https://deepbook.xyz',
      package:  DEEPBOOK_PACKAGE,
      registry: REGISTRY_ID,
      highlights: [
        'Native on-chain orderbook built by Mysten Labs (Sui founders)',
        'Full bid/ask orderbook with limit and market orders',
        'DEEP token for gas subsidies and governance',
        'Integrated into Sui ecosystem — used by wallets and aggregators',
      ],
      known_pools: Object.keys(KNOWN_POOLS),
      note: 'DeepBook is a CLOB (orderbook), not an AMM. It has bids/asks instead of a constant-product formula.',
    },
  };
}

async function getDeepBookClient(address?: string) {
  const { DeepBookClient, mainnetPools, mainnetCoins } = await import('@mysten/deepbook-v3');
  const client = getClient();
  const DUMMY_ADDR = address ?? '0x0000000000000000000000000000000000000000000000000000000000000001';
  return new DeepBookClient({
    client,
    address: DUMMY_ADDR,
    env: 'mainnet' as any,
    pools: mainnetPools as any,
    coins: mainnetCoins as any,
  });
}

async function actionGetOrderbook(input: any): Promise<SkillExecutionResult> {
  const { pool_key, depth = 10 } = input;

  if (!pool_key) {
    return { success: false, error: 'pool_key is required. Known pool_keys: ' + Object.keys(KNOWN_POOLS).join(', ') };
  }

  try {
    const dbClient = await getDeepBookClient();
    const key = pool_key.toUpperCase();

    const ticks = Math.min(Number(depth), 20);
    const level2 = await dbClient.getLevel2TicksFromMid(key, ticks);

    const bidPrices = level2.bid_prices ?? [];
    const bidQtys   = level2.bid_quantities ?? [];
    const askPrices = level2.ask_prices ?? [];
    const askQtys   = level2.ask_quantities ?? [];

    const bestBid = bidPrices[0] ?? null;
    const bestAsk = askPrices[0] ?? null;
    const midPrice = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

    const bids = bidPrices.map((p: number, i: number) => ({ price: p, quantity: bidQtys[i] }));
    const asks = askPrices.map((p: number, i: number) => ({ price: p, quantity: askQtys[i] }));

    return {
      success: true,
      output: {
        protocol:  'DeepBook V3',
        pool:      key,
        pool_id:   KNOWN_POOLS[key]?.id ?? key,
        mid_price: midPrice,
        best_bid:  bestBid,
        best_ask:  bestAsk,
        spread:    bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
        bids,
        asks,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_orderbook failed: ${err.message}` };
  }
}

async function actionGetMidPrice(input: any): Promise<SkillExecutionResult> {
  const result = await actionGetOrderbook({ ...input, depth: 1 });
  if (!result.success || !result.output) return result;
  return {
    success: true,
    output: {
      protocol:  'DeepBook V3',
      pool:      input.pool_key?.toUpperCase(),
      mid_price: result.output['mid_price'],
      best_bid:  result.output['best_bid'],
      best_ask:  result.output['best_ask'],
      spread:    result.output['spread'],
    },
  };
}

async function actionGetPools(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      protocol:    'DeepBook V3',
      chain:       'sui',
      known_pools: Object.entries(KNOWN_POOLS).map(([key, pool]) => ({
        pool_key:       key,
        pool_id:        pool.id,
        base_type:      pool.base,
        quote_type:     pool.quote,
        base_decimals:  pool.baseDecimals,
        quote_decimals: pool.quoteDecimals,
      })),
      _note: 'Use pool_key (e.g. "SUI_USDC") in get_orderbook and get_mid_price for known pools. Pass pool_id directly for custom pools.',
    },
  };
}

async function actionBuildMarketOrderTx(input: any): Promise<SkillExecutionResult> {
  const { sender, pool_key, is_bid, quantity, client_order_id = Date.now() } = input;
  if (!sender)    return { success: false, error: 'sender is required' };
  if (!pool_key)  return { success: false, error: 'pool_key is required. Known pool_keys: ' + Object.keys(KNOWN_POOLS).join(', ') };
  if (is_bid === undefined) return { success: false, error: 'is_bid is required (true = buy base, false = sell base)' };
  if (!quantity)  return { success: false, error: 'quantity is required (base token amount, e.g. "10")' };

  const key = pool_key.toUpperCase();
  const poolInfo = KNOWN_POOLS[key];
  const baseDecimals = poolInfo?.baseDecimals ?? 9;
  const parsedQty = parseFloat(String(quantity));
  if (isNaN(parsedQty) || parsedQty <= 0) {
    return { success: false, error: 'quantity must be a positive number' };
  }

  try {
    const dbClient = await getDeepBookClient(sender);

    // placeMarketOrder returns a Transaction object
    const tx = await dbClient.deepBook.placeMarketOrder({
      poolKey:          key,
      balanceManagerKey: 'MANAGER_1',
      clientOrderId:    Number(client_order_id),
      quantity:         parsedQty * 10 ** baseDecimals,
      isBid:            Boolean(is_bid),
      payWithDeep:      true,
    } as any);

    const client = getClient();
    (tx as any).setSender(sender);
    (tx as any).setGasBudget(100_000_000);
    const txBytes = await (tx as any).build({ client });

    return {
      success: true,
      output: {
        tx_bytes:    Buffer.from(txBytes).toString('base64'),
        sender,
        pool:        key,
        is_bid:      Boolean(is_bid),
        quantity:    parsedQty,
        gas_budget:  '100000000',
        description: `DeepBook market ${Boolean(is_bid) ? 'buy' : 'sell'} ${parsedQty} on ${key}`,
        usage:       'base64-encoded Sui TransactionData (BCS). Requires a BalanceManager (MANAGER_1) set up via DeepBook UI first.',
        _warning:    'DeepBook market orders require an existing BalanceManager. Visit app.deepbook.xyz to set up a BalanceManager before trading.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_market_order_tx failed: ${err.message}` };
  }
}

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const DEEPBOOK_SKILL_METADATA = {
  name: 'DeepBook V3',
  description:
    'DeepBook V3 is Sui\'s native central limit order book (CLOB), built by Mysten Labs. ' +
    'Unlike AMMs, it provides a full bid/ask orderbook with precise price discovery. ' +
    'Get live orderbook depth, mid-price, spread for SUI/USDC, DEEP/SUI, DEEP/USDC pools. ' +
    'Build market order PTBs. DEEP token provides gas subsidies.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  tags: ['deepbook', 'sui', 'clob', 'orderbook', 'dex', 'defi', 'mysten'],
  external_url: 'https://deepbook.xyz',
  logo_url: 'https://icons.llamao.fi/icons/protocols/deepbook?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_pools', 'get_orderbook', 'get_mid_price', 'build_market_order_tx'],
        description:
          'get_protocol_info: DeepBook overview, architecture, and known pools. ' +
          'get_pools: list known DeepBook V3 pools with their IDs and token types. ' +
          'get_orderbook: get live bid/ask depth (requires pool_key or pool_id; optional price_low, price_high, depth). ' +
          'get_mid_price: get current mid-price between best bid and best ask (requires pool_key or pool_id). ' +
          'build_market_order_tx: build market order PTB (requires sender, pool_key, is_bid, quantity).',
      },
      pool_key:        { type: 'string', description: 'Known pool key: SUI_USDC, DEEP_SUI, or DEEP_USDC.' },
      pool_id:         { type: 'string', description: 'Pool object ID (0x...) for custom pools.' },
      sender:          { type: 'string', description: 'Sui wallet address. Required for build_market_order_tx.' },
      is_bid:          { type: 'boolean', description: 'true = buy base token (bid), false = sell base token (ask).' },
      quantity:        { type: 'string', description: 'Base token quantity (human-readable, e.g. "10").' },
      price_low:       { type: 'number', description: 'Lower price bound for orderbook query (optional).' },
      price_high:      { type: 'number', description: 'Upper price bound for orderbook query (optional).' },
      depth:           { type: 'number', description: 'Number of orderbook levels to return per side (default 10).' },
      client_order_id: { type: 'number', description: 'Unique order ID (defaults to timestamp).' },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'List pools', input: { action: 'get_pools' } },
    { title: 'SUI/USDC orderbook', input: { action: 'get_orderbook', pool_key: 'SUI_USDC', depth: 5 } },
    { title: 'SUI mid-price', input: { action: 'get_mid_price', pool_key: 'SUI_USDC' } },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeDeepBookSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':      return await actionGetProtocolInfo();
      case 'get_pools':              return await actionGetPools();
      case 'get_orderbook':          return await actionGetOrderbook(input);
      case 'get_mid_price':          return await actionGetMidPrice(input);
      case 'build_market_order_tx':  return await actionBuildMarketOrderTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_pools, get_orderbook, get_mid_price, build_market_order_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in DeepBook skill' };
  }
}
