/**
 * sync-schemas.ts
 *
 * Syncs skill schemas from code (source of truth) → Supabase DB.
 * Run before / after deploy: npm run sync-schemas
 *
 * For each skill in SKILL_REGISTRY:
 *   1. Compares code schema vs DB schema
 *   2. Updates DB if different
 *   3. Regenerates embedding for any changed skill
 *
 * Skills without a metadata export are NOT touched.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

// ── Import metadata from skill files ────────────────────────────────────────
// Use relative paths — no @/ aliases in scripts

import { WALLET_SKILL_METADATA }      from '../src/skills/wallet';
import { YIELD_SKILL_METADATA }       from '../src/skills/sumplus-yield';
import { DYDX_SKILL_METADATA }        from '../src/skills/dydx';
import { WEEX_SKILL_METADATA }        from '../src/skills/weex';
import { GMX_SKILL_METADATA }         from '../src/skills/gmx';
import { AAVE_SKILL_METADATA }        from '../src/skills/aave';
import { PANCAKESWAP_SKILL_METADATA } from '../src/skills/pancakeswap';
import { AGNI_SKILL_METADATA }        from '../src/skills/agni';
import { UNISWAP_BSC_SKILL_METADATA } from '../src/skills/uniswap-bsc';
import { THENA_SKILL_METADATA }       from '../src/skills/thena';
import { SUI_SKILL_METADATA }         from '../src/skills/sui-blockchain';
import { JUPITER_SKILL_METADATA }     from '../src/skills/jupiter';
import { POLYMARKET_SKILL_METADATA }  from '../src/skills/polymarket';
import { HYPERLIQUID_SKILL_METADATA } from '../src/skills/hyperliquid';
import { RAYDIUM_SKILL_METADATA }     from '../src/skills/raydium';
import { KAMINO_SKILL_METADATA }      from '../src/skills/kamino';
import { JITO_SKILL_METADATA }        from '../src/skills/jito';
import { JUPITER_PERPS_SKILL_METADATA } from '../src/skills/jupiter-perps';
import { DRIFT_SKILL_METADATA }       from '../src/skills/drift';
import { METEORA_SKILL_METADATA }     from '../src/skills/meteora';
import { FLUID_SKILL_METADATA }       from '../src/skills/fluid';
import { EULER_V2_MAINNET_SKILL_METADATA } from '../src/skills/euler-v2-mainnet';
import { MONAD_CHAIN_SKILL_METADATA }   from '../src/skills/monad-chain';
import { UNISWAP_MONAD_SKILL_METADATA } from '../src/skills/uniswap-monad';
import { MAGMA_SKILL_METADATA }       from '../src/skills/magma';
import { SHMONAD_SKILL_METADATA }     from '../src/skills/shmonad';
import { EULER_V2_MONAD_SKILL_METADATA } from '../src/skills/euler-v2-monad';
import { CETUS_SKILL_METADATA }       from '../src/skills/cetus';
import { IKA_DWALLET_SKILL_METADATA } from '../src/skills/ika-dwallet';
import { BLUEFIN_EMBER_SKILL_METADATA } from '../src/skills/bluefin-ember';
import { TEMPO_MPP_SKILL_METADATA }    from '../src/skills/tempo-mpp';
import { UNISWAP_TEMPO_SKILL_METADATA } from '../src/skills/uniswap-tempo';
import { ARSENAL_SKILL_METADATA }       from '../src/skills/arsenal';
import { AERODROME_SKILL_METADATA }       from '../src/skills/aerodrome';
import { MOONWELL_SKILL_METADATA }        from '../src/skills/moonwell';
import { TEMPO_SESSIONS_SKILL_METADATA }  from '../src/skills/tempo-sessions';
import { TEMPO_TOKENS_SKILL_METADATA }    from '../src/skills/tempo-tokens';
import { NAVI_SKILL_METADATA }            from '../src/skills/navi';
import { SCALLOP_SKILL_METADATA }         from '../src/skills/scallop';
import { SUILEND_SKILL_METADATA }         from '../src/skills/suilend';
import { AFTERMATH_SKILL_METADATA }       from '../src/skills/aftermath';
import { VELODROME_SKILL_METADATA }       from '../src/skills/velodrome';
import { TALUS_NEXUS_SKILL_METADATA }     from '../src/skills/talus-nexus';
import { UNISWAP_GET_QUOTE_SKILL_METADATA, UNISWAP_BUILD_TX_SKILL_METADATA } from '../src/skills/uniswap';
import { UNISWAP_XLAYER_SKILL_METADATA }    from '../src/skills/uniswap-xlayer';
import { CURVE_XLAYER_SKILL_METADATA }     from '../src/skills/curve-xlayer';
import { QUICKSWAP_XLAYER_SKILL_METADATA } from '../src/skills/quickswap-xlayer';
import { XPOWER_SKILL_METADATA }          from '../src/skills/xpower';
import { TOKEN_PRICE_QUERY_SKILL_METADATA, UNISWAP_CHAIN_CONFIG_SKILL_METADATA } from '../src/lib/skill-executors';
import { UNISWAP_V3_MAINNET_SKILL_METADATA }   from '../src/skills/uniswap-v3-mainnet';
import { AAVE_V3_MAINNET_SKILL_METADATA }      from '../src/skills/aave-v3-mainnet';
import { LIDO_MAINNET_SKILL_METADATA }         from '../src/skills/lido-mainnet';
import { MORPHO_BLUE_MAINNET_SKILL_METADATA }  from '../src/skills/morpho-blue-mainnet';
import { ETHENA_MAINNET_SKILL_METADATA }       from '../src/skills/ethena-mainnet';
import { CURVE_READ_MAINNET_SKILL_METADATA }   from '../src/skills/curve-read-mainnet';
import { PENDLE_V4_MAINNET_SKILL_METADATA }    from '../src/skills/pendle-v4-mainnet';
import { ONEINCH_MAINNET_SKILL_METADATA }      from '../src/skills/oneinch-mainnet';
import { SYNTHRA_SKILL_METADATA }              from '../src/skills/synthra';
import { DEFILLAMA_SKILL_METADATA }            from '../src/skills/defillama';
import { ETH_RPC_SKILL_METADATA }              from '../src/skills/eth-rpc';
import { TOKENLISTS_SKILL_METADATA }           from '../src/skills/tokenlists';
import { TX_SIM_MAINNET_SKILL_METADATA }       from '../src/skills/tx-sim-mainnet';
import { CCTP_MAINNET_SKILL_METADATA }         from '../src/skills/cctp-mainnet';
import { ACROSS_MAINNET_SKILL_METADATA }       from '../src/skills/across-mainnet';
import { STARGATE_MAINNET_SKILL_METADATA }     from '../src/skills/stargate-mainnet';
import { WORMHOLE_MAINNET_SKILL_METADATA }     from '../src/skills/wormhole-mainnet';
import { DEBRIDGE_MAINNET_SKILL_METADATA }     from '../src/skills/debridge-mainnet';
import { XLAYER_BRIDGE_SKILL_METADATA }        from '../src/skills/xlayer-bridge';
import { MANTLE_BRIDGE_SKILL_METADATA }        from '../src/skills/mantle-bridge';
import { HASHKEY_BRIDGE_SKILL_METADATA }       from '../src/skills/hashkey-bridge';
import { STABLESTOCK_SKILL_METADATA }          from '../src/skills/stablestock';
import { HSKSWAP_SKILL_METADATA }             from '../src/skills/hskswap';
import { DAOAAS_SWAP_SKILL_METADATA }         from '../src/skills/daoaas-swap';
import { ARC_CHAIN_SKILL_METADATA }           from '../src/skills/arc-chain';
import { HAEDAL_SKILL_METADATA }              from '../src/skills/haedal';
import { VOLO_SKILL_METADATA }                from '../src/skills/volo';
import { TURBOS_SKILL_METADATA }              from '../src/skills/turbos';
import { KRIYA_SKILL_METADATA }               from '../src/skills/kriya';
import { DEEPBOOK_SKILL_METADATA }            from '../src/skills/deepbook';
import { ALPHAFI_SKILL_METADATA }             from '../src/skills/alphafi';
import { PYTH_SUI_SKILL_METADATA }            from '../src/skills/pyth-sui';
import { SUINS_SKILL_METADATA }               from '../src/skills/suins';
import { SEVENK_SKILL_METADATA }              from '../src/skills/sevenk';
import { FLOWX_SKILL_METADATA }               from '../src/skills/flowx';
import { BUCKET_SKILL_METADATA }              from '../src/skills/bucket';
import { TYPUS_SKILL_METADATA }               from '../src/skills/typus';
import { THEGRAPH_SKILL_METADATA }            from '../src/skills/thegraph';
import { COINGECKO_SKILL_METADATA }           from '../src/skills/coingecko';
import { ENS_SKILL_METADATA }                 from '../src/skills/ens';
import { CHAINLINK_SKILL_METADATA }           from '../src/skills/chainlink';
import { GAS_TRACKER_SKILL_METADATA }         from '../src/skills/gas-tracker';
import { BABYLON_SKILL_METADATA }             from '../src/skills/babylon';
import { LOMBARD_SKILL_METADATA }             from '../src/skills/lombard';
import { BEDROCK_SKILL_METADATA }             from '../src/skills/bedrock';
import { SOLV_SKILL_METADATA }               from '../src/skills/solv';
import { COREDAO_SKILL_METADATA }            from '../src/skills/coredao';
import { LORENZO_SKILL_METADATA }            from '../src/skills/lorenzo';
import { PELL_SKILL_METADATA }               from '../src/skills/pell';
import { LIQUIDSWAP_SKILL_METADATA }         from '../src/skills/liquidswap';
import { THALA_SKILL_METADATA }              from '../src/skills/thala';
import { ARIES_SKILL_METADATA }              from '../src/skills/aries';
import { COW_PROTOCOL_SKILL_METADATA }       from '../src/skills/cow-protocol';
import { MAPLE_SKILL_METADATA }              from '../src/skills/maple';
import { MARIA_QUERY_SKILL_METADATA }        from '../src/skills/maria-query';
import { MARIA_SWAP_SKILL_METADATA }         from '../src/skills/maria-swap';
import { MARIA_TRANSFER_SKILL_METADATA }     from '../src/skills/maria-transfer';
import { MARIA_CONVERSE_SKILL_METADATA }     from '../src/skills/maria-converse';
import { ONDO_SKILL_METADATA }              from '../src/skills/ondo';
import { SKY_SKILL_METADATA }               from '../src/skills/sky';
import { EIGENLAYER_SKILL_METADATA }        from '../src/skills/eigenlayer';
import { ETHERFI_SKILL_METADATA }           from '../src/skills/etherfi';
import { CENTRIFUGE_SKILL_METADATA }        from '../src/skills/centrifuge';
import { UNISWAP_V4_MAINNET_SKILL_METADATA } from '../src/skills/uniswap-v4-mainnet';
import { STRC_SKILL_METADATA }              from '../src/skills/strc';
import { CANTON_SPLICE_SKILL_METADATA }     from '../src/skills/canton-splice';
import { CASPER_AGENTGUARD_SKILL_METADATA } from '../src/skills/casper-agentguard';
import { X402_PAYMENT_SKILL_METADATA }      from '../src/skills/x402-payment';
import { BNB_CHAIN_SKILL_METADATA }         from '../src/skills/bnb-chain';
import { EXCHANGE_OS_SKILL_METADATA }       from '../src/skills/exchange-os';
import { SAFEROUTER_SKILL_METADATA }        from '../src/skills/saferouter';
import { COMPOUND_V3_MAINNET_SKILL_METADATA } from '../src/skills/compound-v3-mainnet';
import { BALANCER_V2_MAINNET_SKILL_METADATA } from '../src/skills/balancer-v2-mainnet';
import { ORCA_SKILL_METADATA }              from '../src/skills/orca';
import { BINANCE_SKILL_METADATA }           from '../src/skills/binance';
import { BINANCE_STOCK_PERPS_SKILL_METADATA } from '../src/skills/binance-stock-perps';
import { BINANCE_BSTOCKS_SKILL_METADATA }    from '../src/skills/binance-bstocks';
import { AMNIS_SKILL_METADATA }             from '../src/skills/amnis';
import { ECHELON_SKILL_METADATA }           from '../src/skills/echelon';
import { MERKLE_TRADE_SKILL_METADATA }      from '../src/skills/merkle-trade';
import { MARGINFI_SKILL_METADATA }          from '../src/skills/marginfi';
import { MARINADE_SKILL_METADATA }          from '../src/skills/marinade';
import { SANCTUM_SKILL_METADATA }           from '../src/skills/sanctum';
import { SAVE_SKILL_METADATA }              from '../src/skills/save-finance';
import { KINTSU_SKILL_METADATA }            from '../src/skills/kintsu';
import { MORPHO_MONAD_SKILL_METADATA }      from '../src/skills/morpho-monad';
import { PANCAKESWAP_MONAD_SKILL_METADATA } from '../src/skills/pancakeswap-monad';
import { KURU_SKILL_METADATA }              from '../src/skills/kuru';
import { BERACHAIN_SKILL_METADATA }         from '../src/skills/berachain';
import { KODIAK_SKILL_METADATA }            from '../src/skills/kodiak';
import { INFRARED_SKILL_METADATA }          from '../src/skills/infrared';
import { HONEY_SKILL_METADATA }             from '../src/skills/berachain-honey';

// ── UUID → metadata registry ────────────────────────────────────────────────
// Each entry: skill UUID → metadata export from its skill file.
// Multiple UUIDs can share the same metadata (e.g. legacy + v2 IDs for the same skill).

type SkillMeta = {
  schema: object;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  partner_verified?: boolean;
  external_url?: string;
  logo_url?: string;
  // Agent skill taxonomy (defaults: protocol / rest_json)
  kind?: 'protocol' | 'agent' | 'hybrid';
  execution_protocol?: 'rest_json' | 'sse_stream' | 'async_task';
  input_style?: 'structured' | 'intent' | 'mixed';
  deterministic?: boolean;
  multi_step?: boolean;
  supports_streaming_events?: string[];
  requires_user_session?: boolean;
  estimated_duration_seconds?: [number, number];
};

const SKILL_REGISTRY: Record<string, SkillMeta> = {
  // Crypto Wallet Manager (v2 active + v1 legacy both point to same executor)
  '584dc72e-a3dc-4b98-a38f-26a08741f076': WALLET_SKILL_METADATA,
  '5e38d229-01b4-4ff7-95f9-dd4827467644': WALLET_SKILL_METADATA,

  // Sumplus Yield Optimizer
  '895be569-174d-4040-9673-0f7aaa27600f': YIELD_SKILL_METADATA,

  // dYdX Perpetuals
  '606c19fb-d443-43d2-9de7-b0aa74b29511': DYDX_SKILL_METADATA,

  // WEEX Exchange (active)
  'dae040cf-b60c-4ef6-a42c-50c3e1b583db': WEEX_SKILL_METADATA,

  // GMX Markets
  'ab8314d9-dd96-49ec-840e-3e7d6bc2bb71': GMX_SKILL_METADATA,

  // Aave Lending Markets
  'e9f7518e-57d3-4971-8b44-22ccd738442e': AAVE_SKILL_METADATA,

  // PancakeSwap V3
  'd5a3f2b1-9c4e-4d07-8b5a-1e3c2f6d9a70': PANCAKESWAP_SKILL_METADATA,
  // Agni Finance (Mantle)
  '7be7edc6-4553-42df-9474-9e849337892e': AGNI_SKILL_METADATA,
  // Uniswap V3 on BSC
  'd54885d1-1455-497c-9366-d747b1f280af': UNISWAP_BSC_SKILL_METADATA,
  // THENA (BSC ve(3,3) DEX)
  '211c5851-b682-4132-9b1d-a876515ff365': THENA_SKILL_METADATA,

  // SUI Blockchain Toolkit
  'ac6ac13c-e04a-441d-ac0f-ae80231aad2d': SUI_SKILL_METADATA,

  // Jupiter Aggregator (Solana)
  'a8f2c1d4-7e3b-4a9f-b6c5-2d8e1f403b91': JUPITER_SKILL_METADATA,

  // Polymarket Prediction Markets
  'ba1ea5b7-ddfd-4840-bec6-54c9e0f03edb': POLYMARKET_SKILL_METADATA,

  // Hyperliquid Market & Account
  'e59a2f09-9009-4d52-97fc-370a5782b510': HYPERLIQUID_SKILL_METADATA,

  // Raydium DEX (Solana)
  'c5e9d2a7-3f4b-4c8e-a1b6-8f5d923e140c': RAYDIUM_SKILL_METADATA,

  // Kamino Finance (Solana lending + vaults)
  '306c6862-1584-45d0-99c9-e20d723420b5': KAMINO_SKILL_METADATA,

  // Jito (Solana liquid staking + MEV)
  '378a0d53-22a6-4cce-a902-63c11f774c82': JITO_SKILL_METADATA,

  // Jupiter Perpetuals (Solana perps)
  '6f524910-fd50-4a63-b28e-14705a81802d': JUPITER_PERPS_SKILL_METADATA,

  // Drift Protocol (Solana perps)
  '96074985-a8fa-46d8-a365-1ec7c7289d87': DRIFT_SKILL_METADATA,

  // Meteora (Solana DLMM liquidity layer)
  '8cb3f235-4d25-4968-aefb-0f5c1a6294b1': METEORA_SKILL_METADATA,

  // Fluid (Instadapp lending/borrowing, Ethereum)
  '6ea7a68b-7f17-4ce0-8061-352c59fcbc0d': FLUID_SKILL_METADATA,

  // Euler v2 (modular lending, Ethereum mainnet)
  'e6264a67-8b18-4265-a746-918c1a7cb57f': EULER_V2_MAINNET_SKILL_METADATA,

  // Monad chain toolkit (mainnet, chain ID 143)
  '4c5e5018-7b9f-4abf-93bc-552289936f7b': MONAD_CHAIN_SKILL_METADATA,

  // Uniswap V3 on Monad
  '0b178947-e605-4c14-afc3-20179f5b5ebf': UNISWAP_MONAD_SKILL_METADATA,

  // Magma — Monad liquid staking (MON ⇄ gMON)
  '05f0de62-9363-4ebd-b0e8-8b3b32287311': MAGMA_SKILL_METADATA,

  // ShMonad — Monad liquid staking (MON ⇄ shMON, FastLane)
  '207d444c-2918-40c7-8d0e-affa7bceb0bb': SHMONAD_SKILL_METADATA,

  // Euler v2 on Monad — lending (Monad's largest protocol)
  '439ecb2a-46cc-4f32-b99f-48fd7bc3301a': EULER_V2_MONAD_SKILL_METADATA,

  // Cetus CLMM (Sui)
  '2744ff56-cede-460a-8f1b-c7ae77c328f1': CETUS_SKILL_METADATA,

  // IKA dWallet Network
  '0f330f79-caed-44ef-99a7-858e76ff859a': IKA_DWALLET_SKILL_METADATA,

  // Bluefin Ember (Sui)
  'e3b7f1a2-8c4d-4e9f-b5a6-3d2c1e0f7b8a': BLUEFIN_EMBER_SKILL_METADATA,

  // Tempo Machine Payments Protocol (MPP)
  'cf1d3c1b-cee2-4a0e-b19b-16f1e3986d6e': TEMPO_MPP_SKILL_METADATA,

  // Uniswap V3 on Tempo
  'd166a485-636d-4f27-9384-25aa811faf99': UNISWAP_TEMPO_SKILL_METADATA,

  // Sumplus Arsenal meta-skill
  'ba521bd9-4da8-44ed-8a9c-525167557a79': ARSENAL_SKILL_METADATA,

  // Aerodrome Finance (Base)
  '86c6c264-462a-43da-bcf1-32d0551a6b83': AERODROME_SKILL_METADATA,

  // Moonwell (Base)
  'a5f14c95-00dd-4f4e-a498-78fdf9500ada': MOONWELL_SKILL_METADATA,

  // Tempo MPP Sessions (payment channels)
  '2dc7ec4d-35ee-443b-8b7e-203bad3d625d': TEMPO_SESSIONS_SKILL_METADATA,

  // Tempo Token Info
  '591e6f82-f665-4706-8529-f8e8632d1e84': TEMPO_TOKENS_SKILL_METADATA,

  // NAVI Protocol (Sui lending)
  '879d3a33-c5e5-4a1f-b5d6-549dfccd0f41': NAVI_SKILL_METADATA,

  // Scallop (Sui lending)
  '768a3623-cf83-43f3-a94c-28c4a1a49c70': SCALLOP_SKILL_METADATA,

  // Suilend (Sui lending + sSUI liquid staking)
  '907d0c31-54db-48cd-b67b-5311d713873a': SUILEND_SKILL_METADATA,

  // Aftermath Finance (Sui DEX aggregator + afSUI)
  '1a2568da-e586-4a25-b520-529b2d0d1609': AFTERMATH_SKILL_METADATA,

  // Velodrome V2 (Optimism dominant AMM)
  '9c4cddc5-afa4-4e1f-9877-1b8676debdf1': VELODROME_SKILL_METADATA,

  // Talus Nexus Toolkit (Arsenal × Talus partnership)
  '3cb17950-8c83-4ef2-a2a6-6f16de4b848e': TALUS_NEXUS_SKILL_METADATA,

  // Uniswap Get Quote
  '86702f0a-5487-4959-b21a-6de879b9decd': UNISWAP_GET_QUOTE_SKILL_METADATA,

  // Uniswap Build Transaction
  '2384dbf7-10a3-4cf7-9935-62f345e38ebc': UNISWAP_BUILD_TX_SKILL_METADATA,

  // Uniswap Chain Config (static contract addresses)
  'b2968c38-e3fd-41bc-843c-5c95eba2c7d4': UNISWAP_CHAIN_CONFIG_SKILL_METADATA,

  // Token Price Query (CoinGecko)
  'ff0d3b93-8624-49d2-b962-4e0b61c1c6f1': TOKEN_PRICE_QUERY_SKILL_METADATA,

  // WEEX Exchange — alternate UUID (same skill as dae040cf)
  '4c1f2074-2c29-4482-b83d-66af0372c052': WEEX_SKILL_METADATA,

  // Uniswap V3 on XLayer (OKX L2, chain ID 196)
  'f2a8c3d1-7e5b-4f9a-b6c8-3d1e2f7c9b0a': UNISWAP_XLAYER_SKILL_METADATA,

  // Curve Finance on XLayer (stablecoin AMM)
  'c3f8a2d1-6e4b-4a9f-b7c5-2d8e1f403c92': CURVE_XLAYER_SKILL_METADATA,

  // QuickSwap (Algebra) on XLayer
  'd4e9b3c2-7f5a-4b8e-c6d1-3e2f1a504d83': QUICKSWAP_XLAYER_SKILL_METADATA,

  // XPower Finance (XLayer mutual finance)
  '438cb167-7311-4b0f-85bd-756d4b232a5e': XPOWER_SKILL_METADATA,

  // ── ETH Mainnet P0 Skills ────────────────────────────────────────────────────
  '0071eca9-b948-49e0-a574-9ea6436e3245': UNISWAP_V3_MAINNET_SKILL_METADATA,
  'f60967ed-c528-4e61-89da-a1a757eba044': AAVE_V3_MAINNET_SKILL_METADATA,
  '451f4e94-259b-4e04-86ce-e82195b52e98': LIDO_MAINNET_SKILL_METADATA,
  '4ff80de4-268b-4439-8f35-9663025be36c': MORPHO_BLUE_MAINNET_SKILL_METADATA,
  '193c7bb3-1dc4-4c8c-bb09-5bb7ca32e0c7': ETHENA_MAINNET_SKILL_METADATA,
  '70ec462d-8d60-4a1a-8784-7758c6fc3baf': CURVE_READ_MAINNET_SKILL_METADATA,
  'cc0d8e79-c983-428f-9520-7fb47b7f7fe0': PENDLE_V4_MAINNET_SKILL_METADATA,
  '952bec77-a7bb-4ab0-9b78-aae83090401c': ONEINCH_MAINNET_SKILL_METADATA,
  '9e290aa4-1497-40a7-b44e-482787240de4': SYNTHRA_SKILL_METADATA,
  'a4884c93-cea7-4d42-a24c-f895febeab1f': DEFILLAMA_SKILL_METADATA,
  '50c2296f-ae2b-48ca-819f-f4d70b530577': ETH_RPC_SKILL_METADATA,
  '0f2ba08a-a519-4c81-bd2e-cc3553e51491': TOKENLISTS_SKILL_METADATA,
  '913313e6-c1d2-434c-ab76-3883388b1d47': TX_SIM_MAINNET_SKILL_METADATA,

  // Bridge skills
  'e4e2a56c-eed5-4869-befc-9cb4e3754e0a': CCTP_MAINNET_SKILL_METADATA,
  '24a5a07b-4d3f-481c-9154-e28c87463271': ACROSS_MAINNET_SKILL_METADATA,
  '2dbd12ea-af52-48a2-baa1-42825d076ac7': STARGATE_MAINNET_SKILL_METADATA,
  'db785bff-503c-4309-b7ad-0f4a06ec3d10': WORMHOLE_MAINNET_SKILL_METADATA,
  'f9297e4a-6166-4122-86fd-c2b6a5a2927d': DEBRIDGE_MAINNET_SKILL_METADATA,
  'c3f93155-0f5b-4c90-b954-d1419497e1e3': XLAYER_BRIDGE_SKILL_METADATA,
  '49998c3a-4e69-41ae-9483-7b6cd137713a': MANTLE_BRIDGE_SKILL_METADATA,
  '0029fab7-e06a-4f0b-ad11-d2edb11f9be6': HASHKEY_BRIDGE_SKILL_METADATA,

  // StableStock Finance (tokenized stocks on BNB Chain)
  '588aadca-8045-426b-81ae-a7241ba3cf53': STABLESTOCK_SKILL_METADATA,

  // HSKSwap (Solidly V1-style AMM on HashKey Chain)
  'a3f8c201-7e45-4b9d-b3f2-6c1d8a2e5047': HSKSWAP_SKILL_METADATA,

  // DAOaaS Swap (Uniswap V3-fork DEX on Eniac Network / ENI Mainnet, chain ID 173)
  '7a3d8e21-9f4c-4b6e-bc15-d8a4f2e9c1b3': DAOAAS_SWAP_SKILL_METADATA,

  // Arc Chain (Circle's USDC-native EVM L1, Arc Testnet, chain ID 5042002)
  'c8e3a5d2-7f91-4b6e-9d24-3a8f5c7e1b09': ARC_CHAIN_SKILL_METADATA,

  // ── Sui Ecosystem Expansion ─────────────────────────────────────────────────
  // Haedal Protocol (haSUI liquid staking)
  'f885b761-54f2-4a7d-b244-dc8ab0dff85e': HAEDAL_SKILL_METADATA,

  // Volo (voloSUI / vSUI liquid staking)
  '0a9fa9f9-94fc-4823-8fae-a678ec267c53': VOLO_SKILL_METADATA,

  // Turbos Finance (CLMM DEX, Jump Trading backed)
  '1f909dd7-f924-4038-83ce-35db91f1a311': TURBOS_SKILL_METADATA,

  // Kriya DEX (AMM on Sui)
  'fbce6f3b-786a-4deb-a40c-f9479dd11e9b': KRIYA_SKILL_METADATA,

  // DeepBook V3 (native CLOB DEX on Sui, Mysten Labs)
  'dc70f873-7cc5-4b7f-82e8-bb1fc7698015': DEEPBOOK_SKILL_METADATA,

  // ── Sui Ecosystem Expansion (Round 2) ───────────────────────────────────────
  // AlphaFi Protocol (stSUI liquid staking — instant unstake, no fee)
  'bd731f41-c72c-449a-8992-6f6f233104e8': ALPHAFI_SKILL_METADATA,

  // Pyth Network (real-time price feeds via Hermes REST API)
  '9e50e52a-4875-4623-a729-68806a364987': PYTH_SUI_SKILL_METADATA,

  // SuiNS (Sui Name Service — .sui name resolution)
  '9ec9e3cb-2b74-487a-a178-a9996bd4f0f2': SUINS_SKILL_METADATA,

  // 7k Aggregator (DEX aggregator — best-route swaps across all Sui DEXes)
  'edea7e4c-e863-43a0-8ef1-e255500962e7': SEVENK_SKILL_METADATA,

  // FlowX Finance (AMM + CLMM DEX on Sui)
  'b395cfa2-651f-4ab5-9f24-fa3827224143': FLOWX_SKILL_METADATA,

  // Bucket Protocol (BUCK/USDB CDP stablecoin — collateralized debt positions)
  'a24cb359-cf19-491a-9335-2a921966dbab': BUCKET_SKILL_METADATA,

  // Typus Finance (structured DeFi — covered call / cash-secured put vaults)
  '35fcf2e3-098e-4005-bad6-2276ea61cf71': TYPUS_SKILL_METADATA,

  // ── Data & Infrastructure ────────────────────────────────────────────────────
  // The Graph (GraphQL queries for on-chain data via subgraphs)
  '21715733-c258-454f-a118-6bceb7328425': THEGRAPH_SKILL_METADATA,

  // CoinGecko (crypto price & market data — free tier, no API key)
  'e7dfce13-78ef-451b-a2b7-56ac541419a6': COINGECKO_SKILL_METADATA,

  // ENS (Ethereum Name Service — .eth name resolution)
  'b48587f6-e786-4b29-85fd-067c4fa7628c': ENS_SKILL_METADATA,

  // Chainlink (decentralized price feeds — multi-chain EVM)
  '6ec501e5-f2fc-4d0e-b581-0561762baf83': CHAINLINK_SKILL_METADATA,

  // Gas Tracker (real-time gas prices for 7 EVM chains)
  'e4c79fe2-c97f-418d-8559-71ae996260e3': GAS_TRACKER_SKILL_METADATA,

  // ── BTC Staking & Restaking ──────────────────────────────────────────────────
  // Babylon Protocol (BTC staking via timelocks, no bridging)
  'e5db5c99-b6b3-42e9-9b9d-80f8d176be09': BABYLON_SKILL_METADATA,

  // Lombard Finance (LBTC — liquid BTC staking on Ethereum)
  'f73aa843-fc74-46a7-a1a9-21e767247aac': LOMBARD_SKILL_METADATA,

  // Bedrock Protocol (uniBTC + uniETH liquid staking by RockX)
  '1be75d50-3bba-47a5-91f2-9ca2567dd99a': BEDROCK_SKILL_METADATA,

  // Solv Protocol (SolvBTC — BTC yield aggregation across protocols)
  '1238c2c8-be55-439f-b641-84859095d027': SOLV_SKILL_METADATA,

  // CoreDAO / Core Chain (BTC dual staking via Satoshi Plus, lstBTC)
  '812a5882-e781-4504-9015-bfd34857b841': COREDAO_SKILL_METADATA,

  // Lorenzo Protocol (stBTC — BTC liquid restaking backed by Babylon)
  'ca87eb84-8847-43cc-aec7-2f5b493ab688': LORENZO_SKILL_METADATA,

  // Pell Network (BTC restaking for EVM chains, AVS security)
  '4d44370e-76b8-4ae3-851c-a967d93fe83e': PELL_SKILL_METADATA,

  // ── Aptos DeFi ───────────────────────────────────────────────────────────────
  // Liquidswap (largest AMM DEX on Aptos by Pontem Network)
  'dad05953-f098-493d-8c17-96d8984e783e': LIQUIDSWAP_SKILL_METADATA,

  // Thala Finance (MOD stablecoin + thAPT liquid staking + StableSwap AMM)
  'bd804ff4-2735-439b-91a3-619be5b260f8': THALA_SKILL_METADATA,

  // Aries Markets (leading lending/borrowing protocol on Aptos)
  '0dc94302-80e4-4a84-971b-c13bb17b753b': ARIES_SKILL_METADATA,

  // ── Ethereum DeFi — DEX Aggregators ─────────────────────────────────────────
  // CoW Protocol (MEV-protected batch auction DEX, Coincidence of Wants)
  '7ab5352f-4b92-44be-91bc-238f95967dd1': COW_PROTOCOL_SKILL_METADATA,

  // ── Institutional Lending ────────────────────────────────────────────────────
  // Maple Finance (institutional undercollateralized credit protocol)
  'f7fd7045-3f5e-44f8-9021-b44877a4ea05': MAPLE_SKILL_METADATA,

  // ── CLARITY Act — Yield Stablecoins / RWA ───────────────────────────────────
  'b9ee4012-4925-4266-81df-3e749cd86f31': ONDO_SKILL_METADATA,
  'ee216675-ba70-43f2-a32e-4cb72d5c1117': SKY_SKILL_METADATA,

  // ── CLARITY Act — Restaking ──────────────────────────────────────────────────
  '431d7899-edfc-47ba-9f64-0279c8c66b18': EIGENLAYER_SKILL_METADATA,
  'e0f74451-9bcb-44bf-8877-fc6683fc2efe': ETHERFI_SKILL_METADATA,

  // ── CLARITY Act — RWA Tokenization ──────────────────────────────────────────
  'c42fc53b-647c-4566-a7cc-7c2839f9e6c8': CENTRIFUGE_SKILL_METADATA,

  // ── CLARITY Act — DEX Infrastructure ────────────────────────────────────────
  '1df3d9de-7862-438e-b95d-0099f269c49a': UNISWAP_V4_MAINNET_SKILL_METADATA,

  // ── CLARITY Act — STRC (Strategy preferred stock + Saturn/Apyx DeFi ecosystem)
  'ed40e997-f880-4dd5-ad15-b9632d0212d0': STRC_SKILL_METADATA,

  // ── Canton Network / Splice Protocol ─────────────────────────────────────────
  'ada380e4-bc52-4129-b5b2-ac12480b62ac': CANTON_SPLICE_SKILL_METADATA,

  // ── Casper AgentGuard — agent policy/receipt registry on Casper Testnet ─────
  '88c60a3a-6608-4449-9e47-3b8d99120917': CASPER_AGENTGUARD_SKILL_METADATA,

  // ── x402 Payment Protocol ─────────────────────────────────────────────────────
  'b4e7f2a1-8c3d-4f6e-9a2b-5d8e1f4c7a0b': X402_PAYMENT_SKILL_METADATA,

  // ── BNB Chain ─────────────────────────────────────────────────────────────────
  'e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9': BNB_CHAIN_SKILL_METADATA,

  // ── OKX Exchange OS (X Layer pre-launch toolkit, chain ID 196) ──────────────
  'f4a82c19-3d6e-4b85-9c71-8e2f5a1d6b04': EXCHANGE_OS_SKILL_METADATA,

  // ── SafeRouter — verified-inference LLM gateway (discovery / onboarding only) ─
  'b8e9f1a3-4c5d-4d2e-8f7a-9b1c2d3e4f50': SAFEROUTER_SKILL_METADATA,

  // ── Compound V3 (Comet) — Ethereum mainnet lending ───────────────────────────
  'a1d4f7c2-9b6e-4e3a-8d51-2c7f0e9a4b63': COMPOUND_V3_MAINNET_SKILL_METADATA,

  // ── Balancer V2 — Ethereum mainnet DEX (single Vault) ────────────────────────
  'c8b3e6a1-4d7f-4a2e-9c50-6f1b8d3a92e7': BALANCER_V2_MAINNET_SKILL_METADATA,

  // ── Orca Whirlpools — Solana CLMM (Orca-pinned routing via Jupiter) ──────────
  'd2f9a4c7-6b1e-4e8a-bc35-7a0d5f2c9e16': ORCA_SKILL_METADATA,

  // ── Binance — spot market data + trading (largest CEX) ───────────────────────
  'e7c3b9a2-5f8d-4a1e-b6c4-3d9f0e2a7c81': BINANCE_SKILL_METADATA,

  // ── Binance Stock Perpetuals — USDⓈ-M TradFi perps (discovery, pending) ──────
  'b1c2d3e4-5f60-4a7b-8c91-0d2e3f4a5b60': BINANCE_STOCK_PERPS_SKILL_METADATA,

  // ── Binance bStocks — tokenized stock spot (discovery / info, pending) ───────
  'c3d4e5f6-6071-4b8c-9d02-1e3f4a5b6c71': BINANCE_BSTOCKS_SKILL_METADATA,

  // ── Maria A2A — wallet agent proxy skills ────────────────────────────────────
  'f4764725-458c-4256-a5f7-92d50fcb7672': MARIA_QUERY_SKILL_METADATA,
  '36d4289b-0db8-4c3c-9ab0-e01bc93ee70d': MARIA_SWAP_SKILL_METADATA,
  '3e32d737-f2d1-41ca-a102-3e5ddcedb93f': MARIA_TRANSFER_SKILL_METADATA,
  '899a806a-d4d0-4fba-acc3-4f7cd02ca622': MARIA_CONVERSE_SKILL_METADATA,

  // ── Aptos batch (2026-07-01) ─────────────────────────────────────────────────
  '96273c03-66f3-4788-ae6d-11df2d8159b0': AMNIS_SKILL_METADATA,
  'c55b13f4-3d83-43b4-a850-d329bfb166c8': ECHELON_SKILL_METADATA,
  '5109e510-e048-4808-a488-4557629b30d1': MERKLE_TRADE_SKILL_METADATA,

  // ── Solana batch (2026-07-01) ────────────────────────────────────────────────
  '52b1ca79-e36e-4dff-9278-7bb97abe400a': MARGINFI_SKILL_METADATA,
  'bd76cf87-8859-41a4-9b80-eb478ebb656c': MARINADE_SKILL_METADATA,
  '79d9c0d5-f0f6-4d6f-9c8c-7068a63821b7': SANCTUM_SKILL_METADATA,
  '53fb39fd-9b38-4034-b1b5-34a5732ae21e': SAVE_SKILL_METADATA,

  // ── Monad batch 2 (2026-07-01) ───────────────────────────────────────────────
  '770bcf81-af57-41e5-a2b2-f5e017fd00aa': KINTSU_SKILL_METADATA,
  '83cec58e-8b4a-46e1-9f7b-7692e3b6e83c': MORPHO_MONAD_SKILL_METADATA,
  'f3ee7170-bf59-4807-9248-bb5053a03a20': PANCAKESWAP_MONAD_SKILL_METADATA,
  '2b3fd37c-a0ec-42a4-9bbc-a2882236baf3': KURU_SKILL_METADATA,

  // ── Berachain batch (2026-07-01, new ecosystem) ──────────────────────────────
  'e67766d2-6581-4e13-b3a8-1746f5f947f4': BERACHAIN_SKILL_METADATA,
  '55f54b23-57ee-4502-ad63-e9fcc5c0e8af': KODIAK_SKILL_METADATA,
  'e84c77cb-6b5f-4428-8a72-cf63f8760a08': INFRARED_SKILL_METADATA,
  '13299e24-ef6e-442c-a120-a2668e3e45d1': HONEY_SKILL_METADATA,
};

// ── Embedding helper ─────────────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${process.env.OPENAI_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.EMBEDDING_MODEL ?? 'text-embedding-v4',
      input: text,
      dimensions: 1536,
    }),
  });
  const j = await res.json() as any;
  if (!j.data) throw new Error(`Embedding API error: ${JSON.stringify(j)}`);
  return j.data[0].embedding;
}

function buildEmbeddingText(s: { name?: string; description?: string; category?: string; tags?: string[] }): string {
  return [
    s.name,
    s.description,
    `Category: ${s.category ?? ''}`,
    `Tags: ${(s.tags ?? []).join(', ')}`,
  ].filter(Boolean).join('. ');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Stable JSON stringify — sorts keys recursively so order differences don't cause false positives. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return JSON.stringify(v);
  }
  const sorted = Object.fromEntries(
    Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(
      ([k, val]) => [k, JSON.parse(stableStringify(val))]
    )
  );
  return JSON.stringify(sorted);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const ids = Object.keys(SKILL_REGISTRY);
  const { data: rows, error } = await sb
    .from('skills')
    .select('id, name, schema, description, category, tags, external_url, logo_url, partner_verified, status, kind, execution_protocol, input_style, deterministic, multi_step, supports_streaming_events, requires_user_session, estimated_duration_seconds')
    .in('id', ids);

  if (error) throw new Error(`DB fetch error: ${error.message}`);

  const changed: string[] = [];

  // Insert skills that exist in registry but not in DB
  const existingIds = new Set((rows ?? []).map(r => r.id));
  for (const [id, meta] of Object.entries(SKILL_REGISTRY)) {
    if (existingIds.has(id)) continue;
    const { error: insertErr } = await sb.from('skills').insert({
      id,
      name:        meta.name        ?? 'Unnamed Skill',
      description: meta.description ?? '',
      category:    meta.category    ?? 'DeFi',
      tags:        meta.tags        ?? [],
      schema:      meta.schema,
      status:      (meta as any).status      ?? 'approved',
      author_type: (meta as any).author_type ?? 'official',
      is_paid:     (meta as any).is_paid     ?? false,
      price:       (meta as any).price       ?? null,
      version:     (meta as any).version     ?? '1.0.0',
      usage_examples: (meta as any).usage_examples ?? [],
      partner_verified: meta.partner_verified ?? false,
      external_url:   meta.external_url   ?? null,
      logo_url:       meta.logo_url       ?? null,
      kind:                     meta.kind                     ?? 'protocol',
      execution_protocol:       meta.execution_protocol       ?? 'rest_json',
      input_style:              meta.input_style              ?? 'structured',
      deterministic:            meta.deterministic            ?? true,
      multi_step:               meta.multi_step               ?? false,
      supports_streaming_events: meta.supports_streaming_events ?? null,
      requires_user_session:    meta.requires_user_session    ?? false,
      estimated_duration_seconds: meta.estimated_duration_seconds ?? null,
    });
    if (insertErr) {
      console.error(`✗  INSERT ${(meta as any).name ?? id} (${id.slice(0, 8)}…) — ${insertErr.message}`);
    } else {
      console.log(`+  ${(meta as any).name ?? id} (${id.slice(0, 8)}…) — inserted`);
      changed.push(id);
    }
  }

  for (const row of rows ?? []) {
    const meta = SKILL_REGISTRY[row.id];
    if (!meta) continue;

    const codeSchema     = stableStringify(meta.schema);
    const dbSchema       = stableStringify(row.schema);
    const codeExternalUrl      = meta.external_url   ?? null;
    const dbExternalUrl        = (row as any).external_url ?? null;
    const codeLogoUrl          = meta.logo_url       ?? null;
    const dbLogoUrl            = (row as any).logo_url ?? null;
    const codePartnerVerified  = meta.partner_verified ?? false;
    const dbPartnerVerified    = (row as any).partner_verified ?? false;

    const codeKind             = meta.kind               ?? 'protocol';
    const dbKind               = (row as any).kind       ?? 'protocol';
    const codeExecProto        = meta.execution_protocol ?? 'rest_json';
    const dbExecProto          = (row as any).execution_protocol ?? 'rest_json';
    const codeInputStyle       = meta.input_style        ?? 'structured';
    const dbInputStyle         = (row as any).input_style ?? 'structured';
    const codeDeterministic    = meta.deterministic      ?? true;
    const dbDeterministic      = (row as any).deterministic ?? true;
    const codeMultiStep        = meta.multi_step         ?? false;
    const dbMultiStep          = (row as any).multi_step ?? false;
    const codeRequiresSession  = meta.requires_user_session ?? false;
    const dbRequiresSession    = (row as any).requires_user_session ?? false;

    const codeStatus           = (meta as any).status ?? 'approved';
    const dbStatus             = (row as any).status ?? 'approved';

    const codeTags            = JSON.stringify((meta.tags ?? []).slice().sort());
    const dbTags              = JSON.stringify(((row as any).tags ?? []).slice().sort());

    const schemaMatch          = codeSchema === dbSchema;
    const externalUrlMatch     = codeExternalUrl === dbExternalUrl;
    const logoUrlMatch         = codeLogoUrl === dbLogoUrl;
    const partnerVerifiedMatch = codePartnerVerified === dbPartnerVerified;
    const statusMatch          = codeStatus === dbStatus;
    const tagsMatch            = codeTags === dbTags;
    const taxonomyMatch        = codeKind === dbKind
                              && codeExecProto === dbExecProto
                              && codeInputStyle === dbInputStyle
                              && codeDeterministic === dbDeterministic
                              && codeMultiStep === dbMultiStep
                              && codeRequiresSession === dbRequiresSession;

    if (schemaMatch && externalUrlMatch && logoUrlMatch && partnerVerifiedMatch && statusMatch && tagsMatch && taxonomyMatch) {
      console.log(`✓  ${row.name} (${row.id.slice(0, 8)}…) — up to date`);
      continue;
    }

    const patch: Record<string, any> = {};
    if (!schemaMatch)          patch.schema            = meta.schema;
    if (!externalUrlMatch)     patch.external_url      = codeExternalUrl;
    if (!logoUrlMatch)         patch.logo_url          = codeLogoUrl;
    if (!partnerVerifiedMatch) patch.partner_verified  = codePartnerVerified;
    if (!statusMatch)          patch.status            = codeStatus;
    if (!tagsMatch)            patch.tags              = meta.tags ?? [];
    if (!taxonomyMatch) {
      patch.kind                = codeKind;
      patch.execution_protocol  = codeExecProto;
      patch.input_style         = codeInputStyle;
      patch.deterministic       = codeDeterministic;
      patch.multi_step          = codeMultiStep;
      patch.requires_user_session = codeRequiresSession;
      if (meta.supports_streaming_events !== undefined) patch.supports_streaming_events = meta.supports_streaming_events;
      if (meta.estimated_duration_seconds !== undefined) patch.estimated_duration_seconds = meta.estimated_duration_seconds;
    }

    const { error: updateErr } = await sb
      .from('skills')
      .update(patch)
      .eq('id', row.id);

    if (updateErr) {
      console.error(`✗  ${row.name} — update failed: ${updateErr.message}`);
    } else {
      console.log(`↑  ${row.name} (${row.id.slice(0, 8)}…) — updated`);
      changed.push(row.id);
    }
  }

  // Regenerate embeddings for changed skills
  if (changed.length === 0) {
    console.log('\nAll schemas in sync. No embeddings to regenerate.');
    return;
  }

  console.log(`\nRegenerating embeddings for ${changed.length} changed skill(s)…`);

  const { data: changedRows } = await sb
    .from('skills')
    .select('id, name, description, category, tags')
    .in('id', changed);

  for (const row of changedRows ?? []) {
    try {
      const text = buildEmbeddingText(row);
      const embedding = await generateEmbedding(text);
      await sb.from('skills').update({ embedding }).eq('id', row.id);
      console.log(`  ✓ embedding refreshed: ${row.name}`);
    } catch (e: any) {
      console.error(`  ✗ embedding failed for ${row.name}: ${e.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
