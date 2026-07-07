/**
 * Typus Finance — Structured DeFi Options Vaults on Sui
 *
 * Typus is a structured DeFi products platform on Sui. Think of it as
 * Ribbon Finance on Sui: users deposit assets into automated options strategy
 * vaults (DOVs — DeFi Options Vaults) and earn yield from option premium.
 *
 * Products:
 * - Covered Call Vaults: deposit SUI/BTC/ETH, vault sells covered call options
 *   each week/month. Earn premium as yield.
 * - Put Selling Vaults: deposit USDC, vault sells cash-secured put options.
 *   Earn premium as yield.
 * - SAFU: Principal-protected strategy (holds underlying + buys options)
 *
 * Contract addresses (Sui mainnet, from typus-config/config-mainnet.json):
 *   Package (latest):   0xcf20d3a2a6f31a0d04d0aa93840491ceb5dc6181d5ae0eeb2669458222ec08a6
 *   Package (origin):   0x321848bf1ae327a9e022ccb3701940191e02fa193ab160d9c0e49cd3c003de3a
 *   Registry (DOV):     0x3d70b09359e3ca8301ae0abeda4f2fdf72ce313ba58c919ce568e5f535fd2ea8
 *   Version (Typus):    0xd2882b992e986250b3304b59530700bc3850939f9a77e9e9dfa9cf1656f84b3d
 *   Registry (User):    0xb1b16eb4845b5ee1a29432b1f2bcfe8cbb33c234492baf31a706d82e28e18bce
 *   Leaderboard:        0xc515a3e7fd12ba902f7f1ebe52c676136e1b34cb614ae9c79a46b257ca7d5534
 *
 * SDK: @typus/typus-sdk (npm) | github.com/Typus-Lab/typus-sdk
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: typus.finance
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// ─── Contract addresses (Sui mainnet) ────────────────────────────────────────

/** Latest (upgraded) DOV Single package — use this for move calls */
const DOV_SINGLE_PACKAGE =
  '0xcf20d3a2a6f31a0d04d0aa93840491ceb5dc6181d5ae0eeb2669458222ec08a6';

/** Original deployment package (for type arguments and historical reference) */
const DOV_SINGLE_PACKAGE_ORIGIN =
  '0x321848bf1ae327a9e022ccb3701940191e02fa193ab160d9c0e49cd3c003de3a';

/** DOV Single shared registry object — main vault registry */
const DOV_SINGLE_REGISTRY =
  '0x3d70b09359e3ca8301ae0abeda4f2fdf72ce313ba58c919ce568e5f535fd2ea8';

/** Typus ecosystem version object (required for all entry calls) */
const TYPUS_VERSION =
  '0xd2882b992e986250b3304b59530700bc3850939f9a77e9e9dfa9cf1656f84b3d';

/** User registry — tracks per-user deposit state */
const TYPUS_USER_REGISTRY =
  '0xb1b16eb4845b5ee1a29432b1f2bcfe8cbb33c234492baf31a706d82e28e18bce';

/** Leaderboard registry (required by deposit entry) */
const TYPUS_LEADERBOARD =
  '0xc515a3e7fd12ba902f7f1ebe52c676136e1b34cb614ae9c79a46b257ca7d5534';

/** Sui standard clock object */
const CLOCK = '0x6';

// ─── Supported token types (mainnet) ─────────────────────────────────────────

const TOKEN_TYPES: Record<string, { type: string; decimals: number }> = {
  SUI: {
    type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    decimals: 9,
  },
  USDC: {
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimals: 6,
  },
  BTC: {
    type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN',
    decimals: 8,
  },
  ETH: {
    type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN',
    decimals: 8,
  },
  USDT: {
    type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
    decimals: 6,
  },
  VSUI: {
    type: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT',
    decimals: 9,
  },
  HASUI: {
    type: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI',
    decimals: 9,
  },
};

// ─── Known vaults (static catalogue) ─────────────────────────────────────────
//
// Typus vaults are indexed by integer. Each vault has:
//   - vault_index: on-chain index used in all move calls
//   - d_token:     the deposit token type (what you put in)
//   - b_token:     the bid/collateral token type (what option buyers pay with)
//   - strategy:    covered_call | put_selling
//   - frequency:   weekly | bi-weekly | monthly
//
// Vault indexes are discovered from on-chain reads of the DOV_SINGLE_REGISTRY.
// The list below reflects the most established Typus vaults at launch.
// New vaults are added over time — use actionGetVaultInfo to read live state.

const KNOWN_VAULTS = [
  {
    vault_index: 0,
    name: 'SUI Covered Call',
    asset: 'SUI',
    d_token: TOKEN_TYPES.SUI.type,
    b_token: TOKEN_TYPES.USDC.type,
    strategy: 'covered_call',
    frequency: 'weekly',
    description:
      'Deposit SUI, earn yield from selling weekly covered call options. ' +
      'Strike is set above current market price. You keep the premium if the option expires worthless; ' +
      'if exercised, your SUI is sold at the strike price (profit taken in USDC).',
    min_deposit: '1 SUI',
    risk: 'low-medium — upside capped above strike; SUI price risk retained',
  },
  {
    vault_index: 1,
    name: 'USDC Cash-Secured Put',
    asset: 'USDC',
    d_token: TOKEN_TYPES.USDC.type,
    b_token: TOKEN_TYPES.USDC.type,
    strategy: 'put_selling',
    frequency: 'weekly',
    description:
      'Deposit USDC, earn yield from selling weekly cash-secured put options on SUI. ' +
      'Strike is set below current SUI price. You earn premium if SUI stays above strike; ' +
      'if exercised, your USDC buys SUI at the strike (discounted entry).',
    min_deposit: '10 USDC',
    risk: 'low-medium — USDC may convert to SUI below market if strike is breached',
  },
  {
    vault_index: 2,
    name: 'BTC Covered Call',
    asset: 'BTC',
    d_token: TOKEN_TYPES.BTC.type,
    b_token: TOKEN_TYPES.USDC.type,
    strategy: 'covered_call',
    frequency: 'weekly',
    description:
      'Deposit Wormhole BTC, earn yield from selling weekly covered call options. ' +
      'Earn option premium while holding BTC exposure.',
    min_deposit: '0.0001 BTC',
    risk: 'low-medium — upside capped above strike; BTC price risk retained',
  },
  {
    vault_index: 3,
    name: 'ETH Covered Call',
    asset: 'ETH',
    d_token: TOKEN_TYPES.ETH.type,
    b_token: TOKEN_TYPES.USDC.type,
    strategy: 'covered_call',
    frequency: 'weekly',
    description:
      'Deposit Wormhole ETH, earn yield from selling weekly covered call options. ' +
      'Earn option premium while holding ETH exposure.',
    min_deposit: '0.001 ETH',
    risk: 'low-medium — upside capped above strike; ETH price risk retained',
  },
  {
    vault_index: 4,
    name: 'USDC Call Selling',
    asset: 'USDC',
    d_token: TOKEN_TYPES.USDC.type,
    b_token: TOKEN_TYPES.USDC.type,
    strategy: 'call_selling',
    frequency: 'weekly',
    description:
      'Deposit USDC as collateral to sell naked call options on SUI. ' +
      'Higher yield potential but higher risk than put selling.',
    min_deposit: '10 USDC',
    risk: 'medium — unlimited theoretical loss if SUI rallies far above strike',
  },
  {
    vault_index: 5,
    name: 'SUI Bi-Weekly Covered Call',
    asset: 'SUI',
    d_token: TOKEN_TYPES.SUI.type,
    b_token: TOKEN_TYPES.USDC.type,
    strategy: 'covered_call',
    frequency: 'bi-weekly',
    description:
      'Bi-weekly covered call vault on SUI. Longer duration = higher premium per cycle ' +
      'but less frequent compounding.',
    min_deposit: '1 SUI',
    risk: 'low-medium — similar to weekly but with 2-week horizon',
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

function resolveToken(symbol: string): { type: string; decimals: number } | null {
  const upper = symbol.toUpperCase();
  return TOKEN_TYPES[upper] ?? null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:    'Typus Finance',
      chain:   'sui',
      type:    'Structured DeFi Products — Options Vaults (DOV)',
      website: 'https://typus.finance',
      docs:    'https://docs.typus.finance',
      github:  'https://github.com/Typus-Lab',
      token:   'TYPUS (governance token)',
      token_type:
        '0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cbe0f80ef44a6c489385::typus::TYPUS',
      analogy: '"Ribbon Finance on Sui" — automated options strategy vaults',
      highlights: [
        'Largest options protocol on Sui by TVL (2024)',
        'Automated weekly/bi-weekly options rounds — deposit once, auto-rolls',
        'Dutch Auction mechanism for option premium discovery (transparent pricing)',
        'European-style, cash-settled options — no early exercise, no physical delivery',
        'Fully collateralized — no leverage risk for depositors',
        'Earn real yield from option premiums, not token inflation',
      ],
      products: {
        dov: {
          name:  'DeFi Options Vaults (DOV)',
          about: 'Automated strategy vaults. You deposit assets; the vault sells options each round via Dutch Auction and distributes the premium as yield.',
          strategies: {
            covered_call:    'Deposit SUI/BTC/ETH. Vault sells calls above market. Keep premium; upside capped if exercised.',
            put_selling:     'Deposit USDC. Vault sells puts below market. Keep premium; may buy SUI at strike if exercised (effectively a discounted entry).',
            call_selling:    'Deposit USDC as collateral to sell call options. Higher yield, higher risk.',
          },
          mechanics: {
            settlement: 'European style — exercised only at expiration',
            pricing:    'Dutch Auction — price starts high, decreases until filled by option buyers (Bidders)',
            frequency:  'Weekly or bi-weekly rounds (auto-rolling)',
            settlement_currency: 'Cash settled in SUI (calls) or USDC (puts)',
          },
        },
        safu: {
          name:  'SAFU',
          about: 'Principal-protected strategy. Your principal is guaranteed; yield buys options.',
        },
        perps: {
          name:  'Typus Perps',
          about: 'Perpetual futures trading (separate from DOV vaults).',
        },
      },
      user_roles: {
        depositor: 'Provides collateral to vaults; acts as option seller; earns premium yield',
        bidder:    'Buys options via Dutch Auction; profits if options expire in-the-money',
      },
      contracts: {
        dov_single_package: DOV_SINGLE_PACKAGE,
        dov_single_registry: DOV_SINGLE_REGISTRY,
        typus_version: TYPUS_VERSION,
        typus_user_registry: TYPUS_USER_REGISTRY,
      },
    },
  };
}

async function actionGetVaults(input: any): Promise<SkillExecutionResult> {
  const { strategy, asset } = input ?? {};

  let vaults: typeof KNOWN_VAULTS[number][] = [...KNOWN_VAULTS];

  // Optional filtering
  if (strategy) {
    const s = strategy.toLowerCase().replace('-', '_').replace(' ', '_');
    vaults = vaults.filter((v) => v.strategy === s);
  }
  if (asset) {
    const a = asset.toUpperCase();
    vaults = vaults.filter((v) => v.asset === a);
  }

  // Try to enrich with live on-chain data (best-effort — may fail)
  let liveNote: string | undefined;
  try {
    const client = getClient();
    // The DOV registry holds dynamic fields keyed by vault index (u64).
    // We attempt to read the registry object to verify it exists on-chain.
    const registryObj = await client.getObject({
      id: DOV_SINGLE_REGISTRY,
      options: { showContent: false, showType: true },
    });
    if (registryObj.data) {
      liveNote = `DOV registry verified on-chain (${DOV_SINGLE_REGISTRY}). Vault count and live APY require SDK-level getVaults() call.`;
    }
  } catch {
    liveNote = 'On-chain verification skipped — returned cached vault catalogue.';
  }

  return {
    success: true,
    output: {
      protocol:    'Typus Finance',
      chain:       'sui',
      vault_count: vaults.length,
      vaults: vaults.map((v) => ({
        vault_index:  v.vault_index,
        name:         v.name,
        asset:        v.asset,
        strategy:     v.strategy,
        frequency:    v.frequency,
        description:  v.description,
        min_deposit:  v.min_deposit,
        risk:         v.risk,
        d_token_type: v.d_token,
        b_token_type: v.b_token,
      })),
      _note: liveNote ?? 'Static vault catalogue. APY varies by round — check typus.finance/yield for live rates.',
      _apy_note:
        'Live APY depends on option premium from each weekly Dutch Auction. ' +
        'Historical APY has ranged 5–30%+ annualized depending on volatility.',
    },
  };
}

async function actionGetVaultInfo(input: any): Promise<SkillExecutionResult> {
  const { vault_index } = input ?? {};
  if (vault_index === undefined || vault_index === null) {
    return {
      success: false,
      error: 'vault_index is required (integer, e.g. 0 for SUI Covered Call)',
    };
  }

  const idx = parseInt(String(vault_index), 10);
  if (isNaN(idx) || idx < 0) {
    return { success: false, error: 'vault_index must be a non-negative integer' };
  }

  // Find static vault info
  const staticVault = KNOWN_VAULTS.find((v) => v.vault_index === idx);

  // Try on-chain read — Typus stores vaults as dynamic fields of the registry
  // keyed by u64 vault index. We attempt a dynamic field read.
  let onChainData: Record<string, any> | null = null;
  let onChainError: string | undefined;
  try {
    const client = getClient();
    // Typus stores each vault as a dynamic field on DOV_SINGLE_REGISTRY
    // The field name is the vault index (u64), the field value is the Vault struct.
    const dynamicFields = await client.getDynamicFields({
      parentId: DOV_SINGLE_REGISTRY,
    });

    // Find the dynamic field matching our vault_index
    const vaultField = dynamicFields.data.find((f) => {
      const name = f.name;
      // Field names in Typus are typed as u64 with the vault index as value
      return (
        (name as any)?.value === String(idx) ||
        (name as any)?.value === idx
      );
    });

    if (vaultField) {
      const vaultObj = await client.getObject({
        id: vaultField.objectId,
        options: { showContent: true, showType: true },
      });
      if (vaultObj.data?.content) {
        const content = vaultObj.data.content as any;
        onChainData = {
          object_id:     vaultField.objectId,
          type:          vaultObj.data.type,
          fields:        content.fields ?? content,
        };
      }
    } else {
      onChainError = `Vault index ${idx} not found as dynamic field of DOV registry. ` +
        `It may use a different field key scheme — use the Typus SDK getVaults() for accurate results.`;
    }
  } catch (err: any) {
    onChainError = `On-chain read failed: ${err.message}`;
  }

  if (!staticVault && !onChainData) {
    return {
      success: false,
      error:
        `Vault index ${idx} not found in catalogue and on-chain read failed. ` +
        `Known vault indexes: ${KNOWN_VAULTS.map((v) => v.vault_index).join(', ')}. ` +
        (onChainError ?? ''),
    };
  }

  return {
    success: true,
    output: {
      protocol:    'Typus Finance',
      chain:       'sui',
      vault_index: idx,
      ...(staticVault
        ? {
            name:         staticVault.name,
            asset:        staticVault.asset,
            strategy:     staticVault.strategy,
            frequency:    staticVault.frequency,
            description:  staticVault.description,
            min_deposit:  staticVault.min_deposit,
            risk_profile: staticVault.risk,
            d_token_type: staticVault.d_token,
            b_token_type: staticVault.b_token,
          }
        : {}),
      on_chain: onChainData ?? null,
      _on_chain_error: onChainError ?? null,
      _note:
        'APY and current round details (strike price, expiry, TVL per sub-vault) are best retrieved ' +
        'via the Typus SDK: getVaults(config, { indexes: ["' + idx + '"] })',
      _links: {
        app:  `https://typus.finance/yield/`,
        docs: 'https://docs.typus.finance/defi-options-vaults',
      },
    },
  };
}

/**
 * Build a Sui PTB (Programmable Transaction Block) to deposit into a Typus DOV vault.
 *
 * Typus deposit entry point: tds_user_entry::public_raise_fund
 *
 * Required args:
 *   sender       — depositor wallet address
 *   vault_index  — integer vault index (see KNOWN_VAULTS)
 *   amount       — human-readable deposit amount (e.g. "10.5" for 10.5 SUI)
 *   token_type   — asset symbol to deposit (SUI, USDC, BTC, ETH)
 *
 * The "raise_fund" function signature (from SDK user-entry.ts):
 *   public_raise_fund(
 *     version: &TypusVersion,              // TYPUS_VERSION
 *     user_registry: &mut UserRegistry,   // TYPUS_USER_REGISTRY
 *     leaderboard: &mut Leaderboard,      // TYPUS_LEADERBOARD
 *     registry: &mut Registry,            // DOV_SINGLE_REGISTRY
 *     index: u64,                         // vault index
 *     receipts: vector<Receipt>,          // existing deposit receipts (empty for new position)
 *     balance: Balance<D_TOKEN>,          // deposit amount as Balance
 *     raise_from_premium: bool,           // false for fresh deposit
 *     raise_from_inactive: bool,          // false for fresh deposit
 *     clock: &Clock,                      // 0x6
 *   ): Receipt
 *
 * Returns base64-encoded PTB tx_bytes for signing with any Sui wallet.
 */
async function actionBuildDepositTx(input: any): Promise<SkillExecutionResult> {
  const { sender, vault_index, amount, token_type } = input ?? {};

  if (!sender)      return { success: false, error: 'sender is required (Sui address 0x...)' };
  if (vault_index === undefined || vault_index === null)
    return { success: false, error: 'vault_index is required (integer, e.g. 0)' };
  if (!amount)      return { success: false, error: 'amount is required (e.g. "10.5")' };
  if (!token_type)  return { success: false, error: 'token_type is required (SUI, USDC, BTC, ETH)' };

  const idx = parseInt(String(vault_index), 10);
  if (isNaN(idx) || idx < 0) {
    return { success: false, error: 'vault_index must be a non-negative integer' };
  }

  const tokenInfo = resolveToken(token_type);
  if (!tokenInfo) {
    return {
      success: false,
      error:
        `Unknown token_type "${token_type}". Supported: ${Object.keys(TOKEN_TYPES).join(', ')}`,
    };
  }

  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount must be a positive number (e.g. "10.5")' };
  }
  const amountBaseUnits = BigInt(Math.round(parsedAmount * 10 ** tokenInfo.decimals));

  // Resolve coin input — for SUI split from gas; for other tokens query sender's coins
  const client = getClient();
  const tx = new Transaction();
  tx.setSender(sender);

  let depositCoinArg: any;
  try {
    const isSui =
      tokenInfo.type ===
      '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

    if (isSui) {
      [depositCoinArg] = tx.splitCoins(tx.gas, [tx.pure.u64(amountBaseUnits)]);
    } else {
      const { data: coins } = await client.getCoins({
        owner: sender,
        coinType: tokenInfo.type,
      });
      if (!coins || coins.length === 0) {
        return {
          success: false,
          error: `Sender ${sender} owns no ${token_type} coins on mainnet`,
        };
      }
      const primaryCoin = tx.object(coins[0].coinObjectId);
      if (coins.length > 1) {
        tx.mergeCoins(
          primaryCoin,
          coins.slice(1).map((c) => tx.object(c.coinObjectId)),
        );
      }
      [depositCoinArg] = tx.splitCoins(primaryCoin, [tx.pure.u64(amountBaseUnits)]);
    }
  } catch (err: any) {
    return { success: false, error: `Coin resolution failed: ${err.message}` };
  }

  // Convert coin → Balance<D_TOKEN> for the Move call
  // (Typus entry requires Balance, not Coin)
  // TODO: Verify function signature — module name is tds_user_entry in SDK v1.9.x
  const balanceArg = tx.moveCall({
    target: '0x2::coin::into_balance',
    typeArguments: [tokenInfo.type],
    arguments: [depositCoinArg],
  });

  // Build the deposit PTB
  // public_raise_fund<D_TOKEN, B_TOKEN>(...)
  // Type arguments: [D_TOKEN, B_TOKEN] — both must be provided
  // For most vaults B_TOKEN is USDC; consult KNOWN_VAULTS for the correct b_token
  const staticVault = KNOWN_VAULTS.find((v) => v.vault_index === idx);
  const bTokenType = staticVault?.b_token ?? TOKEN_TYPES.USDC.type;

  const receipt = tx.moveCall({
    // TODO: Verify function signature — confirmed from Typus SDK user-entry.ts analysis
    target: `${DOV_SINGLE_PACKAGE}::tds_user_entry::public_raise_fund`,
    typeArguments: [tokenInfo.type, bTokenType],
    arguments: [
      tx.object(TYPUS_VERSION),       // &TypusVersion
      tx.object(TYPUS_USER_REGISTRY), // &mut UserRegistry
      tx.object(TYPUS_LEADERBOARD),   // &mut Leaderboard
      tx.object(DOV_SINGLE_REGISTRY), // &mut Registry
      tx.pure.u64(idx),               // index: u64
      tx.pure.vector('u64', []),      // receipts: vector<Receipt> (empty = new deposit)
      balanceArg,                     // balance: Balance<D_TOKEN>
      tx.pure.bool(false),            // raise_from_premium
      tx.pure.bool(false),            // raise_from_inactive
      tx.object(CLOCK),               // &Clock
    ],
  });

  // Transfer the returned deposit receipt to the sender
  tx.transferObjects([receipt], sender);

  // Build and serialize the PTB
  let txBytes: Uint8Array;
  try {
    tx.setGasBudget(100_000_000); // 0.1 SUI — adjust if needed
    txBytes = await tx.build({ client });
  } catch (err: any) {
    return {
      success: false,
      error:
        `PTB build failed: ${err.message}. ` +
        `This may indicate a function signature mismatch — the Typus contract may have been upgraded. ` +
        `Use the official @typus/typus-sdk getRaiseFundTx() for production use.`,
    };
  }

  const vaultName = staticVault?.name ?? `Vault #${idx}`;
  return {
    success: true,
    output: {
      tx_bytes:    Buffer.from(txBytes).toString('base64'),
      sender,
      gas_budget:  '100000000',
      description: `Deposit ${parsedAmount} ${token_type.toUpperCase()} into Typus ${vaultName}`,
      vault_index: idx,
      vault_name:  vaultName,
      amount_deposited: parsedAmount,
      token:       token_type.toUpperCase(),
      usage:
        'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet/any Sui wallet signer to sign and submit.',
      _note:
        'A deposit receipt (Typus NFT) will be transferred to your address upon success. ' +
        'Keep this receipt — it is required to withdraw or claim yield.',
      _warning:
        'This PTB uses the tds_user_entry::public_raise_fund entry point. ' +
        'If the contract has been upgraded since this skill was last updated, ' +
        'use the official @typus/typus-sdk getRaiseFundTx() function instead.',
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const TYPUS_SKILL_METADATA = {
  name: 'Typus Finance',
  description:
    'Structured DeFi products on Sui — covered call and cash-secured put option vaults (DOVs) ' +
    'that earn yield on deposited assets. Similar to Ribbon Finance on Ethereum. ' +
    'Deposit SUI, USDC, BTC, or ETH into automated weekly options strategy vaults; ' +
    'earn real yield from option premiums via Dutch Auction. ' +
    'Supports get_protocol_info, get_vaults (catalogue + filtering), get_vault_info (on-chain state), ' +
    'and build_deposit_tx (PTB to deposit into a vault).',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['typus', 'sui', 'options', 'structured-products', 'yield', 'dov', 'defi', 'covered-call', 'put-selling'],
  external_url: 'https://typus.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/typus-finance?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_vaults', 'get_vault_info', 'build_deposit_tx'],
        description:
          'get_protocol_info: overview of Typus Finance, products, and contract addresses. ' +
          'get_vaults: catalogue of available DOV vaults (optional: filter by strategy or asset). ' +
          'get_vault_info: detailed info for one vault by vault_index, attempts on-chain state read. ' +
          'build_deposit_tx: build a Sui PTB to deposit into a Typus vault (returns base64 tx_bytes).',
      },
      vault_index: {
        type: 'number',
        description:
          'Integer vault index (e.g. 0 = SUI Covered Call, 1 = USDC Put Selling). ' +
          'Required for get_vault_info and build_deposit_tx.',
      },
      strategy: {
        type: 'string',
        description:
          'Filter vaults by strategy for get_vaults. ' +
          'Options: covered_call, put_selling, call_selling.',
      },
      asset: {
        type: 'string',
        description:
          'Filter vaults by deposit asset for get_vaults, or specify deposit token for build_deposit_tx. ' +
          'Examples: SUI, USDC, BTC, ETH.',
      },
      sender: {
        type: 'string',
        description:
          'Sui wallet address (0x..., 64 hex chars) of the depositor. Required for build_deposit_tx.',
      },
      amount: {
        type: 'string',
        description:
          'Human-readable deposit amount (e.g. "10.5" for 10.5 SUI, "100" for 100 USDC). ' +
          'Required for build_deposit_tx.',
      },
      token_type: {
        type: 'string',
        description:
          'Token symbol to deposit. Required for build_deposit_tx. ' +
          'Must match vault d_token: SUI (9 decimals), USDC (6), BTC (8), ETH (8), USDT (6).',
      },
    },
  },
  usage_examples: [
    {
      title: 'Protocol overview',
      input: { action: 'get_protocol_info' },
    },
    {
      title: 'List all vaults',
      input: { action: 'get_vaults' },
    },
    {
      title: 'List SUI vaults only',
      input: { action: 'get_vaults', asset: 'SUI' },
    },
    {
      title: 'List covered call vaults',
      input: { action: 'get_vaults', strategy: 'covered_call' },
    },
    {
      title: 'Get SUI Covered Call vault info',
      input: { action: 'get_vault_info', vault_index: 0 },
    },
    {
      title: 'Get USDC Put Selling vault info',
      input: { action: 'get_vault_info', vault_index: 1 },
    },
    {
      title: 'Deposit 10 SUI into Covered Call vault',
      input: {
        action:      'build_deposit_tx',
        sender:      '0xYOUR_ADDRESS',
        vault_index: 0,
        amount:      '10',
        token_type:  'SUI',
      },
    },
    {
      title: 'Deposit 100 USDC into Put Selling vault',
      input: {
        action:      'build_deposit_tx',
        sender:      '0xYOUR_ADDRESS',
        vault_index: 1,
        amount:      '100',
        token_type:  'USDC',
      },
    },
  ],
};

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeTypusSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return await actionGetProtocolInfo();
      case 'get_vaults':        return await actionGetVaults(input);
      case 'get_vault_info':    return await actionGetVaultInfo(input);
      case 'build_deposit_tx':  return await actionBuildDepositTx(input);
      default:
        return {
          success: false,
          error:
            `Unknown action "${action}". Available: get_protocol_info, get_vaults, get_vault_info, build_deposit_tx`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message ?? 'Unexpected error in Typus skill',
    };
  }
}
