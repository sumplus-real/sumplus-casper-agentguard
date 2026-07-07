/**
 * Pyth Network — Real-Time Price Feeds (Hermes REST API)
 *
 * Pyth is a first-party oracle aggregating prices from 90+ institutional data
 * providers and publishing them on-chain for 500+ assets. On Sui, Pyth is the
 * dominant price oracle used by NAVI, Scallop, Cetus, and virtually every DeFi
 * protocol on the network.
 *
 * [ARSENAL-HOSTED ✓] This skill uses Pyth's public Hermes REST API — no API
 * key required, no on-chain calls.
 *
 * Hermes endpoint: https://hermes.pyth.network
 * Docs: https://docs.pyth.network/price-feeds
 */

import type { SkillExecutionResult } from '@/types/skill';

// No @mysten/sui imports needed — this skill uses Hermes REST API only.

const HERMES_BASE = 'https://hermes.pyth.network';

// ─── Price Feed IDs ──────────────────────────────────────────────────────────
// All IDs are hex strings without 0x prefix (as returned by Hermes).
// Source: https://hermes.pyth.network/v2/price_feeds?asset_type=crypto

const PRICE_FEEDS: Record<string, string> = {
  // Major crypto
  'BTC/USD':  'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH/USD':  'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOL/USD':  'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'BNB/USD':  '2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  'AVAX/USD': '93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  'DOGE/USD': 'dcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  'ADA/USD':  '2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d',
  'DOT/USD':  'ca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b',
  'LINK/USD': '8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  'ATOM/USD': 'b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819',
  'NEAR/USD': 'c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750',
  'APT/USD':  '03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5',
  'TON/USD':  '8963217838ab4cf5cadc172203c1f0b763fbaa45f346d8ee50ba994bbcac3026',
  'ARB/USD':  '3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
  'OP/USD':   '385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf',
  // Stablecoins
  'USDC/USD': 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  'USDT/USD': '2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
  // Sui ecosystem
  'SUI/USD':  '23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744',
  'DEEP/USD': '29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff',
  'CETUS/USD':'e5b274b2611143df055d6e7cd8d93fe1961716bcd4dca1cad87a83bc1e78c1ef',
  'WAL/USD':  'eba0732395fae9dec4bae12e52760b35fc1c5671e2da8b449c9af4efe5d54341',
  'NAVX/USD': '88250f854c019ef4f88a5c073d52a18bb1c6ac437033f5932cd017d24917ab46',
  // Other popular
  'JUP/USD':  '0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  'PEPE/USD': 'd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
};

// ─── Hermes helpers ──────────────────────────────────────────────────────────

interface HermesPriceInfo {
  price: number;
  conf: number;
  publish_time: number;
  expo: number;
  raw_price: string;
  raw_conf: string;
}

async function fetchHermesPrice(feedId: string): Promise<HermesPriceInfo> {
  // Strip 0x prefix if present — Hermes accepts both but we normalise here.
  const id = feedId.startsWith('0x') ? feedId.slice(2) : feedId;
  const url = `${HERMES_BASE}/v2/updates/price/latest?ids[]=${id}&parsed=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Hermes API error ${res.status} for feed ${id}`);
  const data = await res.json() as any;
  const priceInfo = data.parsed?.[0];
  if (!priceInfo) throw new Error(`No price data returned for feed ${id}`);
  const expo = Number(priceInfo.price.expo);
  const multiplier = Math.pow(10, expo);
  return {
    price:        Number(priceInfo.price.price) * multiplier,
    conf:         Number(priceInfo.price.conf) * multiplier,
    publish_time: Number(priceInfo.price.publish_time),
    expo,
    raw_price:    priceInfo.price.price,
    raw_conf:     priceInfo.price.conf,
  };
}

/** Look up a feed ID by symbol (case-insensitive). Returns null if not found. */
function resolveFeedId(symbolOrId: string): { feedId: string; symbol: string } | null {
  // Direct feed ID (hex string with or without 0x prefix)
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(symbolOrId)) {
    const feedId = symbolOrId.startsWith('0x') ? symbolOrId.slice(2) : symbolOrId;
    const symbol = Object.keys(PRICE_FEEDS).find(
      (k) => PRICE_FEEDS[k].toLowerCase() === feedId.toLowerCase()
    ) ?? feedId;
    return { feedId, symbol };
  }
  // Normalise symbol: "btc" → "BTC/USD", "BTC/USD" → "BTC/USD"
  const upper = symbolOrId.toUpperCase();
  const withSuffix = upper.includes('/') ? upper : `${upper}/USD`;
  const feedId = PRICE_FEEDS[withSuffix];
  if (!feedId) return null;
  return { feedId, symbol: withSuffix };
}

/** Format price with commas and appropriate decimal places. */
function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)    return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (price >= 0.01) return price.toFixed(6);
  return price.toExponential(4);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:        'Pyth Network',
      type:        'First-Party Price Oracle',
      website:     'https://pyth.network',
      docs:        'https://docs.pyth.network/price-feeds',
      hermes_api:  HERMES_BASE,
      description: [
        'Pyth aggregates real-time market data from 90+ institutional providers ' +
        '(exchanges, market makers, trading firms) and publishes price feeds on-chain.',
        'Prices are updated every 400ms on Sui and are available via both on-chain ' +
        'smart contracts and the Hermes REST API.',
        '500+ assets supported: crypto, equities, forex, commodities, and more.',
      ],
      data_quality: [
        'Each price includes a confidence interval (±conf) reflecting current market uncertainty.',
        'publish_time is the Unix timestamp of the last price update — check staleness before use.',
        'Use ema_price for smoothed values less susceptible to short-term manipulation.',
        'Prices are denominated in USD unless otherwise specified.',
      ],
      usage_on_sui: [
        'Used by NAVI, Scallop, Suilend, Cetus, Bluefin, and most Sui DeFi protocols.',
        'On-chain: Sui Move programs call pyth::get_price() with a PriceInfoObject.',
        'Off-chain (this skill): Hermes REST API — no wallet or gas needed.',
      ],
      supported_categories: ['Crypto', 'Equities', 'Forex', 'Commodities', 'Metal'],
      total_feeds_approx: 500,
      sui_ecosystem_feeds: Object.keys(PRICE_FEEDS).filter(
        (k) => ['SUI', 'DEEP', 'CETUS', 'WAL', 'NAVX'].some((s) => k.startsWith(s))
      ),
    },
  };
}

async function actionGetPrice(input: any): Promise<SkillExecutionResult> {
  const symbolOrId: string | undefined = input.symbol ?? input.feed_id;
  if (!symbolOrId) {
    return {
      success: false,
      error: 'Provide either "symbol" (e.g. "BTC" or "BTC/USD") or "feed_id" (64-char hex).',
    };
  }

  const resolved = resolveFeedId(symbolOrId);
  if (!resolved) {
    const known = Object.keys(PRICE_FEEDS).join(', ');
    return {
      success: false,
      error: `Unknown symbol "${symbolOrId}". Known symbols: ${known}. ` +
             'You can also pass a raw 64-char Pyth feed ID via "feed_id".',
    };
  }

  try {
    const info = await fetchHermesPrice(resolved.feedId);
    const ageSeconds = Math.floor(Date.now() / 1000) - info.publish_time;
    const formattedPrice = formatPrice(info.price);
    const formattedConf  = formatPrice(info.conf);
    const display        = `${resolved.symbol}: $${formattedPrice} ±$${formattedConf}`;

    return {
      success: true,
      output: {
        symbol:       resolved.symbol,
        feed_id:      resolved.feedId,
        price:        info.price,
        conf:         info.conf,
        expo:         info.expo,
        publish_time: info.publish_time,
        age_seconds:  ageSeconds,
        display,
        staleness_warning: ageSeconds > 60 ? `Price is ${ageSeconds}s old — may be stale.` : undefined,
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to fetch price from Hermes' };
  }
}

async function actionGetMultiplePrices(input: any): Promise<SkillExecutionResult> {
  const symbols: string[] | undefined = input.symbols;
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return { success: false, error: '"symbols" must be a non-empty array of symbol strings.' };
  }
  if (symbols.length > 20) {
    return { success: false, error: 'Maximum 20 symbols per request.' };
  }

  // Resolve all symbols first; collect errors for unknowns.
  const resolved: Array<{ feedId: string; symbol: string }> = [];
  const unknowns: string[] = [];
  for (const s of symbols) {
    const r = resolveFeedId(s);
    if (r) resolved.push(r);
    else unknowns.push(s);
  }

  if (resolved.length === 0) {
    return { success: false, error: `None of the provided symbols were recognised: ${symbols.join(', ')}` };
  }

  // Batch request — Hermes accepts multiple ids[] params in one call.
  const params = resolved.map((r) => `ids[]=${r.feedId}`).join('&');
  const url = `${HERMES_BASE}/v2/updates/price/latest?${params}&parsed=true`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Hermes API error ${res.status}`);
    const data = await res.json() as any;
    const parsed: any[] = data.parsed ?? [];

    const prices: Record<string, any> = {};
    const now = Math.floor(Date.now() / 1000);

    for (const entry of parsed) {
      const feedId = entry.id as string;
      const match  = resolved.find((r) => r.feedId.toLowerCase() === feedId.toLowerCase());
      const symbol = match?.symbol ?? feedId;
      const expo   = Number(entry.price.expo);
      const mul    = Math.pow(10, expo);
      const price  = Number(entry.price.price) * mul;
      const conf   = Number(entry.price.conf) * mul;
      const publishTime = Number(entry.price.publish_time);
      const ageSeconds  = now - publishTime;

      prices[symbol] = {
        feed_id:      feedId,
        price,
        conf,
        expo,
        publish_time: publishTime,
        age_seconds:  ageSeconds,
        display:      `${symbol}: $${formatPrice(price)} ±$${formatPrice(conf)}`,
        staleness_warning: ageSeconds > 60 ? `Price is ${ageSeconds}s old — may be stale.` : undefined,
      };
    }

    return {
      success: true,
      output: {
        prices,
        fetched_count: Object.keys(prices).length,
        unknown_symbols: unknowns.length > 0 ? unknowns : undefined,
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to fetch prices from Hermes' };
  }
}

async function actionListCommonFeeds(): Promise<SkillExecutionResult> {
  const feeds = Object.entries(PRICE_FEEDS).map(([symbol, feedId]) => ({
    symbol,
    feed_id: feedId,
  }));
  return {
    success: true,
    output: {
      feeds,
      count: feeds.length,
      note: 'This is a curated list of common feeds bundled with this skill. ' +
            'Pyth supports 500+ additional feeds — query them at ' +
            `${HERMES_BASE}/v2/price_feeds?asset_type=crypto`,
      hermes_list_url: `${HERMES_BASE}/v2/price_feeds?asset_type=crypto`,
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const PYTH_SUI_SKILL_METADATA = {
  name:        'Pyth Network',
  description:
    '[ARSENAL-HOSTED ✓] Real-time price feeds for 500+ assets via Pyth Network oracle. ' +
    'Get current market prices for crypto, stocks, and forex directly from first-party data providers. ' +
    'No API key required. Heavily used on Sui by NAVI, Scallop, Cetus, and more.',
  category:    'Data & Oracles',
  version:     '1.0.0',
  author_type: 'official',
  is_paid:     false,
  price:       null,
  tags:        ['pyth', 'oracle', 'price-feed', 'sui', 'data', 'defi'],
  external_url:'https://pyth.network',
  logo_url:    'https://icons.llamao.fi/icons/protocols/pyth-network?w=48&h=48',
  partner_verified: false,
  status:      'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_price', 'get_multiple_prices', 'list_feeds'],
        description:
          'get_protocol_info: Overview of Pyth Network and data quality notes. ' +
          'get_price: Current price for one asset (requires symbol or feed_id). ' +
          'get_multiple_prices: Prices for an array of symbols (requires symbols[]). ' +
          'list_feeds: Return the curated map of symbol → feed_id.',
      },
      symbol: {
        type: 'string',
        description:
          'Asset symbol, e.g. "BTC", "ETH", "SUI", "BTC/USD". ' +
          'Case-insensitive. "/USD" suffix is added automatically if omitted. ' +
          'Required for get_price (unless feed_id is provided).',
      },
      feed_id: {
        type: 'string',
        description:
          'Pyth price feed ID as a 64-char hex string (with or without 0x prefix). ' +
          'Alternative to symbol for get_price — useful for assets not in the curated list.',
      },
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of asset symbols for get_multiple_prices, e.g. ["BTC", "ETH", "SUI"]. ' +
          'Maximum 20 symbols per request.',
      },
    },
  },
  usage_examples: [
    {
      title: 'BTC price',
      input: { action: 'get_price', symbol: 'BTC' },
    },
    {
      title: 'SUI/USD price',
      input: { action: 'get_price', symbol: 'SUI/USD' },
    },
    {
      title: 'Multiple prices',
      input: { action: 'get_multiple_prices', symbols: ['BTC', 'ETH', 'SUI', 'SOL'] },
    },
    {
      title: 'List supported feeds',
      input: { action: 'list_feeds' },
    },
    {
      title: 'Protocol info',
      input: { action: 'get_protocol_info' },
    },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executePythSuiSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':    return actionGetProtocolInfo();
      case 'get_price':            return actionGetPrice(input);
      case 'get_multiple_prices':  return actionGetMultiplePrices(input);
      case 'list_feeds':           return actionListCommonFeeds();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_price, get_multiple_prices, list_feeds`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Pyth skill unexpected error' };
  }
}
