/**
 * Official Skill: Binance Stock Perpetuals (TradFi Perps)
 *
 * Discovery + market data for Binance's USDⓈ-M "TradFi" perpetual futures —
 * USDT-margined perpetual contracts tracking individual stocks (TSLA, AAPL, NVDA,
 * MSTR …), ETFs (SPY, QQQ, SOXL …), commodities (gold, silver, crude) and a few
 * pre-IPO names (OPENAI, SPCX). On Binance these are marked
 * contractType="TRADIFI_PERPETUAL" / underlyingType="EQUITY".
 *
 * Data source — why CoinGecko, not Binance directly:
 *   Binance's futures host (fapi.binance.com) is geo-restricted (HTTP 451) from
 *   the deploy region, and Binance's public-data mirror (data-api.binance.vision)
 *   serves spot only — there is no region-safe futures mirror. So live market data
 *   here is read from CoinGecko's region-safe derivatives endpoint
 *   (api.coingecko.com/api/v3/derivatives/exchanges/binance_futures), which carries
 *   last price, 24h change, funding rate, open interest and volume for these perps.
 *
 *   CoinGecko does not tag which Binance perps are "TradFi/equity", so the contract
 *   universe is pinned to a snapshot of Binance's futures exchangeInfo
 *   (contractType="TRADIFI_PERPETUAL") taken 2026-06-02. New Binance listings may
 *   lag this set until it is refreshed. Each contract still links to Binance Futures
 *   to trade. Read-only, no key, no trading.
 *
 * Set COINGECKO_API_BASE / COINGECKO_API_KEY to use a CoinGecko Pro/Demo key if the
 * shared free-tier endpoint rate-limits the deploy region.
 *
 * Skill UUID: b1c2d3e4-5f60-4a7b-8c91-0d2e3f4a5b60
 */

import { httpsGet } from '@/lib/skill-executors';

const SNAPSHOT_DATE = '2026-06-02';
const TRADE_URL = (symbol: string) => `https://www.binance.com/en/futures/${symbol}`;

// Binance USDⓈ-M TRADIFI_PERPETUAL contracts (snapshot 2026-06-02 from fapi exchangeInfo).
const COMMODITIES = new Set(['XAUUSDT', 'XAGUSDT', 'XPTUSDT', 'XPDUSDT', 'CLUSDT', 'BZUSDT', 'COPPERUSDT', 'NATGASUSDT']);
const ETFS = new Set(['QQQUSDT', 'SPYUSDT', 'SOXLUSDT', 'EWJUSDT', 'EWTUSDT', 'EWYUSDT']);
const PRE_IPO = new Set(['OPENAIUSDT', 'SPCXUSDT']);
const TRADFI_PERPS: string[] = [
  'AAPLUSDT', 'AMDUSDT', 'AMZNUSDT', 'ARMUSDT', 'ASTSUSDT', 'AVGOUSDT', 'BABAUSDT', 'BBXUSDT', 'BEUSDT', 'BRKBUSDT',
  'BZUSDT', 'CBRSUSDT', 'CLUSDT', 'COHRUSDT', 'COINUSDT', 'COPPERUSDT', 'CRCLUSDT', 'CRWVUSDT', 'CSCOUSDT', 'DISUSDT',
  'DRAMUSDT', 'EWJUSDT', 'EWTUSDT', 'EWYUSDT', 'FLNCUSDT', 'GOOGLUSDT', 'HDUSDT', 'HOODUSDT', 'INTCUSDT', 'JPMUSDT',
  'LITEUSDT', 'LLYUSDT', 'METAUSDT', 'MRVLUSDT', 'MSFTUSDT', 'MSTRUSDT', 'MUUSDT', 'NATGASUSDT', 'NBISUSDT', 'NOKUSDT',
  'NVDAUSDT', 'NVOUSDT', 'OPENAIUSDT', 'ORCLUSDT', 'PAYPUSDT', 'PLTRUSDT', 'QCOMUSDT', 'QNTXUSDT', 'QQQUSDT', 'RKLBUSDT',
  'SNDKUSDT', 'SOXLUSDT', 'SPCXUSDT', 'SPYUSDT', 'TSLAUSDT', 'TSMUSDT', 'UBERUSDT', 'USARUSDT', 'VUSDT', 'WDCUSDT',
  'WMTUSDT', 'XAGUSDT', 'XAUUSDT', 'XPDUSDT', 'XPTUSDT',
];
const TRADFI_SET = new Set(TRADFI_PERPS);

function categoryOf(symbol: string): string {
  if (COMMODITIES.has(symbol)) return 'commodity';
  if (ETFS.has(symbol)) return 'etf';
  if (PRE_IPO.has(symbol)) return 'pre_ipo';
  return 'equity';
}

const CATEGORIES = ['equity', 'etf', 'commodity', 'pre_ipo'];

export const BINANCE_STOCK_PERPS_SKILL_METADATA = {
  name: 'Binance Stock Perpetuals',
  description:
    'Discovery and market data for Binance USDⓈ-M TradFi perpetual futures — USDT-margined perps tracking individual ' +
    'stocks (TSLA, AAPL, NVDA, MSTR …), ETFs (SPY, QQQ, SOXL …), commodities (gold, silver, crude) and select pre-IPO ' +
    'names. List the TradFi-perp universe and read last price, 24h change, funding rate, open interest and volume. ' +
    'Read-only, no API key; market data is sourced region-safely via CoinGecko, and each contract carries a Binance ' +
    'Futures trade link.',
  category: 'Finance',
  version: '1.1.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['binance', 'cex', 'perpetuals', 'futures', 'stocks', 'equity', 'tradfi', 'market-data', 'funding-rate'],
  external_url: 'https://www.binance.com/en/futures/markets/tradfi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/binance?w=48&h=48',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['list_perps', 'get_price', 'get_24h_stats', 'get_funding_rate'],
        description:
          'list_perps: the TradFi/equity perpetual universe with live price + funding. get_price: last price. ' +
          'get_24h_stats: last price, 24h % change, volume, open interest. get_funding_rate: funding rate + index price.',
      },
      symbol: { type: 'string', description: 'Perp symbol, e.g. TSLAUSDT. Required for get_price / get_24h_stats / get_funding_rate.' },
      category: { type: 'string', description: `Optional filter for list_perps: one of ${CATEGORIES.join(', ')}.` },
    },
  },
  usage_examples: [
    { title: 'List all TradFi stock perps', input: { action: 'list_perps' } },
    { title: 'Commodity perps only', input: { action: 'list_perps', category: 'commodity' } },
    { title: 'TSLA perp funding rate', input: { action: 'get_funding_rate', symbol: 'TSLAUSDT' } },
    { title: 'NVDA perp 24h stats', input: { action: 'get_24h_stats', symbol: 'NVDAUSDT' } },
  ],
};

function cgBase(): string {
  return process.env.COINGECKO_API_BASE || 'https://api.coingecko.com/api/v3';
}

// Fetch all Binance-futures tickers from CoinGecko and index the TradFi ones by symbol.
async function fetchTradfiTickers(): Promise<Map<string, any>> {
  const keyQs = process.env.COINGECKO_API_KEY ? `&x_cg_demo_api_key=${process.env.COINGECKO_API_KEY}` : '';
  const res = await httpsGet(`${cgBase()}/derivatives/exchanges/binance_futures?include_tickers=all${keyQs}`);
  if (!res || !Array.isArray(res.tickers)) {
    throw new Error('CoinGecko returned no tickers (rate-limited or unavailable). Set COINGECKO_API_KEY to use a keyed endpoint.');
  }
  const map = new Map<string, any>();
  for (const t of res.tickers) {
    if (TRADFI_SET.has(t.symbol)) map.set(t.symbol, t);
  }
  return map;
}

function shapeStats(symbol: string, t: any) {
  return {
    symbol,
    category: categoryOf(symbol),
    underlying: t?.base ?? symbol.replace(/USDT$/, ''),
    last_price: t?.last ?? null,
    price_change_pct_24h: t?.h24_percentage_change ?? null,
    index_price: t?.index ?? null,
    funding_rate: t?.funding_rate ?? null,
    open_interest_usd: t?.open_interest_usd ?? null,
    volume_24h: t?.h24_volume ?? null,
    last_traded: t?.last_traded ?? null,
    trade_url: TRADE_URL(symbol),
  };
}

export async function executeBinanceStockPerpsSkill(input: any): Promise<Record<string, any>> {
  const { action, symbol, category } = input ?? {};
  const upper = symbol ? String(symbol).toUpperCase() : undefined;

  try {
    switch (action) {
      case 'list_perps': {
        if (category && !CATEGORIES.includes(category)) return { error: `invalid category; one of ${CATEGORIES.join(', ')}` };
        const tickers = await fetchTradfiTickers();
        let symbols = TRADFI_PERPS;
        if (category) symbols = symbols.filter((s) => categoryOf(s) === category);
        return {
          source: 'CoinGecko (binance_futures)',
          universe_snapshot: SNAPSHOT_DATE,
          count: symbols.length,
          note: 'TradFi perp universe is a snapshot of Binance futures exchangeInfo (TRADIFI_PERPETUAL); newly listed contracts may lag until refreshed. Live price/funding via CoinGecko.',
          perps: symbols.map((s) => shapeStats(s, tickers.get(s))).sort((a, b) => a.symbol.localeCompare(b.symbol)),
        };
      }

      case 'get_price': {
        if (!upper) return { error: 'symbol is required' };
        if (!TRADFI_SET.has(upper)) return { error: `${upper} is not a known Binance TradFi perp (snapshot ${SNAPSHOT_DATE}). Use list_perps to see the universe.` };
        const t = (await fetchTradfiTickers()).get(upper);
        if (!t) return { error: `No live data for ${upper} from CoinGecko right now.` };
        return { symbol: upper, last_price: t.last, index_price: t.index, last_traded: t.last_traded, trade_url: TRADE_URL(upper) };
      }

      case 'get_24h_stats': {
        if (!upper) return { error: 'symbol is required' };
        if (!TRADFI_SET.has(upper)) return { error: `${upper} is not a known Binance TradFi perp (snapshot ${SNAPSHOT_DATE}). Use list_perps to see the universe.` };
        const t = (await fetchTradfiTickers()).get(upper);
        if (!t) return { error: `No live data for ${upper} from CoinGecko right now.` };
        return shapeStats(upper, t);
      }

      case 'get_funding_rate': {
        if (!upper) return { error: 'symbol is required' };
        if (!TRADFI_SET.has(upper)) return { error: `${upper} is not a known Binance TradFi perp (snapshot ${SNAPSHOT_DATE}). Use list_perps to see the universe.` };
        const t = (await fetchTradfiTickers()).get(upper);
        if (!t) return { error: `No live data for ${upper} from CoinGecko right now.` };
        return {
          symbol: upper,
          funding_rate: t.funding_rate,
          mark_price: t.last,
          index_price: t.index,
          index_basis_pct: t.index_basis_percentage,
          trade_url: TRADE_URL(upper),
          note: 'Funding rate sourced via CoinGecko; settles on Binance every 8h.',
        };
      }

      default:
        return { error: `Unknown action: ${action}` };
    }
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
}
