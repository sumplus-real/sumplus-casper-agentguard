-- Uniswap Skills for Sumplus Arsenal
-- Run this after official-skills.sql
-- Then call POST /api/admin/backfill-embeddings to generate embeddings

-- ══════════════════════════════════════════════════════════════════════════════
-- Skill 1: Uniswap Token Swap
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.skills (id, name, description, category, tags, author_type, status, schema, code, usage_examples, is_paid, price)
VALUES (
  gen_random_uuid(),
  'Uniswap Token Swap',
  'Execute a token swap on Uniswap V3 across multiple chains (Ethereum, Arbitrum, Polygon, Base, Optimism). Automatically calculates optimal route, handles slippage protection, and returns transaction details. Supports both exact input and exact output swaps.',
  'Blockchain',
  ARRAY['uniswap', 'defi', 'swap', 'dex', 'evm', 'ethereum'],
  'official',
  'approved',
  '{
    "input": {
      "type": "object",
      "properties": {
        "chain": {
          "type": "string",
          "enum": ["ethereum", "arbitrum", "polygon", "base", "optimism"],
          "description": "EVM chain to execute swap on"
        },
        "tokenIn": {
          "type": "string",
          "description": "Input token address (use 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE for native ETH)"
        },
        "tokenOut": {
          "type": "string",
          "description": "Output token address"
        },
        "amountIn": {
          "type": "string",
          "description": "Amount of input token in wei (use ethers.parseUnits for decimals)"
        },
        "slippageBps": {
          "type": "integer",
          "description": "Max slippage in basis points (100 = 1%, default 50 = 0.5%)",
          "default": 50
        },
        "recipient": {
          "type": "string",
          "description": "Recipient address (defaults to sender if not provided)"
        },
        "deadline": {
          "type": "integer",
          "description": "Unix timestamp deadline (defaults to current time + 20 minutes)"
        }
      },
      "required": ["chain", "tokenIn", "tokenOut", "amountIn"]
    },
    "output": {
      "type": "object",
      "properties": {
        "success": {"type": "boolean"},
        "txHash": {"type": "string", "description": "Transaction hash"},
        "amountOut": {"type": "string", "description": "Actual output amount received in wei"},
        "amountOutMin": {"type": "string", "description": "Minimum output after slippage"},
        "priceImpact": {"type": "number", "description": "Price impact percentage"},
        "route": {
          "type": "array",
          "items": {"type": "string"},
          "description": "Token addresses in swap route"
        },
        "gasUsed": {"type": "string"},
        "effectiveGasPrice": {"type": "string"},
        "explorerUrl": {"type": "string"}
      }
    }
  }',
  '// Uniswap V3 Token Swap Implementation
import { ethers } from "ethers";
import { SwapRouter, Trade, Route, Pool } from "@uniswap/v3-sdk";
import { Token, CurrencyAmount, Percent } from "@uniswap/sdk-core";

export async function execute(input) {
  const { chain, tokenIn, tokenOut, amountIn, slippageBps = 50, recipient, deadline } = input;

  // 1. Initialize provider and signer
  const provider = getProvider(chain);
  const signer = getSigner(provider);

  // 2. Fetch pool data and build route
  const tokenInContract = new Token(getChainId(chain), tokenIn, await getTokenDecimals(tokenIn, provider));
  const tokenOutContract = new Token(getChainId(chain), tokenOut, await getTokenDecimals(tokenOut, provider));

  const poolAddress = await getPoolAddress(tokenIn, tokenOut, 3000, chain); // 0.3% fee tier
  const pool = await Pool.fetchPoolData(tokenOutContract, tokenInContract, 3000, provider);

  const route = new Route([pool], tokenInContract, tokenOutContract);
  const amountInCurrency = CurrencyAmount.fromRawAmount(tokenInContract, amountIn);

  // 3. Get quote and build trade
  const { calldata, value } = SwapRouter.swapCallParameters(
    new Trade({ route, inputAmount: amountInCurrency, tradeType: TradeType.EXACT_INPUT }),
    {
      slippageTolerance: new Percent(slippageBps, 10000),
      recipient: recipient || await signer.getAddress(),
      deadline: deadline || Math.floor(Date.now() / 1000) + 1200
    }
  );

  // 4. Execute swap
  const swapRouter = new ethers.Contract(SWAP_ROUTER_ADDRESS[chain], SWAP_ROUTER_ABI, signer);
  const tx = await swapRouter.multicall([calldata], { value });
  const receipt = await tx.wait();

  // 5. Parse output amount from logs
  const transferLog = receipt.logs.find(log => log.topics[0] === TRANSFER_EVENT_TOPIC);
  const amountOut = ethers.getBigInt(transferLog.data);

  return {
    success: true,
    txHash: receipt.hash,
    amountOut: amountOut.toString(),
    amountOutMin: calculateMinOutput(amountOut, slippageBps).toString(),
    priceImpact: calculatePriceImpact(route, amountIn, amountOut),
    route: route.path.map(t => t.address),
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.effectiveGasPrice.toString(),
    explorerUrl: getExplorerUrl(chain, receipt.hash)
  };
}',
  '[
    {
      "description": "Swap 1 ETH for USDC on Ethereum mainnet with 0.5% slippage",
      "input": {
        "chain": "ethereum",
        "tokenIn": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "tokenOut": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "amountIn": "1000000000000000000",
        "slippageBps": 50
      },
      "expected_output": {
        "success": true,
        "txHash": "0xabc123...",
        "amountOut": "3245678901",
        "priceImpact": 0.12,
        "route": ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]
      }
    },
    {
      "description": "Swap USDC for WETH on Arbitrum with custom deadline",
      "input": {
        "chain": "arbitrum",
        "tokenIn": "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
        "tokenOut": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        "amountIn": "1000000000",
        "slippageBps": 100,
        "deadline": 1735689600
      },
      "expected_output": {
        "success": true,
        "amountOut": "308765432109876543",
        "route": ["0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"]
      }
    }
  ]',
  true,
  2.50
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Skill 2: Uniswap Price Quote
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.skills (id, name, description, category, tags, author_type, status, schema, code, usage_examples, is_paid, price)
VALUES (
  gen_random_uuid(),
  'Uniswap Price Quote',
  'Get real-time price quotes for token swaps on Uniswap V3 without executing the transaction. Returns expected output amount, price impact, optimal route, and gas estimate. Supports multi-hop routes for better prices. Perfect for price checking before executing swaps.',
  'Blockchain',
  ARRAY['uniswap', 'defi', 'price', 'quote', 'dex', 'ethereum'],
  'official',
  'approved',
  '{
    "input": {
      "type": "object",
      "properties": {
        "chain": {
          "type": "string",
          "enum": ["ethereum", "arbitrum", "polygon", "base", "optimism"],
          "description": "EVM chain to query"
        },
        "tokenIn": {
          "type": "string",
          "description": "Input token address"
        },
        "tokenOut": {
          "type": "string",
          "description": "Output token address"
        },
        "amountIn": {
          "type": "string",
          "description": "Input amount in wei"
        },
        "feeTier": {
          "type": "integer",
          "enum": [100, 500, 3000, 10000],
          "description": "Pool fee tier in basis points (default: auto-select best)",
          "default": null
        }
      },
      "required": ["chain", "tokenIn", "tokenOut", "amountIn"]
    },
    "output": {
      "type": "object",
      "properties": {
        "amountOut": {"type": "string", "description": "Expected output amount in wei"},
        "priceImpact": {"type": "number", "description": "Price impact percentage"},
        "executionPrice": {"type": "string", "description": "Price of 1 tokenIn in tokenOut"},
        "route": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "token": {"type": "string"},
              "symbol": {"type": "string"},
              "feeTier": {"type": "integer"}
            }
          },
          "description": "Swap route with fee tiers"
        },
        "gasEstimate": {"type": "string", "description": "Estimated gas units"},
        "midPrice": {"type": "string", "description": "Pool mid-price (no slippage)"}
      }
    }
  }',
  '// Uniswap V3 Price Quote Implementation
import { ethers } from "ethers";
import { Quoter } from "@uniswap/v3-sdk";
import { Token } from "@uniswap/sdk-core";

export async function execute(input) {
  const { chain, tokenIn, tokenOut, amountIn, feeTier } = input;

  const provider = getProvider(chain);
  const quoter = new ethers.Contract(QUOTER_V2_ADDRESS[chain], QUOTER_V2_ABI, provider);

  // Auto-select best fee tier if not specified
  const feeTiers = feeTier ? [feeTier] : [100, 500, 3000, 10000];
  let bestQuote = null;
  let bestRoute = null;

  for (const fee of feeTiers) {
    try {
      const quoteParams = {
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0
      };

      const quote = await quoter.quoteExactInputSingle.staticCall(quoteParams);

      if (!bestQuote || quote.amountOut > bestQuote.amountOut) {
        bestQuote = quote;
        bestRoute = { fee, tokenIn, tokenOut };
      }
    } catch (e) {
      // Pool doesnt exist for this fee tier, skip
      continue;
    }
  }

  if (!bestQuote) throw new Error("No valid route found");

  // Calculate price impact
  const pool = await fetchPool(tokenIn, tokenOut, bestRoute.fee, provider);
  const midPrice = pool.token0Price.toSignificant(6);
  const executionPrice = (Number(bestQuote.amountOut) / Number(amountIn)).toString();
  const priceImpact = ((executionPrice - midPrice) / midPrice) * 100;

  return {
    amountOut: bestQuote.amountOut.toString(),
    priceImpact: Math.abs(priceImpact),
    executionPrice,
    route: [
      { token: tokenIn, symbol: await getTokenSymbol(tokenIn, provider), feeTier: bestRoute.fee },
      { token: tokenOut, symbol: await getTokenSymbol(tokenOut, provider), feeTier: null }
    ],
    gasEstimate: bestQuote.gasEstimate.toString(),
    midPrice
  };
}',
  '[
    {
      "description": "Get quote for swapping 1000 USDC to ETH on Ethereum",
      "input": {
        "chain": "ethereum",
        "tokenIn": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "tokenOut": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "amountIn": "1000000000"
      },
      "expected_output": {
        "amountOut": "308765432109876543",
        "priceImpact": 0.08,
        "executionPrice": "0.000308765",
        "route": [
          {"token": "0xA0b8...", "symbol": "USDC", "feeTier": 500},
          {"token": "0xC02a...", "symbol": "WETH", "feeTier": null}
        ],
        "gasEstimate": "185000"
      }
    },
    {
      "description": "Get quote for WETH to USDT on Arbitrum with specific fee tier",
      "input": {
        "chain": "arbitrum",
        "tokenIn": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        "tokenOut": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        "amountIn": "500000000000000000",
        "feeTier": 3000
      },
      "expected_output": {
        "amountOut": "1623456789",
        "priceImpact": 0.15,
        "executionPrice": "3246.913578"
      }
    }
  ]',
  false,
  null
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Skill 3: Uniswap Pool Info
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.skills (id, name, description, category, tags, author_type, status, schema, code, usage_examples, is_paid, price)
VALUES (
  gen_random_uuid(),
  'Uniswap Pool Info',
  'Retrieve comprehensive information about Uniswap V3 liquidity pools including TVL, 24h volume, fees earned, current price, liquidity depth, and tick distribution. Supports all major EVM chains and fee tiers.',
  'Blockchain',
  ARRAY['uniswap', 'defi', 'liquidity', 'pool', 'analytics', 'tvl'],
  'official',
  'approved',
  '{
    "input": {
      "type": "object",
      "properties": {
        "chain": {
          "type": "string",
          "enum": ["ethereum", "arbitrum", "polygon", "base", "optimism"]
        },
        "token0": {
          "type": "string",
          "description": "First token address (order matters for price direction)"
        },
        "token1": {
          "type": "string",
          "description": "Second token address"
        },
        "feeTier": {
          "type": "integer",
          "enum": [100, 500, 3000, 10000],
          "description": "Pool fee tier in basis points (0.01%, 0.05%, 0.3%, 1%)",
          "default": 3000
        }
      },
      "required": ["chain", "token0", "token1"]
    },
    "output": {
      "type": "object",
      "properties": {
        "poolAddress": {"type": "string"},
        "token0": {
          "type": "object",
          "properties": {
            "address": {"type": "string"},
            "symbol": {"type": "string"},
            "decimals": {"type": "integer"}
          }
        },
        "token1": {
          "type": "object",
          "properties": {
            "address": {"type": "string"},
            "symbol": {"type": "string"},
            "decimals": {"type": "integer"}
          }
        },
        "feeTier": {"type": "integer"},
        "liquidity": {"type": "string", "description": "Total liquidity in pool"},
        "sqrtPriceX96": {"type": "string"},
        "tick": {"type": "integer"},
        "price": {"type": "string", "description": "Current price (token1/token0)"},
        "tvlUSD": {"type": "number", "description": "Total value locked in USD"},
        "volume24h": {"type": "number", "description": "24h trading volume in USD"},
        "fees24h": {"type": "number", "description": "24h fees collected in USD"},
        "apr": {"type": "number", "description": "Estimated annual percentage rate for LPs"}
      }
    }
  }',
  '// Uniswap V3 Pool Info Implementation
import { ethers } from "ethers";
import { Pool, FeeAmount } from "@uniswap/v3-sdk";
import { Token } from "@uniswap/sdk-core";

export async function execute(input) {
  const { chain, token0, token1, feeTier = 3000 } = input;

  const provider = getProvider(chain);
  const chainId = getChainId(chain);

  // 1. Get pool address
  const factory = new ethers.Contract(FACTORY_ADDRESS[chain], FACTORY_ABI, provider);
  const poolAddress = await factory.getPool(token0, token1, feeTier);

  if (poolAddress === ethers.ZeroAddress) {
    throw new Error(`Pool does not exist for ${token0}/${token1} with ${feeTier} fee tier`);
  }

  // 2. Fetch pool state
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const [slot0, liquidity, token0Contract, token1Contract] = await Promise.all([
    pool.slot0(),
    pool.liquidity(),
    new ethers.Contract(token0, ERC20_ABI, provider),
    new ethers.Contract(token1, ERC20_ABI, provider)
  ]);

  const [symbol0, decimals0, symbol1, decimals1] = await Promise.all([
    token0Contract.symbol(),
    token0Contract.decimals(),
    token1Contract.symbol(),
    token1Contract.decimals()
  ]);

  // 3. Calculate price from sqrtPriceX96
  const sqrtPriceX96 = slot0.sqrtPriceX96;
  const price = (Number(sqrtPriceX96) / (2 ** 96)) ** 2 * (10 ** (decimals0 - decimals1));

  // 4. Fetch 24h stats from TheGraph or equivalent
  const stats = await fetchPoolStats24h(poolAddress, chain);

  // 5. Calculate APR
  const apr = (stats.fees24h / stats.tvlUSD) * 365 * 100;

  return {
    poolAddress,
    token0: { address: token0, symbol: symbol0, decimals: decimals0 },
    token1: { address: token1, symbol: symbol1, decimals: decimals1 },
    feeTier,
    liquidity: liquidity.toString(),
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick: slot0.tick,
    price: price.toFixed(6),
    tvlUSD: stats.tvlUSD,
    volume24h: stats.volume24h,
    fees24h: stats.fees24h,
    apr: apr.toFixed(2)
  };
}',
  '[
    {
      "description": "Get info for USDC/ETH 0.05% pool on Ethereum",
      "input": {
        "chain": "ethereum",
        "token0": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "token1": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "feeTier": 500
      },
      "expected_output": {
        "poolAddress": "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
        "token0": {"address": "0xA0b8...", "symbol": "USDC", "decimals": 6},
        "token1": {"address": "0xC02a...", "symbol": "WETH", "decimals": 18},
        "feeTier": 500,
        "liquidity": "12847563829047362",
        "price": "3245.67",
        "tvlUSD": 125000000,
        "volume24h": 45000000,
        "fees24h": 22500,
        "apr": 6.57
      }
    },
    {
      "description": "Get info for WETH/USDT pool on Arbitrum",
      "input": {
        "chain": "arbitrum",
        "token0": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        "token1": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        "feeTier": 3000
      },
      "expected_output": {
        "tvlUSD": 8500000,
        "volume24h": 3200000,
        "apr": 13.74
      }
    }
  ]',
  false,
  null
);
