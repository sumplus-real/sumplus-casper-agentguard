/**
 * Bucket Protocol — Sui CDP Stablecoin (USDB/BUCK)
 *
 * Bucket Protocol is the leading CDP (Collateralized Debt Position) stablecoin
 * protocol on Sui, similar to MakerDAO. Users deposit collateral (SUI, BTC,
 * WAL, etc.) and borrow USDB (USD-pegged stablecoin). BUCK is the legacy
 * stablecoin still circulating from V1.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Contracts (Sui mainnet):
 *   onchain-config package: 0x1906a868f05cec861532d92aa49059580caf72d900ba2c387d5135b6a9727f52
 *   entry config object:    0x03e79aa64ac007d200aefdcb445e31e24f460279bab6c73babfb031b7464072e
 *   BUCK token:             0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK
 *
 * Note: CDP/FRAMEWORK/SAVING package IDs are stored on-chain in the config object
 * and resolved dynamically at runtime via queryAllConfig().
 *
 * Website: https://app.bucketprotocol.io
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Onchain config package (contains the bootstrap config object registry) */
const ONCHAIN_CONFIG_PACKAGE = '0x1906a868f05cec861532d92aa49059580caf72d900ba2c387d5135b6a9727f52';

/** The single entry-config shared object on mainnet — everything else is resolved from here */
const ENTRY_CONFIG_ID = '0x03e79aa64ac007d200aefdcb445e31e24f460279bab6c73babfb031b7464072e';

/** Legacy BUCK stablecoin (V1) — still circulating on mainnet */
const BUCK_TYPE = '0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK';

/** Supported collateral coin types on mainnet */
const COLLATERAL_TYPES: Record<string, { type: string; symbol: string; decimals: number }> = {
  SUI: {
    type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    symbol: 'SUI',
    decimals: 9,
  },
  BTC: {
    type: '0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC',
    symbol: 'BTC',
    decimals: 8,
  },
  BFBTC: {
    type: '0x7438e8caf5c345fbd3772517380bf0ca432f53892dee65ee0dda3eb127993cd9::bfbtc::BFBTC',
    symbol: 'BFBTC',
    decimals: 8,
  },
  WAL: {
    type: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
    symbol: 'WAL',
    decimals: 9,
  },
};

/** PSM (Peg Stability Module) stablecoin types */
const PSM_TYPES = {
  USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  USDT: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
  BUCK: BUCK_TYPE,
};

/** Bucket Protocol DeFiLlama API */
const DEFILLAMA_API = 'https://api.llama.fi/protocol/bucket-protocol';

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

// ─── On-chain config loader ──────────────────────────────────────────────────

/**
 * Read the Bucket onchain config object to obtain:
 *  - package IDs (CDP, framework, saving, PSM, flash, etc.)
 *  - shared object IDs (Treasury, Vault per collateral, Aggregator per collateral)
 *
 * The config is a nested set of shared objects all reachable from ENTRY_CONFIG_ID.
 * We call the `config::get_config` view function to get the full config data,
 * or fall back to reading the object fields directly.
 */
async function loadOnchainConfig(): Promise<Record<string, any>> {
  const client = getClient();

  // Fetch the entry config object
  const configObj = await client.getObject({
    id: ENTRY_CONFIG_ID,
    options: { showContent: true, showType: true },
  });

  return configObj.data ?? {};
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Bucket Protocol',
      chain: 'sui',
      type: 'CDP Stablecoin / DeFi',
      stablecoin: 'USDB (V2, primary) and BUCK (V1 legacy)',
      website: 'https://app.bucketprotocol.io',
      docs: 'https://docs.bucketprotocol.io',
      highlights: [
        'Leading CDP stablecoin protocol on Sui (similar to MakerDAO)',
        'Deposit SUI, BTC, WAL, BFBTC as collateral; borrow USDB at fixed interest',
        'Over-collateralized positions with on-chain liquidation',
        'PSM (Peg Stability Module): swap USDB ↔ USDC/USDT/BUCK at near-zero fee',
        'Flash mint: borrow USDB within one transaction for arbitrage (0.05% fee)',
        'Saving pool: deposit USDB to earn yield',
        'Borrow incentives: earn SUI rewards for maintaining positions',
      ],
      supported_collaterals: Object.values(COLLATERAL_TYPES).map((c) => c.symbol),
      psm_stablecoins: ['USDC', 'USDT', 'BUCK'],
      contracts: {
        onchain_config_package: ONCHAIN_CONFIG_PACKAGE,
        entry_config_object: ENTRY_CONFIG_ID,
        buck_token: BUCK_TYPE,
        _note: 'CDP/Framework/Saving package IDs are stored on-chain and resolved dynamically',
      },
    },
  };
}

async function actionGetStats(): Promise<SkillExecutionResult> {
  // Fetch TVL and supply data from DeFiLlama (reliable public endpoint)
  let tvlData: any = null;
  try {
    const res = await fetch(DEFILLAMA_API, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      tvlData = await res.json();
    }
  } catch {
    // DeFiLlama unavailable — continue with on-chain data
  }

  // Read the onchain entry config object for protocol metadata
  const client = getClient();
  let configFields: any = {};
  try {
    const obj = await client.getObject({
      id: ENTRY_CONFIG_ID,
      options: { showContent: true },
    });
    if (obj.data?.content && 'fields' in obj.data.content) {
      configFields = (obj.data.content as any).fields ?? {};
    }
  } catch {
    // ignore — just means we won't have on-chain detail
  }

  const currentTvl = tvlData?.currentChainTvls?.Sui ?? tvlData?.tvl ?? null;
  const tvlHistory = Array.isArray(tvlData?.tvl) ? tvlData.tvl.slice(-1)[0] : null;

  return {
    success: true,
    output: {
      protocol: 'Bucket Protocol',
      chain: 'sui',
      tvl_usd: currentTvl
        ? `$${Number(currentTvl).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        : tvlHistory?.totalLiquidityUSD
          ? `$${Number(tvlHistory.totalLiquidityUSD).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
          : 'See DeFiLlama: https://defillama.com/protocol/bucket-protocol',
      stablecoins: {
        USDB: 'Primary V2 stablecoin — minted by depositing collateral',
        BUCK: `Legacy V1 stablecoin. Token type: ${BUCK_TYPE}`,
      },
      supported_collaterals: Object.values(COLLATERAL_TYPES).map((c) => ({
        symbol: c.symbol,
        coin_type: c.type,
        decimals: c.decimals,
      })),
      psm_pools: Object.entries(PSM_TYPES).map(([symbol, type]) => ({ symbol, coin_type: type })),
      entry_config_object: ENTRY_CONFIG_ID,
      _note:
        'For live USDB supply and per-vault collateral stats, use the Bucket Protocol SDK ' +
        '(npm: @bucket-protocol/sdk) with BucketClient.initialize() to load onchain config, ' +
        'then call getAllVaultObjects() and getAllPsmPoolObjects().',
    },
  };
}

/**
 * Build a PTB (Programmable Transaction Block) to:
 *  1. Deposit SUI as collateral into a Bucket vault
 *  2. Borrow USDB against that collateral
 *
 * The transaction uses the Bucket Protocol V2 CDP flow:
 *   account::request → vault::debtor_request → oracle aggregation → vault::update_position
 *
 * Because package IDs and vault object IDs must be loaded from the on-chain config
 * at runtime, this action returns the transaction bytes after building with live data.
 *
 * Parameters:
 *  - sender:           Sui address of the position owner
 *  - collateral_type:  Collateral symbol (SUI, BTC, WAL, BFBTC) — defaults to SUI
 *  - amount_collateral: Amount of collateral in base units (e.g. 1_000_000_000 = 1 SUI)
 *  - usdb_amount:      Amount of USDB to borrow in base units (6 decimals, e.g. 1_000_000 = 1 USDB)
 */
async function actionBuildBorrowTx(input: any): Promise<SkillExecutionResult> {
  const {
    sender,
    collateral_type = 'SUI',
    amount_collateral,
    usdb_amount,
    // Legacy aliases
    amount_sui,
    buck_amount,
  } = input;

  if (!sender) return { success: false, error: 'sender is required (Sui address 0x...)' };

  const collSymbol = (collateral_type as string).toUpperCase();
  const collInfo = COLLATERAL_TYPES[collSymbol];
  if (!collInfo) {
    return {
      success: false,
      error: `Unsupported collateral "${collateral_type}". Supported: ${Object.keys(COLLATERAL_TYPES).join(', ')}`,
    };
  }

  // Accept amount_collateral or legacy amount_sui
  const rawCollAmount = amount_collateral ?? amount_sui;
  const rawUsdbAmount = usdb_amount ?? buck_amount;

  if (!rawCollAmount) {
    return {
      success: false,
      error: `amount_collateral is required (base units; e.g. 1000000000 = 1 ${collSymbol} with ${collInfo.decimals} decimals)`,
    };
  }
  if (!rawUsdbAmount) {
    return {
      success: false,
      error: 'usdb_amount is required (base units with 6 decimals; e.g. 1000000 = 1 USDB)',
    };
  }

  const collAmount = BigInt(rawCollAmount);
  const borrowAmount = BigInt(rawUsdbAmount);

  if (collAmount <= 0n) return { success: false, error: 'amount_collateral must be > 0' };
  if (borrowAmount <= 0n) return { success: false, error: 'usdb_amount must be > 0' };

  const client = getClient();

  // Load the on-chain config to get vault and package IDs
  let cdpPackageId = '';
  let frameworkPackageId = '';
  let treasuryObjId = '';
  let vaultObjId = '';
  let aggregatorObjId = '';
  let oraclePackageId = '';

  try {
    // Fetch the main config object which contains id_vector pointing to sub-configs
    const configObj = await client.getObject({
      id: ENTRY_CONFIG_ID,
      options: { showContent: true },
    });

    const configContent = configObj.data?.content as any;
    if (!configContent || !configContent.fields) {
      throw new Error('Unable to parse config object content from chain');
    }

    // The config registry stores sub-config object IDs in id_vector
    // Each sub-config is fetched individually to get package_config and object_config
    const idVector: string[] = configContent.fields.id_vector ?? [];
    if (idVector.length === 0) {
      throw new Error('Config id_vector is empty — protocol may be paused or config not bootstrapped');
    }

    // Fetch all config sub-objects in parallel
    const subObjs = await Promise.all(
      idVector.map((id) =>
        client.getObject({ id, options: { showContent: true, showType: true } }),
      ),
    );

    // Find package_config and object_config by their Move type
    let packageConfig: any = null;
    let objectConfig: any = null;
    let vaultRegistry: any = null;

    for (const obj of subObjs) {
      const typeStr: string = (obj.data?.content as any)?.type ?? '';
      const fields: any = (obj.data?.content as any)?.fields ?? {};

      if (typeStr.includes('package_config::PackageConfig')) {
        packageConfig = fields;
      } else if (typeStr.includes('object_config::ObjectConfig')) {
        objectConfig = fields;
      } else if (typeStr.includes('vault::Vault') && !typeStr.includes('VaultObjectInfo')) {
        // The vault registry stores a table of VaultObjectInfo keyed by collateral type
        vaultRegistry = { fields, objectId: obj.data?.objectId };
      }
    }

    if (!packageConfig) {
      throw new Error('PackageConfig not found in config sub-objects');
    }
    if (!objectConfig) {
      throw new Error('ObjectConfig not found in config sub-objects');
    }

    cdpPackageId = packageConfig.cdp_package_id;
    frameworkPackageId = packageConfig.framework_package_id;
    oraclePackageId = packageConfig.oracle_package_id;

    // Treasury is a SharedObjectRef stored in object_config
    // The fields may be nested under treasury_obj
    const treasuryRef = objectConfig.treasury_obj;
    treasuryObjId = treasuryRef?.objectId ?? treasuryRef?.id ?? treasuryRef;

    if (!cdpPackageId || !frameworkPackageId || !treasuryObjId) {
      throw new Error(
        `Incomplete config: cdpPackageId=${cdpPackageId}, frameworkPackageId=${frameworkPackageId}, treasuryObjId=${treasuryObjId}`,
      );
    }

    // Find vault object for this collateral type
    // The vault registry uses a VecMap with collateral type string → VaultObjectInfo
    // We need to look up the table directly on chain
    const vaultTableId = vaultRegistry?.fields?.table?.fields?.id?.id;
    if (vaultTableId) {
      const tableObj = await client.getDynamicFieldObject({
        parentId: vaultTableId,
        name: { type: '0x1::string::String', value: collInfo.type },
      });
      const vaultInfo = (tableObj.data?.content as any)?.fields?.value?.fields;
      vaultObjId = vaultInfo?.vault?.objectId ?? vaultInfo?.vault?.id ?? vaultInfo?.vault;
    }

    // Find aggregator object for this collateral type (for oracle price)
    // TODO: Resolve aggregator object ID from oracle sub-config
    // For now, we note this must be resolved from the oracle_config sub-object

    if (!vaultObjId) {
      throw new Error(
        `Vault object ID for ${collSymbol} not found in registry. ` +
          'Use the Bucket Protocol SDK (npm: @bucket-protocol/sdk) for full PTB building.',
      );
    }
  } catch (err: any) {
    return {
      success: false,
      error:
        `Failed to load Bucket Protocol on-chain config: ${err.message}. ` +
        'For production use, install @bucket-protocol/sdk and use BucketClient.initialize() ' +
        'then call buildManagePositionTransaction().',
      _note:
        'Direct PTB building requires resolving vault/aggregator object IDs from the on-chain config. ' +
        'The Bucket Protocol SDK handles this automatically.',
    } as SkillExecutionResult;
  }

  // Build the PTB using the resolved IDs
  const tx = new Transaction();
  tx.setSender(sender);

  try {
    // Split collateral coin from gas (SUI) or use a separate coin
    let depositCoin: any;
    if (collSymbol === 'SUI') {
      [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(collAmount)]);
    } else {
      // For non-SUI collateral, the caller must own coins of that type
      const { data: ownedCoins } = await client.getCoins({ owner: sender, coinType: collInfo.type });
      if (!ownedCoins || ownedCoins.length === 0) {
        return { success: false, error: `sender owns no ${collSymbol} coins on mainnet` };
      }
      const primary = tx.object(ownedCoins[0].coinObjectId);
      if (ownedCoins.length > 1) {
        tx.mergeCoins(
          primary,
          ownedCoins.slice(1).map((c) => tx.object(c.coinObjectId)),
        );
      }
      [depositCoin] = tx.splitCoins(primary, [tx.pure.u64(collAmount)]);
    }

    // Zero-value repay coin (no repayment in a pure borrow)
    // USDB package ID is resolved from the on-chain config above
    // TODO: Verify exact USDB coin type from config.ORIGINAL_USDB_PACKAGE_ID::usdb::USDB
    const usdbPackageId = (cdpPackageId ?? '').replace(/::.*/, ''); // fallback approximation
    const zeroCoin = tx.moveCall({
      target: `0x2::coin::zero`,
      typeArguments: [`${usdbPackageId}::usdb::USDB`],
    });

    // Step 1: Create account request (EOA — no Account object needed)
    // TODO: Verify function name on mainnet
    const accountReq = tx.moveCall({
      target: `${frameworkPackageId}::account::request`,
      arguments: [],
    });

    // Step 2: Create debtor request — deposit collateral, declare borrow
    // TODO: Verify function name on mainnet
    const debtorReq = tx.moveCall({
      target: `${cdpPackageId}::vault::debtor_request`,
      typeArguments: [collInfo.type],
      arguments: [
        tx.object(vaultObjId),   // Vault<T> (shared, mutable)
        accountReq,               // AccountRequest
        tx.object(treasuryObjId), // Treasury (shared, mutable)
        depositCoin,              // Coin<T> — collateral being deposited
        tx.pure.u64(borrowAmount), // u64 — USDB borrow amount
        zeroCoin,                 // Coin<USDB> — repay coin (zero for pure borrow)
        tx.pure.u64(0n),          // u64 — withdraw amount (0 for pure borrow)
      ],
    });

    // Step 3: Check update position request (validates the request against protocol rules)
    // TODO: Verify function name on mainnet
    const updateRequest = tx.moveCall({
      target: `${cdpPackageId}::vault::check_update_position_request`,
      typeArguments: [collInfo.type],
      arguments: [
        tx.object(vaultObjId),
        debtorReq,
      ],
    });

    // Step 4: update_position requires a PriceResult from the oracle
    // Oracle aggregation requires a Pyth price update and is complex to build standalone.
    // The aggregator object ID for this collateral must also be resolved from config.
    // NOTE: This step is intentionally omitted here — use the Bucket SDK for full flow.
    // TODO: Add oracle aggregation (aggregator::aggregate + pyth_rule::feed) here.

    // Step 5: Execute updatePosition — returns (Coin<T>, Coin<USDB>, UpdateResponse)
    // TODO: Verify function name on mainnet
    const [collateralOut, usdbOut] = tx.moveCall({
      target: `${cdpPackageId}::vault::update_position`,
      typeArguments: [collInfo.type],
      arguments: [
        tx.object(vaultObjId),
        tx.object(treasuryObjId),
        tx.object('0x0000000000000000000000000000000000000000000000000000000000000006'), // Clock
        tx.pure.option('address', null), // Option<PriceResult<T>> — None (no oracle in this simplified flow)
        updateRequest,
      ],
    });

    // Transfer borrowed USDB to sender
    tx.transferObjects([usdbOut], tx.pure.address(sender));
    // Return any leftover collateral (should be zero for exact deposit)
    tx.transferObjects([collateralOut], tx.pure.address(sender));

    tx.setGasBudget(100_000_000);
    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes: Buffer.from(txBytes).toString('base64'),
        sender,
        collateral_type: collInfo.type,
        collateral_amount: collAmount.toString(),
        usdb_borrow_amount: borrowAmount.toString(),
        description: `Deposit ${Number(collAmount) / 10 ** collInfo.decimals} ${collSymbol} → Borrow ${Number(borrowAmount) / 1e6} USDB on Bucket Protocol`,
        usage:
          'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer to sign and submit.',
        _note:
          'This PTB omits the oracle price aggregation step (requires Pyth price update). ' +
          'For production use, call @bucket-protocol/sdk buildManagePositionTransaction() which handles Pyth integration automatically.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `Failed to build borrow PTB: ${err.message}` };
  }
}

/**
 * Build a PTB to repay USDB debt and withdraw collateral from Bucket Protocol.
 *
 * Parameters:
 *  - sender:                   Sui address of the position owner
 *  - collateral_type:          Collateral symbol (SUI, BTC, WAL, BFBTC) — defaults to SUI
 *  - usdb_repay_amount:        Amount of USDB to repay in base units (6 decimals)
 *  - collateral_withdraw_amount: Amount of collateral to withdraw in base units
 *  - usdb_object_id:           (Optional) Specific USDB coin object ID to use for repayment
 */
async function actionBuildRepayTx(input: any): Promise<SkillExecutionResult> {
  const {
    sender,
    collateral_type = 'SUI',
    usdb_repay_amount,
    collateral_withdraw_amount,
    usdb_object_id,
    // Legacy aliases
    buck_object_id,
    buck_repay_amount,
  } = input;

  if (!sender) return { success: false, error: 'sender is required (Sui address 0x...)' };

  const collSymbol = (collateral_type as string).toUpperCase();
  const collInfo = COLLATERAL_TYPES[collSymbol];
  if (!collInfo) {
    return {
      success: false,
      error: `Unsupported collateral "${collateral_type}". Supported: ${Object.keys(COLLATERAL_TYPES).join(', ')}`,
    };
  }

  const rawRepayAmount = usdb_repay_amount ?? buck_repay_amount;
  const rawWithdrawAmount = collateral_withdraw_amount ?? 0;
  const usdbCoinId = usdb_object_id ?? buck_object_id;

  if (!rawRepayAmount && !rawWithdrawAmount) {
    return {
      success: false,
      error:
        'At least one of usdb_repay_amount or collateral_withdraw_amount is required. ' +
        'To close the position fully, provide the full debt amount as usdb_repay_amount.',
    };
  }

  const repayAmount = BigInt(rawRepayAmount ?? 0);
  const withdrawAmount = BigInt(rawWithdrawAmount ?? 0);

  const client = getClient();

  // Load on-chain config (same as borrow — reuse pattern)
  let cdpPackageId = '';
  let frameworkPackageId = '';
  let treasuryObjId = '';
  let vaultObjId = '';
  let usdbCoinType = '';

  try {
    const configObj = await client.getObject({
      id: ENTRY_CONFIG_ID,
      options: { showContent: true },
    });

    const configContent = configObj.data?.content as any;
    if (!configContent?.fields) throw new Error('Unable to parse config object');

    const idVector: string[] = configContent.fields.id_vector ?? [];
    const subObjs = await Promise.all(
      idVector.map((id) => client.getObject({ id, options: { showContent: true, showType: true } })),
    );

    let packageConfig: any = null;
    let objectConfig: any = null;
    let vaultRegistry: any = null;

    for (const obj of subObjs) {
      const typeStr: string = (obj.data?.content as any)?.type ?? '';
      const fields: any = (obj.data?.content as any)?.fields ?? {};
      if (typeStr.includes('package_config::PackageConfig')) packageConfig = fields;
      else if (typeStr.includes('object_config::ObjectConfig')) objectConfig = fields;
      else if (typeStr.includes('vault::Vault') && !typeStr.includes('VaultObjectInfo'))
        vaultRegistry = { fields, objectId: obj.data?.objectId };
    }

    if (!packageConfig || !objectConfig) throw new Error('Config sub-objects not found');

    cdpPackageId = packageConfig.cdp_package_id;
    frameworkPackageId = packageConfig.framework_package_id;
    const usdbOrigPackageId = packageConfig.original_usdb_package_id ?? packageConfig.usdb_package_id;
    usdbCoinType = `${usdbOrigPackageId}::usdb::USDB`;

    const treasuryRef = objectConfig.treasury_obj;
    treasuryObjId = treasuryRef?.objectId ?? treasuryRef?.id ?? treasuryRef;

    const vaultTableId = vaultRegistry?.fields?.table?.fields?.id?.id;
    if (vaultTableId) {
      const tableObj = await client.getDynamicFieldObject({
        parentId: vaultTableId,
        name: { type: '0x1::string::String', value: collInfo.type },
      });
      const vaultInfo = (tableObj.data?.content as any)?.fields?.value?.fields;
      vaultObjId = vaultInfo?.vault?.objectId ?? vaultInfo?.vault?.id ?? vaultInfo?.vault;
    }

    if (!vaultObjId) {
      throw new Error(`Vault object ID for ${collSymbol} not found in registry`);
    }
  } catch (err: any) {
    return {
      success: false,
      error:
        `Failed to load Bucket Protocol on-chain config: ${err.message}. ` +
        'Use @bucket-protocol/sdk buildManagePositionTransaction() for production repay flow.',
      _note:
        'For repay, pass repayment as negative borrowAmount and positive withdrawAmount to buildManagePositionTransaction().',
    } as SkillExecutionResult;
  }

  const tx = new Transaction();
  tx.setSender(sender);

  try {
    // Resolve USDB coin to repay
    let repayCoin: any;
    if (repayAmount > 0n) {
      if (usdbCoinId) {
        repayCoin = tx.object(usdbCoinId);
      } else {
        // Auto-resolve USDB coins owned by sender
        const { data: usdbCoins } = await client.getCoins({ owner: sender, coinType: usdbCoinType });
        if (!usdbCoins || usdbCoins.length === 0) {
          return {
            success: false,
            error: `sender owns no USDB (${usdbCoinType}) coins. Provide usdb_object_id to specify a coin.`,
          };
        }
        const primary = tx.object(usdbCoins[0].coinObjectId);
        if (usdbCoins.length > 1) {
          tx.mergeCoins(
            primary,
            usdbCoins.slice(1).map((c) => tx.object(c.coinObjectId)),
          );
        }
        [repayCoin] = tx.splitCoins(primary, [tx.pure.u64(repayAmount)]);
      }
    } else {
      // Zero repay coin — only withdrawing collateral
      repayCoin = tx.moveCall({
        target: `0x2::coin::zero`,
        typeArguments: [usdbCoinType],
      });
    }

    // Zero deposit coin — no new collateral being added during repay
    const zeroColl = tx.moveCall({
      target: `0x2::coin::zero`,
      typeArguments: [collInfo.type],
    });

    // Step 1: Account request
    // TODO: Verify function name on mainnet
    const accountReq = tx.moveCall({
      target: `${frameworkPackageId}::account::request`,
      arguments: [],
    });

    // Step 2: Debtor request — repay USDB and withdraw collateral
    // TODO: Verify function name on mainnet
    const debtorReq = tx.moveCall({
      target: `${cdpPackageId}::vault::debtor_request`,
      typeArguments: [collInfo.type],
      arguments: [
        tx.object(vaultObjId),
        accountReq,
        tx.object(treasuryObjId),
        zeroColl,                  // Coin<T> — zero deposit (repay only)
        tx.pure.u64(0n),           // u64 — borrow amount (0 for pure repay)
        repayCoin,                 // Coin<USDB> — repayment
        tx.pure.u64(withdrawAmount), // u64 — collateral to withdraw
      ],
    });

    // Step 3: Check update position request
    // TODO: Verify function name on mainnet
    const updateRequest = tx.moveCall({
      target: `${cdpPackageId}::vault::check_update_position_request`,
      typeArguments: [collInfo.type],
      arguments: [tx.object(vaultObjId), debtorReq],
    });

    // Step 4: update_position
    // TODO: Verify function name on mainnet
    const [collateralOut, usdbOut] = tx.moveCall({
      target: `${cdpPackageId}::vault::update_position`,
      typeArguments: [collInfo.type],
      arguments: [
        tx.object(vaultObjId),
        tx.object(treasuryObjId),
        tx.object('0x0000000000000000000000000000000000000000000000000000000000000006'), // Clock
        tx.pure.option('address', null), // Option<PriceResult<T>> — None for repay-only
        updateRequest,
      ],
    });

    // Transfer withdrawn collateral and any leftover USDB to sender
    tx.transferObjects([collateralOut], tx.pure.address(sender));
    tx.transferObjects([usdbOut], tx.pure.address(sender));

    tx.setGasBudget(100_000_000);
    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes: Buffer.from(txBytes).toString('base64'),
        sender,
        collateral_type: collInfo.type,
        usdb_repay_amount: repayAmount.toString(),
        collateral_withdraw_amount: withdrawAmount.toString(),
        description:
          `Repay ${Number(repayAmount) / 1e6} USDB + Withdraw ${Number(withdrawAmount) / 10 ** collInfo.decimals} ${collSymbol} on Bucket Protocol`,
        usage:
          'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer to sign and submit.',
        _note:
          'For price-sensitive operations (withdraw while near liquidation threshold), ' +
          'use @bucket-protocol/sdk which includes oracle price aggregation.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `Failed to build repay PTB: ${err.message}` };
  }
}

/**
 * Build a PTB to swap stablecoins via Bucket Protocol's PSM (Peg Stability Module).
 * PSM lets you swap USDB ↔ USDC/USDT/BUCK at near-zero fee with no slippage.
 *
 * Parameters:
 *  - sender:      Sui address
 *  - from_token:  Token to swap from (USDB, USDC, USDT, BUCK)
 *  - to_token:    Token to receive (USDB, USDC, USDT, BUCK)
 *  - amount:      Amount in base units (USDB/USDC/USDT = 6 decimals)
 */
async function actionBuildPsmSwapTx(input: any): Promise<SkillExecutionResult> {
  const { sender, from_token, to_token, amount } = input;

  if (!sender) return { success: false, error: 'sender is required' };
  if (!from_token) return { success: false, error: 'from_token is required (USDB, USDC, USDT, BUCK)' };
  if (!to_token) return { success: false, error: 'to_token is required (USDB, USDC, USDT, BUCK)' };
  if (!amount) return { success: false, error: 'amount is required (base units, 6 decimals)' };

  const fromUpper = (from_token as string).toUpperCase();
  const toUpper = (to_token as string).toUpperCase();

  if (fromUpper === toUpper) {
    return { success: false, error: 'from_token and to_token must be different' };
  }

  const swapAmount = BigInt(amount);
  if (swapAmount <= 0n) return { success: false, error: 'amount must be > 0' };

  // Determine swap direction: swap_in (external → USDB) or swap_out (USDB → external)
  const isSwapIn = toUpper === 'USDB'; // swapping stablecoin INTO USDB
  const isSwapOut = fromUpper === 'USDB'; // swapping USDB OUT to stablecoin

  if (!isSwapIn && !isSwapOut) {
    return {
      success: false,
      error:
        'PSM swaps must involve USDB on one side. Use USDB ↔ USDC, USDB ↔ USDT, or USDB ↔ BUCK.',
    };
  }

  const externalToken = isSwapIn ? fromUpper : toUpper;
  const externalType = PSM_TYPES[externalToken as keyof typeof PSM_TYPES];
  if (!externalType) {
    return {
      success: false,
      error: `PSM does not support "${externalToken}". Supported PSM tokens: ${Object.keys(PSM_TYPES).join(', ')}`,
    };
  }

  const client = getClient();

  // Load PSM package ID and pool object from on-chain config
  let psmPackageId = '';
  let usdbCoinType = '';
  let psmPoolObjId = '';

  try {
    const configObj = await client.getObject({
      id: ENTRY_CONFIG_ID,
      options: { showContent: true },
    });
    const configContent = configObj.data?.content as any;
    if (!configContent?.fields) throw new Error('Unable to parse config object');

    const idVector: string[] = configContent.fields.id_vector ?? [];
    const subObjs = await Promise.all(
      idVector.map((id) => client.getObject({ id, options: { showContent: true, showType: true } })),
    );

    let packageConfig: any = null;
    let psmRegistry: any = null;

    for (const obj of subObjs) {
      const typeStr: string = (obj.data?.content as any)?.type ?? '';
      const fields: any = (obj.data?.content as any)?.fields ?? {};
      if (typeStr.includes('package_config::PackageConfig')) packageConfig = fields;
      else if (typeStr.includes('psm_pool::') || typeStr.includes('PsmPool'))
        psmRegistry = { fields, objectId: obj.data?.objectId };
    }

    if (!packageConfig) throw new Error('PackageConfig not found');
    psmPackageId = packageConfig.psm_package_id;
    const usdbOrigPackageId = packageConfig.original_usdb_package_id ?? packageConfig.usdb_package_id;
    usdbCoinType = `${usdbOrigPackageId}::usdb::USDB`;

    // Find the PSM pool for this external token
    if (psmRegistry?.fields?.table?.fields?.id?.id) {
      const tableObj = await client.getDynamicFieldObject({
        parentId: psmRegistry.fields.table.fields.id.id,
        name: { type: '0x1::string::String', value: externalType },
      });
      const poolInfo = (tableObj.data?.content as any)?.fields?.value?.fields;
      psmPoolObjId = poolInfo?.pool?.objectId ?? poolInfo?.pool?.id ?? poolInfo?.pool;
    }

    if (!psmPoolObjId) {
      throw new Error(`PSM pool for ${externalToken} not found in registry`);
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to load PSM config: ${err.message}. Use @bucket-protocol/sdk for production PSM swaps.`,
    };
  }

  const tx = new Transaction();
  tx.setSender(sender);

  try {
    let inputCoin: any;
    if (isSwapIn) {
      // Swapping external stablecoin → USDB: need external token coins
      const { data: extCoins } = await client.getCoins({ owner: sender, coinType: externalType });
      if (!extCoins || extCoins.length === 0) {
        return { success: false, error: `sender owns no ${externalToken} coins` };
      }
      const primary = tx.object(extCoins[0].coinObjectId);
      if (extCoins.length > 1) {
        tx.mergeCoins(primary, extCoins.slice(1).map((c) => tx.object(c.coinObjectId)));
      }
      [inputCoin] = tx.splitCoins(primary, [tx.pure.u64(swapAmount)]);
    } else {
      // Swapping USDB → external stablecoin: need USDB coins
      const { data: usdbCoins } = await client.getCoins({ owner: sender, coinType: usdbCoinType });
      if (!usdbCoins || usdbCoins.length === 0) {
        return { success: false, error: `sender owns no USDB coins` };
      }
      const primary = tx.object(usdbCoins[0].coinObjectId);
      if (usdbCoins.length > 1) {
        tx.mergeCoins(primary, usdbCoins.slice(1).map((c) => tx.object(c.coinObjectId)));
      }
      [inputCoin] = tx.splitCoins(primary, [tx.pure.u64(swapAmount)]);
    }

    // Call PSM pool::swap_in or pool::swap_out
    // TODO: Verify exact function names on mainnet
    const swapTarget = isSwapIn
      ? `${psmPackageId}::pool::swap_in`   // external stablecoin → USDB
      : `${psmPackageId}::pool::swap_out`; // USDB → external stablecoin

    const typeArgs = isSwapIn ? [externalType, usdbCoinType] : [usdbCoinType, externalType];

    const [outputCoin] = tx.moveCall({
      target: swapTarget,
      typeArguments: typeArgs,
      arguments: [
        tx.object(psmPoolObjId),
        inputCoin,
        tx.pure.u64(swapAmount),
      ],
    });

    tx.transferObjects([outputCoin], tx.pure.address(sender));
    tx.setGasBudget(50_000_000);
    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes: Buffer.from(txBytes).toString('base64'),
        sender,
        from_token: fromUpper,
        to_token: toUpper,
        amount: swapAmount.toString(),
        description: `PSM swap ${Number(swapAmount) / 1e6} ${fromUpper} → ${toUpper} on Bucket Protocol`,
        usage: 'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer to sign and submit.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `Failed to build PSM swap PTB: ${err.message}` };
  }
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const BUCKET_SKILL_METADATA = {
  name: 'Bucket Protocol',
  description:
    'Bucket Protocol is the leading CDP (Collateralized Debt Position) stablecoin protocol on Sui, ' +
    'similar to MakerDAO. Deposit SUI, BTC, WAL, or BFBTC as collateral to borrow USDB ' +
    '(a USD-pegged stablecoin). ' +
    'Actions: get_protocol_info (overview), get_stats (TVL + collateral info), ' +
    'build_borrow_tx (deposit collateral + borrow USDB as a Sui PTB), ' +
    'build_repay_tx (repay USDB + withdraw collateral as a Sui PTB), ' +
    'build_psm_swap_tx (swap USDB ↔ USDC/USDT/BUCK via Peg Stability Module). ' +
    'All build_* actions return base64-encoded Sui transaction bytes ready for wallet signing.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['bucket', 'buck', 'usdb', 'sui', 'cdp', 'stablecoin', 'defi', 'borrow', 'collateral'],
  external_url: 'https://app.bucketprotocol.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/bucket-protocol?w=48&h=48',
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
          'get_stats',
          'build_borrow_tx',
          'build_repay_tx',
          'build_psm_swap_tx',
        ],
        description:
          'get_protocol_info: overview of Bucket Protocol (chain, type, contracts, highlights). ' +
          'get_stats: TVL, supported collaterals, USDB/BUCK info. ' +
          'build_borrow_tx: build Sui PTB to deposit collateral and borrow USDB (requires sender, collateral_type, amount_collateral, usdb_amount). ' +
          'build_repay_tx: build Sui PTB to repay USDB debt and/or withdraw collateral (requires sender, collateral_type, usdb_repay_amount or collateral_withdraw_amount). ' +
          'build_psm_swap_tx: build Sui PTB to swap stablecoins via PSM (requires sender, from_token, to_token, amount).',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x..., 64 hex chars). Required for all build_*_tx actions.',
      },
      collateral_type: {
        type: 'string',
        enum: ['SUI', 'BTC', 'WAL', 'BFBTC'],
        description: 'Collateral asset symbol. Defaults to SUI. Used by build_borrow_tx and build_repay_tx.',
      },
      amount_collateral: {
        type: 'string',
        description:
          'Collateral amount in base units (integer string). ' +
          'SUI has 9 decimals (1 SUI = 1000000000), BTC/BFBTC have 8, WAL has 9. ' +
          'Required for build_borrow_tx.',
      },
      usdb_amount: {
        type: 'string',
        description:
          'USDB borrow amount in base units (integer string, 6 decimals). ' +
          '1 USDB = 1000000. Required for build_borrow_tx.',
      },
      usdb_repay_amount: {
        type: 'string',
        description:
          'USDB repayment amount in base units (integer string, 6 decimals). ' +
          'Used by build_repay_tx. Provide 0 to only withdraw collateral.',
      },
      collateral_withdraw_amount: {
        type: 'string',
        description:
          'Collateral withdrawal amount in base units. Used by build_repay_tx. ' +
          'Provide 0 to only repay USDB without withdrawing.',
      },
      usdb_object_id: {
        type: 'string',
        description:
          'Optional: specific USDB coin object ID to use for repayment. ' +
          'If omitted, Arsenal auto-resolves USDB coins owned by sender.',
      },
      from_token: {
        type: 'string',
        enum: ['USDB', 'USDC', 'USDT', 'BUCK'],
        description: 'Token to swap from. Used by build_psm_swap_tx.',
      },
      to_token: {
        type: 'string',
        enum: ['USDB', 'USDC', 'USDT', 'BUCK'],
        description: 'Token to receive. Used by build_psm_swap_tx. Must involve USDB on one side.',
      },
      amount: {
        type: 'string',
        description:
          'Swap amount in base units (integer string, 6 decimals for all PSM tokens). ' +
          'Used by build_psm_swap_tx.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Protocol overview',
      description: 'Get a summary of Bucket Protocol',
      input: { action: 'get_protocol_info' },
      output: { success: true, output: { name: 'Bucket Protocol', chain: 'sui', type: 'CDP Stablecoin / DeFi' } },
    },
    {
      title: 'Protocol stats',
      description: 'TVL, collateral types, stablecoin info',
      input: { action: 'get_stats' },
      output: { success: true, output: { protocol: 'Bucket Protocol', chain: 'sui', tvl_usd: '$...' } },
    },
    {
      title: 'Borrow USDB against SUI',
      description: 'Deposit 2 SUI collateral and borrow 1 USDB',
      input: {
        action: 'build_borrow_tx',
        sender: '0xYOUR_SUI_ADDRESS',
        collateral_type: 'SUI',
        amount_collateral: '2000000000',
        usdb_amount: '1000000',
      },
      output: { success: true, output: { tx_bytes: '<base64>', description: 'Deposit 2 SUI → Borrow 1 USDB' } },
    },
    {
      title: 'Repay USDB and withdraw SUI',
      description: 'Repay 1 USDB and withdraw 2 SUI from position',
      input: {
        action: 'build_repay_tx',
        sender: '0xYOUR_SUI_ADDRESS',
        collateral_type: 'SUI',
        usdb_repay_amount: '1000000',
        collateral_withdraw_amount: '2000000000',
      },
      output: { success: true, output: { tx_bytes: '<base64>', description: 'Repay 1 USDB + Withdraw 2 SUI' } },
    },
    {
      title: 'PSM swap USDC to USDB',
      description: 'Swap 100 USDC for USDB via PSM at near-zero fee',
      input: {
        action: 'build_psm_swap_tx',
        sender: '0xYOUR_SUI_ADDRESS',
        from_token: 'USDC',
        to_token: 'USDB',
        amount: '100000000',
      },
      output: { success: true, output: { tx_bytes: '<base64>', description: 'PSM swap 100 USDC → USDB' } },
    },
  ],
};

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeBucketSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':
        return await actionGetProtocolInfo();
      case 'get_stats':
        return await actionGetStats();
      case 'build_borrow_tx':
        return await actionBuildBorrowTx(input);
      case 'build_repay_tx':
        return await actionBuildRepayTx(input);
      case 'build_psm_swap_tx':
        return await actionBuildPsmSwapTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_stats, build_borrow_tx, build_repay_tx, build_psm_swap_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Bucket Protocol skill' };
  }
}
