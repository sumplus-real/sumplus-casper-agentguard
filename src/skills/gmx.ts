/**
 * GMX — Decentralized Perpetuals & Spot Exchange
 *
 * GMX is a leading decentralized perpetuals DEX on Arbitrum and Avalanche.
 * GLP (v1) is the liquidity pool token backed by a basket of assets.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * APIs:
 *   Arbitrum v1: https://api.gmx.io
 *   Avalanche v1: https://gmx-avax-server.uc.r.appspot.com
 *   TVL stats: https://api.llama.fi/protocol/gmx
 *
 * Note: GMX v2 (Synthetics) does not have a public REST API.
 * v1 data is provided here for market context.
 */

import type { SkillExecutionResult } from '@/types/skill';

export const GMX_SKILL_METADATA = {
  name: 'GMX Markets',
  description:
    '[ARSENAL-HOSTED ✓] Real-time market data for GMX — a leading decentralized perpetuals DEX ' +
    'on Arbitrum and Avalanche. Get asset prices, GLP pool composition, open interest, ' +
    'funding rates, and protocol TVL/volume stats. No API key required.\n\n' +
    'execution_mode: server-side\n' +
    'sop_compliance:\n' +
    '  provides_quote: false\n' +
    '  returns_price_impact: false\n' +
    '  uses_authoritative_contracts: true\n' +
    '  read_only: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['gmx', 'perpetuals', 'perps', 'glp', 'arbitrum', 'avalanche', 'defi', 'leverage', 'trading'],
  external_url: 'https://app.gmx.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/gmx?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_markets',
          'get_prices',
          'get_protocol_stats',
        ],
        description:
          'Action to perform. ' +
          'get_markets: GLP pool assets with prices, open interest, and funding rates (Arbitrum or Avalanche). ' +
          'get_prices: live token prices only. ' +
          'get_protocol_stats: protocol-level TVL and volume from DefiLlama.',
      },
      chain: {
        type: 'string',
        enum: ['arbitrum', 'avalanche'],
        description: 'Chain to query for get_markets and get_prices (default: arbitrum).',
      },
    },
  },
};

// ─── API config ───────────────────────────────────────────────────────────────

const APIS: Record<string, string> = {
  arbitrum:  'https://api.gmx.io',
  avalanche: 'https://gmx-avax-server.uc.r.appspot.com',
};

const PRICE_DECIMALS = 30; // GMX uses 10^30 fixed-point

function fromFixed30(raw: string | undefined): number | null {
  if (!raw) return null;
  return parseFloat(raw) / 10 ** PRICE_DECIMALS;
}

async function gmxGet(chain: string, path: string): Promise<any> {
  const base = APIS[chain];
  if (!base) throw new Error(`Unsupported chain: ${chain}. Use arbitrum or avalanche.`);
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GMX API ${res.status} for ${path}`);
  return res.json();
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function actionGetMarkets(input: any): Promise<SkillExecutionResult> {
  const chain = input.chain ?? 'arbitrum';
  const tokens: any[] = await gmxGet(chain, '/tokens');

  const markets = tokens
    .filter((t: any) => t.data)
    .map((t: any) => {
      const d = t.data;
      const price = fromFixed30(d.minPrice);
      const longOI = fromFixed30(d.guaranteedUsd);         // USD
      const shortOI = fromFixed30(d.globalShortSize);      // USD
      const poolTokens = parseFloat(d.poolAmount ?? '0') / 10 ** (d.decimals ?? 18);
      const poolUSD = poolTokens * (price ?? 0);
      const fundingBpsHr = parseInt(d.fundingRate ?? '0'); // basis points per hour
      const fundingAnnual = (fundingBpsHr / 100 * 8760).toFixed(0); // % per year

      return {
        symbol:           d.symbol,
        name:             d.name,
        address:          d.address,
        price_usd:        price?.toFixed(6),
        pool_amount_usd:  poolUSD.toFixed(0),
        long_oi_usd:      longOI?.toFixed(0),
        short_oi_usd:     shortOI?.toFixed(0),
        funding_bps_hr:   fundingBpsHr,
        funding_annual:   `${fundingAnnual}%`,
        pool_weight_pct:  d.weight ? (parseInt(d.weight) / 1000).toFixed(1) + '%' : null,
        decimals:         d.decimals,
        updated_at:       d.updatedAt,
      };
    });

  const totalPool = markets.reduce((s, m) => s + parseFloat(m.pool_amount_usd ?? '0'), 0);

  return {
    success: true,
    output: {
      platform:       'GMX v1',
      chain,
      asset_count:    markets.length,
      total_pool_usd: totalPool.toFixed(0),
      markets,
      _note: 'GLP pool composition. long_oi_usd = total long exposure. funding_bps_hr = basis points per hour charged to traders.',
    },
  };
}

async function actionGetPrices(input: any): Promise<SkillExecutionResult> {
  const chain = input.chain ?? 'arbitrum';
  const raw: Record<string, string> = await gmxGet(chain, '/prices');

  const prices = Object.entries(raw).map(([address, rawPrice]) => ({
    address,
    price_usd: fromFixed30(rawPrice)?.toFixed(4),
  }));

  return {
    success: true,
    output: {
      platform: 'GMX v1',
      chain,
      count:    prices.length,
      prices,
      _note: 'Live oracle prices for volatile assets in the GLP pool.',
    },
  };
}

async function actionGetProtocolStats(): Promise<SkillExecutionResult> {
  const res = await fetch('https://api.llama.fi/protocol/gmx', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`DefiLlama API ${res.status}`);
  const data = await res.json();

  // chainTvls contains per-chain breakdown
  const chainTvls = data.currentChainTvls ?? {};

  return {
    success: true,
    output: {
      platform:     'GMX',
      name:         data.name,
      total_tvl:    data.tvl,
      chain_tvls:   chainTvls,
      category:     data.category,
      chains:       data.chains,
      description:  data.description,
      url:          data.url,
      _note:        'TVL in USD. Aggregated from DefiLlama. Includes GLP pool + esGMX staking.',
    },
  };
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeGmxSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_markets':       return await actionGetMarkets(input);
      case 'get_prices':        return await actionGetPrices(input);
      case 'get_protocol_stats': return await actionGetProtocolStats();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_markets, get_prices, get_protocol_stats`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in GMX skill' };
  }
}
