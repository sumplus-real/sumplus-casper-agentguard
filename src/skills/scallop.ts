/**
 * Scallop — Sui Lending Platform
 *
 * Scallop is the first Sui Foundation grant recipient and one of Sui's
 * leading lending platforms with $244M TVL. Features isolated markets,
 * sCoin yield tokens, and a points/rewards system.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: scallop.io
 */

import type { SkillExecutionResult } from '@/types/skill';
import { Scallop } from '@scallop-io/sui-scallop-sdk';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const SCALLOP_API = 'https://api.scallop.io';
const SUI_RPC     = 'https://fullnode.mainnet.sui.io:443';

// Asset decimals for Scallop
const ASSET_DECIMALS: Record<string, number> = {
  SUI: 9,
  USDC: 6,
  USDT: 6,
  WETH: 8,
  WBTC: 8,
  SCA: 9,
  AFSUI: 9,
  HASUI: 9,
  VSUI: 9,
  DEEP: 6,
};

async function apiFetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Scallop API ${res.status}`);
  return res.json();
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actionGetMarkets(): Promise<SkillExecutionResult> {
  // Scallop public market stats endpoint
  const data = await apiFetch(`${SCALLOP_API}/api/market`);
  const markets = (data.data ?? data.markets ?? data) as any[];

  const formatted = (Array.isArray(markets) ? markets : []).map((m: any) => ({
    asset:       m.coinName ?? m.symbol ?? m.asset,
    supply_apy:  m.supplyApy ?? m.supply_apy,
    borrow_apy:  m.borrowApy ?? m.borrow_apy,
    utilization: m.utilizationRate ?? m.utilization,
    tvl_usd:     m.tvl ?? m.totalSupplyUsd,
    total_supply: m.totalSupply ?? m.total_supply,
    total_borrow: m.totalBorrow ?? m.total_borrow,
    scoin:        m.sCoinType ? { scoin_type: m.sCoinType, exchange_rate: m.sCoinExchangeRate } : undefined,
  }));

  return {
    success: true,
    output: {
      protocol:     'Scallop',
      chain:        'sui',
      market_count: formatted.length,
      markets:      formatted,
    },
  };
}

async function actionGetMarket(input: any): Promise<SkillExecutionResult> {
  const { asset } = input;
  if (!asset) return { success: false, error: 'asset is required (e.g. SUI, USDC, WETH)' };

  const data = await apiFetch(`${SCALLOP_API}/api/market/${encodeURIComponent(asset.toLowerCase())}`);
  const m = data.data ?? data;

  return {
    success: true,
    output: {
      protocol:    'Scallop',
      asset:       m.coinName ?? asset,
      supply_apy:  m.supplyApy ?? m.supply_apy,
      borrow_apy:  m.borrowApy ?? m.borrow_apy,
      utilization: m.utilizationRate ?? m.utilization,
      tvl_usd:     m.tvl ?? m.totalSupplyUsd,
      ltv:         m.ltv ?? m.loanToValue,
      scoin: m.sCoinType
        ? { scoin_type: m.sCoinType, exchange_rate: m.sCoinExchangeRate }
        : undefined,
      chain: 'sui',
    },
  };
}

async function actionGetObligations(input: any): Promise<SkillExecutionResult> {
  const { address } = input;
  if (!address) return { success: false, error: 'address is required (Sui address 0x...)' };

  try {
    const scallop = new Scallop({ networkType: 'mainnet' });
    const query = await scallop.createScallopQuery();
    // Scallop query API: get obligation keys owned by the address
    const obligationKeys: any[] = await (query as any).getObligationKeys?.(address) ?? [];

    const obligations = obligationKeys.map((k: any) => ({
      obligation_key_id: k.keyId ?? k.id ?? k.objectId,
      obligation_id:     k.obligationId,
      account_owner:     k.owner ?? address,
    }));

    return {
      success: true,
      output: {
        protocol:         'Scallop',
        chain:            'sui',
        address,
        obligation_count: obligations.length,
        obligations,
        _note: obligations.length === 0
          ? 'No obligations found. An obligation is created on your first supply/borrow.'
          : 'Pass obligation_id + obligation_key_id to build_withdraw_tx / build_borrow_tx / build_repay_tx.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_obligations failed: ${err.message}` };
  }
}

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:       'Scallop',
      chain:      'sui',
      type:       'Lending & Borrowing',
      tvl_approx: '$244M',
      website:    'https://scallop.io',
      highlights: [
        'First Sui Foundation official grant recipient',
        'sCoin yield-bearing tokens (e.g. sSUI, sUSDC)',
        'Isolated pool architecture for risk management',
        'Scallop Points rewards program',
        'Built-in flash loan support',
      ],
      supported_assets: ['SUI', 'USDC', 'USDT', 'WETH', 'WBTC', 'SCA', 'afSUI', 'haSUI', 'vSUI', 'DEEP'],
      _todo: 'Supply, borrow, repay, withdraw, and sCoin mint/redeem — requires wallet signing',
    },
  };
}

// ─── Build TX actions ────────────────────────────────────────────────────────

async function actionBuildTx(action: string, input: any): Promise<SkillExecutionResult> {
  const { sender, asset, amount, obligation_id, obligation_key_id } = input;
  if (!sender) return { success: false, error: 'sender is required' };
  if (!asset)  return { success: false, error: 'asset is required (e.g. SUI, USDC)' };
  if (!amount) return { success: false, error: 'amount is required (human-readable, e.g. "10.5")' };

  const assetUpper = asset.toUpperCase();
  const decimals = ASSET_DECIMALS[assetUpper] ?? 9;
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount must be a positive number string, e.g. "10.5"' };
  }
  const amountBaseUnits = Math.round(parsedAmount * 10 ** decimals);

  const scallop = new Scallop({ networkType: 'mainnet' });
  const scallopBuilder = await scallop.createScallopBuilder();
  const txb = scallopBuilder.createTxBlock();
  txb.setSender(sender);

  const poolCoinName = assetUpper.toLowerCase(); // Scallop uses lowercase names

  try {
    switch (action) {
      case 'build_supply_tx': {
        const sCoin = await txb.depositQuick(amountBaseUnits, poolCoinName);
        txb.transferObjects([sCoin], sender);
        break;
      }
      case 'build_withdraw_tx': {
        // Scallop lending uses the sCoin model: supply mints sCoin, withdraw burns sCoin.
        // There is no obligation for pure lending — obligations only exist for collateral+borrow.
        // withdrawQuick(amount, coinName) resolves the user's sCoin/marketCoin internally.
        const withdrawnCoin = await txb.withdrawQuick(amountBaseUnits, poolCoinName);
        txb.transferObjects([withdrawnCoin], sender);
        break;
      }
      case 'build_borrow_tx': {
        if (!obligation_id || !obligation_key_id) {
          return { success: false, error: 'obligation_id and obligation_key_id required for borrow. Get them via get_obligations action.' };
        }
        const borrowedCoin = await txb.borrowQuick(amountBaseUnits, poolCoinName, obligation_id, obligation_key_id);
        txb.transferObjects([borrowedCoin], sender);
        break;
      }
      case 'build_repay_tx': {
        if (!obligation_id) {
          return { success: false, error: 'obligation_id required for repay. Get it via get_obligations action.' };
        }
        // repayQuick's selectCoin internally transfers leftover back to sender; no return value to transfer
        await txb.repayQuick(amountBaseUnits, poolCoinName, obligation_id);
        break;
      }
    }
  } catch (err: any) {
    return { success: false, error: `Scallop ${action} failed: ${err.message}` };
  }

  // ScallopTxBlock extends SuiTxBlock which holds .txBlock (raw Transaction)
  const rawTx = (txb as any).txBlock as any;
  let txBytes: Uint8Array;
  try {
    rawTx.setGasBudget(100_000_000); // skip dry-run — wallet can re-adjust if needed
    const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
    txBytes = await rawTx.build({ client });
  } catch (err: any) {
    return { success: false, error: `Scallop PTB build failed: ${err.message}` };
  }

  const verbMap: Record<string, string> = {
    build_supply_tx: 'Supply',
    build_withdraw_tx: 'Withdraw',
    build_borrow_tx: 'Borrow',
    build_repay_tx: 'Repay',
  };

  return {
    success: true,
    output: {
      tx_bytes: Buffer.from(txBytes).toString('base64'),
      sender,
      gas_budget: '100000000',
      description: `${verbMap[action]} ${parsedAmount} ${assetUpper} on Scallop`,
      usage: 'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer to sign and submit.',
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const SCALLOP_SKILL_METADATA = {
  name: 'Scallop',
  description:
    'Scallop is a leading lending protocol on Sui (first Sui Foundation grant recipient, $244M+ TVL). ' +
    'Query live lending markets, supply/borrow APY, and protocol overview. ' +
    'Build real Sui PTBs for supply, withdraw, borrow, and repay transactions (returns base64 tx_bytes). ' +
    'Supports sCoin yield-bearing tokens (e.g. sSUI, sUSDC) and isolated pool architecture.',
  category: 'DeFi',
  version: '1.1.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['scallop', 'sui', 'lending', 'borrowing', 'scoin', 'defi'],
  external_url: 'https://app.scallop.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/scallop?w=48&h=48',
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
          'get_obligations',
          'build_supply_tx',
          'build_withdraw_tx',
          'build_borrow_tx',
          'build_repay_tx',
        ],
        description:
          'get_markets: all lending markets with APY and utilization. ' +
          'get_market: stats for one asset (requires asset). ' +
          'get_protocol_info: Scallop overview, features, and supported assets. ' +
          'get_obligations: list user\'s Scallop obligations (only relevant for collateral+borrow; pure lending uses the sCoin model with no obligation). Use before build_borrow_tx / build_repay_tx. ' +
          'build_supply_tx: build PTB to supply asset (mints sCoin receipt). Requires sender, asset, amount. ' +
          'build_withdraw_tx: build PTB to withdraw supplied asset (burns sCoin from sender\'s wallet). Requires sender, asset, amount. No obligation needed. ' +
          'build_borrow_tx: build PTB to borrow asset from Scallop (requires sender, asset, amount, obligation_id, obligation_key_id). ' +
          'build_repay_tx: build PTB to repay borrowed asset (requires sender, asset, amount, obligation_id).',
      },
      asset: {
        type: 'string',
        description: 'Asset symbol (e.g. SUI, USDC, USDT, WETH, SCA). Required for get_market and build_*_tx actions.',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x...) of the transaction sender. Required for build_*_tx actions.',
      },
      address: {
        type: 'string',
        description: 'Sui wallet address (0x...). Required for get_obligations.',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount (e.g. "10.5" for 10.5 SUI). Required for build_*_tx actions.',
      },
      obligation_id: {
        type: 'string',
        description: 'Sui object ID of the Scallop Obligation. Required for build_borrow_tx, build_repay_tx. Get it via get_obligations.',
      },
      obligation_key_id: {
        type: 'string',
        description: 'Sui object ID of the ObligationKey (proves ownership). Required for build_borrow_tx. Get it via get_obligations.',
      },
    },
  },
  usage_examples: [
    { title: 'List all markets', input: { action: 'get_markets' } },
    { title: 'USDC lending rates', input: { action: 'get_market', asset: 'USDC' } },
    { title: 'Protocol overview', input: { action: 'get_protocol_info' } },
    { title: 'Supply SUI to Scallop', input: { action: 'build_supply_tx', sender: '0xYOUR_ADDRESS', asset: 'SUI', amount: '10' } },
    { title: 'Borrow USDC from Scallop', input: { action: 'build_borrow_tx', sender: '0xYOUR_ADDRESS', asset: 'USDC', amount: '100' } },
    { title: 'Repay USDC debt', input: { action: 'build_repay_tx', sender: '0xYOUR_ADDRESS', asset: 'USDC', amount: '50' } },
    { title: 'Withdraw SUI from Scallop', input: { action: 'build_withdraw_tx', sender: '0xYOUR_ADDRESS', asset: 'SUI', amount: '5' } },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeScallopSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_markets':       return await actionGetMarkets();
      case 'get_market':        return await actionGetMarket(input);
      case 'get_protocol_info': return await actionGetProtocolInfo();
      case 'get_obligations':   return await actionGetObligations(input);
      case 'build_supply_tx':
      case 'build_withdraw_tx':
      case 'build_borrow_tx':
      case 'build_repay_tx':    return await actionBuildTx(action, input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_markets, get_market, get_protocol_info, get_obligations, build_supply_tx, build_withdraw_tx, build_borrow_tx, build_repay_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Scallop skill' };
  }
}
