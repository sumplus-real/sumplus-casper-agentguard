/**
 * Volo — voloSUI (vSUI) Liquid Staking on Sui
 *
 * Volo is a liquid staking protocol on Sui (acquired by NAVI Protocol).
 * Stake SUI → receive vSUI (CERT token), which automatically accrues
 * staking rewards. vSUI can be used as collateral in NAVI and other DeFi protocols.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: volosui.com
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// Contract addresses (mainnet)
const PROTOCOL_PACKAGE = '0x68d22cf8bdbcd11ecba1e094922873e4080d4d11133e2443fddda0bfd11dae20';
const CERT_MODULE      = '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55';
const STAKE_POOL       = '0x2d914e23d82fedef1b5f56a32d5c64bdcc3087ccfea2b4d6ea51a71f587840e5';
const POOL_METADATA    = '0x680cd26af32b2bde8d3361e804c53ec1d1cfe24c7f039eb7f549e8dfde389a60';
const SUI_SYSTEM_STATE = '0x0000000000000000000000000000000000000000000000000000000000000005';

const VSUI_TYPE = `${CERT_MODULE}::cert::CERT`;

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:        'Volo (voloSUI)',
      chain:       'sui',
      type:        'Liquid Staking',
      website:     'https://volosui.com',
      token:       'vSUI (ticker: CERT)',
      token_type:  VSUI_TYPE,
      stake_pool:  STAKE_POOL,
      highlights: [
        'Stake SUI → vSUI (CERT), earns Sui staking rewards automatically',
        'Acquired by NAVI Protocol; vSUI accepted as collateral in NAVI lending',
        'Exchange rate monotonically increases as rewards accrue',
        'Unstaking has an epoch delay (~1-2 epochs)',
      ],
      note: 'Volo vSUI token uses the type alias CERT internally.',
    },
  };
}

async function actionGetExchangeRate(): Promise<SkillExecutionResult> {
  try {
    const client = getClient();

    // total_sui_supply is nested inside validator_pool.fields in the StakePool object
    const poolObj = await client.getObject({ id: STAKE_POOL, options: { showContent: true } });
    const poolFields = (poolObj.data?.content as any)?.fields ?? {};
    const validatorPoolFields = poolFields.validator_pool?.fields ?? {};
    const totalSui = validatorPoolFields.total_sui_supply ?? null;

    // vSUI (CERT) supply is in POOL_METADATA as total_supply.fields.value
    const metaObj = await client.getObject({ id: POOL_METADATA, options: { showContent: true } });
    const metaFields = (metaObj.data?.content as any)?.fields ?? {};
    const vsuiSupply = metaFields.total_supply?.fields?.value ?? null;

    const rate =
      totalSui && vsuiSupply && BigInt(vsuiSupply) > 0n
        ? Number(BigInt(totalSui)) / Number(BigInt(vsuiSupply))
        : null;

    return {
      success: true,
      output: {
        protocol:         'Volo',
        chain:            'sui',
        token:            'vSUI',
        exchange_rate:    rate,
        description:      rate ? `1 vSUI = ${rate.toFixed(6)} SUI` : 'Rate not available',
        total_sui_staked: totalSui ? (Number(BigInt(totalSui)) / 1e9).toFixed(4) + ' SUI' : null,
        vsui_supply:      vsuiSupply ? (Number(BigInt(vsuiSupply)) / 1e9).toFixed(4) + ' vSUI' : null,
        stake_pool:       STAKE_POOL,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_exchange_rate failed: ${err.message}` };
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
    const tx = new Transaction();
    tx.setSender(sender);

    const [coin] = tx.splitCoins(tx.gas, [amountMist]);
    const [vsui] = tx.moveCall({
      target: `${PROTOCOL_PACKAGE}::stake_pool::stake_entry`,
      arguments: [
        tx.object(STAKE_POOL),
        tx.object(POOL_METADATA),
        tx.object(SUI_SYSTEM_STATE),
        coin,
      ],
    });
    tx.transferObjects([vsui], tx.pure.address(sender));
    tx.setGasBudget(100_000_000);

    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes:    Buffer.from(txBytes).toString('base64'),
        sender,
        gas_budget:  '100000000',
        amount_sui:  parsedAmount,
        description: `Stake ${parsedAmount} SUI via Volo → receive vSUI (CERT)`,
        usage:       'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_stake_tx failed: ${err.message}` };
  }
}

async function actionBuildUnstakeTx(input: any): Promise<SkillExecutionResult> {
  const { sender, vsui_object_id } = input;
  if (!sender)         return { success: false, error: 'sender is required' };
  if (!vsui_object_id) return { success: false, error: 'vsui_object_id is required (the vSUI/CERT coin object to unstake)' };

  try {
    const client = getClient();
    const tx = new Transaction();
    tx.setSender(sender);

    tx.moveCall({
      target: `${PROTOCOL_PACKAGE}::stake_pool::unstake_entry`,
      arguments: [
        tx.object(STAKE_POOL),
        tx.object(POOL_METADATA),
        tx.object(SUI_SYSTEM_STATE),
        tx.object(vsui_object_id),
      ],
    });
    tx.setGasBudget(100_000_000);

    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes:    Buffer.from(txBytes).toString('base64'),
        sender,
        gas_budget:  '100000000',
        description: 'Unstake vSUI → SUI via Volo (epoch delay, ~1-2 epochs)',
        usage:       'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_unstake_tx failed: ${err.message}` };
  }
}

async function actionGetVsuiBalance(input: any): Promise<SkillExecutionResult> {
  const { address } = input;
  if (!address) return { success: false, error: 'address is required' };

  try {
    const client = getClient();
    const coins = await client.getCoins({ owner: address, coinType: VSUI_TYPE });
    const total = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    return {
      success: true,
      output: {
        protocol:      'Volo',
        address,
        vsui_balance:  (Number(total) / 1e9).toFixed(6),
        vsui_objects:  coins.data.map(c => ({
          object_id: c.coinObjectId,
          balance:   (Number(BigInt(c.balance)) / 1e9).toFixed(6),
        })),
        _note: 'Use vsui_objects[0].object_id as vsui_object_id in build_unstake_tx',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_vsui_balance failed: ${err.message}` };
  }
}

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const VOLO_SKILL_METADATA = {
  name: 'Volo',
  description:
    'Volo is a liquid staking protocol on Sui (acquired by NAVI Protocol). ' +
    'Stake SUI → receive vSUI (CERT token) that automatically earns Sui staking rewards. ' +
    'vSUI is accepted as collateral in NAVI lending. ' +
    'Get current exchange rate, build PTBs to stake or unstake.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  tags: ['volo', 'vsui', 'sui', 'liquid-staking', 'staking', 'navi', 'defi'],
  external_url: 'https://volosui.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/volo?w=48&h=48',
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
          'get_vsui_balance',
          'build_stake_tx',
          'build_unstake_tx',
        ],
        description:
          'get_protocol_info: Volo overview and token addresses. ' +
          'get_exchange_rate: current SUI↔vSUI rate from on-chain StakePool. ' +
          'get_vsui_balance: vSUI (CERT) coin objects owned by address (requires address). ' +
          'build_stake_tx: stake SUI → receive vSUI PTB (requires sender, amount). ' +
          'build_unstake_tx: unstake vSUI → SUI PTB, epoch delay (requires sender, vsui_object_id).',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x...). Required for all build_*_tx actions.',
      },
      address: {
        type: 'string',
        description: 'Sui address for get_vsui_balance.',
      },
      amount: {
        type: 'string',
        description: 'SUI amount to stake (human-readable, e.g. "10"). Required for build_stake_tx.',
      },
      vsui_object_id: {
        type: 'string',
        description: 'vSUI (CERT) coin object ID to unstake. Required for build_unstake_tx. Use get_vsui_balance to list objects.',
      },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'vSUI exchange rate', input: { action: 'get_exchange_rate' } },
    { title: 'Stake 10 SUI for vSUI', input: { action: 'build_stake_tx', sender: '0xYOUR_ADDRESS', amount: '10' } },
    { title: 'Check vSUI balance', input: { action: 'get_vsui_balance', address: '0xYOUR_ADDRESS' } },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeVoloSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':  return await actionGetProtocolInfo();
      case 'get_exchange_rate':  return await actionGetExchangeRate();
      case 'get_vsui_balance':   return await actionGetVsuiBalance(input);
      case 'build_stake_tx':     return await actionBuildStakeTx(input);
      case 'build_unstake_tx':   return await actionBuildUnstakeTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_exchange_rate, get_vsui_balance, build_stake_tx, build_unstake_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Volo skill' };
  }
}
