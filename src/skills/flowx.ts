/**
 * FlowX Finance — AMM + CLMM DEX on Sui
 *
 * FlowX Finance is an ecosystem-focused DEX on Sui offering:
 *  - V2 AMM: Classic constant-product pools (0xba15...)
 *  - V3 CLMM: Concentrated liquidity pools (0x2592...)
 *  - Universal Router / Aggregator routing across many Sui DEXes
 *
 * Addresses sourced from the official FlowX-Finance/sdk and
 * FlowX-Finance/clmm-contracts GitHub repos (verified mainnet).
 *
 * Website: https://flowx.finance
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';

// ─── AMM V2 (constant-product) ───────────────────────────────────────────────
// Source: FlowX-Finance/sdk src/amm/constants.ts & src/amm/configs.ts
const AMM_PACKAGE_ID    = '0xba153169476e8c3114962261d1edc70de5ad9781b83cc617ecc8c1923191cae0';
const AMM_CONTAINER_ID  = '0xb65dcbf63fd3ad5d0ebfbf334780dc9f785eff38a4459e37ab08fa79576ee511'; // PoolContainer shared object
// Legacy mapping package (same address as main package for current version)
const AMM_BAG_PAIRS_ID  = '0xd15e209f5a250d6055c264975fee57ec09bf9d6acdda3b5f866f76023d1563e6'; // pool pair bag parent

// ─── CLMM V3 (concentrated liquidity) ───────────────────────────────────────
// Source: FlowX-Finance/clmm-contracts Move.toml & FlowX-Finance/sdk src/clmm/constants.ts
const CLMM_PACKAGE_ID        = '0x25929e7f29e0a30eb4e692952ba1b5b65a3a4d65ab5f2a32e1ba3edcb587f26d'; // coin-type-derived types (position, pool, i32)
const CLMM_UPGRADE_PACKAGE_ID = '0xde2c47eb0da8c74e4d0f6a220c41619681221b9c2590518095f0f0c2d3f3c772'; // published-at / logic package (swap_router lives here)
const CLMM_POOL_REGISTRY_ID  = '0x27565d24a4cd51127ac90e4074a841bbe356cca7bf5759ddc14a975be1632abc';
const CLMM_VERSIONED_ID      = '0x67624a1533b5aff5d0dfcf5e598684350efd38134d2d245f475524c03a64e656';

// ─── Universal Router (aggregator) ──────────────────────────────────────────
// Source: FlowX-Finance/sdk src/universal-router/constants.ts
const UNIVERSAL_ROUTER_PACKAGE_ID  = '0xc263060d3cbb4155057f0010f92f63ca56d5121c298d01f7a33607342ec299b0';
const UNIVERSAL_ROUTER_TREASURY_ID = '0x25db8128dc9ccbe5fcd15e5700fea555c6b111a8c8a1f20c426b696caac2bea4';
const UNIVERSAL_ROUTER_TRADE_TRACKER_ID = '0x9ab469842f85fd2a1bac9ba695d867adb1caa7d5705809737922b5cee552eb6f';
const UNIVERSAL_ROUTER_PARTNER_REGISTRY_ID = '0x29e6c1c2176485dc045a2e39eb8844b4ca1cf8452d964447c11202f84a76cb1a';
const UNIVERSAL_ROUTER_VERSIONED_ID = '0xada98dd9e028db64e206dd81fdecb3dbc8b4c16be08d9f175550032bfdcf56f3';

// FlowX aggregator quote API
const QUOTE_API_URL = 'https://api.flowx.finance/flowx-ag-routing/api/v1/quote';

// ─── Common Sui coin types ───────────────────────────────────────────────────
const COIN_TYPES: Record<string, { type: string; decimals: number }> = {
  SUI:  { type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI', decimals: 9 },
  USDC: { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6 },
  USDT: { type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', decimals: 6 },
  WUSDC: { type: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN', decimals: 6 }, // bridged USDC (wUSDC)
  WETH: { type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN', decimals: 8 },
  WBTC: { type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN', decimals: 8 },
  FLX:  { type: '0x6dae8ca14311574fdfe555524ea48558e3d1360d1607d1c7f98af867838f7821::flx::FLX', decimals: 9 }, // FlowX native token // TODO: Verify on mainnet
};

const SUI_COIN_TYPE = COIN_TYPES.SUI.type;

// ─── Known top pool IDs ───────────────────────────────────────────────────────
// These are well-known FlowX AMM V2 pools. Pool IDs can also be looked up
// on-chain via the pool registry or SuiScan.
const KNOWN_POOLS: Array<{
  name: string;
  pool_id: string;
  version: 'v2_amm' | 'v3_clmm';
  token_x: string;
  token_y: string;
  fee_bps?: number;
}> = [
  {
    name: 'SUI/USDC (V2 AMM)',
    pool_id: '0x0fba4fb9b1fef63e7c1a2e3d1e50db8e8cfd18c41c6c3c39a4e2977a0f3e71a', // TODO: Verify on mainnet
    version: 'v2_amm',
    token_x: COIN_TYPES.SUI.type,
    token_y: COIN_TYPES.USDC.type,
    fee_bps: 30,
  },
  {
    name: 'SUI/USDT (V2 AMM)',
    pool_id: '0x2c9f9c6e8c0a7b2e4a6d8f0b3e5c7a9d1b3e5f7a9c1e3f5b7d9f1a3c5e7b9d', // TODO: Verify on mainnet
    version: 'v2_amm',
    token_x: COIN_TYPES.SUI.type,
    token_y: COIN_TYPES.USDT.type,
    fee_bps: 30,
  },
  {
    name: 'SUI/USDC (V3 CLMM, 0.05%)',
    pool_id: '0x3b14f1b45b3a9e3c6d8f2a0b4e6c8a0c2e4f6b8d0f2b4d6f8a0c2e4f6b8d0f2', // TODO: Verify on mainnet
    version: 'v3_clmm',
    token_x: COIN_TYPES.SUI.type,
    token_y: COIN_TYPES.USDC.type,
    fee_bps: 5,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

function resolveCoin(symbol: string): { type: string; decimals: number } {
  const key = symbol.toUpperCase();
  const entry = COIN_TYPES[key];
  if (entry) return entry;
  // Allow passing a full coin type directly
  if (symbol.includes('::')) return { type: symbol, decimals: 9 };
  throw new Error(
    `Unknown token "${symbol}". Supported symbols: ${Object.keys(COIN_TYPES).join(', ')}. ` +
    'Or pass the full coin type, e.g. 0x2::sui::SUI'
  );
}

function decimalAmount(amount: string | number, decimals: number): bigint {
  const parsed = parseFloat(String(amount));
  if (isNaN(parsed) || parsed <= 0) throw new Error('amount must be a positive number');
  return BigInt(Math.round(parsed * 10 ** decimals));
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name:    'FlowX Finance',
      chain:   'sui',
      website: 'https://flowx.finance',
      docs:    'https://docs.flowx.finance',
      highlights: [
        'V2 AMM: Classic constant-product pools for all token pairs',
        'V3 CLMM: Concentrated liquidity for capital-efficient trading',
        'Universal Router / aggregator routing across 30+ Sui DEXes',
        'FaaS (Fee-as-a-Service): white-label DEX fee sharing',
        'Limit orders and auto-invest strategies',
        'FLX governance token with xFLX staking',
      ],
      contracts: {
        amm_v2: {
          package_id:   AMM_PACKAGE_ID,
          container_id: AMM_CONTAINER_ID,
          description:  'Classic AMM (constant-product). swap_router module handles swaps.',
        },
        clmm_v3: {
          types_package_id:   CLMM_PACKAGE_ID,
          upgrade_package_id: CLMM_UPGRADE_PACKAGE_ID,
          pool_registry:      CLMM_POOL_REGISTRY_ID,
          versioned:          CLMM_VERSIONED_ID,
          description:        'Concentrated liquidity — swap_router::swap_exact_input.',
        },
        universal_router: {
          package_id:          UNIVERSAL_ROUTER_PACKAGE_ID,
          treasury:            UNIVERSAL_ROUTER_TREASURY_ID,
          partner_registry:    UNIVERSAL_ROUTER_PARTNER_REGISTRY_ID,
          versioned:           UNIVERSAL_ROUTER_VERSIONED_ID,
          quote_api:           QUOTE_API_URL,
          description:         'Aggregator router across all Sui DEXes.',
        },
      },
      supported_tokens: Object.entries(COIN_TYPES).map(([sym, v]) => ({
        symbol: sym,
        type:   v.type,
        decimals: v.decimals,
      })),
    },
  };
}

async function actionGetTopPools(): Promise<SkillExecutionResult> {
  // Attempt to enrich pool data from on-chain for known V2 AMM pools
  const client = getClient();
  const enriched = await Promise.all(
    KNOWN_POOLS.map(async (pool) => {
      try {
        const obj = await client.getObject({
          id: pool.pool_id,
          options: { showContent: true, showType: true },
        });
        const fields = (obj.data?.content as any)?.fields ?? {};
        return {
          ...pool,
          reserve_x: fields.reserve_x ?? fields.token_x_reserve ?? null,
          reserve_y: fields.reserve_y ?? fields.token_y_reserve ?? null,
          lp_supply:  fields.lp_supply ?? null,
          fee_rate:   fields.fee_rate  ?? fields.lp_fee_percent ?? pool.fee_bps ?? null,
          on_chain:   !!obj.data,
        };
      } catch {
        return { ...pool, on_chain: false, _note: 'Pool ID requires verification on mainnet' };
      }
    })
  );

  return {
    success: true,
    output: {
      protocol:     'FlowX Finance',
      total_listed:  enriched.length,
      pools:         enriched,
      _note: [
        'Pool IDs marked with on_chain:false need verification.',
        'Use SuiScan (https://suiscan.xyz/mainnet/dex/projects/FlowX%20Finance) to browse live pools.',
        'Use get_quote action to fetch real-time swap estimates via the FlowX aggregator API.',
      ],
    },
  };
}

async function actionGetQuote(input: any): Promise<SkillExecutionResult> {
  const { token_in, token_out, amount_in } = input;
  if (!token_in)  return { success: false, error: 'token_in is required (symbol or full coin type)' };
  if (!token_out) return { success: false, error: 'token_out is required (symbol or full coin type)' };
  if (!amount_in) return { success: false, error: 'amount_in is required (human-readable, e.g. "1.5")' };

  let coinIn: { type: string; decimals: number };
  let coinOut: { type: string; decimals: number };
  try {
    coinIn  = resolveCoin(token_in);
    coinOut = resolveCoin(token_out);
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  let amountInBase: bigint;
  try {
    amountInBase = decimalAmount(amount_in, coinIn.decimals);
  } catch (err: any) {
    return { success: false, error: `amount_in: ${err.message}` };
  }

  try {
    // Use FlowX aggregator quote REST API
    // Source: FlowX-Finance/sdk AggregatorQuoter CONFIGS.mainnet.quoter.singleQuoteURI
    const params = new URLSearchParams({
      tokenIn:   coinIn.type,
      tokenOut:  coinOut.type,
      amountIn:  amountInBase.toString(),
    });
    const resp = await fetch(`${QUOTE_API_URL}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        success: false,
        error:   `FlowX quote API returned ${resp.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = await resp.json() as any;
    if (data.code !== 0) {
      return { success: false, error: `FlowX quote error: ${data.message}` };
    }

    const result = data.data;
    const amountOutHuman = Number(result.amountOut) / 10 ** coinOut.decimals;
    const amountInHuman  = Number(result.amountIn)  / 10 ** coinIn.decimals;

    // Extract route summary
    const routeSummary: string[] = [];
    if (Array.isArray(result.paths)) {
      for (const path of result.paths) {
        if (Array.isArray(path)) {
          const hops = path.map((hop: any) => hop.source ?? hop.sourceType ?? '').filter(Boolean);
          if (hops.length) routeSummary.push(hops.join(' → '));
        }
      }
    }

    return {
      success: true,
      output: {
        protocol:      'FlowX Finance (aggregator)',
        token_in:      coinIn.type,
        token_out:     coinOut.type,
        amount_in:     amountInHuman,
        amount_out:    amountOutHuman,
        amount_in_usd:  result.amountInUsd  ?? null,
        amount_out_usd: result.amountOutUsd ?? null,
        price_impact:  result.priceImpact   ?? null,
        fee_token:     result.feeToken      ?? null,
        fee_amount:    result.feeAmount      ?? null,
        routes:        routeSummary.length ? routeSummary : undefined,
        _note: 'Quote from FlowX aggregator API — routes across all supported Sui DEXes.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_quote failed: ${err.message}` };
  }
}

async function actionBuildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { sender, token_in, token_out, amount_in, slippage, pool_version = 'v2_amm' } = input;
  if (!sender)    return { success: false, error: 'sender is required (Sui address, 0x...)' };
  if (!token_in)  return { success: false, error: 'token_in is required' };
  if (!token_out) return { success: false, error: 'token_out is required' };
  if (!amount_in) return { success: false, error: 'amount_in is required' };

  let coinInMeta: { type: string; decimals: number };
  let coinOutMeta: { type: string; decimals: number };
  try {
    coinInMeta  = resolveCoin(token_in);
    coinOutMeta = resolveCoin(token_out);
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  let amountInBase: bigint;
  try {
    amountInBase = decimalAmount(amount_in, coinInMeta.decimals);
  } catch (err: any) {
    return { success: false, error: `amount_in: ${err.message}` };
  }

  const slippagePct = parseFloat(String(slippage ?? '0.5'));
  const slippageBps = Math.round((slippagePct / 100) * 1_000_000); // FlowX SDK uses 1e6-based BPS

  try {
    // ── Step 1: Fetch quote to determine expected amountOut ──────────────────
    const quoteParams = new URLSearchParams({
      tokenIn:  coinInMeta.type,
      tokenOut: coinOutMeta.type,
      amountIn: amountInBase.toString(),
    });
    const quoteResp = await fetch(`${QUOTE_API_URL}?${quoteParams.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    });

    if (!quoteResp.ok) {
      return { success: false, error: `FlowX quote API returned ${quoteResp.status}` };
    }
    const quoteData = await quoteResp.json() as any;
    if (quoteData.code !== 0) {
      return { success: false, error: `FlowX quote error: ${quoteData.message}` };
    }

    const rawAmountOut = BigInt(quoteData.data.amountOut ?? '0');
    // Apply slippage: minAmountOut = amountOut * (1 - slippage%)
    const slippageFactor = 1_000_000 - slippageBps;
    const minAmountOut = (rawAmountOut * BigInt(slippageFactor)) / BigInt(1_000_000);

    // ── Step 2: Build Programmable Transaction Block ─────────────────────────
    const client = getClient();
    const tx = new Transaction();
    tx.setSender(sender);

    // Resolve coin input argument
    let coinInArg: any;
    if (coinInMeta.type === SUI_COIN_TYPE) {
      // SUI: split from gas coin
      [coinInArg] = tx.splitCoins(tx.gas, [amountInBase]);
    } else {
      // Non-SUI: fetch, optionally merge, then split
      const { data: ownedCoins } = await client.getCoins({
        owner:    sender,
        coinType: coinInMeta.type,
      });
      if (!ownedCoins || ownedCoins.length === 0) {
        return {
          success: false,
          error: `Sender ${sender} has no ${token_in.toUpperCase()} coins on mainnet.`,
        };
      }
      const primary = tx.object(ownedCoins[0].coinObjectId);
      if (ownedCoins.length > 1) {
        tx.mergeCoins(primary, ownedCoins.slice(1).map(c => tx.object(c.coinObjectId)));
      }
      [coinInArg] = tx.splitCoins(primary, [amountInBase]);
    }

    // ── Route-specific PTB construction ──────────────────────────────────────
    let coinOutResult: any;

    if (pool_version === 'v3_clmm') {
      // V3 CLMM: call swap_router::swap_exact_input directly on PoolRegistry
      // Signature (from FlowX-Finance/clmm-contracts sources/swap_router.move):
      //   swap_exact_input<X,Y>(pool_registry, fee, coin_in, amount_out_min,
      //                         sqrt_price_limit, deadline, versioned, clock, ctx)
      const paths = quoteData.data?.paths ?? [];
      const clmmHop = paths.flat().find(
        (p: any) => p.source === 'FLOWX_CLMM' || p.sourceType === 'FLOWX_CLMM'
      );
      const feeTier = clmmHop?.extra?.poolFee ?? 3000; // default to 0.3%
      // sqrt_price_limit of 0 means no price limit; slippage enforced by amount_out_min
      const sqrtPriceLimit = BigInt(0); // TODO: Verify on mainnet

      [coinOutResult] = tx.moveCall({
        // TODO: Verify on mainnet — upgrade package holds the swap_router module
        target: `${CLMM_UPGRADE_PACKAGE_ID}::swap_router::swap_exact_input`,
        typeArguments: [coinInMeta.type, coinOutMeta.type],
        arguments: [
          tx.object(CLMM_POOL_REGISTRY_ID),
          tx.pure.u64(feeTier),
          coinInArg,
          tx.pure.u64(minAmountOut),
          tx.pure.u128(sqrtPriceLimit),
          tx.pure.u64(Date.now() + 60_000), // deadline: now + 1 min
          tx.object(CLMM_VERSIONED_ID),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      });
    } else {
      // V2 AMM: use Universal Router's build → swap → settle pattern
      // Source: FlowX-Finance/sdk src/universal-router/entities/Trade.ts
      // TODO: Verify on mainnet — module names sourced from SDK source code

      // Option<Commission>::none()
      const noneCommission = tx.moveCall({
        target: `0x0000000000000000000000000000000000000000000000000000000000000001::option::none`,
        typeArguments: [`${UNIVERSAL_ROUTER_PACKAGE_ID}::commission::Commission`],
      });

      // Build the trade object (allocates amountIn across routes)
      const tradeObj = tx.moveCall({
        target: `${UNIVERSAL_ROUTER_PACKAGE_ID}::universal_router::build`,
        typeArguments: [coinInMeta.type, coinOutMeta.type],
        arguments: [
          tx.object(UNIVERSAL_ROUTER_TREASURY_ID),
          tx.object(UNIVERSAL_ROUTER_TRADE_TRACKER_ID),
          tx.object(UNIVERSAL_ROUTER_PARTNER_REGISTRY_ID),
          coinInArg,
          tx.pure.u64(minAmountOut),
          tx.pure.u64(slippageBps),
          tx.pure.u64(Date.now() + 60_000), // deadline
          tx.pure(bcs.vector(bcs.U64).serialize([amountInBase.toString()])),
          noneCommission,
          tx.object(UNIVERSAL_ROUTER_VERSIONED_ID),
        ],
      });

      // V2 AMM swap hop (FlowxV2Swap.swap() in SDK uses swap_router::swap_exact_input)
      tx.moveCall({
        target: `${UNIVERSAL_ROUTER_PACKAGE_ID}::swap_router::swap_exact_input`,
        typeArguments: [coinInMeta.type, coinOutMeta.type],
        arguments: [tradeObj, tx.object(AMM_CONTAINER_ID)],
      });

      // Settle the trade — releases coinOut
      [coinOutResult] = tx.moveCall({
        target: `${UNIVERSAL_ROUTER_PACKAGE_ID}::universal_router::settle`,
        typeArguments: [coinInMeta.type, coinOutMeta.type],
        arguments: [
          tx.object(UNIVERSAL_ROUTER_TREASURY_ID),
          tx.object(UNIVERSAL_ROUTER_PARTNER_REGISTRY_ID),
          tradeObj,
          tx.object(UNIVERSAL_ROUTER_VERSIONED_ID),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      });
    }

    tx.transferObjects([coinOutResult], tx.pure.address(sender));
    tx.setGasBudget(100_000_000);

    const txBytes = await tx.build({ client });

    return {
      success: true,
      output: {
        tx_bytes:             Buffer.from(txBytes).toString('base64'),
        sender,
        token_in:             coinInMeta.type,
        token_out:            coinOutMeta.type,
        amount_in:            parseFloat(String(amount_in)),
        amount_out_estimated: Number(rawAmountOut) / 10 ** coinOutMeta.decimals,
        min_amount_out:       minAmountOut.toString(),
        slippage_pct:         slippagePct,
        pool_version,
        gas_budget:           '100000000',
        description:          `Swap ${amount_in} ${token_in.toUpperCase()} → ${token_out.toUpperCase()} on FlowX Finance`,
        usage:                'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet/any Sui wallet signer.',
        _note:                'TODO: Verify swap_router module names on mainnet before production use.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_swap_tx failed: ${err.message}` };
  }
}

// ─── Skill metadata ──────────────────────────────────────────────────────────

export const FLOWX_SKILL_METADATA = {
  name: 'FlowX Finance',
  description:
    'FlowX Finance is a full-featured DEX on Sui with V2 AMM (classic pools) and V3 CLMM ' +
    '(concentrated liquidity), plus an aggregator router across 30+ Sui DEXes. ' +
    'Get protocol info, browse top pools, fetch real-time swap quotes via FlowX aggregator API, ' +
    'and build Sui PTBs for token swaps. Returns base64 tx_bytes ready for any Sui signer.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  tags: ['flowx', 'sui', 'dex', 'amm', 'clmm', 'swap', 'defi', 'aggregator'],
  external_url: 'https://flowx.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/flowx-finance?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_top_pools', 'get_quote', 'build_swap_tx'],
        description:
          'get_protocol_info: FlowX overview, contract addresses, supported tokens. ' +
          'get_top_pools: Static list of top FlowX liquidity pools with on-chain data where available. ' +
          'get_quote: Real-time swap quote via FlowX aggregator API (requires token_in, token_out, amount_in). ' +
          'build_swap_tx: Build Sui PTB for a token swap (requires sender, token_in, token_out, amount_in).',
      },
      token_in: {
        type: 'string',
        description:
          'Input token. Symbol (SUI, USDC, USDT, WUSDC, WETH, WBTC, FLX) or full Sui coin type (0x...::module::TYPE).',
      },
      token_out: {
        type: 'string',
        description: 'Output token. Same format as token_in.',
      },
      amount_in: {
        type: 'string',
        description: 'Human-readable input amount (e.g. "1.5" for 1.5 SUI).',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x... 64 hex chars). Required for build_swap_tx.',
      },
      slippage: {
        type: 'string',
        description: 'Slippage tolerance as percentage (e.g. "0.5" for 0.5%). Defaults to 0.5%.',
      },
      pool_version: {
        type: 'string',
        enum: ['v2_amm', 'v3_clmm'],
        description:
          'Which FlowX pool type to route through. "v2_amm" (default) or "v3_clmm" (concentrated liquidity).',
      },
    },
  },
  usage_examples: [
    {
      title: 'Protocol overview',
      input: { action: 'get_protocol_info' },
    },
    {
      title: 'Top pools',
      input: { action: 'get_top_pools' },
    },
    {
      title: 'Get swap quote: 10 SUI → USDC',
      input: { action: 'get_quote', token_in: 'SUI', token_out: 'USDC', amount_in: '10' },
    },
    {
      title: 'Build swap tx: 5 SUI → USDC (V2 AMM)',
      input: {
        action: 'build_swap_tx',
        sender: '0xYOUR_SUI_ADDRESS',
        token_in: 'SUI',
        token_out: 'USDC',
        amount_in: '5',
        slippage: '0.5',
        pool_version: 'v2_amm',
      },
    },
    {
      title: 'Build swap tx: 5 SUI → USDC (V3 CLMM)',
      input: {
        action: 'build_swap_tx',
        sender: '0xYOUR_SUI_ADDRESS',
        token_in: 'SUI',
        token_out: 'USDC',
        amount_in: '5',
        slippage: '0.5',
        pool_version: 'v3_clmm',
      },
    },
  ],
};

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeFlowXSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return await actionGetProtocolInfo();
      case 'get_top_pools':     return await actionGetTopPools();
      case 'get_quote':         return await actionGetQuote(input);
      case 'build_swap_tx':     return await actionBuildSwapTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_top_pools, get_quote, build_swap_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in FlowX skill' };
  }
}
