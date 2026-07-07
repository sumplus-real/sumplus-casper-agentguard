/**
 * Multi-Chain EVM Gas Tracker
 *
 * Fetches real-time gas prices from major EVM-compatible chains using public
 * RPC endpoints (eth_gasPrice + eth_feeHistory). No API key required.
 *
 * EIP-1559 chains: Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche
 * Legacy chains:   BSC (uses simple gasPrice only)
 *
 * USD cost estimates use a live ETH/MATIC/BNB/AVAX price fetched from
 * CoinGecko's free no-key endpoint, with hardcoded fallbacks on failure.
 */

import type { SkillExecutionResult } from '@/types/skill';
import { getPublicEndpoints, type RpcChainKey } from '@/lib/rpc';

// ─── Chain definitions ────────────────────────────────────────────────────────

interface ChainConfig {
  name: string;
  rpc: string;
  symbol: string;       // native gas token
  chain_id: number;
  eip1559: boolean;     // true → use baseFee + priority fee model
  coingecko_id: string; // for price lookup
}

const CHAINS: Record<string, ChainConfig> = {
  ethereum:  { name: 'Ethereum',  rpc: 'https://ethereum-rpc.publicnode.com',       symbol: 'ETH',   chain_id: 1,     eip1559: true,  coingecko_id: 'ethereum'         },
  polygon:   { name: 'Polygon',   rpc: 'https://polygon-bor-rpc.publicnode.com',   symbol: 'POL',   chain_id: 137,   eip1559: true,  coingecko_id: 'matic-network'    },
  bsc:       { name: 'BSC',       rpc: 'https://bsc-rpc.publicnode.com',       symbol: 'BNB',   chain_id: 56,    eip1559: false, coingecko_id: 'binancecoin'      },
  arbitrum:  { name: 'Arbitrum',  rpc: 'https://arbitrum-one-rpc.publicnode.com',  symbol: 'ETH',   chain_id: 42161, eip1559: true,  coingecko_id: 'ethereum'         },
  optimism:  { name: 'Optimism',  rpc: 'https://optimism-rpc.publicnode.com',  symbol: 'ETH',   chain_id: 10,    eip1559: true,  coingecko_id: 'ethereum'         },
  base:      { name: 'Base',      rpc: 'https://base-rpc.publicnode.com',      symbol: 'ETH',   chain_id: 8453,  eip1559: true,  coingecko_id: 'ethereum'         },
  avalanche: { name: 'Avalanche', rpc: 'https://avalanche-c-chain-rpc.publicnode.com', symbol: 'AVAX',  chain_id: 43114, eip1559: true,  coingecko_id: 'avalanche-2'      },
};

// ─── Hardcoded price fallbacks (updated 2025-Q2, rough order of magnitude) ───

const PRICE_FALLBACKS: Record<string, number> = {
  ethereum:   2500,
  'matic-network': 0.40,
  binancecoin: 600,
  'avalanche-2': 25,
};

// ─── RPC helpers ──────────────────────────────────────────────────────────────

async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} from ${rpcUrl}`);
  const data = await res.json() as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result;
}

/** Try each registered endpoint for a chain in order; fall back on failure. */
async function rpcCallFailover(chainKey: string, method: string, params: unknown[]): Promise<unknown> {
  const endpoints = getPublicEndpoints(chainKey as RpcChainKey);
  let lastErr: unknown;
  for (const url of endpoints) {
    try {
      return await rpcCall(url, method, params);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error(`No RPC endpoint configured for "${chainKey}"`);
}

function hexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

function weiToGwei(wei: number): number {
  return wei / 1e9;
}

// ─── Gas price fetching ───────────────────────────────────────────────────────

interface GasEstimate {
  slow: number;       // Gwei
  standard: number;   // Gwei
  fast: number;       // Gwei
  base_fee?: number;  // Gwei (EIP-1559 only)
  // raw values for transparency
  raw_gas_price_gwei?: number;
}

async function fetchGasPriceEIP1559(chainKey: string): Promise<GasEstimate> {
  // eth_feeHistory: last 10 blocks, reward percentiles [10, 50, 90]
  const feeHistory = await rpcCallFailover(chainKey, 'eth_feeHistory', [10, 'latest', [10, 50, 90]]) as any;

  const baseFees: number[] = (feeHistory.baseFeePerGas as string[])
    .map((h: string) => weiToGwei(hexToNumber(h)));

  // Use the pending (last) base fee
  const baseFee = baseFees[baseFees.length - 1];

  // Flatten reward percentiles across blocks
  const rewards = feeHistory.reward as string[][];
  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  for (const block of rewards) {
    if (block[0]) p10.push(weiToGwei(hexToNumber(block[0])));
    if (block[1]) p50.push(weiToGwei(hexToNumber(block[1])));
    if (block[2]) p90.push(weiToGwei(hexToNumber(block[2])));
  }

  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const tipSlow     = Math.max(0.001, median(p10));
  const tipStandard = Math.max(0.001, median(p50));
  const tipFast     = Math.max(0.001, median(p90));

  return {
    base_fee: parseFloat(baseFee.toFixed(4)),
    slow:     parseFloat((baseFee + tipSlow).toFixed(4)),
    standard: parseFloat((baseFee + tipStandard).toFixed(4)),
    fast:     parseFloat((baseFee + tipFast).toFixed(4)),
  };
}

async function fetchGasPriceLegacy(chainKey: string): Promise<GasEstimate> {
  const raw = await rpcCallFailover(chainKey, 'eth_gasPrice', []) as string;
  const gasPriceGwei = weiToGwei(hexToNumber(raw));

  return {
    raw_gas_price_gwei: parseFloat(gasPriceGwei.toFixed(4)),
    slow:     parseFloat((gasPriceGwei * 0.85).toFixed(4)),
    standard: parseFloat(gasPriceGwei.toFixed(4)),
    fast:     parseFloat((gasPriceGwei * 1.20).toFixed(4)),
  };
}

async function fetchGasPrice(chainKey: string): Promise<GasEstimate> {
  const chain = CHAINS[chainKey];
  if (!chain) throw new Error(`Unknown chain "${chainKey}"`);
  return chain.eip1559 ? fetchGasPriceEIP1559(chainKey) : fetchGasPriceLegacy(chainKey);
}

// ─── Native token price ───────────────────────────────────────────────────────

const priceCache: Map<string, { price: number; ts: number }> = new Map();
const PRICE_CACHE_TTL_MS = 60_000; // 1 minute

async function fetchNativeTokenPriceUSD(coingeckoId: string): Promise<number> {
  const cached = priceCache.get(coingeckoId);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL_MS) return cached.price;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json() as Record<string, { usd: number }>;
    const price = data[coingeckoId]?.usd;
    if (!price) throw new Error('no price in response');
    priceCache.set(coingeckoId, { price, ts: Date.now() });
    return price;
  } catch {
    // Fall back to hardcoded values
    return PRICE_FALLBACKS[coingeckoId] ?? 0;
  }
}

// ─── Cost calculation ─────────────────────────────────────────────────────────

function calcTxCostUSD(gasPriceGwei: number, gasLimit: number, tokenPriceUSD: number): number {
  const costInNative = (gasPriceGwei * gasLimit) / 1e9;  // convert Gwei → native token
  return costInNative * tokenPriceUSD;
}

function formatUSD(amount: number): string {
  if (amount < 0.000001) return `$${amount.toExponential(3)}`;
  if (amount < 0.01)     return `$${amount.toFixed(6)}`;
  if (amount < 1)        return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function formatGwei(g: number): string {
  return `${g.toFixed(4)} Gwei`;
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Multi-Chain EVM Gas Tracker',
      description:
        'Real-time gas price tracker for 7 major EVM chains. ' +
        'Uses public RPC endpoints (LlamaNodes) — no API key required. ' +
        'EIP-1559 chains return baseFee + priority fee tiers; BSC uses legacy gasPrice.',
      data_source: 'Direct JSON-RPC (eth_gasPrice + eth_feeHistory) via LlamaNodes public RPCs',
      supported_chains: Object.entries(CHAINS).map(([key, cfg]) => ({
        key,
        name:     cfg.name,
        chain_id: cfg.chain_id,
        symbol:   cfg.symbol,
        model:    cfg.eip1559 ? 'EIP-1559 (baseFee + priority tip)' : 'Legacy (fixed gasPrice)',
        rpc:      cfg.rpc,
      })),
      gas_model_notes: [
        'EIP-1559: each block has a baseFee (burned) + a priority tip paid to validators.',
        '  slow = baseFee + p10 tip (may wait several blocks)',
        '  standard = baseFee + p50 tip (typically included next block)',
        '  fast = baseFee + p90 tip (almost always next block)',
        'Legacy (BSC): single gasPrice. slow=85%, standard=100%, fast=120% of current price.',
        'USD estimates use live CoinGecko prices with hardcoded fallbacks on failure.',
      ],
      actions: [
        'get_protocol_info    — this overview',
        'get_gas_price        — gas for one chain (param: chain)',
        'get_all_gas_prices   — gas for all chains ranked cheapest first',
        'estimate_tx_cost     — cost estimate (params: chain, gas_limit, speed)',
      ],
    },
  };
}

async function actionGetGasPrice(input: any): Promise<SkillExecutionResult> {
  const chainKey = (input.chain ?? '').toLowerCase().trim();
  if (!chainKey) {
    return {
      success: false,
      error: 'Provide "chain" (e.g. "ethereum", "polygon", "arbitrum", "optimism", "base", "bsc", "avalanche").',
    };
  }
  if (!CHAINS[chainKey]) {
    return {
      success: false,
      error: `Unknown chain "${chainKey}". Supported: ${Object.keys(CHAINS).join(', ')}.`,
    };
  }

  const cfg = CHAINS[chainKey];

  try {
    const [gas, tokenPrice] = await Promise.all([
      fetchGasPrice(chainKey),
      fetchNativeTokenPriceUSD(cfg.coingecko_id),
    ]);

    const simpleTransferLimit = 21_000;

    const output: Record<string, any> = {
      chain:    cfg.name,
      chain_id: cfg.chain_id,
      symbol:   cfg.symbol,
      model:    cfg.eip1559 ? 'EIP-1559' : 'Legacy',
      gas_prices: {
        slow:     formatGwei(gas.slow),
        standard: formatGwei(gas.standard),
        fast:     formatGwei(gas.fast),
      },
      gas_prices_gwei: {
        slow:     gas.slow,
        standard: gas.standard,
        fast:     gas.fast,
      },
      simple_transfer_cost_usd: {
        slow:     formatUSD(calcTxCostUSD(gas.slow,     simpleTransferLimit, tokenPrice)),
        standard: formatUSD(calcTxCostUSD(gas.standard, simpleTransferLimit, tokenPrice)),
        fast:     formatUSD(calcTxCostUSD(gas.fast,     simpleTransferLimit, tokenPrice)),
      },
      native_token_price_usd: tokenPrice,
      gas_limit_used_for_estimate: simpleTransferLimit,
    };

    if (gas.base_fee !== undefined) output.base_fee_gwei = gas.base_fee;
    if (gas.raw_gas_price_gwei !== undefined) output.raw_gas_price_gwei = gas.raw_gas_price_gwei;

    // Human-readable summary
    output.summary = `${cfg.name} gas: slow ${formatGwei(gas.slow)} / standard ${formatGwei(gas.standard)} / fast ${formatGwei(gas.fast)}. ` +
      `A simple transfer costs ${formatUSD(calcTxCostUSD(gas.standard, simpleTransferLimit, tokenPrice))} at standard speed.`;

    return { success: true, output };
  } catch (e: any) {
    return { success: false, error: e.message ?? `Failed to fetch gas for ${chainKey}` };
  }
}

async function actionGetAllGasPrices(): Promise<SkillExecutionResult> {
  const simpleTransferLimit = 21_000;

  const results = await Promise.allSettled(
    Object.keys(CHAINS).map(async (key) => {
      const cfg = CHAINS[key];
      const [gas, tokenPrice] = await Promise.all([
        fetchGasPrice(key),
        fetchNativeTokenPriceUSD(cfg.coingecko_id),
      ]);
      const standardCostUSD = calcTxCostUSD(gas.standard, simpleTransferLimit, tokenPrice);
      return {
        key,
        chain:    cfg.name,
        chain_id: cfg.chain_id,
        symbol:   cfg.symbol,
        model:    cfg.eip1559 ? 'EIP-1559' : 'Legacy',
        slow_gwei:     gas.slow,
        standard_gwei: gas.standard,
        fast_gwei:     gas.fast,
        base_fee_gwei: gas.base_fee,
        standard_cost_usd:   standardCostUSD,
        standard_cost_usd_f: formatUSD(standardCostUSD),
        standard_gwei_f:     formatGwei(gas.standard),
        native_token_price_usd: tokenPrice,
      };
    })
  );

  const successful: any[] = [];
  const failed: { chain: string; error: string }[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const key = Object.keys(CHAINS)[i];
    if (r.status === 'fulfilled') {
      successful.push(r.value);
    } else {
      failed.push({ chain: key, error: (r.reason as any)?.message ?? 'unknown error' });
    }
  }

  // Sort cheapest first by standard USD cost
  successful.sort((a, b) => a.standard_cost_usd - b.standard_cost_usd);

  const ranked = successful.map((entry, idx) => ({
    rank:     idx + 1,
    chain:    entry.chain,
    chain_id: entry.chain_id,
    symbol:   entry.symbol,
    model:    entry.model,
    gas: {
      slow:     formatGwei(entry.slow_gwei),
      standard: formatGwei(entry.standard_gwei),
      fast:     formatGwei(entry.fast_gwei),
      ...(entry.base_fee_gwei !== undefined ? { base_fee: formatGwei(entry.base_fee_gwei) } : {}),
    },
    gas_gwei: {
      slow:     entry.slow_gwei,
      standard: entry.standard_gwei,
      fast:     entry.fast_gwei,
    },
    simple_transfer_cost_usd: entry.standard_cost_usd_f,
    native_token_price_usd:   entry.native_token_price_usd,
  }));

  const cheapest = ranked[0];
  const priciest = ranked[ranked.length - 1];

  return {
    success: true,
    output: {
      chains:           ranked,
      fetched:          successful.length,
      failed:           failed.length > 0 ? failed : undefined,
      gas_limit_used:   simpleTransferLimit,
      summary: cheapest && priciest
        ? `Cheapest: ${cheapest.chain} at ${cheapest.simple_transfer_cost_usd} per transfer ` +
          `(${cheapest.gas.standard}). Most expensive: ${priciest.chain} at ` +
          `${priciest.simple_transfer_cost_usd} per transfer (${priciest.gas.standard}).`
        : 'No data available.',
    },
  };
}

async function actionEstimateTxCost(input: any): Promise<SkillExecutionResult> {
  const chainKey = (input.chain ?? '').toLowerCase().trim();
  if (!chainKey) {
    return {
      success: false,
      error: 'Provide "chain" (e.g. "ethereum", "polygon", "arbitrum", "optimism", "base", "bsc", "avalanche").',
    };
  }
  if (!CHAINS[chainKey]) {
    return {
      success: false,
      error: `Unknown chain "${chainKey}". Supported: ${Object.keys(CHAINS).join(', ')}.`,
    };
  }

  const gasLimit: number = parseInt(input.gas_limit ?? '21000', 10);
  if (isNaN(gasLimit) || gasLimit <= 0) {
    return { success: false, error: '"gas_limit" must be a positive integer (default: 21000 for a simple ETH transfer).' };
  }

  const speed: string = (input.speed ?? 'standard').toLowerCase();
  if (!['slow', 'standard', 'fast'].includes(speed)) {
    return { success: false, error: '"speed" must be one of: slow, standard, fast.' };
  }

  const cfg = CHAINS[chainKey];

  try {
    const [gas, tokenPrice] = await Promise.all([
      fetchGasPrice(chainKey),
      fetchNativeTokenPriceUSD(cfg.coingecko_id),
    ]);

    const gasPriceGwei = gas[speed as keyof Pick<GasEstimate, 'slow' | 'standard' | 'fast'>];
    const costInNative = (gasPriceGwei * gasLimit) / 1e9;
    const costInUSD    = costInNative * tokenPrice;

    const output: Record<string, any> = {
      chain:    cfg.name,
      chain_id: cfg.chain_id,
      symbol:   cfg.symbol,
      gas_limit: gasLimit,
      speed,
      gas_price_gwei: gasPriceGwei,
      gas_price_gwei_f: formatGwei(gasPriceGwei),
      cost_in_native: parseFloat(costInNative.toFixed(10)),
      cost_in_native_f: `${costInNative.toFixed(8)} ${cfg.symbol}`,
      cost_in_usd: costInUSD,
      cost_in_usd_f: formatUSD(costInUSD),
      native_token_price_usd: tokenPrice,
      model: cfg.eip1559 ? 'EIP-1559' : 'Legacy',
    };

    if (gas.base_fee !== undefined) output.base_fee_gwei = gas.base_fee;

    // Provide all three speeds for easy comparison
    output.all_speeds = {
      slow:     { gas_price_gwei: gas.slow,     cost_usd: formatUSD(calcTxCostUSD(gas.slow,     gasLimit, tokenPrice)), cost_native: `${((gas.slow     * gasLimit) / 1e9).toFixed(8)} ${cfg.symbol}` },
      standard: { gas_price_gwei: gas.standard, cost_usd: formatUSD(calcTxCostUSD(gas.standard, gasLimit, tokenPrice)), cost_native: `${((gas.standard * gasLimit) / 1e9).toFixed(8)} ${cfg.symbol}` },
      fast:     { gas_price_gwei: gas.fast,     cost_usd: formatUSD(calcTxCostUSD(gas.fast,     gasLimit, tokenPrice)), cost_native: `${((gas.fast     * gasLimit) / 1e9).toFixed(8)} ${cfg.symbol}` },
    };

    output.summary =
      `Estimated cost on ${cfg.name} for gas_limit=${gasLimit} at ${speed} speed: ` +
      `${output.cost_in_native_f} (${output.cost_in_usd_f}) at ${output.gas_price_gwei_f}.`;

    return { success: true, output };
  } catch (e: any) {
    return { success: false, error: e.message ?? `Failed to estimate tx cost on ${chainKey}` };
  }
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const GAS_TRACKER_SKILL_METADATA = {
  name:        'Gas Tracker',
  description:
    'Real-time gas prices for major EVM chains (Ethereum, Polygon, BSC, Arbitrum, Optimism, Base, Avalanche). ' +
    'Get slow/standard/fast gas prices in Gwei and estimated transaction costs in USD. ' +
    'No API key required — uses public LlamaNodes RPC endpoints.',
  category:    'Data & Oracles',
  version:     '1.0.0',
  author_type: 'official',
  is_paid:     false,
  price:       null,
  tags:        ['gas', 'evm', 'ethereum', 'polygon', 'arbitrum', 'fees', 'infrastructure', 'base', 'optimism', 'bsc', 'avalanche'],
  external_url: 'https://etherscan.io/gastracker',
  logo_url:    'https://icons.llamao.fi/icons/protocols/ethereum?w=48&h=48',
  partner_verified: false,
  status:      'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_gas_price', 'get_all_gas_prices', 'estimate_tx_cost'],
        description:
          'get_protocol_info: Overview of supported chains and gas models. ' +
          'get_gas_price: Current slow/standard/fast gas for one chain (requires chain). ' +
          'get_all_gas_prices: Gas for all chains ranked cheapest to most expensive. ' +
          'estimate_tx_cost: Cost for a transaction (requires chain; optional gas_limit, speed).',
      },
      chain: {
        type: 'string',
        enum: ['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism', 'base', 'avalanche'],
        description:
          'Target EVM chain. Required for get_gas_price and estimate_tx_cost. ' +
          'Examples: "ethereum", "polygon", "arbitrum", "base".',
      },
      gas_limit: {
        type: 'number',
        description:
          'Gas units consumed by the transaction. ' +
          'Default: 21000 (simple ETH/token transfer). ' +
          'ERC-20 transfer ≈ 65000; Uniswap swap ≈ 150000–250000.',
      },
      speed: {
        type: 'string',
        enum: ['slow', 'standard', 'fast'],
        description:
          'Confirmation speed tier. Default: "standard". ' +
          'slow = likely next few blocks; standard = next block; fast = almost always next block.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Ethereum gas prices',
      description: 'Get current slow/standard/fast gas on Ethereum with USD cost estimates',
      input:  { action: 'get_gas_price', chain: 'ethereum' },
      output: { success: true, output: { summary: 'Ethereum gas: slow 5.1000 Gwei / standard 8.2000 Gwei / fast 12.5000 Gwei. A simple transfer costs $0.52 at standard speed.' } },
    },
    {
      title: 'Polygon gas check',
      description: 'Is gas cheap on Polygon right now?',
      input:  { action: 'get_gas_price', chain: 'polygon' },
      output: { success: true, output: { summary: 'Polygon gas: slow 30.0000 Gwei / standard 35.0000 Gwei / fast 45.0000 Gwei. A simple transfer costs $0.0009 at standard speed.' } },
    },
    {
      title: 'Compare all chains',
      description: 'Get gas across all supported chains, ranked cheapest to most expensive',
      input:  { action: 'get_all_gas_prices' },
      output: { success: true, output: { summary: 'Cheapest: Polygon at $0.0009 per transfer. Most expensive: Ethereum at $0.52 per transfer.' } },
    },
    {
      title: 'Estimate Uniswap swap cost',
      description: 'How much would a Uniswap swap cost on Arbitrum?',
      input:  { action: 'estimate_tx_cost', chain: 'arbitrum', gas_limit: 200000, speed: 'standard' },
      output: { success: true, output: { summary: 'Estimated cost on Arbitrum for gas_limit=200000 at standard speed: 0.00000200 ETH ($0.0050) at 0.0100 Gwei.' } },
    },
    {
      title: 'Protocol info',
      description: 'What chains are supported and how does gas tracking work?',
      input:  { action: 'get_protocol_info' },
      output: { success: true, output: { name: 'Multi-Chain EVM Gas Tracker' } },
    },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeGasTrackerSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':   return actionGetProtocolInfo();
      case 'get_gas_price':       return actionGetGasPrice(input);
      case 'get_all_gas_prices':  return actionGetAllGasPrices();
      case 'estimate_tx_cost':    return actionEstimateTxCost(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_gas_price, get_all_gas_prices, estimate_tx_cost`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Gas Tracker skill unexpected error' };
  }
}
