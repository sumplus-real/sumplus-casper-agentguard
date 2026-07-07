/**
 * NAVI Protocol — Sui Lending & Borrowing
 *
 * NAVI is Sui's largest native lending protocol with $450M+ market size.
 * Supports SUI, USDC, USDT, WETH, WBTC, haSUI, vSUI, CETUS, ETH, USDY (Ondo).
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Contracts (Sui mainnet):
 *   Package: 0xc8d7a1503dc2f9f5b05449a87d8733593e2f0f3ead7941608564a1d5154b7d08
 *   Storage: 0xbb4e2f4b6205c2e2a2db47aeb4f830796ec7c005f88537ee775986639bc442fe
 */

import type { SkillExecutionResult } from '@/types/skill';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import {
  depositCoin,
  withdrawCoin,
  borrowCoin,
  repayDebt,
  pool as naviPool,
} from 'navi-sdk';

/**
 * Auto-resolve a coin input of `coinType` owned by `sender` on mainnet.
 * Returns a TransactionArgument representing a freshly split coin of exactly `amount`.
 * For SUI: splits from gas. For others: queries sender's coins, merges if needed, splits amount.
 * Throws if the sender owns no coins of the given type.
 */
async function resolveCoinInput(
  sender: string,
  coinType: string,
  amount: number | string,
  txb: Transaction,
): Promise<any> {
  const isSui = coinType === '0x2::sui::SUI' || coinType.endsWith('::sui::SUI');
  if (isSui) {
    const [c] = txb.splitCoins(txb.gas, [txb.pure.u64(amount)]);
    return c;
  }
  const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
  const { data: owned } = await client.getCoins({ owner: sender, coinType });
  if (!owned || owned.length === 0) {
    throw new Error(`sender ${sender} owns no ${coinType} coins on mainnet`);
  }
  const primary = txb.object(owned[0].coinObjectId);
  if (owned.length > 1) {
    txb.mergeCoins(primary, owned.slice(1).map((c) => txb.object(c.coinObjectId)));
  }
  const [split] = txb.splitCoins(primary, [txb.pure.u64(amount)]);
  return split;
}

const NAVI_API = 'https://api-defi.naviprotocol.io';

// Map common asset symbols to NAVI pool keys
const NAVI_ASSET_MAP: Record<string, string> = {
  SUI: 'Sui',
  USDC: 'nUSDC',   // Circle native USDC on NAVI
  WUSDC: 'wUSDC',  // Wormhole USDC
  USDT: 'USDT',
  WETH: 'WETH',
  WBTC: 'WBTC',
  ETH: 'ETH',
  CETUS: 'CETUS',
  VSUI: 'vSui',
  HASUI: 'haSui',
  NAVX: 'NAVX',
  USDY: 'USDY',
  DEEP: 'DEEP',
  WAL: 'WAL',
};

async function apiFetch(path: string): Promise<any> {
  const res = await fetch(`${NAVI_API}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`NAVI API ${res.status} for ${path}`);
  return res.json();
}

// ─── Actions ────────────────────────────────────────────────────────────────

function parseNaviReserve(r: any): any {
  const totalSupply  = parseFloat(r.total_supply ?? '0');
  const totalBorrow  = parseFloat(r.total_borrow ?? '0');
  const price        = parseFloat(r.price ?? '0');
  return {
    asset:        r.symbol,
    coin_type:    r.coin_type,
    pool:         r.pool,
    supply_apy:   r.supply_rate,
    borrow_apy:   r.borrow_rate,
    utilization:  totalSupply > 0 ? ((totalBorrow / totalSupply) * 100).toFixed(2) + '%' : '0%',
    total_supply: r.total_supply,
    total_borrow: r.total_borrow,
    price_usd:    r.price,
    tvl_usd:      (totalSupply * price).toFixed(2),
    boosted_apy:  r.boosted,
    borrow_reward_apy: r.borrow_reward_apy,
    reward_tokens: r.rewardTokens,
  };
}

async function actionGetMarkets(): Promise<SkillExecutionResult> {
  const data = await apiFetch('/getIndexAssetData');
  // API returns an object with numeric string keys: { "0": {...}, "1": {...} }
  const reserves = Object.entries(data)
    .filter(([k]) => /^\d+$/.test(k))
    .map(([, v]) => v);

  const markets = reserves.map(parseNaviReserve);

  return {
    success: true,
    output: {
      protocol:     'NAVI Protocol',
      chain:        'sui',
      market_count: markets.length,
      markets,
      _note: 'supply_apy/borrow_apy are percentages. price_usd in USD. tvl_usd = total_supply × price_usd.',
    },
  };
}

async function actionGetMarket(input: any): Promise<SkillExecutionResult> {
  const { asset } = input;
  if (!asset) return { success: false, error: 'asset is required (e.g. SUI, USDC, USDY)' };

  const data = await apiFetch('/getIndexAssetData');
  const reserves = Object.entries(data)
    .filter(([k]) => /^\d+$/.test(k))
    .map(([, v]) => v as any);

  const needle = asset.toUpperCase();
  const match = reserves.find((r: any) =>
    r.symbol?.toUpperCase() === needle ||
    r.pool?.toUpperCase().includes(needle) ||
    r.coin_type === asset,
  );
  if (!match) {
    return { success: false, error: `Asset "${asset}" not found. Available: ${reserves.map(r => r.symbol).filter(Boolean).join(', ')}` };
  }

  return {
    success: true,
    output: {
      protocol: 'NAVI Protocol',
      chain:    'sui',
      ...parseNaviReserve(match),
    },
  };
}

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:        'NAVI Protocol',
      chain:       'sui',
      type:        'Lending & Borrowing',
      tvl_approx:  '$450M+',
      website:     'https://naviprotocol.io',
      highlights: [
        'Largest native lending protocol on Sui',
        'Supports Ondo USDY (real-world asset yield)',
        'haSUI and vSUI liquid staking collateral',
        'Isolated pools for long-tail assets',
      ],
      supported_assets: ['SUI', 'USDC', 'USDT', 'WETH', 'WBTC', 'haSUI', 'vSUI', 'CETUS', 'ETH', 'USDY'],
      // TODO: actual swap/borrow/supply transactions require wallet integration
      _todo: 'Supply, borrow, repay, and withdraw transactions — requires wallet signing',
    },
  };
}

// ─── Build TX actions ────────────────────────────────────────────────────────

async function actionNaviBuildTx(action: string, input: any): Promise<SkillExecutionResult> {
  const { sender, asset, amount } = input;
  if (!sender) return { success: false, error: 'sender is required' };
  if (!asset)  return { success: false, error: 'asset is required (e.g. SUI, USDC)' };
  if (!amount) return { success: false, error: 'amount is required (human-readable, e.g. "10.5")' };

  const assetUpper = asset.toUpperCase();
  const poolKey = NAVI_ASSET_MAP[assetUpper];
  if (!poolKey) {
    return {
      success: false,
      error: `Unknown asset "${asset}". Supported: ${Object.keys(NAVI_ASSET_MAP).join(', ')}`,
    };
  }

  const poolConfig = (naviPool as any)[poolKey];
  if (!poolConfig) {
    return { success: false, error: `NAVI pool config not found for ${poolKey}` };
  }

  const decimals: number = poolConfig.decimal ?? 9;
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount must be a positive number string, e.g. "10.5"' };
  }
  const amountBaseUnits = Math.round(parsedAmount * 10 ** decimals);

  const txb = new Transaction();
  txb.setSender(sender);

  // Optional explicit override: caller may pass coin_object_id to skip auto-resolution
  const explicitCoinId = input.coin_object_id;

  try {
    switch (action) {
      case 'build_supply_tx': {
        const coinObject = explicitCoinId
          ? txb.object(explicitCoinId)
          : await resolveCoinInput(sender, poolConfig.type, amountBaseUnits, txb);
        await depositCoin(txb, poolConfig, coinObject, amountBaseUnits);
        break;
      }
      case 'build_withdraw_tx': {
        const [coin] = await withdrawCoin(txb, poolConfig, amountBaseUnits);
        txb.transferObjects([coin], sender);
        break;
      }
      case 'build_borrow_tx': {
        const [coin] = await borrowCoin(txb, poolConfig, amountBaseUnits);
        txb.transferObjects([coin], sender);
        break;
      }
      case 'build_repay_tx': {
        const coinObject = explicitCoinId
          ? txb.object(explicitCoinId)
          : await resolveCoinInput(sender, poolConfig.type, amountBaseUnits, txb);
        await repayDebt(txb, poolConfig, coinObject, amountBaseUnits);
        break;
      }
    }
  } catch (err: any) {
    return { success: false, error: `NAVI ${action} failed: ${err.message}` };
  }

  const verbMap: Record<string, string> = {
    build_supply_tx: 'Supply',
    build_withdraw_tx: 'Withdraw',
    build_borrow_tx: 'Borrow',
    build_repay_tx: 'Repay',
  };

  let txBytes: Uint8Array;
  try {
    txb.setGasBudget(100_000_000); // skip dry-run — wallet can re-adjust if needed
    const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
    txBytes = await txb.build({ client });
  } catch (err: any) {
    return { success: false, error: `NAVI PTB build failed: ${err.message}` };
  }

  return {
    success: true,
    output: {
      tx_bytes: Buffer.from(txBytes).toString('base64'),
      sender,
      gas_budget: '100000000',
      description: `${verbMap[action]} ${parsedAmount} ${assetUpper} on NAVI Protocol`,
      usage: 'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer to sign and submit.',
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const NAVI_SKILL_METADATA = {
  name: 'NAVI Protocol',
  description:
    'NAVI is the leading lending & borrowing protocol on Sui ($450M+ market size). ' +
    'Query live market rates, supply/borrow APY, utilization, and TVL for all supported assets. ' +
    'Build real Sui PTBs for supply, withdraw, borrow, and repay (returns base64 tx_bytes). ' +
    'Also supports USDY (Ondo Finance yield-bearing stablecoin) as collateral.',
  category: 'DeFi',
  version: '1.1.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['navi', 'sui', 'lending', 'borrowing', 'defi', 'usdy', 'ondo'],
  external_url: 'https://app.naviprotocol.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/navi-protocol?w=48&h=48',
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
          'get_market',
          'get_protocol_info',
          'build_supply_tx',
          'build_withdraw_tx',
          'build_borrow_tx',
          'build_repay_tx',
        ],
        description:
          'get_markets: all lending markets with live APY and utilization. ' +
          'get_market: detailed stats for one asset (requires asset). ' +
          'get_protocol_info: NAVI overview, TVL, and supported assets. ' +
          'build_supply_tx: build PTB to supply asset to NAVI (requires sender, asset, amount). ' +
          'build_withdraw_tx: build PTB to withdraw supplied asset (requires sender, asset, amount). ' +
          'build_borrow_tx: build PTB to borrow asset from NAVI (requires sender, asset, amount). ' +
          'build_repay_tx: build PTB to repay borrowed asset (requires sender, asset, amount).',
      },
      asset: {
        type: 'string',
        description: 'Asset symbol (e.g. SUI, USDC, USDT, USDY). Required for get_market and build_*_tx actions.',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x...) of the transaction sender. Required for build_*_tx actions.',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount (e.g. "10.5" for 10.5 SUI). Required for build_*_tx actions.',
      },
      coin_object_id: {
        type: 'string',
        description: 'Optional override for build_supply_tx / build_repay_tx. By default Arsenal auto-resolves coins owned by sender. Pass this only if you need to force a specific coin object. Not used for SUI (always split from gas).',
      },
    },
  },
  usage_examples: [
    { title: 'List all markets', input: { action: 'get_markets' } },
    { title: 'SUI lending rates', input: { action: 'get_market', asset: 'SUI' } },
    { title: 'Protocol overview', input: { action: 'get_protocol_info' } },
    { title: 'Supply SUI to NAVI', input: { action: 'build_supply_tx', sender: '0xYOUR_ADDRESS', asset: 'SUI', amount: '10' } },
    { title: 'Borrow USDC from NAVI', input: { action: 'build_borrow_tx', sender: '0xYOUR_ADDRESS', asset: 'USDC', amount: '100' } },
    { title: 'Repay USDC debt', input: { action: 'build_repay_tx', sender: '0xYOUR_ADDRESS', asset: 'USDC', amount: '50' } },
    { title: 'Withdraw SUI from NAVI', input: { action: 'build_withdraw_tx', sender: '0xYOUR_ADDRESS', asset: 'SUI', amount: '5' } },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeNaviSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_markets':     return await actionGetMarkets();
      case 'get_market':      return await actionGetMarket(input);
      case 'get_protocol_info': return await actionGetProtocolInfo();
      case 'build_supply_tx':
      case 'build_withdraw_tx':
      case 'build_borrow_tx':
      case 'build_repay_tx':  return await actionNaviBuildTx(action, input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_markets, get_market, get_protocol_info, build_supply_tx, build_withdraw_tx, build_borrow_tx, build_repay_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in NAVI skill' };
  }
}
