/**
 * 7k Aggregator — DEX Aggregator on Sui
 *
 * 7k is the leading DEX aggregator on Sui, routing swaps through all major
 * liquidity sources (Cetus, Turbos, Kriya, DeepBook, Aftermath, FlowX,
 * Bluefin, Suiswap, Springsui, and more) to guarantee the best price and
 * minimal price impact.
 *
 * Uses @7kprotocol/sdk-ts v2 (getQuote + buildTx).
 *
 * [ARSENAL-HOSTED ✓] Arsenal proxies this skill — no API key needed.
 *
 * Website: https://7k.ag
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';

// ─── Token registry ──────────────────────────────────────────────────────────

const COIN_TYPES: Record<string, { type: string; decimals: number }> = {
  SUI: {
    type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    decimals: 9,
  },
  USDC: {
    // Circle native USDC on Sui
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimals: 6,
  },
  USDC_WORMHOLE: {
    // Wormhole bridged USDC (legacy)
    type: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
    decimals: 6,
  },
  USDT: {
    type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
    decimals: 6,
  },
  WETH: {
    type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN',
    decimals: 8,
  },
  WBTC: {
    type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN',
    decimals: 8,
  },
  AFSUI: {
    type: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI',
    decimals: 9,
  },
  HASUI: {
    type: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI',
    decimals: 9,
  },
  VSUI: {
    type: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT',
    decimals: 9,
  },
  CETUS: {
    type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
    decimals: 9,
  },
  TURBOS: {
    type: '0x5d1f47ea69bb0de31c313d7acf89b890dbb8991ea8e03c6c355171f84bb1ba4a::turbos::TURBOS',
    decimals: 9,
  },
  DEEP: {
    type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946b270::deep::DEEP',
    decimals: 6,
  },
  SCA: {
    type: '0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA',
    decimals: 9,
  },
};

// Full list of DEX sources supported by 7k (for protocol info display)
const SUPPORTED_DEXES = [
  'Cetus (CLMM)',
  'Turbos Finance (CLMM)',
  'Kriya DEX',
  'Kriya V3 (CLMM)',
  'DeepBook V2',
  'DeepBook V3',
  'Aftermath Finance',
  'FlowX AMM',
  'FlowX V3 (CLMM)',
  'Bluefin',
  'Suiswap',
  'BlueMove',
  'SpringSui',
  'Obric',
  'stSUI',
  'Steamm',
  'Magma',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a token symbol (e.g. 'SUI', 'USDC') or full coin type string
 * to a { type, decimals } entry.
 */
function resolveCoin(input: string): { type: string; decimals: number } {
  if (input.startsWith('0x')) {
    // Try to find decimals from registry first
    const found = Object.values(COIN_TYPES).find(
      (c) => c.type.toLowerCase() === input.toLowerCase(),
    );
    return found ?? { type: input, decimals: 9 };
  }
  const upper = input.toUpperCase();
  const entry = COIN_TYPES[upper];
  if (entry) return entry;
  throw new Error(
    `Unknown token "${input}". Use a symbol (${Object.keys(COIN_TYPES).join(', ')}) or a full coin type (0x...).`,
  );
}

function getClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('mainnet') });
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: '7k Aggregator',
      chain: 'sui',
      type: 'DEX Aggregator',
      website: 'https://7k.ag',
      api: 'https://api.7k.ag',
      sdk: '@7kprotocol/sdk-ts',
      tagline: 'The "Jupiter of Sui" — best-price routing across all Sui DEXes',
      highlights: [
        'Smart order routing across 17+ Sui liquidity sources',
        'Split routing across multiple DEXes in a single PTB',
        'Minimal price impact via optimal path finding',
        'Supports stable pools, CLMM pools, and order books',
        'Built-in slippage protection via on-chain settle contract',
        'Commission / referral system for integrators',
      ],
      supported_dexes: SUPPORTED_DEXES,
      supported_tokens: Object.keys(COIN_TYPES),
      features: {
        aggregated_swap: 'Best route across AMM, CLMM, and Order Book pools',
        split_routing: 'One swap can span multiple DEXes simultaneously',
        limit_orders: 'Place limit orders via 7k protocol',
        dca: 'Dollar-cost averaging (DCA) orders',
        price_feeds: 'Real-time Pyth-based token prices',
      },
      _note: 'Execute swap requires wallet signing. Use build_swap_tx to get base64 PTB.',
    },
  };
}

async function actionGetQuote(input: any): Promise<SkillExecutionResult> {
  const { token_in, token_out, amount_in } = input;
  if (!token_in) return { success: false, error: 'token_in is required (symbol or coin type)' };
  if (!token_out) return { success: false, error: 'token_out is required (symbol or coin type)' };
  if (!amount_in) return { success: false, error: 'amount_in is required (human-readable amount)' };

  let coinInInfo: { type: string; decimals: number };
  let coinOutInfo: { type: string; decimals: number };

  try {
    coinInInfo = resolveCoin(token_in);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
  try {
    coinOutInfo = resolveCoin(token_out);
  } catch (e: any) {
    return { success: false, error: e.message };
  }

  const parsedAmount = parseFloat(String(amount_in));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount_in must be a positive number (e.g. 1.5 or "10")' };
  }

  const amountBaseUnits = BigInt(Math.round(parsedAmount * 10 ** coinInInfo.decimals)).toString();

  try {
    const { getQuote } = await import('@7kprotocol/sdk-ts');
    const quote = await getQuote({
      tokenIn: coinInInfo.type,
      tokenOut: coinOutInfo.type,
      amountIn: amountBaseUnits,
    });

    if (!quote) {
      return { success: false, error: '7k API returned no quote for this pair' };
    }

    const amountOutRaw = quote.returnAmountWithDecimal ?? quote.returnAmount ?? '0';
    const amountOutHuman = Number(amountOutRaw) / 10 ** coinOutInfo.decimals;
    const spotPrice = amountOutHuman / parsedAmount;

    // Summarize routing path
    const routeSummary = (quote.routes ?? []).map((r: any) => ({
      share_pct: r.share != null ? `${(r.share * 100).toFixed(1)}%` : null,
      hops: (r.hops ?? []).map((h: any) => ({
        dex: h.pool?.type ?? 'unknown',
        pool: h.poolId,
        token_in: h.tokenIn,
        token_out: h.tokenOut,
      })),
    }));

    return {
      success: true,
      output: {
        protocol: '7k Aggregator',
        chain: 'sui',
        token_in: token_in.toUpperCase?.() ?? token_in,
        token_out: token_out.toUpperCase?.() ?? token_out,
        amount_in: parsedAmount,
        amount_out: amountOutHuman,
        amount_out_raw: amountOutRaw,
        spot_price: spotPrice,
        price_impact: quote.priceImpact ?? null,
        effective_price: quote.effectivePrice ?? null,
        market_spot_price: quote.marketSp ?? null,
        routes: routeSummary,
        route_count: (quote.routes ?? []).length,
        warning: quote.warning || null,
        _source: '@7kprotocol/sdk-ts getQuote (live)',
      },
    };
  } catch (err: any) {
    return { success: false, error: `7k get_quote failed: ${err.message}` };
  }
}

async function actionBuildSwapTx(input: any): Promise<SkillExecutionResult> {
  const {
    sender,
    token_in,
    token_out,
    amount_in,
    slippage = 0.005, // default 0.5%
    commission_partner = '0x0000000000000000000000000000000000000000000000000000000000000000',
    commission_bps = 0,
  } = input;

  if (!sender) return { success: false, error: 'sender is required (Sui wallet address 0x...)' };
  if (!token_in) return { success: false, error: 'token_in is required' };
  if (!token_out) return { success: false, error: 'token_out is required' };
  if (!amount_in) return { success: false, error: 'amount_in is required' };

  let coinInInfo: { type: string; decimals: number };
  let coinOutInfo: { type: string; decimals: number };

  try {
    coinInInfo = resolveCoin(token_in);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
  try {
    coinOutInfo = resolveCoin(token_out);
  } catch (e: any) {
    return { success: false, error: e.message };
  }

  const parsedAmount = parseFloat(String(amount_in));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: 'amount_in must be a positive number string, e.g. "1.5"' };
  }

  const parsedSlippage = parseFloat(String(slippage));
  if (isNaN(parsedSlippage) || parsedSlippage < 0 || parsedSlippage > 1) {
    return { success: false, error: 'slippage must be between 0 and 1 (e.g. 0.005 = 0.5%)' };
  }

  const amountBaseUnits = BigInt(Math.round(parsedAmount * 10 ** coinInInfo.decimals)).toString();

  try {
    const { getQuote, buildTx } = await import('@7kprotocol/sdk-ts');

    // Step 1: Get quote
    const quoteResponse = await getQuote({
      tokenIn: coinInInfo.type,
      tokenOut: coinOutInfo.type,
      amountIn: amountBaseUnits,
    });

    if (!quoteResponse) {
      return { success: false, error: '7k API returned no quote for this pair' };
    }
    if (!quoteResponse.routes || quoteResponse.routes.length === 0) {
      return { success: false, error: 'No swap routes found for this pair' };
    }

    // Step 2: Build transaction
    const { tx } = await buildTx({
      quoteResponse,
      accountAddress: sender,
      slippage: parsedSlippage,
      commission: {
        partner: commission_partner,
        commissionBps: commission_bps,
      },
    });

    tx.setSender(sender);
    tx.setGasBudget(100_000_000);

    const client = getClient();
    const txBytes = await tx.build({ client });

    const amountOutRaw = quoteResponse.returnAmountWithDecimal ?? quoteResponse.returnAmount ?? '0';
    const amountOutHuman = Number(amountOutRaw) / 10 ** coinOutInfo.decimals;

    return {
      success: true,
      output: {
        tx_bytes: Buffer.from(txBytes).toString('base64'),
        sender,
        description: `Swap ${parsedAmount} ${token_in.toUpperCase?.()} → ${token_out.toUpperCase?.()} via 7k Aggregator`,
        amount_in: parsedAmount,
        amount_out_estimated: amountOutHuman,
        price_impact: quoteResponse.priceImpact ?? null,
        slippage: parsedSlippage,
        slippage_pct: `${(parsedSlippage * 100).toFixed(2)}%`,
        route_count: (quoteResponse.routes ?? []).length,
        gas_budget: '100000000',
        chain: 'sui',
        usage: 'base64-encoded Sui TransactionData (BCS). Pass to Privy/Suiet/wallet-standard signer to sign and submit.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `7k build_swap_tx failed: ${err.message}` };
  }
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const SEVENK_SKILL_METADATA = {
  name: '7k Aggregator',
  description:
    'DEX aggregator on Sui that finds the best swap route across all major Sui DEXes ' +
    '(Cetus, Turbos, Kriya, DeepBook, Aftermath, FlowX, Bluefin, Suiswap, and more). ' +
    'Get optimal prices with minimal price impact, and build real Sui PTBs (base64 tx_bytes) ' +
    'ready to sign and execute. The "Jupiter of Sui".',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['7k', 'aggregator', 'sui', 'dex', 'swap', 'routing', 'defi'],
  external_url: 'https://7k.ag',
  logo_url: 'https://icons.llamao.fi/icons/protocols/7k?w=48&h=48',
  partner_verified: true,
  status: 'pending',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_quote', 'build_swap_tx'],
        description:
          'get_protocol_info: 7k overview, supported DEXes, and features. ' +
          'get_quote: get best swap route and estimated output (requires token_in, token_out, amount_in). ' +
          'build_swap_tx: build a Sui PTB for executing the swap (requires sender, token_in, token_out, amount_in). Returns base64 tx_bytes.',
      },
      token_in: {
        type: 'string',
        description:
          'Input token symbol (SUI, USDC, USDT, WETH, WBTC, AFSUI, HASUI, VSUI, CETUS, TURBOS, DEEP, SCA) ' +
          'or full Sui coin type (0x...).',
      },
      token_out: {
        type: 'string',
        description: 'Output token symbol or full Sui coin type. Same options as token_in.',
      },
      amount_in: {
        type: 'string',
        description:
          'Human-readable input amount (e.g. "10" for 10 SUI, "100.5" for 100.5 USDC). Required for get_quote and build_swap_tx.',
      },
      sender: {
        type: 'string',
        description: 'Sui wallet address (0x... 64-hex). Required for build_swap_tx.',
      },
      slippage: {
        type: 'number',
        description:
          'Maximum acceptable slippage as a decimal (e.g. 0.005 = 0.5%, 0.01 = 1%). Default: 0.005. Only for build_swap_tx.',
      },
      commission_partner: {
        type: 'string',
        description:
          'Partner address to receive commission. Defaults to zero address (no commission). Only for build_swap_tx.',
      },
      commission_bps: {
        type: 'number',
        description:
          'Commission in basis points (1 bps = 0.01%). Default: 0. Only for build_swap_tx.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Protocol overview',
      input: { action: 'get_protocol_info' },
    },
    {
      title: 'Quote: swap 10 SUI → USDC',
      input: { action: 'get_quote', token_in: 'SUI', token_out: 'USDC', amount_in: '10' },
    },
    {
      title: 'Quote: swap 100 USDC → SUI',
      input: { action: 'get_quote', token_in: 'USDC', token_out: 'SUI', amount_in: '100' },
    },
    {
      title: 'Build swap PTB: 1 SUI → USDC',
      input: {
        action: 'build_swap_tx',
        sender: '0xYOUR_SUI_ADDRESS',
        token_in: 'SUI',
        token_out: 'USDC',
        amount_in: '1',
        slippage: 0.005,
      },
    },
    {
      title: 'Build swap PTB with tighter slippage',
      input: {
        action: 'build_swap_tx',
        sender: '0xYOUR_SUI_ADDRESS',
        token_in: 'SUI',
        token_out: 'USDT',
        amount_in: '5',
        slippage: 0.001,
      },
    },
  ],
};

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeSevenKSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':
        return await actionGetProtocolInfo();
      case 'get_quote':
        return await actionGetQuote(input);
      case 'build_swap_tx':
        return await actionBuildSwapTx(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_quote, build_swap_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in 7k Aggregator skill' };
  }
}
