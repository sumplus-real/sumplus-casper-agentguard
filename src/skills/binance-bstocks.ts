/**
 * Official Skill: Binance bStocks (Tokenized Stock Spot)
 *
 * Discovery / informational skill for Binance's tokenized-equity push announced
 * June 1, 2026:
 *   • US stock brokerage — 7,000+ US stocks & ETFs, zero commission for non-US
 *     users, fractional shares from $5.
 *   • bStocks — an upcoming tokenization layer that lets users mint their stock
 *     holdings into on-chain tokens on BNB Chain, settling near-instantly. Buyable
 *     with USDC, USDT or BNB. Announced as launching "in the coming weeks."
 *   • Tokenized stocks (live via the Ondo Finance partnership, Feb 2026) — a set
 *     of tokenized US equities/ETFs (AAPLon, GOOGLon, TSLAon, NVDAon, QQQon …).
 *
 * There is no public spot/trading API for these products yet, so this skill is
 * read-only product information that routes users to Binance. Every fact carries
 * a status flag (live / upcoming) and the announcement date so it cannot be
 * mistaken for live market data.
 *
 * Source: Binance announcement, June 1, 2026.
 *
 * Skill UUID: c3d4e5f6-6071-4b8c-9d02-1e3f4a5b6c71
 */

const LEARN_URL = 'https://www.binance.com/en/academy/articles/what-are-tokenized-stocks';
const PRODUCT_URL = 'https://www.binance.com/en/markets/tokenized-stocks';

export const BINANCE_BSTOCKS_SKILL_METADATA = {
  name: 'Binance bStocks (Tokenized Stocks)',
  description:
    'Product information and routing for Binance tokenized equities: the 7,000+ US-stock zero-commission brokerage, ' +
    'the upcoming bStocks self-tokenization layer on BNB Chain (mint your stock holdings into on-chain tokens, buy with ' +
    'USDC / USDT / BNB), and the live Ondo-partnered tokenized stocks (AAPLon, TSLAon, NVDAon, QQQon …). Read-only ' +
    'overview with live/upcoming status flags; no trading API for these products exists yet, so this skill routes users to Binance.',
  category: 'Finance',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['binance', 'cex', 'tokenized-stocks', 'bstocks', 'rwa', 'equity', 'bnb-chain', 'ondo', 'info'],
  external_url: PRODUCT_URL,
  logo_url: 'https://icons.llamao.fi/icons/protocols/binance?w=48&h=48',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_overview', 'list_tokenized_stocks', 'get_payment_assets'],
        description:
          'get_overview: the three tokenized-equity products and their live/upcoming status. ' +
          'list_tokenized_stocks: tokenized US equities/ETFs currently available via the Ondo partnership. ' +
          'get_payment_assets: which assets bStocks can be bought with.',
      },
    },
  },
  usage_examples: [
    { title: 'What is bStocks?', input: { action: 'get_overview' } },
    { title: 'Available tokenized stocks', input: { action: 'list_tokenized_stocks' } },
  ],
};

const ANNOUNCED = '2026-06-01';

export async function executeBinanceBStocksSkill(input: any): Promise<Record<string, any>> {
  const { action } = input ?? {};

  switch (action) {
    case 'get_overview': {
      return {
        announced: ANNOUNCED,
        products: [
          {
            name: 'US Stock Brokerage',
            status: 'live',
            summary: '7,000+ US stocks & ETFs, zero commission for non-US users, fractional shares from $5.',
            audience: 'non-US users',
          },
          {
            name: 'bStocks (self-tokenization)',
            status: 'upcoming',
            summary: 'Mint held stocks into on-chain tokens on BNB Chain; trades settle near-instantly vs T+1 on traditional rails. Buy with USDC, USDT or BNB.',
            chain: 'BNB Chain',
            note: 'Announced as launching "in the coming weeks" — not yet live.',
          },
          {
            name: 'Tokenized Stocks (Ondo partnership)',
            status: 'live',
            summary: 'Tokenized US equities & ETFs available on Binance via the Ondo Finance partnership since Feb 2026.',
            partner: 'Ondo Finance',
          },
        ],
        learn_more: LEARN_URL,
        trade: PRODUCT_URL,
      };
    }

    case 'list_tokenized_stocks': {
      // Tokenized US equities/ETFs available via the Ondo Finance partnership (Feb 2026).
      const assets = [
        { token: 'AAPLon', underlying: 'AAPL', name: 'Apple' },
        { token: 'GOOGLon', underlying: 'GOOGL', name: 'Alphabet' },
        { token: 'TSLAon', underlying: 'TSLA', name: 'Tesla' },
        { token: 'NVDAon', underlying: 'NVDA', name: 'Nvidia' },
        { token: 'MSFTon', underlying: 'MSFT', name: 'Microsoft' },
        { token: 'AMZNon', underlying: 'AMZN', name: 'Amazon' },
        { token: 'METAon', underlying: 'META', name: 'Meta Platforms' },
        { token: 'QQQon', underlying: 'QQQ', name: 'Invesco QQQ ETF' },
      ];
      return {
        source: 'Binance × Ondo Finance tokenized stocks',
        status: 'live',
        count: assets.length,
        assets,
        note: 'Token ticker uses the "on" suffix convention. List reflects the announced lineup; check Binance for the current full set and live prices.',
        trade: PRODUCT_URL,
      };
    }

    case 'get_payment_assets': {
      return {
        product: 'bStocks',
        status: 'upcoming',
        payment_assets: ['USDC', 'USDT', 'BNB'],
        note: 'bStocks purchases settle in stablecoins or BNB on BNB Chain. Other crypto assets may be supported at launch.',
      };
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}
