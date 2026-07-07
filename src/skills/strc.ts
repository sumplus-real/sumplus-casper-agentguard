/**
 * STRC — Strategy's Perpetual Preferred Stock & On-Chain Yield Ecosystem
 *
 * STRC is Strategy's (formerly MicroStrategy) perpetual preferred stock (Nasdaq: STRC).
 * Launched July 2025 via a $2.5B IPO, it pays 11.5% annualized dividends monthly,
 * derived from Bitcoin holdings. It is NOT a native DeFi token — but it became the
 * foundational yield primitive for an entire DeFi ecosystem.
 *
 * CLARITY Act connection: Michael Saylor explicitly cited STRC as a "digital credit"
 * instrument whose markets the CLARITY Act would unlock by legitimizing activity-based
 * yield mechanisms and enabling institutional DeFi integration.
 *
 * On-chain ecosystem:
 *   - Saturn (saturn.credit):  USDat + sUSDat — STRC dividends as on-chain stablecoin yield
 *   - Apyx (apyx.fi):          apxUSD + apyUSD — dividend-backed stablecoin protocol
 *   - Pendle:                  PT/YT yield market for Saturn and Apyx products (~$318M TVL)
 *   - Ondo Global Markets:     Tokenized STRC across Ethereum, BNB, Solana (May 2026)
 *
 * Docs: https://saturncredit.gitbook.io  |  https://docs.apyx.fi
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Contract Addresses ───────────────────────────────────────────────────────

const CONTRACTS = {
  // Apyx — Ethereum Mainnet
  apxUSD_eth: '0x98A878b1Cd98131B271883B390f68D2c90674665' as const,
  apyUSD_eth: '0x38EEb52F0771140d10c4E9A9a72349A329Fe8a6A' as const,
  // Apyx — Base
  apxUSD_base: '0xD993935E13851dd7517af10687EC7e5022127228' as const,
  apyUSD_base: '0x2c271ddF484aC0386d216eB7eB9Ff02D4Dc0F6AA' as const,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchLlama(slug: string): Promise<any> {
  const res = await fetch(`https://api.llama.fi/protocol/${slug}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'STRC DeFi Ecosystem',
      underlying_asset: {
        name: 'Strategy Perpetual Preferred Stock',
        ticker: 'STRC',
        exchange: 'Nasdaq',
        issuer: 'Strategy (formerly MicroStrategy)',
        launched: 'July 2025',
        ipo_size_usd: '2,521,000,000',
        dividend_yield_annualized: '11.5%',
        dividend_frequency: 'Monthly',
        par_value_usd: 100,
        description: [
          'STRC is Strategy\'s perpetual preferred stock — no maturity, no principal repayment.',
          'Dividends are paid in cash monthly and funded by Strategy\'s Bitcoin acquisition model.',
          'Strategy adjusts the dividend rate monthly to keep share price anchored near $100 par.',
          'As of May 2026, STRC carries an 11.5% annualized yield vs ~3.7% for US Treasuries.',
        ],
      },
      clarity_act_connection: [
        'Michael Saylor positioned STRC as "digital credit" in a BTC/MSTR/STRC triad.',
        'The CLARITY Act legitimizes activity-based yield mechanisms, reducing regulatory risk for STRC.',
        'CLARITY Act frameworks for DeFi enable STRC to function in lending, collateral, and settlement.',
        'If passed, CLARITY Act could accelerate institutional integration of STRC-backed products.',
      ],
      onchain_ecosystem: {
        saturn: {
          website: 'https://saturn.credit',
          app: 'https://app.saturn.credit',
          docs: 'https://saturncredit.gitbook.io/saturn-docs',
          description: 'Issues USDat (T-bill backed stablecoin) and sUSDat (STRC dividend yield).',
          tvl_usd_approx: '~$102M (May 2026)',
        },
        apyx: {
          website: 'https://apyx.fi',
          docs: 'https://docs.apyx.fi',
          description: 'Dividend-backed stablecoin: apxUSD (non-yielding) and apyUSD (yield-bearing).',
          contracts_eth: {
            apxUSD: CONTRACTS.apxUSD_eth,
            apyUSD: CONTRACTS.apyUSD_eth,
          },
          contracts_base: {
            apxUSD: CONTRACTS.apxUSD_base,
            apyUSD: CONTRACTS.apyUSD_base,
          },
          aum_usd_approx: '~$163M (May 2026)',
        },
        pendle: {
          description: 'Splits Saturn/Apyx yield tokens into PT (fixed) and YT (variable).',
          tvl_on_strc_products_usd_approx: '~$318M (May 2026)',
        },
        ondo_global_markets: {
          description: 'Tokenized STRC as equity-linked note on Ethereum, BNB Chain, and Solana.',
          launched: 'May 2026',
        },
      },
      available_actions: [
        'get_protocol_info — overview of STRC and its DeFi ecosystem',
        'get_apyx_stats — Apyx protocol yield and TVL from DeFiLlama + on-chain',
        'get_saturn_stats — Saturn protocol TVL from DeFiLlama',
        'get_strc_market_data — STRC yield, market context, and DeFi integration summary',
      ],
    },
  };
}

async function actionGetApyxStats(): Promise<SkillExecutionResult> {
  try {
    const [llamaApyx, srRes] = await Promise.all([
      fetchLlama('apyx'),
      fetch('https://yields.llama.fi/pools', { signal: AbortSignal.timeout(10_000) })
        .then(r => r.json())
        .catch(() => null),
    ]);

    // Extract apyUSD pool from yield aggregator if available
    const apyusdPool = srRes?.data?.find(
      (p: any) =>
        p.project?.toLowerCase() === 'apyx' ||
        p.symbol?.toLowerCase().includes('apyusd'),
    ) ?? null;

    return {
      success: true,
      output: {
        protocol: 'Apyx',
        website: 'https://apyx.fi',
        tokens: {
          apxUSD: {
            description: 'Non-yielding stablecoin. Deep liquidity layer for DeFi collateral.',
            contract_eth: CONTRACTS.apxUSD_eth,
            contract_base: CONTRACTS.apxUSD_base,
          },
          apyUSD: {
            description: 'Yield-bearing stablecoin. Accrues STRC dividends (~11% APY). 30-day redemption cooldown.',
            contract_eth: CONTRACTS.apyUSD_eth,
            contract_base: CONTRACTS.apyUSD_base,
            current_apy_pct: apyusdPool?.apy ?? '~11%',
          },
        },
        tvl_usd: llamaApyx?.tvl ?? null,
        aum_usd_reported: '163,550,000',
        chains: ['Ethereum', 'Base'],
        collateral: 'Strategy STRC preferred shares (Nasdaq: STRC)',
        note: 'Apyx is the largest external holder of STRC; dividends flow directly to apyUSD holders.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetSaturnStats(): Promise<SkillExecutionResult> {
  try {
    const llama = await fetchLlama('saturn');

    return {
      success: true,
      output: {
        protocol: 'Saturn',
        website: 'https://saturn.credit',
        app: 'https://app.saturn.credit',
        tokens: {
          USDat: {
            description: 'Non-yielding stablecoin, 100% backed by tokenized US Treasuries. Permissionless.',
          },
          sUSDat: {
            description: 'Yield-bearing vault (ERC-4626). Backed by STRC digital credit exposure. ~11% APY.',
          },
        },
        tvl_usd: llama?.tvl ?? null,
        chain: 'Ethereum',
        auditors: ['Three Sigma', 'Certora'],
        funding: '$2M seed (led by The Spartan Group, Anchorage Digital, Susquehanna Crypto)',
        note: 'Saturn converts STRC monthly dividend cashflows into on-chain stablecoin yield.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetStrcMarketData(): Promise<SkillExecutionResult> {
  try {
    // Fetch Pendle TVL for STRC-related pools via DeFiLlama
    const pendleLlama = await fetchLlama('pendle-v4');

    return {
      success: true,
      output: {
        asset: 'STRC — Strategy Perpetual Preferred Stock',
        nasdaq_ticker: 'STRC',
        par_value_usd: 100,
        dividend_yield_annualized_pct: 11.5,
        dividend_schedule: 'Monthly cash payments',
        us_treasury_10y_yield_pct_approx: 3.7,
        yield_premium_over_treasuries_pct: 7.8,
        defi_integration_summary: {
          total_onchain_strc_exposure_usd_approx: '~$400M+ (May 2026)',
          saturn_tvl_usd_approx: '~$102M',
          apyx_aum_usd_approx: '~$163M',
          pendle_strc_tvl_usd_approx: '~$318M',
          ondo_tokenized: 'Live on Ethereum, BNB Chain, Solana (May 2026)',
          daily_strc_trading_volume_usd_approx: '~$1.6B',
        },
        clarity_act_status: {
          house_passed: 'July 17, 2025 (294-134)',
          senate_banking_advanced: 'May 2026',
          saylor_quote:
            'The CLARITY Act could unlock BTC, MSTR, and STRC markets by providing legal clarity for digital credit instruments.',
        },
        risk_factors: [
          'STRC yield is tied to Bitcoin price performance — if BTC falls, Strategy may reduce dividends.',
          'DeFi protocols add leverage layers on top of STRC, amplifying systemic risk.',
          'apyUSD has 30-day redemption lockup; sUSDat has permissioned access.',
          'STRC is not a digital asset — it is Nasdaq-listed equity subject to US securities law.',
          'Regulatory uncertainty persists until CLARITY Act is signed into law.',
        ],
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

// ─── Metadata & Entry Point ────────────────────────────────────────────────────

export const STRC_SKILL_METADATA = {
  name: 'STRC DeFi Ecosystem',
  description:
    'Strategy\'s perpetual preferred stock (Nasdaq: STRC) and its DeFi yield ecosystem. ' +
    'STRC pays 11.5% annual dividends monthly, backed by Bitcoin. ' +
    'On-chain protocols Saturn (USDat/sUSDat) and Apyx (apxUSD/apyUSD) tokenize this yield. ' +
    'Connected to the CLARITY Act as a key "digital credit" instrument Saylor wants unlocked.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: [
    'strc',
    'strategy',
    'microstrategy',
    'rwa',
    'digital-credit',
    'preferred-stock',
    'bitcoin-yield',
    'saturn',
    'apyx',
    'usdat',
    'apyusd',
    'clarity-act',
    'tokenized-equity',
    'pendle',
  ],
  external_url: 'https://saturn.credit',
  logo_url: 'https://icons.llamao.fi/icons/protocols/saturn?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_protocol_info',
          'get_apyx_stats',
          'get_saturn_stats',
          'get_strc_market_data',
        ],
        description:
          'get_protocol_info: Full overview of STRC and its on-chain DeFi ecosystem (Saturn, Apyx, Pendle, Ondo). ' +
          'get_apyx_stats: Apyx protocol TVL, APY, and contract addresses for apxUSD and apyUSD on Ethereum and Base. ' +
          'get_saturn_stats: Saturn protocol TVL and token details (USDat, sUSDat) from DeFiLlama. ' +
          'get_strc_market_data: STRC yield context, DeFi integration summary, CLARITY Act status, and risk factors.',
      },
    },
  },
};

export async function executeStrcSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info':
      return actionGetProtocolInfo();
    case 'get_apyx_stats':
      return actionGetApyxStats();
    case 'get_saturn_stats':
      return actionGetSaturnStats();
    case 'get_strc_market_data':
      return actionGetStrcMarketData();
    default:
      return {
        success: false,
        output: {
          error: `Unknown action: ${input.action}. Available: get_protocol_info, get_apyx_stats, get_saturn_stats, get_strc_market_data`,
        },
      };
  }
}
