/**
 * Kriya DEX — AMM DEX on Sui
 *
 * Kriya is one of Sui's top AMM DEXes with stable and volatile pools.
 * The kriya-dex-sdk provides swap building; quotes are computed via devInspect.
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: kriya.finance
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// Package IDs
const PACKAGE_ID    = '0xa0eba10b173538c8fecca1dff298e488402cc9ff374f8a12ca7758eebe830b66';
const PACKAGE_ID_V1 = '0xe10f85f47c6d11f63e650aa7daf168c55ead9abb6da4227eba5dd5e4f8d890b1';

// Common Sui coin types
const COIN_TYPES: Record<string, { type: string; decimals: number }> = {
  SUI:  { type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI', decimals: 9 },
  USDC: { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6 },
  USDT: { type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', decimals: 6 },
  WETH: { type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN', decimals: 8 },
};

function resolveCoin(symbol: string): { type: string; decimals: number } {
  const entry = COIN_TYPES[symbol.toUpperCase()];
  if (!entry) throw new Error(`Unknown token "${symbol}". Supported: ${Object.keys(COIN_TYPES).join(', ')}, or pass full coin type.`);
  return entry;
}

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:     'Kriya DEX',
      chain:    'sui',
      type:     'AMM DEX',
      website:  'https://kriya.finance',
      package:  PACKAGE_ID,
      highlights: [
        'AMM with stable and volatile pool types',
        'Low-slippage stablecoin pools (stable mode)',
        'xKRIYA governance token staking',
        'Supports multi-hop routing via kriya-dex-sdk',
      ],
      pool_types: ['stable (low slippage for correlated assets)', 'volatile (standard AMM for uncorrelated assets)'],
    },
  };
}

async function actionGetPool(input: any): Promise<SkillExecutionResult> {
  const { pool_id } = input;
  if (!pool_id) return { success: false, error: 'pool_id is required' };

  try {
    const client = getClient();
    const obj = await client.getObject({
      id: pool_id,
      options: { showContent: true, showType: true },
    });

    if (!obj.data) return { success: false, error: `Pool ${pool_id} not found` };

    const fields = (obj.data.content as any)?.fields ?? {};
    return {
      success: true,
      output: {
        protocol:        'Kriya DEX',
        pool_id,
        type:            obj.data.type,
        token_x_reserve: fields.token_x_reserve ?? fields.reserve_x,
        token_y_reserve: fields.token_y_reserve ?? fields.reserve_y,
        is_stable:       fields.is_stable,
        lp_supply:       fields.lp_fee_percent !== undefined ? fields.lp_supply : null,
        fee_percent:     fields.lp_fee_percent ?? fields.fee,
        raw_fields:      fields,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_pool failed: ${err.message}` };
  }
}

async function actionGetQuote(input: any): Promise<SkillExecutionResult> {
  const { pool_id, token_in, amount_in } = input;
  if (!pool_id)   return { success: false, error: 'pool_id is required' };
  if (!token_in)  return { success: false, error: 'token_in is required' };
  if (!amount_in) return { success: false, error: 'amount_in is required' };

  let coinInType: string;
  let coinInDecimals: number;
  try {
    const resolved = resolveCoin(token_in);
    coinInType     = resolved.type;
    coinInDecimals = resolved.decimals;
  } catch {
    coinInType     = token_in;
    coinInDecimals = 9;
  }

  const parsedAmount = parseFloat(String(amount_in));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount_in must be a positive number' };
  }

  try {
    const client = getClient();
    // Get pool to determine token types
    const obj = await client.getObject({
      id: pool_id,
      options: { showContent: true, showType: true },
    });
    const poolType = obj.data?.type ?? '';
    // Pool type: spot_dex::Pool<CoinX, CoinY>
    const match = poolType.match(/Pool<(.+),\s*(.+)>/);
    const coinXType = match?.[1]?.trim();
    const coinYType = match?.[2]?.trim()?.replace('>', '');

    const isXtoY = coinInType === coinXType ||
      coinInType.toLowerCase() === coinXType?.toLowerCase();

    const fn = isXtoY ? 'spot_dex::get_amount_out_x_to_y' : 'spot_dex::get_amount_out_y_to_x';
    const amountBaseUnits = BigInt(Math.round(parsedAmount * 10 ** coinInDecimals));

    // Use devInspect for quote
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::${fn.split('::')[0]}::${fn.split('::')[1]}`,
      typeArguments: [coinXType ?? coinInType, coinYType ?? ''],
      arguments: [
        tx.object(pool_id),
        tx.pure.u64(amountBaseUnits),
      ],
    });

    const result = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });

    const returnVals = result?.results?.[0]?.returnValues ?? [];
    let amountOut = null;
    if (returnVals.length > 0) {
      const raw = BigInt('0x' + Buffer.from(returnVals[0]?.[0] ?? []).reverse().toString('hex'));
      const coinOutType = isXtoY ? coinYType : coinXType;
      let coinOutDecimals = 9;
      try {
        const sym = Object.entries(COIN_TYPES).find(([, v]) => v.type === coinOutType);
        if (sym) coinOutDecimals = sym[1].decimals;
      } catch {}
      amountOut = Number(raw) / 10 ** coinOutDecimals;
    }

    return {
      success: true,
      output: {
        protocol:  'Kriya DEX',
        pool_id,
        token_in:  coinInType,
        token_out: isXtoY ? coinYType : coinXType,
        amount_in: parsedAmount,
        amount_out: amountOut,
        direction: isXtoY ? 'X→Y' : 'Y→X',
        _note: 'Quote computed via devInspect on-chain call.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_quote failed: ${err.message}` };
  }
}

async function actionBuildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { pool_id, sender, token_in, amount_in, min_amount_out = '0' } = input;
  if (!pool_id)   return { success: false, error: 'pool_id is required' };
  if (!sender)    return { success: false, error: 'sender is required' };
  if (!token_in)  return { success: false, error: 'token_in is required' };
  if (!amount_in) return { success: false, error: 'amount_in is required' };

  let coinInType: string;
  let coinInDecimals: number;
  try {
    const resolved = resolveCoin(token_in);
    coinInType     = resolved.type;
    coinInDecimals = resolved.decimals;
  } catch {
    coinInType     = token_in;
    coinInDecimals = 9;
  }

  const parsedAmount = parseFloat(String(amount_in));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount_in must be a positive number' };
  }
  const amountBaseUnits = BigInt(Math.round(parsedAmount * 10 ** coinInDecimals));
  const minOut = BigInt(String(min_amount_out));

  try {
    const client = getClient();

    // Get pool type to determine coin types
    const obj = await client.getObject({
      id: pool_id,
      options: { showContent: true, showType: true },
    });
    const poolType = obj.data?.type ?? '';
    const match = poolType.match(/Pool<(.+),\s*(.+)>/);
    const coinXType = match?.[1]?.trim() ?? coinInType;
    const coinYType = match?.[2]?.trim()?.replace('>', '') ?? '';

    const isXtoY = coinInType === coinXType ||
      coinInType.toLowerCase() === coinXType?.toLowerCase();

    // Use kriya-dex-sdk for swap tx building
    const { Dex } = await import('kriya-dex-sdk');
    const dex = new Dex(getFullnodeUrl('mainnet'));

    const poolObj = (obj.data?.content as any)?.fields ?? {};
    const poolForSdk = {
      objectId:       pool_id,
      token_x:        coinXType,
      token_y:        coinYType,
      is_stable:      poolObj.is_stable ?? false,
      lp_fee_percent: poolObj.lp_fee_percent ?? 30,
      protocol_fee_percent: poolObj.protocol_fee_percent ?? 20,
    };

    const tx = new Transaction();
    tx.setSender(sender);

    // Resolve input coin
    let inputCoinArg: any;
    if (coinInType === COIN_TYPES.SUI.type) {
      const [c] = tx.splitCoins(tx.gas, [amountBaseUnits]);
      inputCoinArg = c;
    } else {
      const { data: ownedCoins } = await client.getCoins({ owner: sender, coinType: coinInType });
      if (!ownedCoins || ownedCoins.length === 0) {
        return { success: false, error: `sender ${sender} has no ${token_in.toUpperCase()} coins` };
      }
      const primary = tx.object(ownedCoins[0].coinObjectId);
      if (ownedCoins.length > 1) {
        tx.mergeCoins(primary, ownedCoins.slice(1).map(c => tx.object(c.coinObjectId)));
      }
      const [split] = tx.splitCoins(primary, [amountBaseUnits]);
      inputCoinArg = split;
    }

    dex.swap(poolForSdk as any, coinInType, amountBaseUnits, inputCoinArg, minOut, tx, sender);
    tx.setGasBudget(100_000_000);

    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes:    Buffer.from(txBytes).toString('base64'),
        sender,
        pool_id,
        token_in:    coinInType,
        token_out:   isXtoY ? coinYType : coinXType,
        amount_in:   parsedAmount,
        min_out:     String(minOut),
        gas_budget:  '100000000',
        description: `Swap ${parsedAmount} ${token_in.toUpperCase()} on Kriya DEX`,
        usage:       'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet signer.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_swap_tx failed: ${err.message}` };
  }
}

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const KRIYA_SKILL_METADATA = {
  name: 'Kriya DEX',
  description:
    'Kriya is a leading AMM DEX on Sui with stable and volatile pool types. ' +
    'Query pool details, get swap quotes via on-chain devInspect, and build ' +
    'real Sui PTBs for token swaps. Returns base64 tx_bytes ready for signing.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  tags: ['kriya', 'sui', 'dex', 'amm', 'swap', 'defi'],
  external_url: 'https://kriya.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/kriya?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_pool', 'get_quote', 'build_swap_tx'],
        description:
          'get_protocol_info: Kriya overview and package addresses. ' +
          'get_pool: get pool details (reserves, fee, stable/volatile type) by pool_id. ' +
          'get_quote: compute swap output via devInspect (requires pool_id, token_in, amount_in). ' +
          'build_swap_tx: build PTB for swap (requires pool_id, sender, token_in, amount_in).',
      },
      pool_id:        { type: 'string', description: 'Kriya pool object ID (0x...).' },
      sender:         { type: 'string', description: 'Sui wallet address. Required for build_swap_tx.' },
      token_in:       { type: 'string', description: 'Input token symbol (SUI, USDC, USDT, WETH) or full coin type.' },
      amount_in:      { type: 'string', description: 'Human-readable input amount (e.g. "10").' },
      min_amount_out: { type: 'string', description: 'Minimum output in base units for slippage protection (default "0").' },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'Get pool details', input: { action: 'get_pool', pool_id: '0xPOOL_ID' } },
    { title: 'Get swap quote', input: { action: 'get_quote', pool_id: '0xPOOL_ID', token_in: 'SUI', amount_in: '10' } },
    { title: 'Build swap tx', input: { action: 'build_swap_tx', pool_id: '0xPOOL_ID', sender: '0xYOUR_ADDRESS', token_in: 'SUI', amount_in: '10' } },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeKriyaSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return await actionGetProtocolInfo();
      case 'get_pool':          return await actionGetPool(input);
      case 'get_quote':         return await actionGetQuote(input);
      case 'build_swap_tx':     return await actionBuildSwapTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_pool, get_quote, build_swap_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Kriya skill' };
  }
}
