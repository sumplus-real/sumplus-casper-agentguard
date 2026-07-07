/**
 * Official Skill: Bluefin Ember Protocol
 * Skill UUID: e3b7f1a2-8c4d-4e9f-b5a6-3d2c1e0f7b8a
 *
 * Ember Protocol is the first Structured Vaults product on Sui, incubated by
 * Bluewater Labs (Bluefin). Non-custodial, permissionless vaults managed by
 * top-tier curators running DeFi, CeFi, and cross-chain strategies.
 *
 * Actions:
 *   list_vaults       — list all active vaults with live APY and TVL (real API)
 *   get_vault_info    — full details on a specific vault (real API)
 *   get_user_position — user's shares, value, and unrealised yield (@ember-finance/sdk)
 *   deposit           — build a Sui PTB to deposit into a vault (@ember-finance/sdk)
 *   withdraw          — build a Sui PTB to redeem vault shares (@ember-finance/sdk)
 *
 * Data source: https://vaults.api.sui-prod.bluefin.io/api/v2/vaults
 * SDK: @ember-finance/sdk v1.4.4
 * Package: 0x8cdf6979baabf8c2f972d1be70a2008b12a238232264f579d9f626e723c75a9d
 */

import type { SkillExecutionResult } from '@/types/skill';
import https from 'https';
import { EmberVaults } from '@ember-finance/sdk/index';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';

// ── Constants ─────────────────────────────────────────────────────────────────

const VAULTS_API = 'https://vaults.api.sui-prod.bluefin.io/api/v2/vaults';
const SUI_RPC   = getFullnodeUrl('mainnet');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const EMBER_PACKAGE_ID = '0x8cdf6979baabf8c2f972d1be70a2008b12a238232264f579d9f626e723c75a9d';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmberVaultRaw {
  id: string;
  name: string;
  longName: string;
  description: string;
  strategy: string;
  status: string;         // 'active' | 'beta' | ...
  category: string;
  tags: string[];
  external_url: 'https://trade.bluefin.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/bluefin?w=48&h=48',
  partner_verified: true,
  managers: { name: string }[];
  reportedApy: {
    reportedApyE9: string;  // APY * 1e9
    lendingApyE9: string;
    rewardApyE9: string;
    targetApyE9: string;
    updatedAt: string;
  };
  totalDepositsInUsdE9: string;    // all-chain TVL * 1e9
  maxDepositsAllowedE18: string;   // capacity * 1e18
  withdrawalPeriod: string;
  withdrawalPeriodDays: number;
  detailsByChain: {
    sui?: {
      address: string;             // Sui vault object ID — use this for PTB calls
      chainIdentifier: string;
      totalDepositsInUsdE9: string; // Sui-only TVL * 1e9
      baseDepositCoin: {
        symbol: string;
        decimals: number;
        coinType: string;
      };
      receiptCoin: {
        symbol: string;
        decimals: number;
        coinType: string;
      };
      maxDepositsAllowed: string;
    };
  };
  rateE18: string;  // current share price * 1e18
}

// ── API helper ────────────────────────────────────────────────────────────────

function fetchVaultsApi(): Promise<EmberVaultRaw[]> {
  return new Promise((resolve, reject) => {
    https.get(VAULTS_API, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse Ember API response')); }
      });
    }).on('error', reject);
  });
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** reportedApyE9 → human percent string e.g. "20.66%" */
function parseApy(apyE9: string): { pct: number; display: string } {
  const pct = Number(apyE9) / 1e9 * 100;
  return { pct, display: `${pct.toFixed(2)}%` };
}

/** totalDepositsInUsdE9 → USD number */
function parseTvl(tvlE9: string): number {
  return Number(tvlE9) / 1e9;
}

/** maxDepositsAllowedE18 → USD number */
function parseCapacity(e18: string): number {
  return Number(e18) / 1e18;
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function actionListVaults(input: any): Promise<SkillExecutionResult> {
  const { token, min_apy } = input ?? {};

  let raw: EmberVaultRaw[];
  try {
    raw = await fetchVaultsApi();
  } catch (err: any) {
    return { success: false, error: `Ember API unavailable: ${err.message}` };
  }

  // Filter: only Sui-deployed, active vaults
  let vaults = raw.filter(v =>
    v.status === 'active' &&
    v.detailsByChain?.sui !== undefined
  );

  if (token) {
    vaults = vaults.filter(v =>
      v.detailsByChain.sui?.baseDepositCoin.symbol.toLowerCase() === String(token).toLowerCase()
    );
  }

  if (min_apy !== undefined) {
    vaults = vaults.filter(v => parseApy(v.reportedApy.reportedApyE9).pct >= Number(min_apy));
  }

  const list = vaults
    .sort((a, b) =>
      parseApy(b.reportedApy.reportedApyE9).pct - parseApy(a.reportedApy.reportedApyE9).pct
    )
    .map(v => {
      const sui = v.detailsByChain.sui!;
      const tvl = parseTvl(sui.totalDepositsInUsdE9);
      const capacity = parseCapacity(v.maxDepositsAllowedE18);
      const apy = parseApy(v.reportedApy.reportedApyE9);
      return {
        id:           v.id,
        name:         v.name,
        token:        sui.baseDepositCoin.symbol,
        apy:          apy.display,
        tvl:          formatUsd(tvl),
        capacity:     formatUsd(capacity),
        utilisation:  capacity > 0 ? `${((tvl / capacity) * 100).toFixed(1)}%` : 'N/A',
        lock_period:  v.withdrawalPeriodDays > 0
                        ? `${v.withdrawalPeriodDays} day(s)`
                        : 'Flexible (no lock)',
        status:       v.status,
        curator:      v.managers.map(m => m.name).join(', ') || 'N/A',
        vault_object_id: sui.address,
      };
    });

  return {
    success: true,
    output: {
      vaults: list,
      count: list.length,
      chain: 'sui',
      platform: 'Bluefin Ember',
    },
  };
}

async function actionGetVaultInfo(input: any): Promise<SkillExecutionResult> {
  const { vault_id } = input ?? {};
  if (!vault_id) {
    return { success: false, error: 'vault_id is required. Use list_vaults to see available vault IDs.' };
  }

  let raw: EmberVaultRaw[];
  try {
    raw = await fetchVaultsApi();
  } catch (err: any) {
    return { success: false, error: `Ember API unavailable: ${err.message}` };
  }

  // Match by UUID id, vault name, or Sui object address
  const idLower = String(vault_id).toLowerCase();
  const v = raw.find(v =>
    v.id === vault_id ||
    v.name.toLowerCase().includes(idLower) ||
    v.detailsByChain?.sui?.address === vault_id
  );

  if (!v || !v.detailsByChain?.sui) {
    return {
      success: false,
      error: `Vault "${vault_id}" not found or not deployed on Sui. Use list_vaults to see available vaults.`,
    };
  }

  const sui = v.detailsByChain.sui;
  const tvl = parseTvl(sui.totalDepositsInUsdE9);
  const capacity = parseCapacity(v.maxDepositsAllowedE18);
  const apy = parseApy(v.reportedApy.reportedApyE9);
  const sharePrice = Number(v.rateE18) / 1e18;

  return {
    success: true,
    output: {
      id:                  v.id,
      name:                v.name,
      token:               sui.baseDepositCoin.symbol,
      receipt_token:       sui.receiptCoin.symbol,
      apy:                 apy.display,
      apy_components: {
        lending:  `${(Number(v.reportedApy.lendingApyE9) / 1e9 * 100).toFixed(2)}%`,
        rewards:  `${(Number(v.reportedApy.rewardApyE9) / 1e9 * 100).toFixed(2)}%`,
        target:   `${(Number(v.reportedApy.targetApyE9) / 1e9 * 100).toFixed(2)}%`,
        updated:  v.reportedApy.updatedAt,
      },
      tvl:                 formatUsd(tvl),
      tvl_usd:             tvl,
      capacity:            formatUsd(capacity),
      utilisation:         capacity > 0 ? `${((tvl / capacity) * 100).toFixed(1)}%` : 'N/A',
      available_capacity:  formatUsd(Math.max(0, capacity - tvl)),
      share_price:         sharePrice.toFixed(6),
      curator:             v.managers.map(m => m.name).join(', ') || 'N/A',
      strategy:            v.strategy,
      description:         v.description,
      lock_period:         v.withdrawalPeriodDays > 0
                             ? `${v.withdrawalPeriodDays} day(s)`
                             : 'Flexible (no lock)',
      status:              v.status,
      chain:               'sui',
      vault_object_id:     sui.address,
      base_coin_type:      sui.baseDepositCoin.coinType,
      receipt_coin_type:   sui.receiptCoin.coinType,
      platform:            'Bluefin Ember',
    },
  };
}

async function actionGetUserPosition(input: any): Promise<SkillExecutionResult> {
  const { address, vault_id } = input ?? {};
  if (!address)  return { success: false, error: 'address (Sui wallet address) is required.' };
  if (!vault_id) return { success: false, error: 'vault_id is required.' };

  if (!/^0x[0-9a-fA-F]{64}$/.test(String(address))) {
    return { success: false, error: 'Invalid Sui address format. Must be 0x followed by 64 hex characters.' };
  }

  // Resolve vault from API to get UUID and metadata
  let raw: EmberVaultRaw[];
  try {
    raw = await fetchVaultsApi();
  } catch (err: any) {
    return { success: false, error: `Ember API unavailable: ${err.message}` };
  }

  const idLower = String(vault_id).toLowerCase();
  const v = raw.find(v =>
    v.id === vault_id ||
    v.name.toLowerCase().includes(idLower) ||
    v.detailsByChain?.sui?.address === vault_id
  );
  if (!v || !v.detailsByChain?.sui) {
    return { success: false, error: `Vault "${vault_id}" not found on Sui. Use list_vaults to see available vaults.` };
  }

  try {
    // accountsV2Api works without init() — pure REST call
    const ember = new EmberVaults({
      chainType: 'sui',
      network: 'mainnet',
      suiClient: new SuiClient({ url: SUI_RPC }) as any,
      environment: 'prod',
    });

    const resp = await ember.accountsV2Api.getAccountPositionsValue(address, v.id);
    const positions = resp.data;

    const sui = v.detailsByChain.sui;
    const sharePrice = Number(v.rateE18) / 1e18;

    if (!positions || positions.length === 0) {
      return {
        success: true,
        output: {
          address,
          vault_id:   v.id,
          vault_name: v.name,
          token:      sui.baseDepositCoin.symbol,
          shares:     '0',
          current_value_usd:    '$0.00',
          unrealised_yield_usd: '$0.00',
          total_yield_usd:      '$0.00',
          share_price:          sharePrice.toFixed(6),
          message: 'No position found for this address in this vault.',
        },
      };
    }

    const pos = positions[0];
    return {
      success: true,
      output: {
        address,
        vault_id:   v.id,
        vault_name: v.name,
        token:      sui.baseDepositCoin.symbol,
        shares:                  pos.shares,
        current_value_usd:       formatUsd(Number(pos.positionValueUsdE9)   / 1e9),
        unrealised_yield_usd:    formatUsd(Number(pos.unrealizedYieldUsdE9) / 1e9),
        realised_yield_usd:      formatUsd(Number(pos.realizedYieldUsdE9)   / 1e9),
        total_yield_usd:         formatUsd(Number(pos.totalYieldUsdE9)      / 1e9),
        position_in_coin:        pos.positionValueInCoinAmount,
        unrealised_yield_in_coin:pos.unrealizedYieldInCoinAmount,
        share_price:             sharePrice.toFixed(6),
        status:                  pos.status,
      },
    };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch position: ${err.message}` };
  }
}

async function actionDeposit(input: any): Promise<SkillExecutionResult> {
  const { vault_id, amount, sender } = input ?? {};
  if (!vault_id) return { success: false, error: 'vault_id is required.' };
  if (!amount)   return { success: false, error: 'amount is required (human-readable, e.g. "100" for 100 USDC).' };
  if (!sender)   return { success: false, error: 'sender (Sui wallet address) is required.' };

  if (!/^0x[0-9a-fA-F]{64}$/.test(String(sender))) {
    return { success: false, error: 'Invalid Sui address format. Must be 0x followed by 64 hex characters.' };
  }

  // Fetch vault to get Sui object address and token info
  let raw: EmberVaultRaw[];
  try {
    raw = await fetchVaultsApi();
  } catch (err: any) {
    return { success: false, error: `Ember API unavailable: ${err.message}` };
  }

  const idLower = String(vault_id).toLowerCase();
  const v = raw.find(v =>
    v.id === vault_id ||
    v.name.toLowerCase().includes(idLower) ||
    v.detailsByChain?.sui?.address === vault_id
  );

  if (!v || !v.detailsByChain?.sui) {
    return { success: false, error: `Vault "${vault_id}" not found on Sui.` };
  }

  if (v.status !== 'active') {
    return { success: false, error: `Vault is currently "${v.status}" and not accepting deposits.` };
  }

  const sui = v.detailsByChain.sui;
  const decimals = sui.baseDepositCoin.decimals;
  const amountRaw = BigInt(Math.floor(Number(amount) * 10 ** decimals));

  try {
    const suiClient = new SuiClient({ url: SUI_RPC });
    const ember = new EmberVaults({
      chainType:     'sui',
      network:       'mainnet',
      suiClient:     suiClient as any,
      environment:   'prod',
      walletAddress: sender,  // needed for coin selection
    });
    await ember.init();

    // Build unsigned PTB — returnTxb: true returns the TransactionBlock without executing
    const response = await ember.asSui().user.depositAsset(
      sui.address,          // vault Sui object ID
      amountRaw.toString(), // deposit amount in base units
      '0',                  // minSharesToMint — no slippage floor
      { sender, returnTxb: true }
    );

    const txBlock = response as unknown as Transaction;
    const txBytes = await txBlock.build({ client: suiClient as any });
    const tx_bytes = Buffer.from(txBytes).toString('base64');

    return {
      success: true,
      output: {
        action:          'deposit',
        vault_id:        v.id,
        vault_name:      v.name,
        token:           sui.baseDepositCoin.symbol,
        vault_object_id: sui.address,
        amount:          `${amount} ${sui.baseDepositCoin.symbol}`,
        amount_raw:      amountRaw.toString(),
        sender,
        current_apy:     parseApy(v.reportedApy.reportedApyE9).display,
        tx_bytes,
        instructions: [
          'Pass tx_bytes to Privy send_sui_transaction or any Sui-compatible wallet to sign and submit.',
          'Receipt tokens will appear in your wallet immediately after the transaction confirms.',
        ],
      },
    };
  } catch (err: any) {
    return { success: false, error: `Failed to build deposit transaction: ${err.message}` };
  }
}

async function actionWithdraw(input: any): Promise<SkillExecutionResult> {
  const { vault_id, shares_amount, sender } = input ?? {};
  if (!vault_id)      return { success: false, error: 'vault_id is required.' };
  if (!shares_amount) return { success: false, error: 'shares_amount is required (number of receipt tokens to redeem).' };
  if (!sender)        return { success: false, error: 'sender (Sui wallet address) is required.' };

  if (!/^0x[0-9a-fA-F]{64}$/.test(String(sender))) {
    return { success: false, error: 'Invalid Sui address format. Must be 0x followed by 64 hex characters.' };
  }

  let raw: EmberVaultRaw[];
  try {
    raw = await fetchVaultsApi();
  } catch (err: any) {
    return { success: false, error: `Ember API unavailable: ${err.message}` };
  }

  const idLower = String(vault_id).toLowerCase();
  const v = raw.find(v =>
    v.id === vault_id ||
    v.name.toLowerCase().includes(idLower) ||
    v.detailsByChain?.sui?.address === vault_id
  );

  if (!v || !v.detailsByChain?.sui) {
    return { success: false, error: `Vault "${vault_id}" not found on Sui.` };
  }

  const sui = v.detailsByChain.sui;
  const shareDecimals = sui.receiptCoin.decimals;
  const sharesRaw = BigInt(Math.floor(Number(shares_amount) * 10 ** shareDecimals));

  const sharePrice   = Number(v.rateE18) / 1e18;
  const estimatedOut = (Number(shares_amount) * sharePrice).toFixed(6);

  try {
    const suiClient = new SuiClient({ url: SUI_RPC });
    const ember = new EmberVaults({
      chainType:     'sui',
      network:       'mainnet',
      suiClient:     suiClient as any,
      environment:   'prod',
      walletAddress: sender,  // needed for receipt coin selection
    });
    await ember.init();

    // Build unsigned PTB — returnTxb: true returns the TransactionBlock without executing
    const response = await ember.asSui().user.redeemShares(
      sui.address,             // vault Sui object ID
      sharesRaw.toString(),    // shares in base units
      { sender, returnTxb: true }
    );

    const txBlock = response as unknown as Transaction;
    const txBytes = await txBlock.build({ client: suiClient as any });
    const tx_bytes = Buffer.from(txBytes).toString('base64');

    return {
      success: true,
      output: {
        action:          'withdraw',
        vault_id:        v.id,
        vault_name:      v.name,
        token:           sui.baseDepositCoin.symbol,
        receipt_token:   sui.receiptCoin.symbol,
        vault_object_id: sui.address,
        shares_to_redeem:shares_amount,
        shares_raw:      sharesRaw.toString(),
        estimated_out:   `${estimatedOut} ${sui.baseDepositCoin.symbol}`,
        share_price:     sharePrice.toFixed(6),
        lock_period:     v.withdrawalPeriodDays > 0
          ? `${v.withdrawalPeriodDays} day(s) withdrawal period`
          : 'Immediate — no lock',
        sender,
        tx_bytes,
        instructions: [
          'Pass tx_bytes to Privy send_sui_transaction or any Sui-compatible wallet to sign and submit.',
          'Underlying tokens will be returned to your wallet after the transaction confirms.',
        ],
      },
    };
  } catch (err: any) {
    return { success: false, error: `Failed to build withdraw transaction: ${err.message}` };
  }
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function executeBlueFinEmberSkill(input: any): Promise<SkillExecutionResult> {
  const action = input?.action;
  switch (action) {
    case 'list_vaults':       return actionListVaults(input);
    case 'get_vault_info':    return actionGetVaultInfo(input);
    case 'get_user_position': return actionGetUserPosition(input);
    case 'deposit':           return actionDeposit(input);
    case 'withdraw':          return actionWithdraw(input);
    default:
      return {
        success: false,
        error: `Unknown action: "${action}". Valid: list_vaults, get_vault_info, get_user_position, deposit, withdraw`,
      };
  }
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const BLUEFIN_EMBER_SKILL_METADATA = {
  name: 'Bluefin Ember',
  description:
    'Bluefin Ember Protocol — structured yield vaults on Sui. ' +
    'List all active vaults with live APY and TVL from the Ember API. ' +
    'Query vault details including APY breakdown, share price, curator, and strategy. ' +
    'Get user position: shares held, current value, unrealised yield. ' +
    'Build deposit and withdraw (redeem) Sui PTBs ready to sign via Privy or any Sui wallet. ' +
    'Supports all Ember vaults: eTHIRD, rcUSD, suiUSDe, eBLUE, R25-fixed, and more.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['bluefin', 'ember', 'vaults', 'sui', 'yield', 'defi', 'structured-products', 'earn'],
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['list_vaults', 'get_vault_info', 'get_user_position', 'deposit', 'withdraw'],
        description:
          'list_vaults: all active Sui vaults with live APY/TVL (optional filters: token, min_apy). ' +
          'get_vault_info: full details for one vault (requires vault_id). ' +
          'get_user_position: user shareholding and yield (requires address, vault_id). ' +
          'deposit: build a Sui deposit transaction (requires vault_id, amount, sender). ' +
          'withdraw: build a Sui withdrawal transaction (requires vault_id, shares_amount, sender).',
      },
      vault_id: {
        type: 'string',
        description: 'Vault UUID, name, or Sui object address. Use list_vaults to discover all active vaults.',
      },
      token: {
        type: 'string',
        description: 'Filter list_vaults by deposit token symbol (e.g. "USDC", "BLUE").',
      },
      min_apy: {
        type: 'number',
        description: 'Filter list_vaults to vaults with APY >= this value (e.g. 15 for 15%).',
      },
      amount: {
        type: 'string',
        description: 'Human-readable deposit amount (e.g. "100" for 100 USDC). Required for deposit.',
      },
      shares_amount: {
        type: 'string',
        description: 'Number of receipt tokens to redeem. Required for withdraw. Use get_user_position to see your balance.',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x + 64 hex chars). Required for deposit and withdraw.',
      },
      address: {
        type: 'string',
        description: 'Sui wallet address to query. Required for get_user_position.',
      },
    },
  },
};
