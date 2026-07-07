-- Uniswap Skills v2 Migration
-- Maria agent team suggestions: quote/execute split, exact-output, human-readable amounts, chain config
-- Run in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Rename + overhaul "Uniswap Price Quote" → "Uniswap Get Quote"
--    - Human-readable amounts (not wei)
--    - Exact-output mode (amountOut field)
--    - Clearer route output (symbols, not addresses)
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE public.skills
SET
  name        = 'Uniswap Get Quote',
  description = 'Get a real-time price quote for a token swap on Uniswap V3 without executing any transaction. Supports both exact-input (''I have 0.1 ETH, how much USDC do I get?'') and exact-output (''I want 100 USDC, how much ETH do I need?'') modes. Automatically selects the best fee tier and returns human-readable amounts. Use this before Uniswap Build Transaction to confirm the price.',
  tags        = ARRAY['uniswap', 'defi', 'price', 'quote', 'dex', 'ethereum'],
  schema      = '{
    "input": {
      "type": "object",
      "properties": {
        "chain":     { "type": "string", "enum": ["ethereum","arbitrum","polygon","base","optimism"], "description": "EVM chain to query" },
        "tokenIn":   { "type": "string", "description": "Input token symbol (e.g. ''ETH'', ''USDC'') or contract address" },
        "tokenOut":  { "type": "string", "description": "Output token symbol or contract address" },
        "amountIn":  { "type": "string", "description": "Human-readable input amount, e.g. ''0.1'' for 0.1 ETH. Do NOT use raw wei. Mutually exclusive with amountOut." },
        "amountOut": { "type": "string", "description": "Human-readable desired output amount for exact-output queries, e.g. ''100'' for 100 USDC. Mutually exclusive with amountIn." },
        "feeTier":   { "type": "integer", "enum": [100,500,3000,10000], "description": "Pool fee tier (100=0.01%, 500=0.05%, 3000=0.3%, 10000=1%). Omit to auto-select best." }
      },
      "required": ["chain","tokenIn","tokenOut"]
    },
    "output": {
      "type": "object",
      "properties": {
        "amountIn":       { "type": "string",  "description": "Human-readable input amount" },
        "amountOut":      { "type": "string",  "description": "Human-readable expected output amount" },
        "priceImpact":    { "type": "number",  "description": "Price impact as a percentage, e.g. 0.08 means 0.08%" },
        "fee":            { "type": "string",  "description": "Fee tier used, e.g. ''0.3%''" },
        "route":          { "type": "array",   "items": { "type": "string" }, "description": "Token symbols in swap route, e.g. [''ETH'',''USDC'']" },
        "executionPrice": { "type": "string",  "description": "Effective price: tokenOut per 1 tokenIn" },
        "gasEstimate":    { "type": "string",  "description": "Estimated gas units" }
      }
    }
  }',
  usage_examples = '[
    {
      "title": "Exact-input: sell 0.1 ETH for USDC on Optimism",
      "description": "How much USDC do I get for 0.1 ETH?",
      "input": { "chain": "optimism", "tokenIn": "ETH", "tokenOut": "USDC", "amountIn": "0.1" },
      "expected_output": { "amountIn": "0.1", "amountOut": "192.5", "priceImpact": 0.08, "fee": "0.3%", "route": ["ETH","USDC"], "executionPrice": "1925.0", "gasEstimate": "185000" }
    },
    {
      "title": "Exact-output: buy 100 USDC with ETH on Optimism",
      "description": "How much ETH do I need to get exactly 100 USDC?",
      "input": { "chain": "optimism", "tokenIn": "ETH", "tokenOut": "USDC", "amountOut": "100" },
      "expected_output": { "amountIn": "0.052", "amountOut": "100", "priceImpact": 0.04, "fee": "0.3%", "route": ["ETH","USDC"], "executionPrice": "1923.07", "gasEstimate": "190000" }
    }
  ]',
  updated_at = now()
WHERE name = 'Uniswap Price Quote';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Replace "Uniswap Token Swap" → "Uniswap Build Transaction"
--    - Returns calldata only: { to, data, value } — caller signs with own wallet
--    - No private key touched
--    - Human-readable amounts + exact-output mode
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE public.skills
SET
  name        = 'Uniswap Build Transaction',
  description = 'Build an unsigned Uniswap V3 swap transaction (calldata only). Returns the raw transaction fields { to, data, value } that the caller signs and broadcasts using their own wallet or signing infrastructure (hardware wallet, MPC, AA). Does NOT hold or use any private keys. Supports exact-input and exact-output modes with human-readable amounts. Use Uniswap Get Quote first to confirm the price before building.',
  tags        = ARRAY['uniswap', 'defi', 'swap', 'transaction', 'calldata', 'dex', 'evm'],
  schema      = '{
    "input": {
      "type": "object",
      "properties": {
        "chain":       { "type": "string", "enum": ["ethereum","arbitrum","polygon","base","optimism"], "description": "EVM chain for the swap" },
        "tokenIn":     { "type": "string", "description": "Input token symbol (e.g. ''ETH'', ''USDC'') or contract address" },
        "tokenOut":    { "type": "string", "description": "Output token symbol or contract address" },
        "amountIn":    { "type": "string", "description": "Human-readable input amount, e.g. ''0.1'' for 0.1 ETH. Do NOT use raw wei. Mutually exclusive with amountOut." },
        "amountOut":   { "type": "string", "description": "Human-readable desired output amount for exact-output swaps, e.g. ''100'' for 100 USDC. Mutually exclusive with amountIn." },
        "recipient":   { "type": "string", "description": "Recipient wallet address (0x...) who will receive the output tokens" },
        "slippageBps": { "type": "integer", "description": "Max slippage in basis points (50=0.5%, 100=1%). Default: 50", "default": 50 },
        "deadline":    { "type": "integer", "description": "Unix timestamp deadline. Default: now + 20 minutes" }
      },
      "required": ["chain","tokenIn","tokenOut","recipient"]
    },
    "output": {
      "type": "object",
      "properties": {
        "to":           { "type": "string", "description": "SwapRouter contract address" },
        "data":         { "type": "string", "description": "Encoded calldata (hex string starting with 0x)" },
        "value":        { "type": "string", "description": "ETH value to send in hex wei (0x0 for ERC-20 swaps)" },
        "amountIn":     { "type": "string", "description": "Human-readable input amount" },
        "amountOutMin": { "type": "string", "description": "Minimum output after slippage (human-readable)" },
        "gasEstimate":  { "type": "string", "description": "Estimated gas units" }
      }
    }
  }',
  usage_examples = '[
    {
      "title": "Exact-input: build calldata to sell 0.1 ETH for USDC on Optimism",
      "description": "Build unsigned tx to swap 0.1 ETH → USDC. Caller signs with their own wallet.",
      "input": { "chain": "optimism", "tokenIn": "ETH", "tokenOut": "USDC", "amountIn": "0.1", "recipient": "0xYourWalletAddress", "slippageBps": 50 },
      "expected_output": { "to": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", "data": "0x414bf389...", "value": "0x16345785D8A0000", "amountIn": "0.1", "amountOutMin": "191.54", "gasEstimate": "195000" }
    },
    {
      "title": "Exact-output: build calldata to buy exactly 100 USDC on Optimism",
      "description": "Build unsigned tx to receive exactly 100 USDC, spending at most ETH + 0.5% slippage.",
      "input": { "chain": "optimism", "tokenIn": "ETH", "tokenOut": "USDC", "amountOut": "100", "recipient": "0xYourWalletAddress", "slippageBps": 50 },
      "expected_output": { "to": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", "data": "0xdb3e2198...", "value": "0x0", "amountIn": "0.052", "amountOutMin": "100", "gasEstimate": "198000" }
    }
  ]',
  updated_at = now()
WHERE name = 'Uniswap Token Swap';

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Uniswap Pool Info — update examples to use token symbols, not raw addresses
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE public.skills
SET
  schema = '{
    "input": {
      "type": "object",
      "properties": {
        "chain":   { "type": "string", "enum": ["ethereum","arbitrum","polygon","base","optimism"] },
        "token0":  { "type": "string", "description": "First token symbol (e.g. ''USDC'') or contract address" },
        "token1":  { "type": "string", "description": "Second token symbol (e.g. ''WETH'') or contract address" },
        "feeTier": { "type": "integer", "enum": [100,500,3000,10000], "description": "Pool fee tier (100=0.01%, 500=0.05%, 3000=0.3%, 10000=1%). Default: 3000", "default": 3000 }
      },
      "required": ["chain","token0","token1"]
    },
    "output": {
      "type": "object",
      "properties": {
        "poolAddress": { "type": "string" },
        "token0":      { "type": "object", "properties": { "address": { "type": "string" }, "symbol": { "type": "string" }, "decimals": { "type": "integer" } } },
        "token1":      { "type": "object", "properties": { "address": { "type": "string" }, "symbol": { "type": "string" }, "decimals": { "type": "integer" } } },
        "feeTier":     { "type": "integer" },
        "liquidity":   { "type": "string", "description": "Raw liquidity value" },
        "price":       { "type": "string", "description": "Current price (token1 per token0), human-readable" },
        "tvlUSD":      { "type": "number", "description": "Total value locked in USD" },
        "volume24h":   { "type": "number", "description": "24h trading volume in USD" },
        "fees24h":     { "type": "number", "description": "24h fees collected in USD" },
        "apr":         { "type": "number", "description": "Estimated APR for LPs based on 24h fees" }
      }
    }
  }',
  usage_examples = '[
    {
      "title": "Get USDC/ETH pool info on Ethereum (0.05% tier)",
      "description": "Retrieve TVL, volume, and APR for the main USDC/ETH pool",
      "input": { "chain": "ethereum", "token0": "USDC", "token1": "WETH", "feeTier": 500 },
      "expected_output": {
        "poolAddress": "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
        "token0": { "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "symbol": "USDC", "decimals": 6 },
        "token1": { "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "symbol": "WETH", "decimals": 18 },
        "feeTier": 500, "liquidity": "12847563829047362", "price": "3245.67",
        "tvlUSD": 125000000, "volume24h": 45000000, "fees24h": 22500, "apr": 6.57
      }
    }
  ]',
  updated_at = now()
WHERE name = 'Uniswap Pool Info';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. NEW: Uniswap Chain Config
--    Static configuration: contract addresses, token addresses, fee tiers
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.skills (name, description, category, tags, author_type, status, schema, code, usage_examples, is_paid, price)
VALUES (
  'Uniswap Chain Config',
  'Query static configuration for Uniswap V3 on any supported chain: contract addresses (router, factory, quoter), well-known token addresses, supported fee tiers, and the list of supported chains. Use this to avoid hardcoding addresses in your agent and to validate chain support before calling other Uniswap skills.',
  'Blockchain',
  ARRAY['uniswap', 'defi', 'config', 'addresses', 'tokens', 'evm'],
  'official',
  'approved',
  '{
    "input": {
      "type": "object",
      "properties": {
        "chain": { "type": "string", "enum": ["ethereum","arbitrum","polygon","base","optimism"], "description": "Chain to query. Omit to get list of all supported chains." }
      },
      "required": []
    },
    "output": {
      "type": "object",
      "properties": {
        "supported_chains": { "type": "array", "items": { "type": "string" }, "description": "All chains where Uniswap V3 is supported" },
        "chain":      { "type": "string",  "description": "The queried chain (only present if chain was specified)" },
        "swapRouter": { "type": "string",  "description": "SwapRouter02 contract address" },
        "factory":    { "type": "string",  "description": "UniswapV3Factory contract address" },
        "quoterV2":   { "type": "string",  "description": "QuoterV2 contract address" },
        "fee_tiers":  { "type": "array",   "items": { "type": "integer" }, "description": "Supported fee tiers in basis points" },
        "tokens":     { "type": "object",  "description": "Well-known token symbol → address mapping", "additionalProperties": { "type": "string" } }
      }
    }
  }',
  '// Uniswap Chain Config — static data, no RPC calls needed
const CHAIN_CONFIG = {
  ethereum: {
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    factory:    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoterV2:   "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    fee_tiers:  [100, 500, 3000, 10000],
    tokens: { WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7", DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F", WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" }
  },
  optimism: {
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    factory:    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoterV2:   "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    fee_tiers:  [100, 500, 3000, 10000],
    tokens: { WETH: "0x4200000000000000000000000000000000000006", USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", USDT: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", WBTC: "0x68f180fcCe6836688e9084f035309E29Bf0A2095" }
  },
  arbitrum: {
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    factory:    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoterV2:   "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    fee_tiers:  [100, 500, 3000, 10000],
    tokens: { WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548", WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" }
  },
  base: {
    swapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481",
    factory:    "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    quoterV2:   "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    fee_tiers:  [100, 500, 3000, 10000],
    tokens: { WETH: "0x4200000000000000000000000000000000000006", USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" }
  },
  polygon: {
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    factory:    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoterV2:   "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    fee_tiers:  [100, 500, 3000, 10000],
    tokens: { WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" }
  }
};

export async function execute(input) {
  const { chain } = input;
  const supported_chains = Object.keys(CHAIN_CONFIG);
  if (!chain) return { supported_chains };
  if (!CHAIN_CONFIG[chain]) throw new Error(`Unsupported chain: ${chain}. Supported: ${supported_chains.join(", ")}`);
  return { chain, supported_chains, ...CHAIN_CONFIG[chain] };
}',
  '[
    {
      "title": "Get Optimism Uniswap config",
      "description": "Fetch router addresses and token list for Optimism",
      "input": { "chain": "optimism" },
      "expected_output": {
        "chain": "optimism",
        "supported_chains": ["ethereum","optimism","arbitrum","base","polygon"],
        "swapRouter": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
        "factory": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        "quoterV2": "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        "fee_tiers": [100,500,3000,10000],
        "tokens": { "WETH": "0x4200000000000000000000000000000000000006", "USDC": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "USDT": "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", "DAI": "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", "WBTC": "0x68f180fcCe6836688e9084f035309E29Bf0A2095" }
      }
    },
    {
      "title": "List all supported chains",
      "description": "Get chains where Uniswap V3 is available",
      "input": {},
      "expected_output": { "supported_chains": ["ethereum","optimism","arbitrum","base","polygon"] }
    }
  ]',
  false,
  null
);
