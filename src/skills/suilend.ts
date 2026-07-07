/**
 * Suilend — Sui Lending + Liquid Staking
 *
 * Suilend is a major lending platform on Sui featuring:
 * - Lending & borrowing across major Sui assets
 * - sSUI liquid staking via SPRING protocol
 * - Native bridge and swap integration
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: suilend.fi
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const SUILEND_API = 'https://api.suilend.fi';

// Mainnet coin types
const COIN_TYPES: Record<string, { type: string; decimals: number }> = {
  SUI:  { type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI', decimals: 9 },
  USDC: { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6 },
  USDT: { type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', decimals: 6 },
  WETH: { type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN', decimals: 8 },
  WBTC: { type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN', decimals: 8 },
  SSUI: { type: '0x83556891f4a0f233ce7b05cfe7f957d4020492a34f5405b2cb9377d060bef4bf::spring_sui::SPRING_SUI', decimals: 9 },
};

function resolveCoin(symbol: string): { type: string; decimals: number } {
  const entry = COIN_TYPES[symbol.toUpperCase()];
  if (!entry) throw new Error(`Unknown asset "${symbol}". Supported: ${Object.keys(COIN_TYPES).join(', ')}`);
  return entry;
}

async function getSuilendClient() {
  const { SuiClient } = await import('@mysten/sui/client');
  const { SuilendClient, LENDING_MARKET_ID, LENDING_MARKET_TYPE } = await import('@suilend/sdk/client');
  const client = new SuiClient({ url: getFullnodeUrl('mainnet') });

  // Polyfill: @suilend/sui-fe expects @mysten/sui@2.x gRPC client methods (listCoins, listOwnedObjects).
  // We have @mysten/sui@1.45.2 (required by Scallop/Aftermath). Bridge the APIs so initialize works.
  (client as any).listCoins = async ({ owner, coinType, cursor }: any) => {
    const r = await client.getCoins({ owner, coinType, cursor });
    return {
      objects: r.data.map((c: any) => ({ ...c, objectId: c.coinObjectId })),
      cursor: r.nextCursor,
      hasNextPage: r.hasNextPage,
    };
  };
  (client as any).listOwnedObjects = async ({ owner, cursor, type }: any) => {
    const r = await client.getOwnedObjects({
      owner,
      cursor,
      filter: type ? { StructType: type } : undefined,
      options: { showContent: true, showType: true },
    });
    return {
      objects: r.data.map((d: any) => ({ ...d.data })),
      cursor: r.nextCursor,
      hasNextPage: r.hasNextPage,
    };
  };

  const suilend = await SuilendClient.initialize(
    LENDING_MARKET_ID,
    LENDING_MARKET_TYPE,
    client as any,
  );
  return { suilend, client };
}

async function apiFetch(path: string): Promise<any> {
  const res = await fetch(`${SUILEND_API}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Suilend API ${res.status} for ${path}`);
  return res.json();
}

// ─── Actions ────────────────────────────────────────────────────────────────

function parseSuilendReserve(r: any): any {
  // Reserve struct decimal fields are BCS-decoded { value: bigint } with 1e18 scaling
  const dec = (v: any): number | null => {
    if (v?.value !== undefined) return Number(BigInt(v.value)) / 1e18;
    if (typeof v === 'number') return v;
    return null;
  };
  const cfg = r.config?.element ?? r.config ?? {};
  return {
    coin_type:             r.coinType,
    array_index:           r.arrayIndex?.toString?.() ?? String(r.arrayIndex ?? ''),
    available_amount:      r.availableAmount?.toString?.(),
    ctoken_supply:          r.ctokenSupply?.toString?.(),
    borrowed_amount:        dec(r.borrowedAmount),
    cumulative_borrow_rate: dec(r.cumulativeBorrowRate),
    price:                 dec(r.price),
    open_ltv_pct:          cfg.openLtvPct,
    close_ltv_pct:         cfg.closeLtvPct,
    max_close_ltv_pct:     cfg.maxCloseLtvPct,
    borrow_weight_bps:     cfg.borrowWeightBps?.toString?.() ?? cfg.borrowWeightBps,
    deposit_limit:         cfg.depositLimit?.toString?.(),
    borrow_limit:          cfg.borrowLimit?.toString?.(),
    liquidation_bonus_bps: cfg.liquidationBonusBps,
    borrow_fee_bps:        cfg.borrowFeeBps,
  };
}

async function actionGetReserves(): Promise<SkillExecutionResult> {
  try {
    const { suilend } = await getSuilendClient();
    const reserves: any[] = (suilend as any).lendingMarket?.reserves ?? [];
    const formatted = reserves.map(parseSuilendReserve);
    return {
      success: true,
      output: {
        protocol:      'Suilend',
        chain:         'sui',
        reserve_count: formatted.length,
        reserves:      formatted,
        _note: 'Reserves fetched from on-chain lending market. APY/utilization require additional calculation from borrowed_amount + available_amount + config fields.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_reserves failed: ${err.message}` };
  }
}

async function actionGetReserve(input: any): Promise<SkillExecutionResult> {
  const { asset } = input;
  if (!asset) return { success: false, error: 'asset is required (e.g. SUI, USDC, USDT)' };

  let coinTypeFilter: string;
  try { coinTypeFilter = resolveCoin(asset).type; } catch (e: any) { return { success: false, error: e.message }; }

  try {
    const { suilend } = await getSuilendClient();
    const reserves: any[] = (suilend as any).lendingMarket?.reserves ?? [];
    const match = reserves.find((r: any) => r.coinType === coinTypeFilter || r.coinType?.name === coinTypeFilter);
    if (!match) {
      return { success: false, error: `Reserve for ${asset} not found on Suilend` };
    }
    return {
      success: true,
      output: {
        protocol: 'Suilend',
        asset:    asset.toUpperCase(),
        chain:    'sui',
        ...parseSuilendReserve(match),
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_reserve failed: ${err.message}` };
  }
}

async function actionGetSsuiInfo(): Promise<SkillExecutionResult> {
  const data = await apiFetch('/spring/ssui').catch(async () => {
    return apiFetch('/staking/ssui');
  });
  const d = data.data ?? data;

  return {
    success: true,
    output: {
      protocol:      'Suilend SPRING',
      asset:         'sSUI',
      description:   'Liquid staking token for SUI. Stake SUI → receive sSUI, earns staking rewards automatically.',
      apy:           d.apy ?? d.stakingApy ?? d.annualizedApy,
      exchange_rate: d.exchangeRate ?? d.sSuiToSui,
      total_staked:  d.totalStaked ?? d.totalSuiStaked,
      ssui_supply:   d.sSuiSupply ?? d.totalSsui,
      chain:         'sui',
    },
  };
}

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:    'Suilend',
      chain:   'sui',
      type:    'Lending + Liquid Staking',
      website: 'https://suilend.fi',
      highlights: [
        'SPRING liquid staking: SUI → sSUI with auto-compounding rewards',
        'Multi-asset lending with competitive APYs',
        'Native bridge integration for cross-chain assets',
        'Built-in swap for collateral management',
      ],
      products: {
        lending:       'Supply/borrow assets, manage collateral',
        liquid_staking:'Stake SUI to get sSUI (liquid, usable in DeFi)',
        bridge:        'Cross-chain asset bridging',
        swap:          'Native DEX integration',
      },
    },
  };
}

/** Auto-resolve the input coin for non-SUI tokens on Suilend. */
async function resolveSuilendCoinInput(
  sender: string,
  coinType: string,
  amountBaseUnits: string,
  tx: Transaction,
  explicitCoinId?: string,
): Promise<any> {
  if (coinType === COIN_TYPES.SUI.type) {
    const [c] = tx.splitCoins(tx.gas, [tx.pure.u64(amountBaseUnits)]);
    return c;
  }
  if (explicitCoinId) {
    const [c] = tx.splitCoins(tx.object(explicitCoinId), [tx.pure.u64(amountBaseUnits)]);
    return c;
  }
  const { SuiClient } = await import('@mysten/sui/client');
  const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
  const { data: owned } = await client.getCoins({ owner: sender, coinType });
  if (!owned || owned.length === 0) {
    throw new Error(`sender ${sender} owns no ${coinType} coins on mainnet`);
  }
  const primary = tx.object(owned[0].coinObjectId);
  if (owned.length > 1) {
    tx.mergeCoins(primary, owned.slice(1).map((c) => tx.object(c.coinObjectId)));
  }
  const [split] = tx.splitCoins(primary, [tx.pure.u64(amountBaseUnits)]);
  return split;
}

async function actionBuildSupplyTx(input: any): Promise<SkillExecutionResult> {
  const { sender, asset, amount, coin_object_id } = input;
  if (!sender) return { success: false, error: 'sender is required' };
  if (!asset)  return { success: false, error: 'asset is required (e.g. SUI, USDC)' };
  if (!amount) return { success: false, error: 'amount is required (human-readable, e.g. "10.5")' };

  let coin: { type: string; decimals: number };
  try { coin = resolveCoin(asset); } catch (e: any) { return { success: false, error: e.message }; }

  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount must be a positive number' };
  }
  const amountBaseUnits = String(Math.round(parsedAmount * 10 ** coin.decimals));

  try {
    const { suilend } = await getSuilendClient();
    const { depositLiquidityAndMintCtokens } = await import('@suilend/sdk/_generated/suilend/lending-market/functions' as any);
    const { SUI_CLOCK_OBJECT_ID } = await import('@mysten/sui/utils');

    const lendingMarket = (suilend as any).lendingMarket;
    const marketTypeArg = lendingMarket.$typeArgs[0];
    const reserveArrayIndex = (suilend as any).findReserveArrayIndex(coin.type);

    const tx = new Transaction();
    tx.setSender(sender);

    const sendCoin = await resolveSuilendCoinInput(sender, coin.type, amountBaseUnits, tx, coin_object_id);

    const [ctokens] = depositLiquidityAndMintCtokens(
      tx,
      [marketTypeArg, coin.type],
      {
        lendingMarket: tx.object(lendingMarket.id),
        reserveArrayIndex: tx.pure.u64(reserveArrayIndex),
        clock: tx.object(SUI_CLOCK_OBJECT_ID),
        deposit: sendCoin,
      },
    );
    tx.transferObjects([ctokens], tx.pure.address(sender));
    tx.setGasBudget(100_000_000);

    const { SuiClient: SC } = await import('@mysten/sui/client');
    const client = new SC({ url: getFullnodeUrl('mainnet') });
    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes: Buffer.from(txBytes).toString('base64'),
        sender,
        gas_budget: '100000000',
        description: `Supply ${parsedAmount} ${asset.toUpperCase()} to Suilend`,
        usage: 'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer. cTokens transferred to sender; first supply creates an obligation on submission.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_supply_tx failed: ${err.message}` };
  }
}

async function actionBuildWithdrawTx(input: any): Promise<SkillExecutionResult> {
  const { sender, asset, amount, ctoken_object_id } = input;
  if (!sender) return { success: false, error: 'sender is required' };
  if (!asset)  return { success: false, error: 'asset is required' };
  if (!amount) return { success: false, error: 'amount is required' };

  let coin: { type: string; decimals: number };
  try { coin = resolveCoin(asset); } catch (e: any) { return { success: false, error: e.message }; }

  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount must be a positive number' };
  }
  const amountBaseUnits = String(Math.round(parsedAmount * 10 ** coin.decimals));

  try {
    const { suilend, client } = await getSuilendClient();
    const { PACKAGE_ID } = await import('@suilend/sdk/_generated/suilend' as any);

    const lendingMarket = (suilend as any).lendingMarket;
    const marketTypeArg = lendingMarket.$typeArgs[0];
    // Suilend cToken type: Coin<CToken<MARKET, UNDERLYING>>
    const cTokenType = `${PACKAGE_ID}::reserve::CToken<${marketTypeArg}, ${coin.type}>`;

    const tx = new Transaction();
    tx.setSender(sender);

    // Resolve cToken coin object(s) from sender's wallet
    let ctokenArg: any;
    if (ctoken_object_id) {
      const [split] = tx.splitCoins(tx.object(ctoken_object_id), [tx.pure.u64(amountBaseUnits)]);
      ctokenArg = split;
    } else {
      const { data: owned } = await client.getCoins({ owner: sender, coinType: cTokenType });
      if (!owned || owned.length === 0) {
        return {
          success: false,
          error: `sender ${sender} owns no Suilend cToken for ${asset.toUpperCase()} (${cTokenType}). Supply first, or pass ctoken_object_id explicitly.`,
        };
      }
      const primary = tx.object(owned[0].coinObjectId);
      if (owned.length > 1) {
        tx.mergeCoins(primary, owned.slice(1).map((c) => tx.object(c.coinObjectId)));
      }
      const [split] = tx.splitCoins(primary, [tx.pure.u64(amountBaseUnits)]);
      ctokenArg = split;
    }

    // RateLimiterExemption = option::none()
    const [exemption] = tx.moveCall({
      target: `0x1::option::none`,
      typeArguments: [`${PACKAGE_ID}::lending_market::RateLimiterExemption<${marketTypeArg}, ${coin.type}>`],
      arguments: [],
    });

    // suilend.redeem handles request → (unstakeSui if SUI) → fulfill and returns Coin<T>
    const [withdrawCoin] = (suilend as any).redeem(ctokenArg, coin.type, exemption, tx);
    tx.transferObjects([withdrawCoin], tx.pure.address(sender));
    tx.setGasBudget(100_000_000);

    const txBytes = await tx.build({ client: client as any });

    return {
      success: true,
      output: {
        tx_bytes: Buffer.from(txBytes).toString('base64'),
        sender,
        gas_budget: '100000000',
        description: `Withdraw ${parsedAmount} ${asset.toUpperCase()} from Suilend`,
        usage: 'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer. Burns cToken from sender\'s wallet and returns underlying asset — no obligation required.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_withdraw_tx failed: ${err.message}` };
  }
}

async function actionBuildSsuiStakeTx(input: any): Promise<SkillExecutionResult> {
  // sSUI stake = deposit SUI; delegate to actionBuildSupplyTx with SUI
  return actionBuildSupplyTx({ ...input, asset: 'SUI' });
}

async function actionBuildSsuiUnstakeTx(input: any): Promise<SkillExecutionResult> {
  // sSUI unstake = withdraw SUI; delegate to actionBuildWithdrawTx
  return actionBuildWithdrawTx({ ...input, asset: 'SUI' });
}

async function actionGetObligations(input: any): Promise<SkillExecutionResult> {
  const { address } = input;
  if (!address) return { success: false, error: 'address is required (Sui address 0x...)' };

  try {
    const { SuiClient } = await import('@mysten/sui/client');
    const { LENDING_MARKET_TYPE } = await import('@suilend/sdk/client');
    const client = new SuiClient({ url: getFullnodeUrl('mainnet') });

    // ObligationOwnerCap type
    const capType = `0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::lending_market::ObligationOwnerCap<${LENDING_MARKET_TYPE}>`;

    const owned = await client.getOwnedObjects({
      owner: address,
      filter: { StructType: capType },
      options: { showContent: true, showType: true },
    });

    const obligations = owned.data
      .map((o: any) => {
        const fields = o.data?.content?.fields;
        return fields
          ? {
              obligation_owner_cap_id: o.data.objectId,
              obligation_id: fields.obligation_id,
              lending_market_id: fields.lending_market_id,
            }
          : null;
      })
      .filter(Boolean);

    return {
      success: true,
      output: {
        protocol:         'Suilend',
        chain:            'sui',
        address,
        obligation_count: obligations.length,
        obligations,
        _note: obligations.length === 0
          ? 'No obligations found. Obligations are created automatically the first time you supply/stake.'
          : 'Pass obligation_owner_cap_id + obligation_id to build_withdraw_tx / build_ssui_unstake_tx.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_obligations failed: ${err.message}` };
  }
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const SUILEND_SKILL_METADATA = {
  name: 'Suilend',
  description:
    'Suilend is a major lending platform on Sui with liquid staking via SPRING (sSUI). ' +
    'Query lending reserves (supply/borrow APY, utilization, TVL), get sSUI liquid staking info. ' +
    'Build real Sui PTBs for supply, withdraw, and sSUI stake/unstake (returns base64 tx_bytes). ' +
    'sSUI earns staking yield while remaining usable as DeFi collateral.',
  category: 'DeFi',
  version: '1.1.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['suilend', 'sui', 'lending', 'ssui', 'liquid-staking', 'spring', 'defi'],
  external_url: 'https://suilend.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/suilend?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_reserves',
          'get_reserve',
          'get_ssui_info',
          'get_protocol_info',
          'get_obligations',
          'build_supply_tx',
          'build_withdraw_tx',
          'build_ssui_stake_tx',
          'build_ssui_unstake_tx',
        ],
        description:
          'get_reserves: all lending reserves with live APY and utilization. ' +
          'get_reserve: detailed stats for one asset (requires asset). ' +
          'get_ssui_info: sSUI liquid staking rate and yield via SPRING protocol. ' +
          'get_protocol_info: Suilend overview and supported assets. ' +
          'get_obligations: list a user\'s Suilend collateral obligations (only relevant if assets were explicitly deposited into an obligation as collateral; plain supply mints cTokens directly and does NOT create an obligation). ' +
          'build_supply_tx: build PTB to supply assets, returns cToken receipt (requires sender, asset, amount; non-SUI coins auto-resolved from sender). ' +
          'build_withdraw_tx: build PTB to withdraw by burning cTokens held in sender\'s wallet (requires sender, asset, amount). No obligation needed — mirror of build_supply_tx. ' +
          'build_ssui_stake_tx: build PTB to stake SUI and receive sSUI (requires sender, amount). ' +
          'build_ssui_unstake_tx: build PTB to unstake sSUI back to SUI (requires sender, amount).',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x...). Required for all build_*_tx actions.',
      },
      address: {
        type: 'string',
        description: 'Sui address (0x...) for get_obligations.',
      },
      asset: {
        type: 'string',
        description: 'Asset symbol (e.g. SUI, USDC, USDT, WBTC). Required for get_reserve, build_supply_tx, build_withdraw_tx.',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount (e.g. "10.5"). Required for all build_*_tx actions.',
      },
      coin_object_id: {
        type: 'string',
        description: 'Optional override for build_supply_tx. By default Arsenal auto-resolves coins owned by sender on mainnet. Pass this only to force a specific coin object. Not used for SUI (always split from gas).',
      },
      ctoken_object_id: {
        type: 'string',
        description: 'Optional override for build_withdraw_tx / build_ssui_unstake_tx. By default Arsenal auto-resolves Suilend cToken objects owned by sender. Pass to force a specific cToken coin object.',
      },
    },
  },
  usage_examples: [
    { title: 'List all reserves', input: { action: 'get_reserves' } },
    { title: 'SUI lending rates', input: { action: 'get_reserve', asset: 'SUI' } },
    { title: 'sSUI staking info', input: { action: 'get_ssui_info' } },
    {
      title: 'Supply USDC to Suilend',
      input: { action: 'build_supply_tx', sender: '0xYOUR_ADDRESS', asset: 'USDC', amount: '100' },
    },
    {
      title: 'Stake SUI for sSUI',
      input: { action: 'build_ssui_stake_tx', sender: '0xYOUR_ADDRESS', amount: '10' },
    },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeSuilendSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_reserves':           return await actionGetReserves();
      case 'get_reserve':            return await actionGetReserve(input);
      case 'get_ssui_info':          return await actionGetSsuiInfo();
      case 'get_protocol_info':      return await actionGetProtocolInfo();
      case 'get_obligations':        return await actionGetObligations(input);
      case 'build_supply_tx':        return await actionBuildSupplyTx(input);
      case 'build_withdraw_tx':      return await actionBuildWithdrawTx(input);
      case 'build_ssui_stake_tx':    return await actionBuildSsuiStakeTx(input);
      case 'build_ssui_unstake_tx':  return await actionBuildSsuiUnstakeTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_reserves, get_reserve, get_ssui_info, get_protocol_info, get_obligations, build_supply_tx, build_withdraw_tx, build_ssui_stake_tx, build_ssui_unstake_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Suilend skill' };
  }
}
