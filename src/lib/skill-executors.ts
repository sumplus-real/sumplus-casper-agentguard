/**
 * Skill Executors - Real Implementation Logic
 *
 * Shared execution logic for Arsenal skills.
 * Used by both REST API and MCP Server to ensure consistent behavior.
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import type { SkillExecutionResult } from '@/types/skill';
import { executeCetusSkill } from '@/skills/cetus';
import { executeWalletSkill } from '@/skills/wallet';
import { executeWeexSkill } from '@/skills/weex';
import { executeUniswapGetQuote, executeUniswapBuildTx } from '@/skills/uniswap';
import { executeSuiSkill } from '@/skills/sui-blockchain';
import { executeYieldSkill } from '@/skills/sumplus-yield';
import { executeVelodromeSkill } from '@/skills/velodrome';
import { executeNaviSkill } from '@/skills/navi';
import { executeScallopSkill } from '@/skills/scallop';
import { executeSuilendSkill } from '@/skills/suilend';
import { executeAftermathSkill } from '@/skills/aftermath';
import { executeTalusNexusSkill } from '@/skills/talus-nexus';
import { executeHyperliquidSkill } from '@/skills/hyperliquid';
import { executePolymarketSkill } from '@/skills/polymarket';
import { executeDydxSkill } from '@/skills/dydx';
import { executeAaveSkill } from '@/skills/aave';
import { executeGmxSkill } from '@/skills/gmx';
import { executeIkaDwalletSkill } from '@/skills/ika-dwallet';
import { executeJupiterSkill } from '@/skills/jupiter';
import { executeRaydiumSkill } from '@/skills/raydium';
import { executeKaminoSkill } from '@/skills/kamino';
import { executeJitoSkill } from '@/skills/jito';
import { executeJupiterPerpsSkill } from '@/skills/jupiter-perps';
import { executeDriftSkill } from '@/skills/drift';
import { executePancakeSwapSkill } from '@/skills/pancakeswap';
import { executeAgniSkill } from '@/skills/agni';
import { executeUniswapBscSkill } from '@/skills/uniswap-bsc';
import { executeThenaSkill } from '@/skills/thena';
import { executeBlueFinEmberSkill } from '@/skills/bluefin-ember';
import { executeMppSkill } from '@/skills/tempo-mpp';
import { executeUniswapTempoSkill } from '@/skills/uniswap-tempo';
import { executeArsenalSkill } from '@/skills/arsenal';
import { executeAerodromeSkill } from '@/skills/aerodrome';
import { executeMoonwellSkill } from '@/skills/moonwell';
import { executeTempoSessionsSkill } from '@/skills/tempo-sessions';
import { executeTempoTokensSkill } from '@/skills/tempo-tokens';
import { executeUniswapXLayerSkill }   from '@/skills/uniswap-xlayer';
import { executeCurveXLayerSkill }     from '@/skills/curve-xlayer';
import { executeQuickSwapXLayerSkill } from '@/skills/quickswap-xlayer';
import { executeXPowerSkill }         from '@/skills/xpower';
import { executeUniswapV3MainnetSkill }   from '@/skills/uniswap-v3-mainnet';
import { executeAaveV3MainnetSkill }      from '@/skills/aave-v3-mainnet';
import { executeLidoMainnetSkill }        from '@/skills/lido-mainnet';
import { executeMorphoBlueMainnetSkill }  from '@/skills/morpho-blue-mainnet';
import { executeEthenaMainnetSkill }      from '@/skills/ethena-mainnet';
import { executeCurveReadMainnetSkill }   from '@/skills/curve-read-mainnet';
import { executePendleV4MainnetSkill }    from '@/skills/pendle-v4-mainnet';
import { executeOneInchMainnetSkill }     from '@/skills/oneinch-mainnet';
import { executeSynthraSkill }            from '@/skills/synthra';
import { executeDefiLlamaSkill }          from '@/skills/defillama';
import { executeEthRpcSkill }             from '@/skills/eth-rpc';
import { executeTokenListsSkill }         from '@/skills/tokenlists';
import { executeTxSimMainnetSkill }       from '@/skills/tx-sim-mainnet';
import { executeCctpMainnetSkill }        from '@/skills/cctp-mainnet';
import { executeAcrossMainnetSkill }      from '@/skills/across-mainnet';
import { executeStargateMainnetSkill }    from '@/skills/stargate-mainnet';
import { executeWormholeMainnetSkill }    from '@/skills/wormhole-mainnet';
import { executeDeBridgeMainnetSkill }    from '@/skills/debridge-mainnet';
import { executeXLayerBridgeSkill }       from '@/skills/xlayer-bridge';
import { executeMantleBridgeSkill }       from '@/skills/mantle-bridge';
import { executeHashKeyBridgeSkill }      from '@/skills/hashkey-bridge';
import { executeStableStockSkill }        from '@/skills/stablestock';
import { executeHskSwapSkill }            from '@/skills/hskswap';
import { executeDaoaasSwapSkill }         from '@/skills/daoaas-swap';
import { executeArcChainSkill }           from '@/skills/arc-chain';
import { executeHaedalSkill }             from '@/skills/haedal';
import { executeVoloSkill }               from '@/skills/volo';
import { executeTurbosSkill }             from '@/skills/turbos';
import { executeKriyaSkill }              from '@/skills/kriya';
import { executeDeepBookSkill }           from '@/skills/deepbook';
import { executeAlphaFiSkill }            from '@/skills/alphafi';
import { executePythSuiSkill }            from '@/skills/pyth-sui';
import { executeSuiNSSkill }              from '@/skills/suins';
import { executeSevenKSkill }             from '@/skills/sevenk';
import { executeFlowXSkill }              from '@/skills/flowx';
import { executeBucketSkill }             from '@/skills/bucket';
import { executeTypusSkill }              from '@/skills/typus';
import { executeTheGraphSkill }           from '@/skills/thegraph';
import { executeCoinGeckoSkill }          from '@/skills/coingecko';
import { executeENSSkill }               from '@/skills/ens';
import { executeChainlinkSkill }          from '@/skills/chainlink';
import { executeGasTrackerSkill }         from '@/skills/gas-tracker';
import { executeBabylonSkill }            from '@/skills/babylon';
import { executeLombardSkill }            from '@/skills/lombard';
import { executeBedrockSkill }            from '@/skills/bedrock';
import { executeSolvSkill }              from '@/skills/solv';
import { executeCoreDaoSkill }           from '@/skills/coredao';
import { executeLorenzoSkill }           from '@/skills/lorenzo';
import { executePellSkill }              from '@/skills/pell';
import { executeLiquidswapSkill }        from '@/skills/liquidswap';
import { executeThalaSkill }             from '@/skills/thala';
import { executeAriesSkill }             from '@/skills/aries';
import { executeCowProtocolSkill }       from '@/skills/cow-protocol';
import { executeMapleSkill }             from '@/skills/maple';
import { executeMariaQuerySkill }        from '@/skills/maria-query';
import { executeMariaSwapSkill }         from '@/skills/maria-swap';
import { executeMariaTransferSkill }     from '@/skills/maria-transfer';
import { executeMariaConverseSkill }     from '@/skills/maria-converse';
import { executeOndoSkill }             from '@/skills/ondo';
import { executeSkySkill }              from '@/skills/sky';
import { executeCantonSplice }          from '@/skills/canton-splice';
import { executeCasperAgentGuardSkill } from '@/skills/casper-agentguard';
import { executeX402PaymentSkill }      from '@/skills/x402-payment';
import { executeBnbChainSkill }         from '@/skills/bnb-chain';
import { executeEigenLayerSkill }       from '@/skills/eigenlayer';
import { executeEtherFiSkill }          from '@/skills/etherfi';
import { executeCentrifugeSkill }       from '@/skills/centrifuge';
import { executeUniswapV4MainnetSkill } from '@/skills/uniswap-v4-mainnet';
import { executeStrcSkill }            from '@/skills/strc';
import { executeExchangeOsSkill }      from '@/skills/exchange-os';
import { executeSafeRouterSkill }      from '@/skills/saferouter';
import { executeCompoundV3MainnetSkill } from '@/skills/compound-v3-mainnet';
import { executeBalancerV2MainnetSkill } from '@/skills/balancer-v2-mainnet';
import { executeOrcaSkill }            from '@/skills/orca';
import { executeBinanceSkill }         from '@/skills/binance';
import { executeBinanceStockPerpsSkill } from '@/skills/binance-stock-perps';
import { executeBinanceBStocksSkill }   from '@/skills/binance-bstocks';
import { executeMeteoraSkill }          from '@/skills/meteora';
import { executeFluidSkill }            from '@/skills/fluid';
import { executeEulerV2MainnetSkill }   from '@/skills/euler-v2-mainnet';
import { executeMonadChainSkill }       from '@/skills/monad-chain';
import { executeUniswapMonadSkill }     from '@/skills/uniswap-monad';
import { executeMagmaSkill }            from '@/skills/magma';
import { executeShmonadSkill }          from '@/skills/shmonad';
import { executeEulerV2MonadSkill }     from '@/skills/euler-v2-monad';
import { executeAmnisSkill }            from '@/skills/amnis';
import { executeEchelonSkill }          from '@/skills/echelon';
import { executeMerkleTradeSkill }      from '@/skills/merkle-trade';
import { executeMarginfiSkill }         from '@/skills/marginfi';
import { executeMarinadeSkill }         from '@/skills/marinade';
import { executeSanctumSkill }          from '@/skills/sanctum';
import { executeSaveSkill }             from '@/skills/save-finance';
import { executeKintsuSkill }           from '@/skills/kintsu';
import { executeMorphoMonadSkill }      from '@/skills/morpho-monad';
import { executePancakeSwapMonadSkill } from '@/skills/pancakeswap-monad';
import { executeKuruSkill }             from '@/skills/kuru';
import { executeBerachainSkill }        from '@/skills/berachain';
import { executeKodiakSkill }           from '@/skills/kodiak';
import { executeInfraredSkill }         from '@/skills/infrared';
import { executeHoneySkill }            from '@/skills/berachain-honey';

/**
 * Helper to make HTTPS requests using Node's https module with proxy support
 * (more reliable than fetch in Next.js API routes)
 */
export function httpsGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const proxyUrl = process.env.https_proxy || process.env.http_proxy;

    let options: any;
    let client: typeof https | typeof http;

    if (proxyUrl) {
      // Use proxy
      const proxy = new URL(proxyUrl);
      client = http;  // Connect to proxy via HTTP

      options = {
        hostname: proxy.hostname,
        port: proxy.port || 7890,
        path: url,  // Full URL when using proxy
        method: 'GET',
        headers: {
          'Host': targetUrl.hostname,
          'Accept': 'application/json',
          'User-Agent': 'Arsenal/1.0'
        },
        timeout: 30000
      };
    } else {
      // Direct connection
      client = https;
      options = {
        hostname: targetUrl.hostname,
        path: targetUrl.pathname + targetUrl.search,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Arsenal/1.0'
        },
        timeout: 30000,
        family: 4
      };
    }

    const req = client.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    }).on('error', (error) => {
      reject(error);
    }).on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// ─── Skill metadata (for skills whose executors live in this file) ────────────

export const TOKEN_PRICE_QUERY_SKILL_METADATA = {
  name: 'Token Price Query',
  description:
    'Real-time crypto price and market data via CoinGecko. ' +
    'Look up spot prices for any token by symbol or CoinGecko ID, ' +
    'get full market data (market cap, volume, 24h change), search tokens by name, ' +
    'or fetch historical prices by date.',
  category: 'Market Data',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['price', 'market', 'crypto', 'token', 'coingecko', 'bitcoin', 'ethereum', 'real-time', 'market-data'],
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_price', 'get_market_data', 'search_token', 'get_historical_price'],
        description:
          'get_price: spot price(s) by token_ids or symbols. ' +
          'get_market_data: full market data for one or more tokens (requires token_ids). ' +
          'search_token: find CoinGecko IDs by name/symbol (requires query). ' +
          'get_historical_price: price on a specific date (requires token_ids, date).',
      },
      token_ids:    { type: 'array', items: { type: 'string' }, description: 'CoinGecko token IDs (e.g. ["bitcoin", "ethereum"]).' },
      symbols:      { type: 'array', items: { type: 'string' }, description: 'Token symbols (e.g. ["BTC", "ETH"]). Arsenal resolves to CoinGecko IDs.' },
      vs_currencies:{ type: 'array', items: { type: 'string' }, description: 'Quote currencies (default: ["usd"]).' },
      query:        { type: 'string', description: 'Search term for search_token.' },
      date:         { type: 'string', description: 'Date for historical price in DD-MM-YYYY format (e.g. "01-01-2024").' },
    },
  },
  usage_examples: [
    { title: 'BTC + ETH price', input: { action: 'get_price', token_ids: ['bitcoin', 'ethereum'] } },
    { title: 'Price by symbol', input: { action: 'get_price', symbols: ['SOL', 'SUI'] } },
    { title: 'Search token', input: { action: 'search_token', query: 'arbitrum' } },
  ],
};

export const UNISWAP_CHAIN_CONFIG_SKILL_METADATA = {
  name: 'Uniswap Chain Config',
  description:
    'Static Uniswap V3 contract addresses and token lists for each supported EVM chain. ' +
    'Returns SwapRouter02, Factory, QuoterV2 addresses and well-known token addresses ' +
    'for Ethereum, Optimism, Arbitrum, Base, and Polygon.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['uniswap', 'defi', 'config', 'addresses', 'tokens', 'evm'],
  status: 'approved',
  schema: {
    type: 'object',
    properties: {
      chain: {
        type: 'string',
        enum: ['ethereum', 'optimism', 'arbitrum', 'base', 'polygon'],
        description: 'Chain to get config for. Omit to list all supported chains.',
      },
    },
  },
  usage_examples: [
    { title: 'List supported chains', input: {} },
    { title: 'Base chain config', input: { chain: 'base' } },
  ],
};

/**
 * Token Price Query - Real CoinGecko Integration
 *
 * Skill ID: ff0d3b93-8624-49d2-b962-4e0b61c1c6f1
 */
export async function executeTokenPriceQuery(input: any): Promise<SkillExecutionResult> {
  const { action, token_ids, vs_currencies = ['usd'], query, date } = input;

  // Accept both "symbol" (string) and "symbols" (array) for compatibility
  let symbols: string[] | undefined = input.symbols;
  if (!symbols && input.symbol) {
    symbols = Array.isArray(input.symbol) ? input.symbol : [input.symbol];
  }

  const COINGECKO_API = 'https://api.coingecko.com/api/v3';

  try {
    switch (action) {
      case 'get_price': {
        if (!token_ids && !symbols) {
          return {
            success: false,
            error: 'Either token_ids, symbols, or symbol is required'
          };
        }

        // If symbols provided, need to search first
        let ids = token_ids;
        if (!ids && symbols) {
          ids = [];
          for (const symbol of symbols) {
            try {
              const searchUrl = `${COINGECKO_API}/search?query=${encodeURIComponent(symbol)}`;
              console.log(`Searching for symbol: ${symbol} at ${searchUrl}`);

              const searchData = await httpsGet(searchUrl);
              console.log(`Search data:`, searchData.coins?.[0]);

              if (searchData.coins && searchData.coins.length > 0) {
                ids.push(searchData.coins[0].id);
              }
            } catch (error: any) {
              console.error(`Error searching for ${symbol}:`, error.message);
            }
          }
        }

        if (!ids || ids.length === 0) {
          return {
            success: false,
            error: 'No tokens found'
          };
        }

        // Get prices
        const params = new URLSearchParams({
          ids: ids.join(','),
          vs_currencies: vs_currencies.join(','),
          include_market_cap: input.include_market_cap !== false ? 'true' : 'false',
          include_24hr_vol: input.include_24h_vol !== false ? 'true' : 'false',
          include_24hr_change: input.include_24h_change !== false ? 'true' : 'false'
        });

        const priceData = await httpsGet(`${COINGECKO_API}/simple/price?${params}`);

        return {
          success: true,
          output: {
            prices: priceData
          }
        };
      }

      case 'get_market_data': {
        if (!token_ids) {
          return {
            success: false,
            error: 'token_ids is required'
          };
        }

        const params = new URLSearchParams({
          ids: token_ids.join(','),
          vs_currency: vs_currencies[0],
          order: 'market_cap_desc',
          per_page: token_ids.length.toString(),
          page: '1',
          sparkline: 'false'
        });

        const marketData = await httpsGet(`${COINGECKO_API}/coins/markets?${params}`);

        return {
          success: true,
          output: {
            market_data: marketData
          }
        };
      }

      case 'search_token': {
        if (!query) {
          return {
            success: false,
            error: 'query is required'
          };
        }

        const searchData = await httpsGet(`${COINGECKO_API}/search?query=${encodeURIComponent(query)}`);

        return {
          success: true,
          output: {
            search_results: searchData.coins.slice(0, 10).map((coin: any) => ({
              id: coin.id,
              symbol: coin.symbol,
              name: coin.name,
              market_cap_rank: coin.market_cap_rank
            }))
          }
        };
      }

      case 'get_historical_price': {
        if (!token_ids || !date) {
          return {
            success: false,
            error: 'token_ids and date are required'
          };
        }

        const tokenId = token_ids[0];
        const historyData = await httpsGet(`${COINGECKO_API}/coins/${tokenId}/history?date=${date}`);

        return {
          success: true,
          output: {
            historical_price: {
              date,
              price: historyData.market_data?.current_price?.[vs_currencies[0]],
              market_cap: historyData.market_data?.market_cap?.[vs_currencies[0]],
              total_volume: historyData.market_data?.total_volume?.[vs_currencies[0]]
            }
          }
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action: ${action}`
        };
    }
  } catch (error: any) {
    console.error('Error executing Token Price Query:', error);
    return {
      success: false,
      error: error.message || 'Execution failed',
    };
  }
}

/**
 * Main skill executor router
 *
 * Routes skill execution to the appropriate executor based on skill ID.
 */
export async function executeSkillById(skillId: string, input: any): Promise<SkillExecutionResult> {
  // SUI Blockchain Toolkit
  if (skillId === 'ac6ac13c-e04a-441d-ac0f-ae80231aad2d') {
    const output = await executeSuiSkill(input) as Record<string, any>;
    return { success: true, output };
  }

  // Sumplus Yield Optimizer
  if (skillId === '895be569-174d-4040-9673-0f7aaa27600f') {
    const output = await executeYieldSkill(input) as Record<string, any>;
    return { success: true, output };
  }

  // Velodrome V2 — Optimism's dominant DEX
  if (skillId === '9c4cddc5-afa4-4e1f-9877-1b8676debdf1') {
    return await executeVelodromeSkill(input);
  }

  // Token Price Query
  if (skillId === 'ff0d3b93-8624-49d2-b962-4e0b61c1c6f1') {
    return await executeTokenPriceQuery(input);
  }

  // Crypto Wallet Manager (powered by Alchemy)
  // 584dc72e = v2 (Alchemy), 5e38d229 = v1 legacy seed
  if (skillId === '584dc72e-a3dc-4b98-a38f-26a08741f076' || skillId === '5e38d229-01b4-4ff7-95f9-dd4827467644') {
    const output = await executeWalletSkill(input) as Record<string, any>;
    return { success: true, output };
  }

  // Cetus CLMM
  if (skillId === '2744ff56-cede-460a-8f1b-c7ae77c328f1') {
    const output = await executeCetusSkill(input) as Record<string, any>;
    return { success: true, output };
  }

  // WEEX Exchange (primary + alternate UUID)
  if (skillId === 'dae040cf-b60c-4ef6-a42c-50c3e1b583db' || skillId === '4c1f2074-2c29-4482-b83d-66af0372c052') {
    const output = await executeWeexSkill(input) as Record<string, any>;
    return { success: true, output };
  }

  // Uniswap Get Quote — live QuoterV2 via Alchemy RPC
  if (skillId === '86702f0a-5487-4959-b21a-6de879b9decd') {
    return await executeUniswapGetQuote(input);
  }

  // Uniswap Build Transaction — live QuoterV2 + SwapRouter02 calldata via Alchemy RPC
  if (skillId === '2384dbf7-10a3-4cf7-9935-62f345e38ebc') {
    return await executeUniswapBuildTx(input);
  }

  // Uniswap Chain Config — static data, no RPC needed
  if (skillId === 'b2968c38-e3fd-41bc-843c-5c95eba2c7d4') {
    const CHAIN_CONFIG: Record<string, any> = {
      ethereum: {
        swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
        factory:    '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        quoterV2:   '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        fee_tiers:  [100, 500, 3000, 10000],
        tokens: { WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F', WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
      },
      optimism: {
        swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
        factory:    '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        quoterV2:   '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        fee_tiers:  [100, 500, 3000, 10000],
        tokens: { WETH: '0x4200000000000000000000000000000000000006', USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', WBTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095' },
      },
      arbitrum: {
        swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
        factory:    '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        quoterV2:   '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        fee_tiers:  [100, 500, 3000, 10000],
        tokens: { WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548', WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' },
      },
      base: {
        swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
        factory:    '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
        quoterV2:   '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
        fee_tiers:  [100, 500, 3000, 10000],
        tokens: { WETH: '0x4200000000000000000000000000000000000006', USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' },
      },
      polygon: {
        swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
        factory:    '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        quoterV2:   '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        fee_tiers:  [100, 500, 3000, 10000],
        tokens: { WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
      },
    };
    const supported_chains = Object.keys(CHAIN_CONFIG);
    const { chain } = input || {};
    if (!chain) return { success: true, output: { supported_chains } };
    if (!CHAIN_CONFIG[chain]) return { success: false, error: `Unsupported chain: ${chain}. Supported: ${supported_chains.join(', ')}` };
    return { success: true, output: { chain, supported_chains, ...CHAIN_CONFIG[chain] } };
  }

  // NAVI Protocol — Sui lending ($450M+ market size)
  if (skillId === '879d3a33-c5e5-4a1f-b5d6-549dfccd0f41') return await executeNaviSkill(input);

  // Scallop — Sui lending, first Sui Foundation grant ($244M TVL)
  if (skillId === '768a3623-cf83-43f3-a94c-28c4a1a49c70') return await executeScallopSkill(input);

  // Suilend — Sui lending + sSUI liquid staking via SPRING
  if (skillId === '907d0c31-54db-48cd-b67b-5311d713873a') return await executeSuilendSkill(input);

  // Aftermath Finance — Sui DEX aggregator ("Jupiter of Sui") + afSUI liquid staking
  if (skillId === '1a2568da-e586-4a25-b520-529b2d0d1609') return await executeAftermathSkill(input);

  // Talus Nexus Toolkit — onchain agentic workflow engine (Arsenal × Talus partnership)
  if (skillId === '3cb17950-8c83-4ef2-a2a6-6f16de4b848e') return await executeTalusNexusSkill(input);

  // Hyperliquid — #1 decentralized perps DEX, market data + account queries
  if (skillId === 'e59a2f09-9009-4d52-97fc-370a5782b510') return await executeHyperliquidSkill(input);

  // Polymarket — world's largest prediction market, market data + account queries
  if (skillId === 'ba1ea5b7-ddfd-4840-bec6-54c9e0f03edb') return await executePolymarketSkill(input);

  // dYdX v4 — decentralized perps on its own L1 chain, 290+ markets
  if (skillId === '606c19fb-d443-43d2-9de7-b0aa74b29511') return await executeDydxSkill(input);

  // Aave v3 — largest lending protocol, $30B+ TVL across all chains
  if (skillId === 'e9f7518e-57d3-4971-8b44-22ccd738442e') return await executeAaveSkill(input);

  // GMX — decentralized perpetuals DEX on Arbitrum/Avalanche (GLP v1)
  if (skillId === 'ab8314d9-dd96-49ec-840e-3e7d6bc2bb71') return await executeGmxSkill(input);

  // IKA dWallet Network — Zero-Trust Threshold Signature Network, cross-chain signing via Sui
  // TODO: skill is currently disabled (status=pending in DB). To re-enable:
  //   UPDATE skills SET status='approved' WHERE id='0f330f79-caed-44ef-99a7-858e76ff859a';
  if (skillId === '0f330f79-caed-44ef-99a7-858e76ff859a') return await executeIkaDwalletSkill(input);

  // Jupiter Aggregator — leading Solana DEX aggregator (swap quotes + tx building)
  if (skillId === 'a8f2c1d4-7e3b-4a9f-b6c5-2d8e1f403b91') return await executeJupiterSkill(input);

  // Raydium DEX — Solana's largest AMM + CLMM DEX (pool data + protocol stats)
  if (skillId === 'c5e9d2a7-3f4b-4c8e-a1b6-8f5d923e140c') return await executeRaydiumSkill(input);

  // Kamino Finance — Solana's largest lending protocol + automated vaults
  if (skillId === '306c6862-1584-45d0-99c9-e20d723420b5') return await executeKaminoSkill(input);

  // Jito — Solana liquid staking (jitoSOL) + MEV tip data
  if (skillId === '378a0d53-22a6-4cce-a902-63c11f774c82') return await executeJitoSkill(input);

  // Jupiter Perpetuals — Solana's highest-volume perp-futures venue
  if (skillId === '6f524910-fd50-4a63-b28e-14705a81802d') return await executeJupiterPerpsSkill(input);

  // Drift Protocol — Solana perp-futures DEX (market data + order intent)
  if (skillId === '96074985-a8fa-46d8-a365-1ec7c7289d87') return await executeDriftSkill(input);

  // PancakeSwap V3 — leading BSC DEX (quotes + swap tx building)
  if (skillId === 'd5a3f2b1-9c4e-4d07-8b5a-1e3c2f6d9a70') return await executePancakeSwapSkill(input);

  // Agni Finance — leading Mantle DEX (quotes + swap tx building)
  if (skillId === '7be7edc6-4553-42df-9474-9e849337892e') return await executeAgniSkill(input);

  // Uniswap V3 on BSC — second-largest BSC DEX (quotes + swap tx building)
  if (skillId === 'd54885d1-1455-497c-9366-d747b1f280af') return await executeUniswapBscSkill(input);

  // THENA — leading ve(3,3) DEX on BSC (Fusion + V1 best-execution)
  if (skillId === '211c5851-b682-4132-9b1d-a876515ff365') return await executeThenaSkill(input);
  if (skillId === 'e3b7f1a2-8c4d-4e9f-b5a6-3d2c1e0f7b8a') return await executeBlueFinEmberSkill(input);

  // Tempo Machine Payments Protocol (MPP)
  if (skillId === 'cf1d3c1b-cee2-4a0e-b19b-16f1e3986d6e') return await executeMppSkill(input);

  // Uniswap V3 on Tempo
  if (skillId === 'd166a485-636d-4f27-9384-25aa811faf99') return await executeUniswapTempoSkill(input);

  // Sumplus Arsenal meta-skill
  if (skillId === 'ba521bd9-4da8-44ed-8a9c-525167557a79') return await executeArsenalSkill(input);

  // Aerodrome Finance (Base)
  if (skillId === '86c6c264-462a-43da-bcf1-32d0551a6b83') return await executeAerodromeSkill(input);

  // Moonwell (Base)
  if (skillId === 'a5f14c95-00dd-4f4e-a498-78fdf9500ada') return await executeMoonwellSkill(input);
  if (skillId === '2dc7ec4d-35ee-443b-8b7e-203bad3d625d') return await executeTempoSessionsSkill(input);
  if (skillId === '591e6f82-f665-4706-8529-f8e8632d1e84') return await executeTempoTokensSkill(input);

  // Uniswap V3 on XLayer (OKX L2, chain ID 196)
  if (skillId === 'f2a8c3d1-7e5b-4f9a-b6c8-3d1e2f7c9b0a') return await executeUniswapXLayerSkill(input);

  // Curve Finance on XLayer
  if (skillId === 'c3f8a2d1-6e4b-4a9f-b7c5-2d8e1f403c92') return await executeCurveXLayerSkill(input);

  // QuickSwap on XLayer
  if (skillId === 'd4e9b3c2-7f5a-4b8e-c6d1-3e2f1a504d83') return await executeQuickSwapXLayerSkill(input);

  // XPower Finance (XLayer mutual finance)
  if (skillId === '438cb167-7311-4b0f-85bd-756d4b232a5e') return await executeXPowerSkill(input);

  // Uniswap v3 Mainnet
  if (skillId === '0071eca9-b948-49e0-a574-9ea6436e3245') return await executeUniswapV3MainnetSkill(input);

  // Aave v3 Mainnet (direct on-chain executor)
  if (skillId === 'f60967ed-c528-4e61-89da-a1a757eba044') return await executeAaveV3MainnetSkill(input);

  // Lido Mainnet (liquid staking)
  if (skillId === '451f4e94-259b-4e04-86ce-e82195b52e98') return await executeLidoMainnetSkill(input);

  // Morpho Blue Mainnet
  if (skillId === '4ff80de4-268b-4439-8f35-9663025be36c') return await executeMorphoBlueMainnetSkill(input);

  // Ethena Mainnet (USDe staking)
  if (skillId === '193c7bb3-1dc4-4c8c-bb09-5bb7ca32e0c7') return await executeEthenaMainnetSkill(input);

  // Curve Read Mainnet
  if (skillId === '70ec462d-8d60-4a1a-8784-7758c6fc3baf') return await executeCurveReadMainnetSkill(input);

  // Pendle v4 Mainnet
  if (skillId === 'cc0d8e79-c983-428f-9520-7fb47b7f7fe0') return await executePendleV4MainnetSkill(input);

  // 1inch Mainnet
  if (skillId === '952bec77-a7bb-4ab0-9b78-aae83090401c') return await executeOneInchMainnetSkill(input);

  // Synthra (SynRoute)
  if (skillId === '9e290aa4-1497-40a7-b44e-482787240de4') return await executeSynthraSkill(input);

  // DefiLlama
  if (skillId === 'a4884c93-cea7-4d42-a24c-f895febeab1f') return await executeDefiLlamaSkill(input);

  // ETH RPC
  if (skillId === '50c2296f-ae2b-48ca-819f-f4d70b530577') return await executeEthRpcSkill(input);

  // Token Lists (canonical mainnet tokens)
  if (skillId === '0f2ba08a-a519-4c81-bd2e-cc3553e51491') return await executeTokenListsSkill(input);

  // Transaction Simulation Mainnet
  if (skillId === '913313e6-c1d2-434c-ab76-3883388b1d47') return await executeTxSimMainnetSkill(input);

  // CCTP Bridge
  if (skillId === 'e4e2a56c-eed5-4869-befc-9cb4e3754e0a') return await executeCctpMainnetSkill(input);

  // Across Protocol Bridge
  if (skillId === '24a5a07b-4d3f-481c-9154-e28c87463271') return await executeAcrossMainnetSkill(input);

  // Stargate Bridge (LayerZero)
  if (skillId === '2dbd12ea-af52-48a2-baa1-42825d076ac7') return await executeStargateMainnetSkill(input);

  // Wormhole Token Bridge
  if (skillId === 'db785bff-503c-4309-b7ad-0f4a06ec3d10') return await executeWormholeMainnetSkill(input);

  // deBridge DLN
  if (skillId === 'f9297e4a-6166-4122-86fd-c2b6a5a2927d') return await executeDeBridgeMainnetSkill(input);

  // XLayer Official Bridge
  if (skillId === 'c3f93155-0f5b-4c90-b954-d1419497e1e3') return await executeXLayerBridgeSkill(input);
  if (skillId === '49998c3a-4e69-41ae-9483-7b6cd137713a') return await executeMantleBridgeSkill(input);
  if (skillId === '0029fab7-e06a-4f0b-ad11-d2edb11f9be6') return await executeHashKeyBridgeSkill(input);

  // StableStock Finance (tokenized stocks on BNB Chain)
  if (skillId === '588aadca-8045-426b-81ae-a7241ba3cf53') return await executeStableStockSkill(input);

  // HSKSwap (Solidly V1-style AMM on HashKey Chain)
  if (skillId === 'a3f8c201-7e45-4b9d-b3f2-6c1d8a2e5047') return await executeHskSwapSkill(input);

  // DAOaaS Swap (Uniswap V3-fork DEX on Eniac Network / ENI Mainnet, chain ID 173)
  if (skillId === '7a3d8e21-9f4c-4b6e-bc15-d8a4f2e9c1b3') return await executeDaoaasSwapSkill(input);

  // Arc Chain (Circle's USDC-native EVM L1, Arc Testnet, chain ID 5042002)
  if (skillId === 'c8e3a5d2-7f91-4b6e-9d24-3a8f5c7e1b09') return await executeArcChainSkill(input);
  if (skillId === 'f885b761-54f2-4a7d-b244-dc8ab0dff85e') return await executeHaedalSkill(input);
  if (skillId === '0a9fa9f9-94fc-4823-8fae-a678ec267c53') return await executeVoloSkill(input);
  if (skillId === '1f909dd7-f924-4038-83ce-35db91f1a311') return await executeTurbosSkill(input);
  if (skillId === 'fbce6f3b-786a-4deb-a40c-f9479dd11e9b') return await executeKriyaSkill(input);
  if (skillId === 'dc70f873-7cc5-4b7f-82e8-bb1fc7698015') return await executeDeepBookSkill(input);

  // ── Sui Ecosystem Expansion (Round 2) ───────────────────────────────────────
  if (skillId === 'bd731f41-c72c-449a-8992-6f6f233104e8') return await executeAlphaFiSkill(input);
  if (skillId === '9e50e52a-4875-4623-a729-68806a364987') return await executePythSuiSkill(input);
  if (skillId === '9ec9e3cb-2b74-487a-a178-a9996bd4f0f2') return await executeSuiNSSkill(input);
  if (skillId === 'edea7e4c-e863-43a0-8ef1-e255500962e7') return await executeSevenKSkill(input);
  if (skillId === 'b395cfa2-651f-4ab5-9f24-fa3827224143') return await executeFlowXSkill(input);
  if (skillId === 'a24cb359-cf19-491a-9335-2a921966dbab') return await executeBucketSkill(input);
  if (skillId === '35fcf2e3-098e-4005-bad6-2276ea61cf71') return await executeTypusSkill(input);

  // ── Data & Infrastructure ────────────────────────────────────────────────────
  if (skillId === '21715733-c258-454f-a118-6bceb7328425') return await executeTheGraphSkill(input);
  if (skillId === 'e7dfce13-78ef-451b-a2b7-56ac541419a6') return await executeCoinGeckoSkill(input);
  if (skillId === 'b48587f6-e786-4b29-85fd-067c4fa7628c') return await executeENSSkill(input);
  if (skillId === '6ec501e5-f2fc-4d0e-b581-0561762baf83') return await executeChainlinkSkill(input);
  if (skillId === 'e4c79fe2-c97f-418d-8559-71ae996260e3') return await executeGasTrackerSkill(input);

  // BTC Staking & Restaking
  if (skillId === 'e5db5c99-b6b3-42e9-9b9d-80f8d176be09') return await executeBabylonSkill(input);
  if (skillId === 'f73aa843-fc74-46a7-a1a9-21e767247aac') return await executeLombardSkill(input);
  if (skillId === '1be75d50-3bba-47a5-91f2-9ca2567dd99a') return await executeBedrockSkill(input);
  if (skillId === '1238c2c8-be55-439f-b641-84859095d027') return await executeSolvSkill(input);
  if (skillId === '812a5882-e781-4504-9015-bfd34857b841') return await executeCoreDaoSkill(input);
  if (skillId === 'ca87eb84-8847-43cc-aec7-2f5b493ab688') return await executeLorenzoSkill(input);
  if (skillId === '4d44370e-76b8-4ae3-851c-a967d93fe83e') return await executePellSkill(input);

  // Aptos DeFi
  if (skillId === 'dad05953-f098-493d-8c17-96d8984e783e') return await executeLiquidswapSkill(input);
  if (skillId === 'bd804ff4-2735-439b-91a3-619be5b260f8') return await executeThalaSkill(input);
  if (skillId === '0dc94302-80e4-4a84-971b-c13bb17b753b') return await executeAriesSkill(input);

  // Ethereum DeFi — DEX Aggregators
  // CoW Protocol (MEV-protected batch auction DEX)
  if (skillId === '7ab5352f-4b92-44be-91bc-238f95967dd1') return await executeCowProtocolSkill(input);

  // Institutional Lending
  // Maple Finance (institutional undercollateralized credit protocol)
  if (skillId === 'f7fd7045-3f5e-44f8-9021-b44877a4ea05') return await executeMapleSkill(input);

  // CLARITY Act — Yield Stablecoins / RWA
  if (skillId === 'b9ee4012-4925-4266-81df-3e749cd86f31') return await executeOndoSkill(input);
  if (skillId === 'ee216675-ba70-43f2-a32e-4cb72d5c1117') return await executeSkySkill(input);

  // CLARITY Act — Restaking
  if (skillId === '431d7899-edfc-47ba-9f64-0279c8c66b18') return await executeEigenLayerSkill(input);
  if (skillId === 'e0f74451-9bcb-44bf-8877-fc6683fc2efe') return await executeEtherFiSkill(input);

  // CLARITY Act — RWA Tokenization
  if (skillId === 'c42fc53b-647c-4566-a7cc-7c2839f9e6c8') return await executeCentrifugeSkill(input);

  // CLARITY Act — DEX Infrastructure
  if (skillId === '1df3d9de-7862-438e-b95d-0099f269c49a') return await executeUniswapV4MainnetSkill(input);

  // CLARITY Act — STRC (Strategy preferred stock + Saturn/Apyx DeFi ecosystem)
  if (skillId === 'ed40e997-f880-4dd5-ad15-b9632d0212d0') return await executeStrcSkill(input);

  // ── Canton Network / Splice ───────────────────────────────────────────────────
  if (skillId === 'ada380e4-bc52-4129-b5b2-ac12480b62ac') return await executeCantonSplice(input);

  // ── Casper AgentGuard — policy and receipt registry toolkit on Casper Testnet ─
  if (skillId === '88c60a3a-6608-4449-9e47-3b8d99120917') return await executeCasperAgentGuardSkill(input);

  // ── x402 Payment Protocol ─────────────────────────────────────────────────────
  if (skillId === 'b4e7f2a1-8c3d-4f6e-9a2b-5d8e1f4c7a0b') return await executeX402PaymentSkill(input);

  // ── BNB Chain ─────────────────────────────────────────────────────────────────
  if (skillId === 'e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9') return await executeBnbChainSkill(input);

  // ── OKX Exchange OS (X Layer pre-launch toolkit) ─────────────────────────────
  if (skillId === 'f4a82c19-3d6e-4b85-9c71-8e2f5a1d6b04') return await executeExchangeOsSkill(input);

  // ── SafeRouter — verified-inference LLM gateway (discovery / onboarding only,
  //    NOT a proxy: agents must call /v1/chat/completions on SafeRouter directly
  //    to preserve the per-request TEE attestation) ─────────────────────────────
  if (skillId === 'b8e9f1a3-4c5d-4d2e-8f7a-9b1c2d3e4f50') return await executeSafeRouterSkill(input);

  // ── Compound V3 (Comet) — Ethereum mainnet lending ───────────────────────────
  if (skillId === 'a1d4f7c2-9b6e-4e3a-8d51-2c7f0e9a4b63') return await executeCompoundV3MainnetSkill(input);

  // ── Balancer V2 — Ethereum mainnet DEX (single Vault) ────────────────────────
  if (skillId === 'c8b3e6a1-4d7f-4a2e-9c50-6f1b8d3a92e7') return await executeBalancerV2MainnetSkill(input);

  // ── Orca Whirlpools — Solana CLMM (Orca-pinned routing) ──────────────────────
  if (skillId === 'd2f9a4c7-6b1e-4e8a-bc35-7a0d5f2c9e16') return await executeOrcaSkill(input);

  // ── Binance — spot market data + trading (largest CEX) ───────────────────────
  if (skillId === 'e7c3b9a2-5f8d-4a1e-b6c4-3d9f0e2a7c81') {
    const output = await executeBinanceSkill(input) as Record<string, any>;
    if (output && typeof output.error === 'string') return { success: false, error: output.error };
    return { success: true, output };
  }

  // ── Binance Stock Perpetuals — USDⓈ-M TradFi perps (discovery + market data) ──
  if (skillId === 'b1c2d3e4-5f60-4a7b-8c91-0d2e3f4a5b60') {
    const output = await executeBinanceStockPerpsSkill(input) as Record<string, any>;
    if (output && typeof output.error === 'string') return { success: false, error: output.error };
    return { success: true, output };
  }

  // ── Binance bStocks — tokenized stock spot (discovery / info only) ───────────
  if (skillId === 'c3d4e5f6-6071-4b8c-9d02-1e3f4a5b6c71') {
    const output = await executeBinanceBStocksSkill(input) as Record<string, any>;
    if (output && typeof output.error === 'string') return { success: false, error: output.error };
    return { success: true, output };
  }

  // ── Meteora — Solana's largest liquidity layer (DLMM data + Meteora-routed swap) ──
  if (skillId === '8cb3f235-4d25-4968-aefb-0f5c1a6294b1') return await executeMeteoraSkill(input);

  // ── Fluid (Instadapp) — Ethereum lending/borrowing (fToken lend + Vault operate) ──
  if (skillId === '6ea7a68b-7f17-4ce0-8061-352c59fcbc0d') return await executeFluidSkill(input);

  // ── Euler v2 — modular lending on Ethereum mainnet (EVK vaults + EVC) ────────
  if (skillId === 'e6264a67-8b18-4265-a746-918c1a7cb57f') return await executeEulerV2MainnetSkill(input);

  // ── Monad — chain toolkit (mainnet, chain ID 143, native MON) ────────────────
  if (skillId === '4c5e5018-7b9f-4abf-93bc-552289936f7b') return await executeMonadChainSkill(input);

  // ── Uniswap V3 on Monad — swap quotes + tx building ──────────────────────────
  if (skillId === '0b178947-e605-4c14-afc3-20179f5b5ebf') return await executeUniswapMonadSkill(input);

  // ── Magma — Monad liquid staking (MON ⇄ gMON) ────────────────────────────────
  if (skillId === '05f0de62-9363-4ebd-b0e8-8b3b32287311') return await executeMagmaSkill(input);

  // ── ShMonad — Monad liquid staking (MON ⇄ shMON, FastLane) ───────────────────
  if (skillId === '207d444c-2918-40c7-8d0e-affa7bceb0bb') return await executeShmonadSkill(input);

  // ── Euler v2 on Monad — lending (Monad's largest protocol) ───────────────────
  if (skillId === '439ecb2a-46cc-4f32-b99f-48fd7bc3301a') return await executeEulerV2MonadSkill(input);

  // ── Aptos batch (Amnis LST / Echelon lending / Merkle perps) ─────────────────
  if (skillId === '96273c03-66f3-4788-ae6d-11df2d8159b0') return await executeAmnisSkill(input);
  if (skillId === 'c55b13f4-3d83-43b4-a850-d329bfb166c8') return await executeEchelonSkill(input);
  if (skillId === '5109e510-e048-4808-a488-4557629b30d1') return await executeMerkleTradeSkill(input);

  // ── Solana batch (marginfi / Marinade / Sanctum / Save) ──────────────────────
  if (skillId === '52b1ca79-e36e-4dff-9278-7bb97abe400a') return await executeMarginfiSkill(input);
  if (skillId === 'bd76cf87-8859-41a4-9b80-eb478ebb656c') return await executeMarinadeSkill(input);
  if (skillId === '79d9c0d5-f0f6-4d6f-9c8c-7068a63821b7') return await executeSanctumSkill(input);
  if (skillId === '53fb39fd-9b38-4034-b1b5-34a5732ae21e') return await executeSaveSkill(input);

  // ── Monad batch 2 (Kintsu / Morpho Blue Monad / PancakeSwap Monad / Kuru) ─────
  if (skillId === '770bcf81-af57-41e5-a2b2-f5e017fd00aa') return await executeKintsuSkill(input);
  if (skillId === '83cec58e-8b4a-46e1-9f7b-7692e3b6e83c') return await executeMorphoMonadSkill(input);
  if (skillId === 'f3ee7170-bf59-4807-9248-bb5053a03a20') return await executePancakeSwapMonadSkill(input);
  if (skillId === '2b3fd37c-a0ec-42a4-9bbc-a2882236baf3') return await executeKuruSkill(input);

  // ── Berachain batch (chain toolkit / Kodiak DEX / Infrared LST / Honey) ───────
  if (skillId === 'e67766d2-6581-4e13-b3a8-1746f5f947f4') return await executeBerachainSkill(input);
  if (skillId === '55f54b23-57ee-4502-ad63-e9fcc5c0e8af') return await executeKodiakSkill(input);
  if (skillId === 'e84c77cb-6b5f-4428-8a72-cf63f8760a08') return await executeInfraredSkill(input);
  if (skillId === '13299e24-ef6e-442c-a120-a2668e3e45d1') return await executeHoneySkill(input);

  // ── Maria A2A — wallet agent proxy skills ────────────────────────────────────
  if (skillId === 'f4764725-458c-4256-a5f7-92d50fcb7672') return await executeMariaQuerySkill(input);
  if (skillId === '36d4289b-0db8-4c3c-9ab0-e01bc93ee70d') return await executeMariaSwapSkill(input);
  if (skillId === '3e32d737-f2d1-41ca-a102-3e5ddcedb93f') return await executeMariaTransferSkill(input);
  if (skillId === '899a806a-d4d0-4fba-acc3-4f7cd02ca622') return await executeMariaConverseSkill(input);

  // Default: skill not implemented yet
  return {
    success: false,
    error: 'Skill execution not implemented yet',
    _note: 'This skill provides schema and implementation guide only. Agents should implement the execution logic using the provided implementation_guide field.'
  };
}
