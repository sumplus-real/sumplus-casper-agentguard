/**
 * Official Skill: Cetus Protocol (cetus.zone)
 *
 * Cetus is the leading Concentrated Liquidity Market Maker (CLMM) DEX on Sui
 * and Aptos. $90B+ total volume, 17M+ accounts, 183M+ trades.
 *
 * Supports: swap quotes, pool queries, liquidity position management,
 * DCA strategy info, token price lookups, and build_swap_tx (real PTB for
 * server-side wallet signing via Privy / any Sui signer).
 */

import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

// ── Sui mainnet verified coin type registry ──────────────────────────────────
// Addresses verified against cetus.zone swap app and SuiScan explorer.
const COIN_REGISTRY: Record<string, { type: string; decimals: number }> = {
  SUI:  { type: '0x2::sui::SUI',                                                                                            decimals: 9 },
  USDC: { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',                          decimals: 6 },
  USDT: { type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',                          decimals: 6 },
  CETUS:{ type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',                         decimals: 9 },
  WETH: { type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN',                          decimals: 8 },
  WBTC: { type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN',                          decimals: 8 },
  // Testnet (Cetus + DeepBook only on testnet)
  'SUI:testnet': { type: '0x2::sui::SUI', decimals: 9 },
};

// Providers that require Pyth oracle price feeds — excluded from routing because
// their PTB calls insert extra Move calls that fail serialization without a live Pyth endpoint.
const STABLE_PROVIDERS = [
  'CETUS', 'KRIYA', 'FLOWXV2', 'FLOWXV3', 'KRIYAV3', 'TURBOS',
  'AFTERMATH', 'HAEDAL', 'VOLO', 'AFSUI', 'BLUEMOVE', 'DEEPBOOKV3',
  'SCALLOP', 'SUILEND', 'BLUEFIN', 'ALPHAFI', 'SPRINGSUI', 'STEAMM',
  'HAWAL', 'MOMENTUM', 'MAGMA', 'FULLSAIL', 'CETUSDLMM', 'FERRADLMM', 'FERRACLMM',
];

// Providers with a Sui testnet deployment. TURBOS (and most others in
// STABLE_PROVIDERS) are mainnet-only — calling them on testnet triggers
// "Turbos only supported on mainnet" during PTB construction.
const TESTNET_PROVIDERS = ['CETUS', 'DEEPBOOKV3'];

function pickProviders(isTestnet: boolean): string[] {
  return isTestnet ? TESTNET_PROVIDERS : STABLE_PROVIDERS;
}

/** Extract ordered route symbols from RouterDataV3 flat paths array */
function extractRouteSymbols(paths: Array<{ from: string; target: string }>): string[] {
  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const path of paths) {
    for (const coinType of [path.from, path.target]) {
      const sym =
        Object.entries(COIN_REGISTRY).find(([, v]) => v.type === coinType)?.[0] ??
        coinType.split('::').pop() ??
        coinType;
      if (!seen.has(sym)) { seen.add(sym); symbols.push(sym as string); }
    }
  }
  return symbols;
}

function resolveCoin(symbol: string, isTestnet: boolean): { type: string; decimals: number } {
  const key = symbol.toUpperCase();
  if (isTestnet && key === 'SUI') return COIN_REGISTRY['SUI:testnet'];
  const entry = COIN_REGISTRY[key];
  if (!entry) throw new Error(
    `Unknown token "${symbol}". Supported: ${Object.keys(COIN_REGISTRY).filter(k => !k.includes(':')).join(', ')}`
  );
  return entry;
}

export const CETUS_SKILL_METADATA = {
  name: "Cetus CLMM",
  description:
    "Interact with Cetus (cetus.zone) — the leading concentrated liquidity DEX on Sui. " +
    "Get swap quotes, query pools, check liquidity positions, explore DCA strategies, " +
    "and access real-time price data across Sui token pairs.",
  category: 'DeFi',
  version: "1.0.0",
  author_type: "official",
  is_paid: false,
  price: null,
  tags: ["cetus", "sui", "clmm", "dex", "swap", "liquidity", "defi", "aptos"],
  external_url: 'https://app.cetus.zone',
  logo_url: 'https://icons.llamao.fi/icons/protocols/cetus?w=48&h=48',
  partner_verified: true,
  status: "approved",
  schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        type: "string",
        enum: [
          "get_swap_quote",
          "get_pool",
          "list_pools",
          "get_position",
          "get_token_price",
          "get_dca_info",
          "build_swap_tx",
        ],
        description: "Cetus operation to perform. build_swap_tx: build a real Sui PTB for server-side wallet signing (Privy etc.), returns Base64 tx_bytes ready to submit.",
      },
      // Swap
      coin_a: {
        type: "string",
        description:
          "Input token symbol or type address (e.g. SUI, USDC, 0x2::sui::SUI)",
      },
      coin_b: {
        type: "string",
        description: "Output token symbol or type address",
      },
      amount: {
        type: "number",
        description: "Amount to swap or query (in human-readable units)",
      },
      a_to_b: {
        type: "boolean",
        description: "Swap direction: true = coin_a → coin_b, false = coin_b → coin_a",
      },
      by_amount_in: {
        type: "boolean",
        description:
          "true = fix input amount, false = fix output amount (default: true)",
      },
      slippage: {
        type: "number",
        description: "Max acceptable slippage as a percentage (e.g. 0.5 = 0.5%)",
      },
      // Pool
      pool_address: {
        type: "string",
        description: "Sui object address of the pool",
      },
      fee_tier: {
        type: "number",
        enum: [100, 500, 2500, 10000],
        description: "Pool fee tier in basis points (100=0.01%, 500=0.05%, 2500=0.25%, 10000=1%)",
      },
      limit: {
        type: "number",
        description: "Max number of pools to return (default: 10)",
      },
      // Position
      position_id: {
        type: "string",
        description: "NFT object ID of the liquidity position",
      },
      // build_swap_tx
      sender: {
        type: "string",
        description: "Sui wallet address (0x...) of the transaction sender. Required for build_swap_tx.",
      },
      token_in: {
        type: "string",
        description: "Input token symbol (SUI, USDC, USDT, CETUS, WETH, WBTC). Required for build_swap_tx.",
      },
      token_out: {
        type: "string",
        description: "Output token symbol. Required for build_swap_tx.",
      },
      amount_in: {
        type: "string",
        description: "Human-readable input amount (e.g. \"1.5\" for 1.5 SUI). Required for build_swap_tx.",
      },
      chain: {
        type: "string",
        enum: ["sui", "sui:testnet"],
        description: "Network: \"sui\" (mainnet, default) or \"sui:testnet\". Testnet supports Cetus + DeepBook only.",
      },
      // DCA
      target_token: {
        type: "string",
        description: "Token to accumulate via DCA (e.g. SUI, CETUS)",
      },
      budget_token: {
        type: "string",
        description: "Token used to fund DCA purchases (e.g. USDC)",
      },
      budget_amount: {
        type: "number",
        description: "Total budget in budget_token",
      },
      frequency: {
        type: "string",
        enum: ["hourly", "daily", "weekly"],
        description: "DCA purchase frequency",
      },
      order_count: {
        type: "number",
        description: "Number of DCA orders to split the budget into",
      },
    },
  },
};

// ── Types ───────────────────────────────────────────────────────────────

interface CetusPool {
  address: string;
  coin_type_a: string;
  coin_type_b: string;
  symbol_a: string;
  symbol_b: string;
  fee_tier: number;    // basis points
  fee_rate: string;    // e.g. "0.25%"
  tick_spacing: number;
  current_price: number;
  liquidity: string;
  volume_24h_usd: number;
  tvl_usd: number;
  apr_24h: number;
  fee_apr: number;
  reward_apr: number;
}

interface SwapQuote {
  coin_in: string;
  coin_out: string;
  amount_in: number;
  amount_out: number;
  price_impact: number;    // percentage
  fee_amount: number;
  fee_rate: string;
  route: string[];
  estimated_gas_sui: number;
  minimum_received: number;  // after slippage
}

interface LiquidityPosition {
  position_id: string;
  pool_address: string;
  symbol_a: string;
  symbol_b: string;
  tick_lower: number;
  tick_upper: number;
  price_lower: number;
  price_upper: number;
  liquidity: string;
  amount_a: number;
  amount_b: number;
  uncollected_fees_a: number;
  uncollected_fees_b: number;
  in_range: boolean;
  created_at: string;
}

interface DcaStrategy {
  target_token: string;
  budget_token: string;
  total_budget: number;
  order_count: number;
  per_order_amount: number;
  frequency: string;
  estimated_duration: string;
  avg_price_benefit: string;
  gas_estimate_total_sui: number;
}

// ── Mock data helpers (representative Sui mainnet pools) ─────────────────

const MOCK_POOLS: CetusPool[] = [
  {
    address: "0x2e041f3fd93646dcc877f783c1f2b7fa62d30271f8d26c28e0b87c7e1f4d6e3c",
    coin_type_a: "0x2::sui::SUI",
    coin_type_b: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    symbol_a: "SUI",
    symbol_b: "USDC",
    fee_tier: 2500,
    fee_rate: "0.25%",
    tick_spacing: 60,
    current_price: 3.82,
    liquidity: "8421903847162",
    volume_24h_usd: 12_430_000,
    tvl_usd: 94_200_000,
    apr_24h: 24.7,
    fee_apr: 18.5,
    reward_apr: 6.2,
  },
  // Note: no direct SUI/USDT pool on Cetus mainnet — SUI→USDT routes via SUI→USDC→USDT
  {
    address: "0x4d6b9e2f1a8c3d5e7f0b2c4a6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c0d2",
    coin_type_a: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe97b::cetus::CETUS",
    coin_type_b: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    symbol_a: "CETUS",
    symbol_b: "USDC",
    fee_tier: 2500,
    fee_rate: "0.25%",
    tick_spacing: 60,
    current_price: 0.148,
    liquidity: "2938471629384",
    volume_24h_usd: 3_240_000,
    tvl_usd: 18_400_000,
    apr_24h: 42.1,
    fee_apr: 28.3,
    reward_apr: 13.8,
  },
  {
    address: "0x1a3c5e7d9f0b2d4f6a8c0e2f4a6c8e0f2a4c6e8f0a2c4e6f8a0c2e4f6a8c0e2",
    coin_type_a: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    coin_type_b: "0x94e7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f",
    symbol_a: "USDC",
    symbol_b: "USDT",
    fee_tier: 100,
    fee_rate: "0.01%",
    tick_spacing: 2,
    current_price: 1.0002,
    liquidity: "18291038471629",
    volume_24h_usd: 32_180_000,
    tvl_usd: 148_000_000,
    apr_24h: 5.2,
    fee_apr: 5.2,
    reward_apr: 0,
  },
];

const TOKEN_PRICES: Record<string, number> = {
  SUI: 3.82,
  USDC: 1.0,
  USDT: 1.0,
  CETUS: 0.148,
  WETH: 3285,
  WBTC: 97400,
};

// ── Executor ─────────────────────────────────────────────────────────────

export async function executeCetusSkill(input: {
  action: string;
  // existing params
  coin_a?: string;
  coin_b?: string;
  amount?: number;
  a_to_b?: boolean;
  by_amount_in?: boolean;
  slippage?: number;
  pool_address?: string;
  fee_tier?: number;
  limit?: number;
  position_id?: string;
  target_token?: string;
  budget_token?: string;
  budget_amount?: number;
  frequency?: string;
  order_count?: number;
  // build_swap_tx params
  sender?: string;
  token_in?: string;
  token_out?: string;
  amount_in?: string;
  chain?: string;
}): Promise<unknown> {
  const {
    action,
    coin_a,
    coin_b,
    amount = 100,
    a_to_b = true,
    by_amount_in = true,
    slippage = 0.5,
    pool_address,
    fee_tier,
    limit = 10,
    position_id,
    target_token = "SUI",
    budget_token = "USDC",
    budget_amount = 1000,
    frequency = "daily",
    order_count = 10,
  } = input;

  switch (action) {
    case "get_swap_quote": {
      // Accept both old-style (coin_a/coin_b/amount) and Maria's spec (token_in/token_out/amount_in)
      const rawIn     = input.token_in  ?? coin_a;
      const rawOut    = input.token_out ?? coin_b;
      const rawAmount = input.amount_in ?? String(amount);
      const chainId   = input.chain ?? 'sui';
      const isTestnet = chainId === 'sui:testnet';

      if (!rawIn || !rawOut) return { success: false, error: 'token_in and token_out are required' };

      let fromCoin: { type: string; decimals: number };
      let toCoin:   { type: string; decimals: number };
      try {
        fromCoin = resolveCoin(rawIn,  isTestnet);
        toCoin   = resolveCoin(rawOut, isTestnet);
      } catch (err: any) {
        return { success: false, error: err.message };
      }

      const parsedAmount = parseFloat(String(rawAmount));
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return { success: false, error: 'amount_in must be a positive number' };
      }

      const amountBaseUnits = BigInt(Math.round(parsedAmount * 10 ** fromCoin.decimals));

      // Live Cetus Aggregator SDK — same logic as build_swap_tx, no PTB needed
      const rpcUrl    = isTestnet ? getFullnodeUrl('testnet') : getFullnodeUrl('mainnet');
      const suiClient = new SuiClient({ url: rpcUrl });
      // Dummy signer (quote only — no transaction is built)
      const cetusClient = new AggregatorClient({
        signer: '0x' + '0'.repeat(64),
        client: suiClient,
        env: isTestnet ? Env.Testnet : Env.Mainnet,
      });

      let router: any;
      try {
        router = await cetusClient.findRouters({
          from:       fromCoin.type,
          target:     toCoin.type,
          amount:     amountBaseUnits,
          byAmountIn: true,
          providers:  pickProviders(isTestnet),
        });
      } catch (err: any) {
        return { success: false, error: `findRouters failed: ${err.message}` };
      }

      if (!router || router.insufficientLiquidity) {
        return {
          success: false,
          error: `No route found for ${rawIn.toUpperCase()} → ${rawOut.toUpperCase()}`,
        };
      }

      const route     = router.paths?.length
        ? extractRouteSymbols(router.paths)
        : [rawIn.toUpperCase(), rawOut.toUpperCase()];
      const hopCount  = route.length - 1;

      const amountOutUnits  = Number(router.amountOut.toString());
      const amountOutHuman  = amountOutUnits / 10 ** toCoin.decimals;

      // price_impact: SDK provides as Decimal (0–1). Fall back to 0 if not present.
      const priceImpact = router.priceImpact != null ? Math.abs(Number(router.priceImpact)) : 0;

      // fee: Cetus pools typically charge 0.25% per hop; stable pools 0.01%
      const feeStr = hopCount === 1 ? '0.25%' : `${hopCount}× hops (typically 0.01–0.25% each)`;

      return {
        amount_out:   amountOutHuman.toFixed(toCoin.decimals <= 6 ? toCoin.decimals : 6),
        price_impact: parseFloat(priceImpact.toFixed(6)),   // 0–1
        fee:          feeStr,
        route,
        // bonus fields for debugging / UI
        token_in:    rawIn.toUpperCase(),
        token_out:   rawOut.toUpperCase(),
        amount_in:   String(rawAmount),
        hop_count:   hopCount,
        chain:       chainId,
        source:      'cetus.zone aggregator (live)',
        _operation:  'cetus_swap',
      };
    }

    case "get_pool": {
      if (!pool_address && !(coin_a && coin_b)) {
        throw new Error("Provide pool_address or both coin_a and coin_b");
      }

      let pool: CetusPool | undefined;
      if (pool_address) {
        pool = MOCK_POOLS.find((p) => p.address === pool_address);
      } else {
        const symA = coin_a!.split("::").pop()?.toUpperCase() ?? coin_a!.toUpperCase();
        const symB = coin_b!.split("::").pop()?.toUpperCase() ?? coin_b!.toUpperCase();
        pool = MOCK_POOLS.find(
          (p) =>
            ((p.symbol_a === symA && p.symbol_b === symB) ||
              (p.symbol_a === symB && p.symbol_b === symA)) &&
            (fee_tier === undefined || p.fee_tier === fee_tier)
        );
      }

      if (!pool) {
        return {
          found: false,
          message: "No matching pool found. Try list_pools to see available pools.",
        };
      }

      return {
        pool,
        price_range_24h: {
          low: parseFloat((pool.current_price * 0.96).toFixed(6)),
          high: parseFloat((pool.current_price * 1.04).toFixed(6)),
        },
        source: "cetus.zone",
        _mock: true,
      };
    }

    case "list_pools": {
      let pools = [...MOCK_POOLS];

      if (coin_a || coin_b) {
        const sym = (coin_a ?? coin_b)!.split("::").pop()?.toUpperCase();
        if (sym) {
          pools = pools.filter(
            (p) => p.symbol_a === sym || p.symbol_b === sym
          );
        }
      }
      if (fee_tier) pools = pools.filter((p) => p.fee_tier === fee_tier);

      pools = pools
        .sort((a, b) => b.tvl_usd - a.tvl_usd)
        .slice(0, limit);

      return {
        pools,
        count: pools.length,
        total_tvl_usd: pools.reduce((s, p) => s + p.tvl_usd, 0),
        source: "cetus.zone",
        _mock: true,
        _note:
          "Showing top pools by TVL. Use cetus.zone/pools for the full live listing.",
      };
    }

    case "get_position": {
      if (!position_id) throw new Error("position_id (NFT object ID) is required");

      const pool = MOCK_POOLS[0]; // SUI/USDC as example
      const tickLower = -887220;
      const tickUpper = 887220;

      const position: LiquidityPosition = {
        position_id,
        pool_address: pool.address,
        symbol_a: pool.symbol_a,
        symbol_b: pool.symbol_b,
        tick_lower: tickLower,
        tick_upper: tickUpper,
        price_lower: parseFloat((pool.current_price * 0.8).toFixed(6)),
        price_upper: parseFloat((pool.current_price * 1.2).toFixed(6)),
        liquidity: "1293847162",
        amount_a: 42.5,
        amount_b: 162.35,
        uncollected_fees_a: 0.12,
        uncollected_fees_b: 0.46,
        in_range: true,
        created_at: "2025-11-15T10:23:00Z",
      };

      return {
        position,
        estimated_value_usd:
          position.amount_a * (TOKEN_PRICES[pool.symbol_a] ?? 1) +
          position.amount_b * (TOKEN_PRICES[pool.symbol_b] ?? 1),
        uncollected_fees_usd:
          position.uncollected_fees_a * (TOKEN_PRICES[pool.symbol_a] ?? 1) +
          position.uncollected_fees_b * (TOKEN_PRICES[pool.symbol_b] ?? 1),
        source: "cetus.zone",
        _mock: true,
        _note:
          "Position data is representative. Query on-chain via Cetus SDK or cetus.zone/portfolio for live balances.",
      };
    }

    case "get_token_price": {
      const symbol = (coin_a ?? target_token).split("::").pop()?.toUpperCase() ?? "SUI";
      const price = TOKEN_PRICES[symbol];
      if (!price) {
        return {
          symbol,
          found: false,
          message: `Price not available for ${symbol}. Supported: ${Object.keys(TOKEN_PRICES).join(", ")}`,
        };
      }
      const pool = MOCK_POOLS.find(
        (p) => p.symbol_a === symbol || p.symbol_b === symbol
      );
      return {
        symbol,
        price_usd: price,
        change_24h_pct: symbol === "SUI" ? 3.2 : symbol === "CETUS" ? -1.4 : 0.01,
        volume_24h_usd: pool?.volume_24h_usd ?? null,
        source: "cetus.zone aggregator",
        _mock: true,
      };
    }

    case "get_dca_info": {
      const perOrder = parseFloat((budget_amount / order_count).toFixed(2));
      const durationMap: Record<string, string> = {
        hourly: `${order_count} hours`,
        daily: `${order_count} days`,
        weekly: `${order_count} weeks`,
      };

      const strategy: DcaStrategy = {
        target_token: target_token.toUpperCase(),
        budget_token: budget_token.toUpperCase(),
        total_budget: budget_amount,
        order_count,
        per_order_amount: perOrder,
        frequency,
        estimated_duration: durationMap[frequency] ?? `${order_count} periods`,
        avg_price_benefit:
          "DCA reduces timing risk by spreading purchases. Expected avg entry ≈ TWAP over period.",
        gas_estimate_total_sui: parseFloat((order_count * 0.003).toFixed(4)),
      };

      return {
        strategy,
        setup_instructions: [
          `1. Connect your Sui wallet at cetus.zone`,
          `2. Navigate to Trade → DCA`,
          `3. Set input token to ${budget_token.toUpperCase()} and output to ${target_token.toUpperCase()}`,
          `4. Enter total budget: ${budget_amount} ${budget_token.toUpperCase()}`,
          `5. Set ${order_count} orders at ${frequency} frequency`,
          `6. Review and confirm — Cetus will execute automatically`,
        ],
        source: "cetus.zone",
        _mock: false,
      };
    }

    case "build_swap_tx": {
      const { sender, token_in, token_out, amount_in, slippage = 0.01, chain = "sui" } = input;
      if (!sender)    return { success: false, error: "sender is required for build_swap_tx" };
      if (!token_in)  return { success: false, error: "token_in is required for build_swap_tx" };
      if (!token_out) return { success: false, error: "token_out is required for build_swap_tx" };
      if (!amount_in) return { success: false, error: "amount_in is required for build_swap_tx" };

      const isTestnet = chain === "sui:testnet";

      // Normalise sender to 0x + 64 hex chars (Sui canonical format)
      const normalizedSender = '0x' + sender.replace(/^0x/, '').padStart(64, '0');

      let fromCoin: { type: string; decimals: number };
      let targetCoin: { type: string; decimals: number };
      try {
        fromCoin   = resolveCoin(token_in,  isTestnet);
        targetCoin = resolveCoin(token_out, isTestnet);
      } catch (err: any) {
        return { success: false, error: err.message };
      }

      // Convert human amount → base units (integer)
      const parsedAmount = parseFloat(amount_in);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return { success: false, error: "amount_in must be a positive number string, e.g. \"1.5\"" };
      }
      const amountBaseUnits = BigInt(Math.round(parsedAmount * 10 ** fromCoin.decimals));

      // Initialise Sui + Cetus clients
      const rpcUrl = isTestnet ? getFullnodeUrl('testnet') : getFullnodeUrl('mainnet');
      const suiClient = new SuiClient({ url: rpcUrl });
      const cetusClient = new AggregatorClient({
        signer: normalizedSender,
        client: suiClient,
        env: isTestnet ? Env.Testnet : Env.Mainnet,
      });

      // Find optimal route (multi-hop supported).
      // Pass STABLE_PROVIDERS to exclude oracle-dependent DEXes (HAEDALPMM, METASTABLE, OBRIC,
      // STEAMM_OMM, SEVENK, HAEDALHMMV2) whose PTB calls require live Pyth price feeds and
      // cause "Invalid params" serialization failures when Pyth is unavailable.
      let router: any;
      const providers = pickProviders(isTestnet);
      try {
        router = await cetusClient.findRouters({
          from:       fromCoin.type,
          target:     targetCoin.type,
          amount:     amountBaseUnits,
          byAmountIn: true,
          providers,
        });
      } catch (err: any) {
        return { success: false, error: `findRouters failed: ${err.message}` };
      }

      if (!router || router.insufficientLiquidity) {
        return { success: false, error: `Insufficient liquidity for ${token_in.toUpperCase()} → ${token_out.toUpperCase()} (tried ${providers.length} providers)` };
      }

      // Extract human-readable route (e.g. ["SUI", "USDC", "USDT"] for 2-hop)
      const route = router.paths?.length ? extractRouteSymbols(router.paths) : [token_in.toUpperCase(), token_out.toUpperCase()];
      const hopCount = route.length - 1;

      // Build PTB
      const txb = new Transaction();
      txb.setSender(normalizedSender);

      try {
        await cetusClient.fastRouterSwap({ router, slippage, txb });
      } catch (err: any) {
        return { success: false, error: `fastRouterSwap failed: ${err.message}` };
      }

      // Serialise → Base64 (resolves coinWithBalance deferred lookups)
      let txBytes: Uint8Array;
      try {
        txBytes = await txb.build({ client: suiClient });
      } catch (err: any) {
        return { success: false, error: `Transaction serialisation failed: ${err.message}` };
      }

      const amountOutHuman = (Number(router.amountOut.toString()) / 10 ** targetCoin.decimals).toFixed(targetCoin.decimals === 9 ? 6 : targetCoin.decimals);
      const amountOutMin   = (Number(router.amountOut.toString()) * (1 - slippage) / 10 ** targetCoin.decimals).toFixed(targetCoin.decimals === 9 ? 6 : targetCoin.decimals);

      return {
        tx_bytes: Buffer.from(txBytes).toString('base64'),
        amount_in:            parsedAmount,
        amount_out_estimated: parseFloat(amountOutHuman),
        amount_out_minimum:   parseFloat(amountOutMin),
        token_in:  token_in.toUpperCase(),
        token_out: token_out.toUpperCase(),
        route,
        hop_count: hopCount,
        slippage,
        chain,
        usage: "Pass tx_bytes to Privy send_sui_transaction (or any Sui wallet) to sign and submit.",
      };
    }

    default:
      throw new Error(`Unknown Cetus action: ${action}`);
  }
}
