/**
 * Haedal Protocol — haSUI Liquid Staking on Sui
 *
 * Haedal is one of Sui's leading liquid staking protocols.
 * Stake SUI → receive haSUI, which earns staking rewards automatically.
 * haSUI can be used in DeFi while accumulating yield.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: haedal.xyz
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// Contract addresses (mainnet)
const ORIGINAL_PACKAGE = '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d';
const LATEST_PACKAGE   = '0x126e4cfb051cad744706df590ec399e8c02b6feae195c35b8b496280d5442a62';
const STAKING_OBJ      = '0x47b224762220393057ebf4f70501b6e657c3e56684737568439a04f80849b2ca';
const SUI_SYSTEM_STATE = '0x0000000000000000000000000000000000000000000000000000000000000005';

const HASUI_TYPE = `${ORIGINAL_PACKAGE}::hasui::HASUI`;
const SUI_TYPE   = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

// Haedal's recommended validator (can be overridden)
const DEFAULT_VALIDATOR = '0xd30e2101a97dcbf022c901567a8889c846f3089cfdfc6a0007a9f7db7049b0f2';

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:        'Haedal Protocol',
      chain:       'sui',
      type:        'Liquid Staking',
      website:     'https://haedal.xyz',
      token:       'haSUI',
      token_type:  HASUI_TYPE,
      staking_obj: STAKING_OBJ,
      highlights: [
        'Stake SUI → haSUI, liquid token that earns Sui staking rewards',
        'Instant unstake available (fee applies) or delayed unstake (free, 1-2 epochs)',
        'haSUI usable as collateral in DeFi protocols on Sui',
        'HAEDAL governance token for protocol decisions',
      ],
    },
  };
}

async function actionGetExchangeRate(): Promise<SkillExecutionResult> {
  try {
    const client = getClient();

    // Try devInspect first — get_exchange_rate returns u64 scaled by 1e6
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${ORIGINAL_PACKAGE}::staking::get_exchange_rate`,
        arguments: [tx.object(STAKING_OBJ)],
      });
      const result = await client.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });
      const returnValues = result?.results?.[0]?.returnValues ?? [];
      if (returnValues.length > 0) {
        const raw = BigInt('0x' + Buffer.from(returnValues[0]?.[0] ?? []).reverse().toString('hex'));
        const rate = Number(raw) / 1e6; // contract returns rate scaled by 1e6
        if (rate > 0.5 && rate < 10) {
          return {
            success: true,
            output: {
              protocol:      'Haedal',
              chain:         'sui',
              token:         'haSUI',
              exchange_rate: rate,
              description:   `1 haSUI = ${rate.toFixed(6)} SUI`,
              source:        'devInspect on-chain',
            },
          };
        }
      }
    } catch {
      // fall through to field-based calculation
    }

    // Field-based fallback: (net_staked + rewards - fees) / stsui_supply
    const obj = await client.getObject({ id: STAKING_OBJ, options: { showContent: true } });
    const fields = (obj.data?.content as any)?.fields ?? {};

    const totalStaked   = fields.total_staked   ? BigInt(fields.total_staked)   : null;
    const totalUnstaked = fields.total_unstaked ? BigInt(fields.total_unstaked) : null;
    const totalRewards  = fields.total_rewards  ? BigInt(fields.total_rewards)  : 0n;
    const protocolFees  = fields.total_protocol_fees ? BigInt(fields.total_protocol_fees) : 0n;
    const stsuiSupply   = fields.stsui_supply   ? BigInt(fields.stsui_supply)   : null;

    let rate: number | null = null;
    let totalSuiBacking: bigint | null = null;

    if (totalStaked !== null && totalUnstaked !== null && stsuiSupply !== null && stsuiSupply > 0n) {
      totalSuiBacking = totalStaked - totalUnstaked + totalRewards - protocolFees;
      rate = Number(totalSuiBacking) / Number(stsuiSupply);
    }

    return {
      success: true,
      output: {
        protocol:         'Haedal',
        chain:            'sui',
        token:            'haSUI',
        exchange_rate:    rate,
        description:      rate ? `1 haSUI ≈ ${rate.toFixed(6)} SUI` : 'Rate unavailable',
        total_sui_staked: totalSuiBacking ? (Number(totalSuiBacking) / 1e9).toFixed(4) + ' SUI' : null,
        hasui_supply:     stsuiSupply ? (Number(stsuiSupply) / 1e9).toFixed(4) + ' haSUI' : null,
        staking_obj:      STAKING_OBJ,
        _note:            'exchange_rate > 1.0 means haSUI has accumulated staking rewards',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_exchange_rate failed: ${err.message}` };
  }
}

async function actionBuildStakeTx(input: any): Promise<SkillExecutionResult> {
  const { sender, amount, validator } = input;
  if (!sender) return { success: false, error: 'sender is required (Sui 0x... address)' };
  if (!amount) return { success: false, error: 'amount is required (e.g. "10" for 10 SUI)' };

  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount must be a positive number' };
  }
  const amountMist = BigInt(Math.round(parsedAmount * 1e9));
  const validatorAddr = validator ?? DEFAULT_VALIDATOR;

  try {
    const client = getClient();
    const tx = new Transaction();
    tx.setSender(sender);

    const [coin] = tx.splitCoins(tx.gas, [amountMist]);
    const [hasui] = tx.moveCall({
      target: `${LATEST_PACKAGE}::interface::request_stake`,
      arguments: [
        tx.object(SUI_SYSTEM_STATE),
        tx.object(STAKING_OBJ),
        coin,
        tx.pure.address(validatorAddr),
      ],
    });
    tx.transferObjects([hasui], tx.pure.address(sender));
    tx.setGasBudget(100_000_000);

    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes:    Buffer.from(txBytes).toString('base64'),
        sender,
        gas_budget:  '100000000',
        amount_sui:  parsedAmount,
        validator:   validatorAddr,
        description: `Stake ${parsedAmount} SUI via Haedal → receive haSUI`,
        usage:       'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_stake_tx failed: ${err.message}` };
  }
}

async function actionBuildUnstakeTx(input: any): Promise<SkillExecutionResult> {
  const { sender, hasui_object_id } = input;
  if (!sender)          return { success: false, error: 'sender is required' };
  if (!hasui_object_id) return { success: false, error: 'hasui_object_id is required (the haSUI coin object to unstake)' };

  try {
    const client = getClient();
    const tx = new Transaction();
    tx.setSender(sender);

    tx.moveCall({
      target: `${LATEST_PACKAGE}::staking::request_unstake_delay`,
      arguments: [
        tx.object(SUI_SYSTEM_STATE),
        tx.object(STAKING_OBJ),
        tx.object(hasui_object_id),
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
        description: 'Unstake haSUI via Haedal (delayed, free, ~1-2 epochs before SUI is claimable)',
        usage:       'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_unstake_tx failed: ${err.message}` };
  }
}

async function actionBuildInstantUnstakeTx(input: any): Promise<SkillExecutionResult> {
  const { sender, hasui_object_id } = input;
  if (!sender)          return { success: false, error: 'sender is required' };
  if (!hasui_object_id) return { success: false, error: 'hasui_object_id is required' };

  try {
    const client = getClient();
    const tx = new Transaction();
    tx.setSender(sender);

    tx.moveCall({
      target: `${LATEST_PACKAGE}::staking::request_unstake_instant_v2`,
      arguments: [
        tx.object(SUI_SYSTEM_STATE),
        tx.object(STAKING_OBJ),
        tx.object(hasui_object_id),
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
        description: 'Instant unstake haSUI → SUI via Haedal (fee applies, immediate)',
        usage:       'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer.',
        _warning:    'Instant unstake incurs a fee (typically ~0.3%). Use build_unstake_tx for fee-free delayed unstake.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_instant_unstake_tx failed: ${err.message}` };
  }
}

async function actionGetHasuiBalance(input: any): Promise<SkillExecutionResult> {
  const { address } = input;
  if (!address) return { success: false, error: 'address is required' };

  try {
    const client = getClient();
    const coins = await client.getCoins({ owner: address, coinType: HASUI_TYPE });
    const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    return {
      success: true,
      output: {
        protocol:      'Haedal',
        address,
        hasui_balance: (Number(totalBalance) / 1e9).toFixed(6),
        hasui_objects: coins.data.map(c => ({ object_id: c.coinObjectId, balance: (Number(BigInt(c.balance)) / 1e9).toFixed(6) })),
        _note:         'Use hasui_objects[0].object_id as hasui_object_id in build_unstake_tx',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_hasui_balance failed: ${err.message}` };
  }
}

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const HAEDAL_SKILL_METADATA = {
  name: 'Haedal Protocol',
  description:
    'Haedal is a leading liquid staking protocol on Sui. Stake SUI to receive haSUI, ' +
    'which earns Sui network staking rewards while remaining liquid and usable in DeFi. ' +
    'Get the current SUI/haSUI exchange rate. Build PTBs to stake SUI, delayed-unstake ' +
    '(free, ~1-2 epoch wait), or instant-unstake (fee applies, immediate).',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  tags: ['haedal', 'sui', 'liquid-staking', 'hasui', 'staking', 'defi'],
  external_url: 'https://haedal.xyz',
  logo_url: 'https://icons.llamao.fi/icons/protocols/haedal?w=48&h=48',
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
          'get_hasui_balance',
          'build_stake_tx',
          'build_unstake_tx',
          'build_instant_unstake_tx',
        ],
        description:
          'get_protocol_info: Haedal overview, addresses, and features. ' +
          'get_exchange_rate: current SUI↔haSUI exchange rate (on-chain). ' +
          'get_hasui_balance: haSUI coin objects owned by an address (requires address). ' +
          'build_stake_tx: build PTB to stake SUI and receive haSUI (requires sender, amount; optionally validator). ' +
          'build_unstake_tx: build PTB for delayed unstake — haSUI → SUI after ~1-2 epochs, no fee (requires sender, hasui_object_id). ' +
          'build_instant_unstake_tx: build PTB for immediate unstake with fee (requires sender, hasui_object_id).',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x...). Required for all build_*_tx actions.',
      },
      address: {
        type: 'string',
        description: 'Sui address for get_hasui_balance.',
      },
      amount: {
        type: 'string',
        description: 'SUI amount to stake (human-readable, e.g. "10"). Required for build_stake_tx.',
      },
      validator: {
        type: 'string',
        description: 'Optional validator address for build_stake_tx. Defaults to Haedal recommended validator.',
      },
      hasui_object_id: {
        type: 'string',
        description: 'haSUI coin object ID (0x...). Required for build_unstake_tx and build_instant_unstake_tx. Use get_hasui_balance to list owned objects.',
      },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'Current exchange rate', input: { action: 'get_exchange_rate' } },
    { title: 'Check haSUI balance', input: { action: 'get_hasui_balance', address: '0xYOUR_ADDRESS' } },
    { title: 'Stake 5 SUI for haSUI', input: { action: 'build_stake_tx', sender: '0xYOUR_ADDRESS', amount: '5' } },
    { title: 'Instant unstake haSUI', input: { action: 'build_instant_unstake_tx', sender: '0xYOUR_ADDRESS', hasui_object_id: '0xHASUI_OBJECT_ID' } },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeHaedalSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':         return await actionGetProtocolInfo();
      case 'get_exchange_rate':         return await actionGetExchangeRate();
      case 'get_hasui_balance':         return await actionGetHasuiBalance(input);
      case 'build_stake_tx':            return await actionBuildStakeTx(input);
      case 'build_unstake_tx':          return await actionBuildUnstakeTx(input);
      case 'build_instant_unstake_tx':  return await actionBuildInstantUnstakeTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_exchange_rate, get_hasui_balance, build_stake_tx, build_unstake_tx, build_instant_unstake_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Haedal skill' };
  }
}
