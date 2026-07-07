/**
 * Aave v3 — Lending & Borrowing Markets
 *
 * Aave is the largest decentralized lending protocol with $30B+ TVL
 * across Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, and more.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * API: POST https://api.v3.aave.com/graphql (public GraphQL, no auth)
 */

import type { SkillExecutionResult } from '@/types/skill';

export const AAVE_SKILL_METADATA = {
  name: 'Aave Lending Markets',
  description:
    '[ARSENAL-HOSTED ✓] Real-time market data, account queries, and unsigned transactions for Aave v3 — ' +
    'the largest decentralized lending protocol ($30B+ TVL). ' +
    'Get supply/borrow APYs, utilization rates, market TVL across all chains, ' +
    'user account health factor, supplied collateral, and borrowed positions. ' +
    'Build supply/withdraw/borrow/repay transactions (returns transactions array ready for wallet signing). ' +
    'No API key required.\n\n' +
    'execution_mode: server-side\n' +
    'chains: ethereum, arbitrum, base, optimism, polygon, avalanche\n' +
    'sop_compliance:\n' +
    '  provides_quote: false\n' +
    '  returns_price_impact: false\n' +
    '  uses_authoritative_contracts: true',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['aave', 'lending', 'borrowing', 'defi', 'ethereum', 'arbitrum', 'base', 'polygon', 'xlayer', 'okx', 'interest-rate', 'collateral', 'health-factor'],
  external_url: 'https://app.aave.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/aave?w=48&h=48',
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
          'get_reserves',
          'get_user_account',
          'get_user_supplies',
          'get_user_borrows',
          'build_supply_tx',
          'build_withdraw_tx',
          'build_borrow_tx',
          'build_repay_tx',
        ],
        description:
          'Action to perform. ' +
          'get_markets: list all Aave markets across chains with TVL. ' +
          'get_reserves: assets/rates for a specific chain (supply APY, borrow APY, utilization). ' +
          'get_user_account: health factor, net worth, collateral, debt for an address. ' +
          'get_user_supplies: what a user has supplied. ' +
          'get_user_borrows: what a user has borrowed. ' +
          'build_supply_tx: build approve + supply transactions (requires token, amount, sender, chain). ' +
          'build_withdraw_tx: build withdraw transaction (requires token, amount, sender, chain; use amount="max" for full withdrawal). ' +
          'build_borrow_tx: build borrow transaction (requires token, amount, sender, chain; needs prior collateral). ' +
          'build_repay_tx: build approve + repay transactions (requires token, sender, chain; amount or repay_all=true).',
      },
      chain: {
        type: 'string',
        enum: ['ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'avalanche', 'bnb', 'gnosis', 'scroll', 'metis', 'xlayer'],
        description: 'Chain to query or transact on (default: ethereum). Build tx actions support: ethereum, arbitrum, base, optimism, polygon.',
      },
      address: {
        type: 'string',
        description: 'User EVM wallet address (0x...). Required for get_user_account, get_user_supplies, get_user_borrows.',
      },
      asset: {
        type: 'string',
        description: 'Optional asset symbol to filter results (e.g. USDC, ETH, WBTC). Used with get_reserves.',
      },
      token: {
        type: 'string',
        description: 'Token symbol (ETH/WETH, USDC, USDT, DAI, WBTC, etc.) or 0x address. Required for build_*_tx actions.',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount (e.g. "100" for 100 USDC, "0.5" for 0.5 ETH). Use "max" in build_withdraw_tx to withdraw all. Required for build_*_tx actions.',
      },
      sender: {
        type: 'string',
        description: 'EVM wallet address (0x...). Required for all build_*_tx actions.',
      },
      repay_all: {
        type: 'boolean',
        description: 'For build_repay_tx: if true, repays the full borrow balance (passes uint256.max). Default: false.',
      },
      rate_mode: {
        type: 'number',
        enum: [1, 2],
        description: 'Interest rate mode for build_borrow_tx / build_repay_tx: 1=stable (deprecated), 2=variable. Default: 2.',
      },
    },
  },
  usage_examples: [
    { title: 'Get all markets', input: { action: 'get_markets' } },
    { title: 'Get Arbitrum reserves', input: { action: 'get_reserves', chain: 'arbitrum' } },
    { title: 'Supply 100 USDC on Base', input: { action: 'build_supply_tx', token: 'USDC', amount: '100', sender: '0xYourAddress', chain: 'base' } },
    { title: 'Borrow 0.05 WETH on Ethereum', input: { action: 'build_borrow_tx', token: 'WETH', amount: '0.05', sender: '0xYourAddress', chain: 'ethereum' } },
    { title: 'Repay all USDC on Arbitrum', input: { action: 'build_repay_tx', token: 'USDC', sender: '0xYourAddress', chain: 'arbitrum', repay_all: true } },
    { title: 'Withdraw 50 USDC from Base', input: { action: 'build_withdraw_tx', token: 'USDC', amount: '50', sender: '0xYourAddress', chain: 'base' } },
  ],
};

// ─── Chain config ─────────────────────────────────────────────────────────────

const CHAIN_IDS: Record<string, number> = {
  ethereum:  1,
  arbitrum:  42161,
  base:      8453,
  optimism:  10,
  polygon:   137,
  avalanche: 43114,
  bnb:       56,
  gnosis:    100,
  scroll:    534352,
  metis:     1088,
  xlayer:    196,
};

// Known pool addresses for common chains (lowercase)
const POOL_ADDRESSES: Record<number, string> = {
  1:      '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',  // Ethereum
  42161:  '0x794a61358d6845594f94dc1db02a252b5b4814ad',  // Arbitrum
  8453:   '0xe20fcbdbffc4dd138ce8b2e6fbb6cb49777ad64d',  // Base
  10:     '0x794a61358d6845594f94dc1db02a252b5b4814ad',  // Optimism
  137:    '0x794a61358d6845594f94dc1db02a252b5b4814ad',  // Polygon
  43114:  '0x794a61358d6845594f94dc1db02a252b5b4814ad',  // Avalanche
  196:    '0x0bde0b58e8e6218c63c9b7b9c7a3adb8a3f73cb7',  // XLayer (Aave v3.6, launched 2026-03-30)
};

// Aave v3 Pool function selectors
const AAVE_SEL = {
  supply:   '617ba037',  // supply(address,uint256,address,uint16)
  withdraw: '69328dec',  // withdraw(address,uint256,address)
  borrow:   'a415bcad',  // borrow(address,uint256,uint256,uint16,address)
  repay:    '573ade81',  // repay(address,uint256,uint256,address)
  approve:  '095ea7b3',  // ERC20 approve(address,uint256)
} as const;

// Well-known token addresses per chain for Aave
const AAVE_TOKENS: Record<number, Record<string, { address: string; decimals: number }>> = {
  1: {
    ETH:  { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6  },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6  },
    DAI:  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
    WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8  },
    LINK: { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
    AAVE: { address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18 },
  },
  42161: {
    ETH:  { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6  },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6  },
    DAI:  { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    WBTC: { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8  },
    ARB:  { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  },
  8453: {
    ETH:   { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    WETH:  { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    USDC:  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6  },
    cbBTC: { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8  },
    cbETH: { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
  },
  10: {
    ETH:  { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6  },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6  },
    DAI:  { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    WBTC: { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8  },
    OP:   { address: '0x4200000000000000000000000000000000000042', decimals: 18 },
  },
  137: {
    MATIC:  { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
    WMATIC: { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
    ETH:    { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    WETH:   { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    USDC:   { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6  },
    USDT:   { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6  },
    DAI:    { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
    WBTC:   { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8  },
  },
};

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x'))
    return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}

function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * (10n ** BigInt(decimals))
       + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
}

function resolveAaveToken(symbol: string, chainId: number): { address: string; decimals: number } {
  if (/^0x[0-9a-fA-F]{40}$/.test(symbol)) return { address: symbol, decimals: 18 };
  const registry = AAVE_TOKENS[chainId];
  const entry = registry?.[symbol.toUpperCase()];
  if (!entry) {
    const supported = registry ? Object.keys(registry).join(', ') : 'none';
    throw new Error(`Unknown token "${symbol}" on chain ${chainId}. Supported: ${supported}`);
  }
  return entry;
}

const AAVE_GQL = 'https://api.v3.aave.com/graphql';

async function gql(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(AAVE_GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Aave GraphQL ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Aave GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

function resolveChainId(chain: string): number {
  const id = CHAIN_IDS[chain?.toLowerCase() ?? 'ethereum'];
  if (!id) throw new Error(`Unsupported chain: ${chain}. Supported: ${Object.keys(CHAIN_IDS).join(', ')}`);
  return id;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function actionGetMarkets(): Promise<SkillExecutionResult> {
  const data = await gql(`{
    markets(request: { chainIds: [1, 42161, 8453, 10, 137, 43114, 56, 100, 534352, 1088] }) {
      name
      address
      chain { chainId name }
      totalMarketSize
      totalAvailableLiquidity
    }
  }`);

  const markets = (data.markets ?? []).map((m: any) => ({
    name:               m.name,
    chain:              m.chain?.name,
    chain_id:           m.chain?.chainId,
    pool_address:       m.address,
    total_market_size:  m.totalMarketSize,
    available_liquidity: m.totalAvailableLiquidity,
  }));

  const total = markets.reduce((sum: number, m: any) => sum + parseFloat(m.total_market_size ?? '0'), 0);

  return {
    success: true,
    output: {
      platform:     'Aave v3',
      market_count: markets.length,
      total_tvl_usd: total.toFixed(0),
      markets,
      _note: 'total_market_size = TVL in USD. Use get_reserves with chain= to see individual asset rates.',
    },
  };
}

async function actionGetReserves(input: any): Promise<SkillExecutionResult> {
  const { chain = 'ethereum', asset } = input;
  const chainId = resolveChainId(chain);

  const data = await gql(`{
    markets(request: { chainIds: [${chainId}] }) {
      name
      address
      totalMarketSize
      reserves {
        underlyingToken { symbol name address }
        usdExchangeRate
        isFrozen
        isPaused
        supplyInfo {
          apy { formatted }
          total { value }
          supplyCap { usd }
          canBeCollateral
          maxLTV { value }
          liquidationThreshold { value }
        }
        borrowInfo {
          apy { formatted }
          utilizationRate { formatted }
          total { amount { value } usd }
          availableLiquidity { usd }
          borrowCap { usd }
        }
      }
    }
  }`);

  const market = (data.markets ?? [])[0];
  if (!market) return { success: false, error: `No Aave market found on ${chain}` };

  let reserves = (market.reserves ?? []).map((r: any) => ({
    asset:               r.underlyingToken?.symbol,
    asset_name:          r.underlyingToken?.name,
    address:             r.underlyingToken?.address,
    price_usd:           r.usdExchangeRate,
    supply_apy:          r.supplyInfo?.apy?.formatted ? r.supplyInfo.apy.formatted + '%' : null,
    borrow_apy:          r.borrowInfo?.apy?.formatted ? r.borrowInfo.apy.formatted + '%' : null,
    utilization:         r.borrowInfo?.utilizationRate?.formatted ? r.borrowInfo.utilizationRate.formatted + '%' : null,
    total_supplied_usd:  r.supplyInfo?.total?.value
      ? (parseFloat(r.supplyInfo.total.value) * parseFloat(r.usdExchangeRate ?? '0')).toFixed(0)
      : null,
    total_borrowed_usd:  r.borrowInfo?.total?.usd ?? null,
    available_liquidity: r.borrowInfo?.availableLiquidity?.usd ?? null,
    supply_cap_usd:      r.supplyInfo?.supplyCap?.usd ?? null,
    borrow_cap_usd:      r.borrowInfo?.borrowCap?.usd ?? null,
    can_be_collateral:   r.supplyInfo?.canBeCollateral,
    max_ltv:             r.supplyInfo?.maxLTV?.value
      ? (parseFloat(r.supplyInfo.maxLTV.value) * 100).toFixed(0) + '%'
      : null,
    liquidation_threshold: r.supplyInfo?.liquidationThreshold?.value
      ? (parseFloat(r.supplyInfo.liquidationThreshold.value) * 100).toFixed(0) + '%'
      : null,
    is_frozen:           r.isFrozen,
    is_paused:           r.isPaused,
    borrowing_enabled:   !!r.borrowInfo,
  }));

  // Filter by asset symbol if provided
  if (asset) {
    const assetUpper = asset.toUpperCase();
    reserves = reserves.filter((r: any) =>
      r.asset?.toUpperCase().includes(assetUpper) || r.asset_name?.toUpperCase().includes(assetUpper)
    );
  }

  return {
    success: true,
    output: {
      platform:          'Aave v3',
      market:            market.name,
      chain,
      total_tvl_usd:     market.totalMarketSize,
      reserve_count:     reserves.length,
      reserves,
      _note: 'supply_apy/borrow_apy are annual percentages. utilization = borrowed / supplied. Frozen/paused assets cannot be used.',
    },
  };
}

async function actionGetUserAccount(input: any): Promise<SkillExecutionResult> {
  const { address, chain = 'ethereum' } = input;
  if (!address) return { success: false, error: 'address is required (EVM address, 0x...)' };

  const chainId = resolveChainId(chain);
  const marketAddr = POOL_ADDRESSES[chainId];

  // If we don't have a known address, fetch it first
  let poolAddress = marketAddr;
  if (!poolAddress) {
    const mData = await gql(`{ markets(request: { chainIds: [${chainId}] }) { address } }`);
    poolAddress = mData.markets?.[0]?.address;
    if (!poolAddress) return { success: false, error: `No Aave market found on ${chain}` };
  }

  const data = await gql(
    `query UserAccount($market: EvmAddress!, $user: EvmAddress!, $chainId: Int!) {
      userMarketState(request: { market: $market, user: $user, chainId: $chainId }) {
        netWorth
        netAPY { formatted }
        healthFactor
        totalCollateralBase
        totalDebtBase
        availableBorrowsBase
        ltv { formatted }
        isInIsolationMode
        eModeEnabled
      }
    }`,
    { market: poolAddress.toLowerCase(), user: address.toLowerCase(), chainId }
  );

  const state = data.userMarketState;
  if (!state) return { success: false, error: 'No account data found (address may not have used Aave on this chain)' };

  return {
    success: true,
    output: {
      platform:           'Aave v3',
      address,
      chain,
      net_worth_usd:      state.netWorth,
      net_apy:            state.netAPY?.formatted ? state.netAPY.formatted + '%' : null,
      health_factor:      state.healthFactor ?? 'N/A (no borrows)',
      total_collateral:   state.totalCollateralBase,
      total_debt:         state.totalDebtBase,
      available_borrows:  state.availableBorrowsBase,
      ltv:                state.ltv?.formatted ? state.ltv.formatted + '%' : null,
      in_isolation_mode:  state.isInIsolationMode,
      emode_enabled:      state.eModeEnabled,
      _note: 'health_factor < 1.0 means liquidatable. Values in USD. Use get_user_supplies/borrows for position details.',
    },
  };
}

async function actionGetUserSupplies(input: any): Promise<SkillExecutionResult> {
  const { address, chain = 'ethereum' } = input;
  if (!address) return { success: false, error: 'address is required (EVM address, 0x...)' };

  const chainId = resolveChainId(chain);
  const marketAddr = POOL_ADDRESSES[chainId];
  let poolAddress = marketAddr;
  if (!poolAddress) {
    const mData = await gql(`{ markets(request: { chainIds: [${chainId}] }) { address } }`);
    poolAddress = mData.markets?.[0]?.address;
    if (!poolAddress) return { success: false, error: `No Aave market found on ${chain}` };
  }

  const data = await gql(
    `query UserSupplies($markets: [MarketInput!]!, $user: EvmAddress!) {
      userSupplies(request: { markets: $markets, user: $user, orderBy: { balance: DESC } }) {
        currency { symbol address }
        balance { amount { value } usd }
        apy { formatted }
        isCollateral
        canBeCollateral
      }
    }`,
    {
      markets: [{ address: poolAddress.toLowerCase(), chainId }],
      user: address.toLowerCase(),
    }
  );

  const supplies = (data.userSupplies ?? []).filter((s: any) => parseFloat(s.balance?.amount?.value ?? '0') > 0);

  return {
    success: true,
    output: {
      platform:      'Aave v3',
      address,
      chain,
      supply_count:  supplies.length,
      supplies: supplies.map((s: any) => ({
        asset:            s.currency?.symbol,
        address:          s.currency?.address,
        amount:           s.balance?.amount?.value,
        value_usd:        s.balance?.usd,
        supply_apy:       s.apy?.formatted ? s.apy.formatted + '%' : null,
        is_collateral:    s.isCollateral,
        can_be_collateral: s.canBeCollateral,
      })),
      _note: 'These assets are earning supply APY and may be used as collateral.',
    },
  };
}

async function actionGetUserBorrows(input: any): Promise<SkillExecutionResult> {
  const { address, chain = 'ethereum' } = input;
  if (!address) return { success: false, error: 'address is required (EVM address, 0x...)' };

  const chainId = resolveChainId(chain);
  const marketAddr = POOL_ADDRESSES[chainId];
  let poolAddress = marketAddr;
  if (!poolAddress) {
    const mData = await gql(`{ markets(request: { chainIds: [${chainId}] }) { address } }`);
    poolAddress = mData.markets?.[0]?.address;
    if (!poolAddress) return { success: false, error: `No Aave market found on ${chain}` };
  }

  const data = await gql(
    `query UserBorrows($markets: [MarketInput!]!, $user: EvmAddress!) {
      userBorrows(request: { markets: $markets, user: $user, orderBy: { debt: DESC } }) {
        currency { symbol address }
        debt { amount { value } usd }
        apy { formatted }
      }
    }`,
    {
      markets: [{ address: poolAddress.toLowerCase(), chainId }],
      user: address.toLowerCase(),
    }
  );

  const borrows = (data.userBorrows ?? []).filter((b: any) => parseFloat(b.debt?.amount?.value ?? '0') > 0);

  return {
    success: true,
    output: {
      platform:     'Aave v3',
      address,
      chain,
      borrow_count: borrows.length,
      borrows: borrows.map((b: any) => ({
        asset:       b.currency?.symbol,
        address:     b.currency?.address,
        amount:      b.debt?.amount?.value,
        value_usd:   b.debt?.usd,
        borrow_apy:  b.apy?.formatted ? b.apy.formatted + '%' : null,
      })),
      _note: 'These assets are accruing borrow interest. Check health factor to monitor liquidation risk.',
    },
  };
}

// ─── Build TX actions ─────────────────────────────────────────────────────────

async function actionBuildSupplyTx(input: any): Promise<SkillExecutionResult> {
  const { token, amount, sender, chain = 'ethereum' } = input;
  if (!token)  return { success: false, error: 'token is required' };
  if (!amount) return { success: false, error: 'amount is required' };
  if (!sender) return { success: false, error: 'sender is required' };

  try {
    const chainId  = resolveChainId(chain);
    const poolAddr = POOL_ADDRESSES[chainId];
    if (!poolAddr) return { success: false, error: `No Aave pool found on ${chain}` };

    const tokenInfo = resolveAaveToken(token, chainId);
    const amountRaw = parseUnits(String(amount), tokenInfo.decimals);

    return {
      success: true,
      output: {
        transactions: [
          {
            to: tokenInfo.address,
            data: '0x' + AAVE_SEL.approve + p32(poolAddr) + p32(amountRaw),
            value: '0x0',
            description: `Approve ${amount} ${token.toUpperCase()} to Aave v3 Pool`,
          },
          {
            to: poolAddr,
            data: '0x' + AAVE_SEL.supply + p32(tokenInfo.address) + p32(amountRaw) + p32(sender) + p32(0n),
            value: '0x0',
            description: `Supply ${amount} ${token.toUpperCase()} to Aave v3 on ${chain}`,
          },
        ],
        token: token.toUpperCase(),
        amount,
        pool: poolAddr,
        chain,
        chain_id: chainId,
        note: 'Execute transactions in order. Supplied assets earn supply APY and can be used as collateral.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_supply_tx failed: ${err.message}` };
  }
}

async function actionBuildWithdrawTx(input: any): Promise<SkillExecutionResult> {
  const { token, amount, sender, chain = 'ethereum' } = input;
  if (!token)  return { success: false, error: 'token is required' };
  if (!amount) return { success: false, error: 'amount is required (use "max" to withdraw all)' };
  if (!sender) return { success: false, error: 'sender is required' };

  try {
    const chainId  = resolveChainId(chain);
    const poolAddr = POOL_ADDRESSES[chainId];
    if (!poolAddr) return { success: false, error: `No Aave pool found on ${chain}` };

    const tokenInfo = resolveAaveToken(token, chainId);
    const amountRaw = String(amount).toLowerCase() === 'max'
      ? (2n ** 256n) - 1n
      : parseUnits(String(amount), tokenInfo.decimals);

    return {
      success: true,
      output: {
        transactions: [
          {
            to: poolAddr,
            data: '0x' + AAVE_SEL.withdraw + p32(tokenInfo.address) + p32(amountRaw) + p32(sender),
            value: '0x0',
            description: `Withdraw ${String(amount) === 'max' ? 'all' : amount} ${token.toUpperCase()} from Aave v3 on ${chain}`,
          },
        ],
        token: token.toUpperCase(),
        amount: String(amount),
        pool: poolAddr,
        chain,
        chain_id: chainId,
        note: 'Withdrawal limited by active borrows and health factor.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_withdraw_tx failed: ${err.message}` };
  }
}

async function actionBuildBorrowTx(input: any): Promise<SkillExecutionResult> {
  const { token, amount, sender, chain = 'ethereum', rate_mode = 2 } = input;
  if (!token)  return { success: false, error: 'token is required' };
  if (!amount) return { success: false, error: 'amount is required' };
  if (!sender) return { success: false, error: 'sender is required' };

  try {
    const chainId  = resolveChainId(chain);
    const poolAddr = POOL_ADDRESSES[chainId];
    if (!poolAddr) return { success: false, error: `No Aave pool found on ${chain}` };

    const tokenInfo        = resolveAaveToken(token, chainId);
    const amountRaw        = parseUnits(String(amount), tokenInfo.decimals);
    const interestRateMode = BigInt(rate_mode); // 1=stable (deprecated), 2=variable

    return {
      success: true,
      output: {
        transactions: [
          {
            to: poolAddr,
            data: '0x' + AAVE_SEL.borrow
              + p32(tokenInfo.address) + p32(amountRaw)
              + p32(interestRateMode)  + p32(0n) + p32(sender),
            value: '0x0',
            description: `Borrow ${amount} ${token.toUpperCase()} from Aave v3 on ${chain} (variable rate)`,
          },
        ],
        token: token.toUpperCase(),
        amount,
        pool: poolAddr,
        chain,
        chain_id: chainId,
        rate_mode: interestRateMode === 2n ? 'variable' : 'stable',
        note: 'Requires sufficient collateral. Call get_user_account first to verify health factor.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_borrow_tx failed: ${err.message}` };
  }
}

async function actionBuildRepayTx(input: any): Promise<SkillExecutionResult> {
  const { token, amount, sender, chain = 'ethereum', repay_all = false, rate_mode = 2 } = input;
  if (!token)              return { success: false, error: 'token is required' };
  if (!repay_all && !amount) return { success: false, error: 'amount is required (or set repay_all: true)' };
  if (!sender)             return { success: false, error: 'sender is required' };

  try {
    const chainId  = resolveChainId(chain);
    const poolAddr = POOL_ADDRESSES[chainId];
    if (!poolAddr) return { success: false, error: `No Aave pool found on ${chain}` };

    const tokenInfo        = resolveAaveToken(token, chainId);
    const amountRaw        = repay_all ? (2n ** 256n) - 1n : parseUnits(String(amount), tokenInfo.decimals);
    const interestRateMode = BigInt(rate_mode);
    const displayAmount    = repay_all ? 'full balance' : String(amount);

    return {
      success: true,
      output: {
        transactions: [
          {
            to: tokenInfo.address,
            data: '0x' + AAVE_SEL.approve + p32(poolAddr) + p32(amountRaw),
            value: '0x0',
            description: `Approve ${token.toUpperCase()} to Aave v3 Pool for repayment`,
          },
          {
            to: poolAddr,
            data: '0x' + AAVE_SEL.repay
              + p32(tokenInfo.address) + p32(amountRaw)
              + p32(interestRateMode)  + p32(sender),
            value: '0x0',
            description: `Repay ${displayAmount} ${token.toUpperCase()} to Aave v3 on ${chain}`,
          },
        ],
        token: token.toUpperCase(),
        amount: displayAmount,
        pool: poolAddr,
        chain,
        chain_id: chainId,
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_repay_tx failed: ${err.message}` };
  }
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeAaveSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_markets':      return await actionGetMarkets();
      case 'get_reserves':     return await actionGetReserves(input);
      case 'get_user_account': return await actionGetUserAccount(input);
      case 'get_user_supplies': return await actionGetUserSupplies(input);
      case 'get_user_borrows':   return await actionGetUserBorrows(input);
      case 'build_supply_tx':   return await actionBuildSupplyTx(input);
      case 'build_withdraw_tx': return await actionBuildWithdrawTx(input);
      case 'build_borrow_tx':   return await actionBuildBorrowTx(input);
      case 'build_repay_tx':    return await actionBuildRepayTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_markets, get_reserves, get_user_account, get_user_supplies, get_user_borrows, build_supply_tx, build_withdraw_tx, build_borrow_tx, build_repay_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Aave skill' };
  }
}
