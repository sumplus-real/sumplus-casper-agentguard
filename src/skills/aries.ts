/**
 * Aries Markets — Lending & Borrowing Protocol on Aptos
 *
 * Aries Markets is the leading decentralised lending, borrowing, and margin
 * trading protocol on Aptos — often described as "Aave for Aptos". Users can
 * supply assets to earn interest, borrow against their collateral, and trade
 * with margin via an on-chain order book.
 *
 * Data is sourced from three places:
 *   1. Aptos fullnode  — live on-chain reserve state (supply, borrow, config)
 *   2. DeFiLlama yields — pre-computed supply APYs per pool
 *   3. DeFiLlama protocol — TVL & borrow TVL
 *
 * Contract: 0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3
 * Docs:     https://docs.ariesmarkets.xyz
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Constants ────────────────────────────────────────────────────────────────

const APTOS_NODE  = 'https://fullnode.mainnet.aptoslabs.com/v1';
const LLAMA_BASE  = 'https://api.llama.fi';
const YIELDS_BASE = 'https://yields.llama.fi';

/** Main Aries Markets contract address */
const ARIES_CONTRACT = '0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3';

/**
 * The handle of the on-chain table that stores per-asset ReserveDetails.
 * Sourced from the Reserves resource on the contract account.
 * (stable — only changes if the contract is redeployed)
 */
const RESERVES_STATS_HANDLE = '0xdf52b2c83b75c52db5bb9f58fb39d9fc2e91b2d537f6498c07bf0f5175498db4';

/**
 * Canonical coin types supported by Aries, keyed by human-readable symbol.
 */
const COIN_TYPES: Record<string, { coinType: string; decimals: number; symbol: string }> = {
  APT:   { coinType: '0x1::aptos_coin::AptosCoin', decimals: 8, symbol: 'APT' },
  USDC:  { coinType: '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC', decimals: 6, symbol: 'USDC' },
  USDT:  { coinType: `${ARIES_CONTRACT}::fa_to_coin_wrapper::WrappedUSDT`, decimals: 6, symbol: 'USDT' },
  WETH:  { coinType: '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WETH', decimals: 6, symbol: 'WETH' },
  WBTC:  { coinType: '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WBTC', decimals: 8, symbol: 'WBTC' },
  STAPT: { coinType: '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::stapt_token::StakedApt', decimals: 8, symbol: 'stAPT' },
  AMAPT: { coinType: '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::amapt_token::AmnisApt', decimals: 8, symbol: 'amAPT' },
  CAKE:  { coinType: '0x159df6b7689437016108a019fd5bef736bac692b6d4a1f10c941f6fbb9a74ca6::oft::CakeOFT', decimals: 8, symbol: 'CAKE' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function aptosFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`${APTOS_NODE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Aptos node ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function aptosView<T = any>(func: string, typeArgs: string[], args: string[]): Promise<T> {
  const res = await fetch(`${APTOS_NODE}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ function: func, type_arguments: typeArgs, arguments: args }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Aptos view ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function aptosTableItem<T = any>(
  tableHandle: string,
  keyType: string,
  valueType: string,
  key: Record<string, string>
): Promise<T> {
  const res = await fetch(`${APTOS_NODE}/tables/${tableHandle}/item`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ key_type: keyType, value_type: valueType, key }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Aptos table ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function llamaFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`${LLAMA_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DeFiLlama ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function yieldsFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`${YIELDS_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DeFiLlama yields ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function toHex(str: string): string {
  return Buffer.from(str, 'utf-8').toString('hex');
}

function formatUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

/**
 * Parse a coin type string into address / module / struct components
 * for on-chain TypeInfo table key queries.
 */
function parseCoinType(coinType: string): { address: string; module: string; struct: string } | null {
  const parts = coinType.split('::');
  if (parts.length !== 3) return null;
  return { address: parts[0], module: parts[1], struct: parts[2] };
}

/**
 * Fetch ReserveDetails for a coin type from the on-chain stats table.
 */
async function fetchReserveDetails(coinType: string): Promise<any | null> {
  const parsed = parseCoinType(coinType);
  if (!parsed) return null;
  try {
    return await aptosTableItem(
      RESERVES_STATS_HANDLE,
      '0x1::type_info::TypeInfo',
      `${ARIES_CONTRACT}::reserve_details::ReserveDetails`,
      {
        account_address: parsed.address,
        module_name: `0x${toHex(parsed.module)}`,
        struct_name: `0x${toHex(parsed.struct)}`,
      }
    );
  } catch {
    return null;
  }
}

/**
 * Derive borrow APY and supply APY from ReserveDetails.
 *
 * Two-slope interest rate model:
 *   if util <= optimal_util:
 *     borrow_rate = min_rate + (optimal_rate - min_rate) * util / optimal_util
 *   else:
 *     borrow_rate = optimal_rate + (max_rate - optimal_rate) * (util - optimal_util) / (1 - optimal_util)
 *   supply_rate = borrow_rate * util * (1 - reserve_ratio)
 *
 * All config values are in integer percent (e.g. 83 means 83 %).
 */
function deriveApys(details: any): { borrowApy: number; supplyApy: number; utilization: number } {
  // total_borrowed.val is scaled by 10^18 to represent a decimal in underlying octas
  const totalBorrowedOctas = Number(BigInt(details.total_borrowed.val) / BigInt(10 ** 18));
  const totalCashOctas     = Number(details.total_cash_available);
  const total              = totalBorrowedOctas + totalCashOctas;
  const utilization        = total > 0 ? totalBorrowedOctas / total : 0;

  const cfg         = details.interest_rate_config;
  const minRate     = Number(cfg.min_borrow_rate)     / 100;
  const optRate     = Number(cfg.optimal_borrow_rate) / 100;
  const maxRate     = Number(cfg.max_borrow_rate)     / 100;
  const optUtil     = Number(cfg.optimal_utilization) / 100;
  const reserveRatio = Number(details.reserve_config.reserve_ratio) / 100;

  let borrowApy: number;
  if (utilization <= optUtil) {
    borrowApy = optUtil > 0
      ? minRate + (optRate - minRate) * utilization / optUtil
      : minRate;
  } else {
    borrowApy = (1 - optUtil) > 0
      ? optRate + (maxRate - optRate) * (utilization - optUtil) / (1 - optUtil)
      : maxRate;
  }

  const supplyApy = borrowApy * utilization * (1 - reserveRatio);

  return {
    borrowApy:   Math.round(borrowApy  * 10000) / 100,  // percent, 2 dp
    supplyApy:   Math.round(supplyApy  * 10000) / 100,
    utilization: Math.round(utilization * 10000) / 100,
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  let tvlUsd: number | null     = null;
  let borrowedUsd: number | null = null;
  try {
    const data    = await llamaFetch<any>('/protocol/aries-markets');
    const chainTvls = data.currentChainTvls ?? {};
    tvlUsd      = chainTvls['Aptos']          ?? null;
    borrowedUsd = chainTvls['Aptos-borrowed'] ?? null;
  } catch {
    // non-fatal — proceed without live TVL
  }

  return {
    success: true,
    output: {
      name: 'Aries Markets',
      type: 'Lending & Borrowing Protocol (Aptos)',
      website: 'https://app.ariesmarkets.xyz',
      docs: 'https://docs.ariesmarkets.xyz',
      contract: ARIES_CONTRACT,
      chain: 'Aptos',
      description: [
        'Aries Markets is the leading decentralised lending and borrowing protocol on Aptos.',
        'Often described as "Aave for Aptos", it lets users supply assets to earn interest,',
        'borrow against their collateral at variable rates, and engage in margin trading',
        'via an on-chain order book — all with near-instant finality and low gas fees.',
      ],
      oracles: ['Pyth (primary)', 'Switchboard (fallback)'],
      supported_assets: Object.keys(COIN_TYPES).join(', '),
      tvl_usd: tvlUsd,
      borrowed_usd: borrowedUsd,
      tvl_display:    tvlUsd      ? `TVL: ${formatUsd(tvlUsd)}`              : 'TVL: unavailable',
      borrow_display: borrowedUsd ? `Total Borrowed: ${formatUsd(borrowedUsd)}` : '',
      available_actions: [
        'get_protocol_info — this overview',
        'get_market_stats  — supply APY, borrow APY, utilization, TVL per asset',
        'get_user_position — lending/borrowing positions for an Aptos address',
        'get_asset_info    — detailed parameters for a specific asset (APT, USDC, …)',
      ],
    },
  };
}

async function actionGetMarketStats(): Promise<SkillExecutionResult> {
  // Fetch supply APYs from DeFiLlama yields (pre-computed with compounding)
  const llamaYields = new Map<string, { apyBase: number; tvlUsd: number }>();
  try {
    const yieldsData = await yieldsFetch<{ data: any[] }>('/pools');
    for (const pool of yieldsData.data ?? []) {
      if (pool.project === 'aries-markets' && pool.chain === 'Aptos') {
        const sym = (pool.symbol as string).toUpperCase();
        llamaYields.set(sym, { apyBase: pool.apyBase ?? 0, tvlUsd: pool.tvlUsd ?? 0 });
      }
    }
  } catch {
    // non-fatal — will derive from on-chain data
  }

  // Fetch all contract resources to get ReserveCoinContainers
  const resources: any[] = await aptosFetch(`/accounts/${ARIES_CONTRACT}/resources?limit=50`);

  const containerType = `${ARIES_CONTRACT}::reserve::ReserveCoinContainer`;
  const containers = resources
    .filter((r: any) => r.type.includes(containerType))
    .map((r: any) => {
      const ct = r.type.slice(r.type.indexOf('<') + 1, r.type.lastIndexOf('>'));
      return { coinType: ct, totalCashRaw: Number(r.data.underlying_coin?.value ?? 0) };
    });

  const markets: any[] = [];

  for (const container of containers) {
    const ct = container.coinType;
    const assetEntry = Object.values(COIN_TYPES).find((a) => a.coinType === ct);
    if (!assetEntry) continue;

    const { symbol, decimals } = assetEntry;
    const divisor = 10 ** decimals;

    const details = await fetchReserveDetails(ct);
    if (!details) continue;

    const totalBorrowedOctas = Number(BigInt(details.total_borrowed.val) / BigInt(10 ** 18));
    const totalCashOctas     = Number(details.total_cash_available);
    const totalSupplied      = (totalBorrowedOctas + totalCashOctas) / divisor;
    const totalBorrowed      = totalBorrowedOctas / divisor;

    const { borrowApy, supplyApy, utilization } = deriveApys(details);

    // Prefer DeFiLlama supply APY (ZUSDC, ZUSDT, ZWETH are the DeFiLlama pool names)
    const llamaPool = llamaYields.get(`Z${symbol}`) ?? llamaYields.get(symbol);
    const finalSupplyApy = llamaPool ? llamaPool.apyBase : supplyApy;

    markets.push({
      asset: symbol,
      coin_type: ct,
      total_supplied: totalSupplied,
      total_borrowed: totalBorrowed,
      utilization_pct: utilization,
      supply_apy_pct: finalSupplyApy,
      borrow_apy_pct: borrowApy,
      loan_to_value: details.reserve_config.loan_to_value,
      liquidation_threshold: details.reserve_config.liquidation_threshold,
      allow_collateral: details.reserve_config.allow_collateral,
      display: `${symbol}: Supply ${finalSupplyApy.toFixed(4)}% | Borrow ${borrowApy.toFixed(4)}% | Util ${utilization.toFixed(2)}% | Supplied ${totalSupplied.toFixed(2)} | Borrowed ${totalBorrowed.toFixed(2)}`,
    });
  }

  if (markets.length === 0) {
    return { success: false, error: 'Failed to fetch market data from Aries on-chain' };
  }

  return {
    success: true,
    output: {
      markets,
      count: markets.length,
      data_sources: ['Aptos fullnode (live on-chain)', 'DeFiLlama yields (supply APY)'],
    },
  };
}

async function actionGetUserPosition(input: any): Promise<SkillExecutionResult> {
  const address: string | undefined = input.address;
  if (!address || !address.startsWith('0x')) {
    return {
      success: false,
      error: 'Provide "address" as a valid Aptos address (starts with 0x).',
    };
  }
  const profileName: string = input.profile ?? 'main';

  // Check profile existence first to give a clean error instead of per-asset noise
  let isRegistered = false;
  try {
    const result = await aptosView<boolean[]>(
      `${ARIES_CONTRACT}::profile::profile_exists`,
      [],
      [address, profileName]
    );
    isRegistered = result[0] ?? false;
  } catch {
    // treat as not registered
  }

  if (!isRegistered) {
    return {
      success: true,
      output: {
        address,
        profile: profileName,
        has_position: false,
        deposits: [],
        loans: [],
        message: `Address ${address} has no Aries profile named "${profileName}".`,
      },
    };
  }

  const deposits: any[] = [];
  const loans: any[]    = [];

  for (const { coinType, decimals, symbol } of Object.values(COIN_TYPES)) {
    const divisor = 10 ** decimals;

    // profile_deposit<CoinType>(address, profile_name) -> (u64 lp_shares, u64 underlying)
    try {
      const depResult = await aptosView<string[]>(
        `${ARIES_CONTRACT}::profile::profile_deposit`,
        [coinType],
        [address, profileName]
      );
      const lpShares   = Number(depResult[0] ?? 0);
      const underlying = Number(depResult[1] ?? 0);
      if (lpShares > 0 || underlying > 0) {
        deposits.push({
          asset: symbol,
          coin_type: coinType,
          lp_shares: lpShares,
          amount: underlying / divisor,
          display: `Supplied ${(underlying / divisor).toFixed(4)} ${symbol}`,
        });
      }
    } catch {
      // asset not in user position — skip
    }

    // profile_loan<CoinType>(address, profile_name) -> (u128 borrowed_scaled, u128 borrow_shares)
    // borrowed_scaled is in the same 10^18 units as total_borrowed.val; divide by 10^18 to get octas
    try {
      const loanResult = await aptosView<string[]>(
        `${ARIES_CONTRACT}::profile::profile_loan`,
        [coinType],
        [address, profileName]
      );
      const borrowedOctas = Number(BigInt(loanResult[0] ?? '0') / BigInt(10 ** 18));
      const shares        = Number(loanResult[1] ?? 0);
      if (borrowedOctas > 0) {
        loans.push({
          asset: symbol,
          coin_type: coinType,
          borrow_shares: shares,
          amount: borrowedOctas / divisor,
          display: `Borrowed ${(borrowedOctas / divisor).toFixed(4)} ${symbol}`,
        });
      }
    } catch {
      // not borrowed — skip
    }
  }

  return {
    success: true,
    output: {
      address,
      profile: profileName,
      has_position: deposits.length > 0 || loans.length > 0,
      deposits,
      loans,
      summary: [
        `Deposits: ${deposits.length > 0 ? deposits.map((d) => d.display).join(', ') : 'none'}`,
        `Loans: ${loans.length > 0 ? loans.map((l) => l.display).join(', ') : 'none'}`,
      ].join(' | '),
    },
  };
}

async function actionGetAssetInfo(input: any): Promise<SkillExecutionResult> {
  const rawAsset: string | undefined = input.asset;
  if (!rawAsset) {
    return {
      success: false,
      error: `Provide "asset" as one of: ${Object.keys(COIN_TYPES).join(', ')}`,
    };
  }

  const assetKey   = rawAsset.toUpperCase();
  const assetEntry = COIN_TYPES[assetKey];
  if (!assetEntry) {
    return {
      success: false,
      error: `Unknown asset "${rawAsset}". Supported: ${Object.keys(COIN_TYPES).join(', ')}`,
    };
  }

  const { coinType, decimals, symbol } = assetEntry;
  const divisor = 10 ** decimals;

  const details = await fetchReserveDetails(coinType);
  if (!details) {
    return { success: false, error: `No reserve data found for ${symbol} on Aries` };
  }

  const totalBorrowedOctas = Number(BigInt(details.total_borrowed.val) / BigInt(10 ** 18));
  const totalCashOctas     = Number(details.total_cash_available);
  const totalSupplied      = (totalBorrowedOctas + totalCashOctas) / divisor;
  const totalBorrowed      = totalBorrowedOctas / divisor;

  const { borrowApy, supplyApy, utilization } = deriveApys(details);
  const cfg = details.reserve_config;

  return {
    success: true,
    output: {
      asset: symbol,
      coin_type: coinType,
      decimals,
      // Market data
      total_supplied: totalSupplied,
      total_borrowed: totalBorrowed,
      utilization_pct: utilization,
      supply_apy_pct: supplyApy,
      borrow_apy_pct: borrowApy,
      // Risk parameters
      loan_to_value: cfg.loan_to_value,
      liquidation_threshold: cfg.liquidation_threshold,
      liquidation_bonus_bips: cfg.liquidation_bonus_bips,
      borrow_factor: cfg.borrow_factor,
      reserve_ratio: cfg.reserve_ratio,
      allow_collateral: cfg.allow_collateral,
      allow_redeem: cfg.allow_redeem,
      // Caps
      borrow_limit: Number(cfg.borrow_limit) / divisor,
      deposit_limit: Number(cfg.deposit_limit) / divisor,
      // Interest rate model
      interest_rate_model: {
        min_borrow_rate_pct:    Number(details.interest_rate_config.min_borrow_rate),
        optimal_borrow_rate_pct: Number(details.interest_rate_config.optimal_borrow_rate),
        max_borrow_rate_pct:    Number(details.interest_rate_config.max_borrow_rate),
        optimal_utilization_pct: Number(details.interest_rate_config.optimal_utilization),
      },
      display: [
        `${symbol} on Aries Markets`,
        `Supply APY: ${supplyApy.toFixed(4)}% | Borrow APY: ${borrowApy.toFixed(4)}%`,
        `Utilization: ${utilization.toFixed(2)}% | Supplied: ${totalSupplied.toFixed(4)} | Borrowed: ${totalBorrowed.toFixed(4)}`,
        `LTV: ${cfg.loan_to_value}% | Liquidation Threshold: ${cfg.liquidation_threshold}%`,
        `Collateral: ${cfg.allow_collateral ? 'Yes' : 'No'}`,
      ].join(' | '),
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const ARIES_SKILL_METADATA = {
  name: 'Aries Markets',
  description:
    'Leading lending & borrowing protocol on Aptos ("Aave for Aptos"). ' +
    'Get live market stats (supply APY, borrow APY, utilization) for all assets, ' +
    'look up user positions (deposits and loans), and fetch detailed risk parameters ' +
    'for any supported asset. Data sourced from Aptos fullnode + DeFiLlama.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['aries', 'aptos', 'lending', 'borrowing', 'defi', 'apt', 'usdc', 'usdt', 'weth'],
  external_url: 'https://app.ariesmarkets.xyz',
  logo_url: 'https://icons.llama.fi/aries-markets.jpg',
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
          'get_market_stats',
          'get_user_position',
          'get_asset_info',
        ],
        description:
          'get_protocol_info: Aries overview, TVL, supported assets, and available actions. ' +
          'get_market_stats: All markets — supply APY, borrow APY, utilization, total supplied/borrowed per asset. ' +
          'get_user_position: Lending and borrowing positions for a given Aptos address (requires address). ' +
          'get_asset_info: Full detail for one asset — risk params, caps, interest rate model (requires asset).',
      },
      address: {
        type: 'string',
        description:
          'Aptos wallet address to look up positions for, e.g. "0xabc…". Required for get_user_position.',
      },
      profile: {
        type: 'string',
        description:
          'Aries profile name. Defaults to "main" (the standard profile). ' +
          'Only relevant for get_user_position if the user has multiple profiles.',
      },
      asset: {
        type: 'string',
        description:
          `Asset symbol for get_asset_info. One of: ${Object.keys(COIN_TYPES).join(', ')}.`,
      },
    },
  },
  usage_examples: [
    {
      title: 'Aries Overview',
      input: { action: 'get_protocol_info' },
    },
    {
      title: 'All Market Stats (APY + TVL)',
      input: { action: 'get_market_stats' },
    },
    {
      title: 'User Position Lookup',
      input: {
        action: 'get_user_position',
        address: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      },
    },
    {
      title: 'APT Asset Details',
      input: { action: 'get_asset_info', asset: 'APT' },
    },
    {
      title: 'USDC Asset Details',
      input: { action: 'get_asset_info', asset: 'USDC' },
    },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeAriesSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return actionGetProtocolInfo();
      case 'get_market_stats':  return actionGetMarketStats();
      case 'get_user_position': return actionGetUserPosition(input);
      case 'get_asset_info':    return actionGetAssetInfo(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_market_stats, get_user_position, get_asset_info`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Aries skill unexpected error' };
  }
}
