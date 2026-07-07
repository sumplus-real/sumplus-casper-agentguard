/**
 * AlphaFi Protocol — stSUI Liquid Staking on Sui
 *
 * AlphaFi is Sui's liquid staking + yield optimization protocol.
 * Stake SUI → receive stSUI, which earns Sui staking rewards automatically.
 * stSUI features instant unstaking (no epoch wait, no fee).
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website:  https://app.alphafi.xyz
 * stSUI:    https://stsui.com
 * Docs:     https://docs.alphafi.xyz
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// ─── Contract addresses (mainnet / production) ───────────────────────────────

// The first (original) package — used for type strings
const STSUI_FIRST_PACKAGE_ID  = '0xc35ee7fee75782806890cf8ed8536b52b4ba0ace0fb46b944f1155cc5945baa3';
// The latest upgraded package — used for all Move calls
const STSUI_LATEST_PACKAGE_ID = '0x059f94b85c07eb74d2847f8255d8cc0a67c9a8dcc039eabf9f8b9e23a0de2700';

// Shared objects
const LST_INFO          = '0x1adb343ab351458e151bc392fbf1558b3332467f23bda45ae67cd355a57fd5f5';
const SUI_SYSTEM_STATE  = '0x0000000000000000000000000000000000000000000000000000000000000005';

// Token types
const STSUI_COIN_TYPE = `${STSUI_FIRST_PACKAGE_ID}::stsui::STSUI`;
const SUI_COIN_TYPE   = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

// ─── Client ──────────────────────────────────────────────────────────────────

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:           'AlphaFi Protocol',
      chain:          'sui',
      type:           'Liquid Staking',
      website:        'https://app.alphafi.xyz',
      stsui_website:  'https://stsui.com',
      token:          'stSUI',
      token_type:     STSUI_COIN_TYPE,
      lst_info_obj:   LST_INFO,
      first_package:  STSUI_FIRST_PACKAGE_ID,
      latest_package: STSUI_LATEST_PACKAGE_ID,
      highlights: [
        'Stake SUI → stSUI: liquid token that earns Sui network staking rewards automatically',
        'Instant unstake — no epoch wait, no fee (unique among Sui LSTs)',
        'Exchange rate appreciation: 1 stSUI starts at 1 SUI, grows as rewards accrue',
        'stSUI usable as collateral in DeFi protocols across Sui ecosystem',
        'ALPHA governance token for protocol decisions',
        'Open-source stSUI LST Standard — anyone can launch their own LST on Sui',
      ],
    },
  };
}

async function actionGetExchangeRate(): Promise<SkillExecutionResult> {
  try {
    const client = getClient();

    // Read LST_INFO shared object — fields: storage.total_sui_supply,
    // accrued_spread_fees, lst_treasury_cap.total_supply.value
    const obj = await client.getObject({ id: LST_INFO, options: { showContent: true } });
    const fields = (obj.data?.content as any)?.fields ?? {};

    // Total SUI backing = total_sui_supply (inside storage field) - accrued_spread_fees
    const storageFields     = fields.storage?.fields ?? fields.storage ?? {};
    const totalSuiSupplyRaw = storageFields.total_sui_supply ?? fields.total_sui_supply ?? null;
    const accruedFeesRaw    = fields.accrued_spread_fees ?? '0';

    // stSUI supply = lst_treasury_cap.total_supply.value
    const treasuryCap   = fields.lst_treasury_cap?.fields ?? fields.lst_treasury_cap ?? {};
    const totalSupply   = treasuryCap.total_supply?.fields ?? treasuryCap.total_supply ?? {};
    const stSuiSupplyRaw = totalSupply.value ?? fields.total_supply ?? null;

    let rate: number | null = null;
    let totalSuiBacking: bigint | null = null;
    let stSuiSupply: bigint | null = null;

    if (totalSuiSupplyRaw !== null && stSuiSupplyRaw !== null) {
      const totalSui  = BigInt(String(totalSuiSupplyRaw));
      const fees      = BigInt(String(accruedFeesRaw));
      stSuiSupply     = BigInt(String(stSuiSupplyRaw));
      totalSuiBacking = totalSui > fees ? totalSui - fees : totalSui;

      if (stSuiSupply > 0n) {
        // Both values are in MIST (1e9 = 1 SUI); ratio is dimensionless
        rate = Number(totalSuiBacking) / Number(stSuiSupply);
      }
    }

    return {
      success: true,
      output: {
        protocol:         'AlphaFi',
        chain:            'sui',
        token:            'stSUI',
        exchange_rate:    rate,
        description:      rate
          ? `1 stSUI ≈ ${rate.toFixed(6)} SUI`
          : 'Rate unavailable — object structure may have changed',
        total_sui_staked: totalSuiBacking
          ? (Number(totalSuiBacking) / 1e9).toFixed(4) + ' SUI'
          : null,
        stsui_supply:     stSuiSupply
          ? (Number(stSuiSupply) / 1e9).toFixed(4) + ' stSUI'
          : null,
        lst_info_obj:     LST_INFO,
        _note:            'exchange_rate > 1.0 means stSUI has accumulated staking rewards',
        _raw_fields:      rate === null ? fields : undefined,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_exchange_rate failed: ${err.message}` };
  }
}

async function actionGetStsuiBalance(input: any): Promise<SkillExecutionResult> {
  const { address } = input;
  if (!address) return { success: false, error: 'address is required (Sui 0x... address)' };

  try {
    const client = getClient();
    const coins  = await client.getCoins({ owner: address, coinType: STSUI_COIN_TYPE });
    const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);

    return {
      success: true,
      output: {
        protocol:       'AlphaFi',
        address,
        stsui_balance:  (Number(totalBalance) / 1e9).toFixed(6),
        stsui_objects:  coins.data.map(c => ({
          object_id: c.coinObjectId,
          balance:   (Number(BigInt(c.balance)) / 1e9).toFixed(6),
        })),
        _note: 'Use stsui_objects[0].object_id as stsui_object_id in build_unstake_tx',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_stsui_balance failed: ${err.message}` };
  }
}

async function actionBuildStakeTx(input: any): Promise<SkillExecutionResult> {
  const { sender, amount } = input;
  if (!sender) return { success: false, error: 'sender is required (Sui 0x... address)' };
  if (!amount) return { success: false, error: 'amount is required (e.g. "10" for 10 SUI)' };

  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount must be a positive number' };
  }
  const amountMist = BigInt(Math.round(parsedAmount * 1e9));

  try {
    const client = getClient();
    const tx     = new Transaction();
    tx.setSender(sender);

    // Split SUI from gas
    const [suiCoin] = tx.splitCoins(tx.gas, [amountMist]);

    // Call liquid_staking::mint — returns stSUI coin
    // Args: lst_info, sui_system_state, sui_coin
    // Type arg: STSUI_COIN_TYPE
    const [stsuiCoin] = tx.moveCall({
      target:        `${STSUI_LATEST_PACKAGE_ID}::liquid_staking::mint`,
      typeArguments: [STSUI_COIN_TYPE],
      arguments: [
        tx.object(LST_INFO),
        tx.object(SUI_SYSTEM_STATE),
        suiCoin,
      ],
    });

    tx.transferObjects([stsuiCoin], tx.pure.address(sender));
    tx.setGasBudget(100_000_000);

    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes:    Buffer.from(txBytes).toString('base64'),
        sender,
        gas_budget:  '100000000',
        amount_sui:  parsedAmount,
        description: `Stake ${parsedAmount} SUI via AlphaFi → receive stSUI`,
        usage:       'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_stake_tx failed: ${err.message}` };
  }
}

async function actionBuildUnstakeTx(input: any): Promise<SkillExecutionResult> {
  const { sender, stsui_object_id } = input;
  if (!sender)          return { success: false, error: 'sender is required' };
  if (!stsui_object_id) return { success: false, error: 'stsui_object_id is required (the stSUI coin object to unstake). Use get_stsui_balance to list owned objects.' };

  try {
    const client = getClient();
    const tx     = new Transaction();
    tx.setSender(sender);

    // Call liquid_staking::redeem — returns SUI coin
    // Args: lst_info, stsui_coin, sui_system_state
    // Type arg: STSUI_COIN_TYPE
    const [suiCoin] = tx.moveCall({
      target:        `${STSUI_LATEST_PACKAGE_ID}::liquid_staking::redeem`,
      typeArguments: [STSUI_COIN_TYPE],
      arguments: [
        tx.object(LST_INFO),
        tx.object(stsui_object_id),
        tx.object(SUI_SYSTEM_STATE),
      ],
    });

    tx.transferObjects([suiCoin], tx.pure.address(sender));
    tx.setGasBudget(100_000_000);

    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes:        Buffer.from(txBytes).toString('base64'),
        sender,
        gas_budget:      '100000000',
        stsui_object_id,
        description:     'Instant unstake stSUI → SUI via AlphaFi (no fee, no epoch wait)',
        usage:           'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer.',
        _note:           'AlphaFi stSUI supports instant unstaking — SUI is received in the same transaction.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_unstake_tx failed: ${err.message}` };
  }
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const ALPHAFI_SKILL_METADATA = {
  name: 'AlphaFi Protocol',
  description:
    'AlphaFi is a liquid staking + yield optimization protocol on Sui. ' +
    'Stake SUI to receive stSUI, which automatically earns Sui network staking rewards. ' +
    'Unlike most LSTs, stSUI supports instant unstaking with no fee and no epoch wait. ' +
    'Get the current stSUI/SUI exchange rate, check balances, and build PTBs to stake or unstake.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  tags: ['alphafi', 'stsui', 'sui', 'liquid-staking', 'staking', 'yield', 'defi'],
  external_url: 'https://app.alphafi.xyz',
  logo_url: 'https://icons.llamao.fi/icons/protocols/alphafi?w=48&h=48',
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
          'get_exchange_rate',
          'get_stsui_balance',
          'build_stake_tx',
          'build_unstake_tx',
        ],
        description:
          'get_protocol_info: AlphaFi overview, addresses, and stSUI features. ' +
          'get_exchange_rate: current stSUI/SUI exchange rate read from chain (reflects accumulated rewards). ' +
          'get_stsui_balance: list stSUI coin objects owned by an address (requires address). ' +
          'build_stake_tx: build PTB to stake SUI and receive stSUI (requires sender, amount). ' +
          'build_unstake_tx: build PTB to instantly unstake stSUI → SUI with no fee (requires sender, stsui_object_id).',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x..., 64 hex chars). Required for all build_*_tx actions.',
      },
      address: {
        type: 'string',
        description: 'Sui address to query stSUI balance for. Required for get_stsui_balance.',
      },
      amount: {
        type: 'string',
        description: 'SUI amount to stake (human-readable float, e.g. "10" for 10 SUI). Required for build_stake_tx.',
      },
      stsui_object_id: {
        type: 'string',
        description:
          'stSUI coin object ID (0x...). Required for build_unstake_tx. ' +
          'Use get_stsui_balance to list stSUI objects owned by the sender.',
      },
    },
  },
  usage_examples: [
    { title: 'Protocol info',           input: { action: 'get_protocol_info' } },
    { title: 'Current exchange rate',   input: { action: 'get_exchange_rate' } },
    { title: 'Check stSUI balance',     input: { action: 'get_stsui_balance', address: '0xYOUR_ADDRESS' } },
    { title: 'Stake 5 SUI for stSUI',   input: { action: 'build_stake_tx', sender: '0xYOUR_ADDRESS', amount: '5' } },
    { title: 'Unstake stSUI instantly', input: { action: 'build_unstake_tx', sender: '0xYOUR_ADDRESS', stsui_object_id: '0xSTSUI_OBJECT_ID' } },
  ],
};

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeAlphaFiSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':   return await actionGetProtocolInfo();
      case 'get_exchange_rate':   return await actionGetExchangeRate();
      case 'get_stsui_balance':   return await actionGetStsuiBalance(input);
      case 'build_stake_tx':      return await actionBuildStakeTx(input);
      case 'build_unstake_tx':    return await actionBuildUnstakeTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_exchange_rate, get_stsui_balance, build_stake_tx, build_unstake_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in AlphaFi skill' };
  }
}
