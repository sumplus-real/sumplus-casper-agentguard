/**
 * Lorenzo Protocol — BTC Liquid Staking Skill
 *
 * Lorenzo Protocol is the "Bitcoin Liquidity Finance Layer" built on top of Babylon.
 * Users stake native BTC (or BTCB on BNB Chain) through Lorenzo, which delegates BTC
 * to Babylon finality provider nodes. In return, users receive:
 *
 *   stBTC  — Liquid Principal Token (LPT): 1:1 redeemable for BTC principal
 *   YAT    — Yield Accruing Token: represents Babylon staking rewards + Lorenzo points
 *
 * The principal-interest separation model keeps stBTC at a stable 1:1 BTC peg,
 * while yield accumulates in tradeable YAT tokens.
 *
 * stBTC is an ERC-20/BEP-20 token deployed at the same address across chains:
 *   0xf6718b2701D4a6498eF77D7c152b2137Ab28b8A3
 *
 * Confirmed deployments:
 *   Ethereum mainnet  (chain ID 1)    — ERC-20, ~86 stBTC supply (~$11.5M)
 *   BNB Smart Chain   (chain ID 56)   — BEP-20, ~388 stBTC supply (primary DeFi chain)
 *   Lorenzo Chain     (chain ID 8329) — EVM L1, stBTC is native gas token
 *
 * BTC is custodied off-chain with Cobo, Ceffu, and Chainup before Babylon staking.
 * BANK is the Lorenzo governance / utility token.
 *
 * Website:  https://www.lorenzo-protocol.xyz
 * App:      https://app.lorenzo-protocol.xyz
 * Docs:     https://docs.lorenzo-protocol.xyz
 * Explorer: https://scan.lorenzo-protocol.xyz  (Lorenzo Chain)
 * GitHub:   https://github.com/Lorenzo-Protocol
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet, bsc } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * stBTC is deployed at the same address on Ethereum, BSC, and Lorenzo Chain.
 * Verified on Etherscan (https://etherscan.io/token/0xf6718b2701D4a6498eF77D7c152b2137Ab28b8A3)
 * and BscScan (https://bscscan.com/token/0xf6718b2701d4a6498ef77d7c152b2137ab28b8a3).
 */
const STBTC_ADDRESS = '0xf6718b2701D4a6498eF77D7c152b2137Ab28b8A3' as `0x${string}`;

const LORENZO_CHAIN_ID = 8329;
const LORENZO_RPC      = 'https://8329.rpc.thirdweb.com'; // public RPC via Thirdweb
const LORENZO_EXPLORER = 'https://scan.lorenzo-protocol.xyz';

// TODO: verify if Lorenzo exposes a public REST API at https://api.lorenzo-protocol.xyz
//       Cosmos-SDK style endpoints (e.g. /lorenzo/staking/v1/stats) were found in docs
//       but have not been confirmed as publicly accessible without authentication.

const STBTC_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SupportedChain = 'ethereum' | 'bsc' | 'bnb' | 'lorenzo';

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function resolveChain(chain: unknown): SupportedChain {
  const s = String(chain ?? '').toLowerCase().replace(/[- ]/g, '');
  if (s === 'bsc' || s === 'bnb' || s === 'binance' || s === 'bscmainnet' || s === 'bnbchain') return 'bsc';
  if (s === 'lorenzo' || s === 'lorenzochain') return 'lorenzo';
  return 'ethereum'; // default
}

/**
 * Build a viem public client for the requested chain.
 * Lorenzo Chain uses Thirdweb's public RPC (no API key needed).
 * Ethereum and BSC use Alchemy when ALCHEMY_API_KEY is set, with public RPC fallback.
 */
function getClient(chain: SupportedChain) {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  switch (chain) {
    case 'bsc':
    case 'bnb':
      return createPublicClient({
        chain: bsc,
        transport: alchemyKey
          ? http(`https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`)
          : http('https://bsc-dataseed.binance.org'),
      });
    case 'lorenzo':
      return createPublicClient({
        chain: {
          id: LORENZO_CHAIN_ID,
          name: 'Lorenzo',
          nativeCurrency: { name: 'Lorenzo stBTC', symbol: 'stBTC', decimals: 18 },
          rpcUrls: { default: { http: [LORENZO_RPC] } },
          blockExplorers: { default: { name: 'Lorenzo Explorer', url: LORENZO_EXPLORER } },
        },
        transport: http(LORENZO_RPC),
      });
    default:
      return createPublicClient({
        chain: mainnet,
        transport: alchemyKey
          ? http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`)
          : http('https://cloudflare-eth.com'),
      });
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function actionGetProtocolInfo(): SkillExecutionResult {
  return {
    success: true,
    output: {
      name:    'Lorenzo Protocol',
      tagline: 'The Bitcoin Liquidity Finance Layer',
      status:  'Live',

      description:
        'Lorenzo Protocol is a BTC liquid staking platform built on Babylon. ' +
        'Users stake native BTC (or BTCB on BNB Chain) through Lorenzo, which delegates ' +
        'the BTC to Babylon finality provider nodes. In return, users receive stBTC — ' +
        'a liquid, transferable ERC-20/BEP-20 token that represents their staked BTC ' +
        'principal at a 1:1 ratio. Babylon staking rewards are distributed separately ' +
        'via Yield Accruing Tokens (YAT), allowing stBTC to remain redeemable 1:1 for BTC ' +
        'while yield accumulates in the YAT wrapper.',

      tokens: {
        stBTC: {
          name:        'Lorenzo stBTC',
          symbol:      'stBTC',
          decimals:    18,
          description:
            'Liquid Principal Token (LPT). Minted 1:1 when BTC is staked via Lorenzo/Babylon. ' +
            'Redeemable 1:1 for BTC principal. Does not rebase — yield goes to YAT.',
          contract:    STBTC_ADDRESS,
          chains: [
            { name: 'Ethereum Mainnet', chain_id: 1,              explorer: `https://etherscan.io/token/${STBTC_ADDRESS}` },
            { name: 'BNB Smart Chain',  chain_id: 56,             explorer: `https://bscscan.com/token/${STBTC_ADDRESS}` },
            { name: 'Lorenzo Chain',    chain_id: LORENZO_CHAIN_ID, explorer: `${LORENZO_EXPLORER}/token/${STBTC_ADDRESS}` },
          ],
        },
        YAT: {
          symbol:      'YAT',
          description:
            'Yield Accruing Token. Issued alongside stBTC when BTC is staked. ' +
            'Represents the yield position: Babylon staking rewards, Lorenzo points, and ' +
            'other yield (ERC-20, NFTs, etc). YAT is tradeable separately from the BTC principal.',
        },
        BANK: {
          symbol:      'BANK',
          description:
            'Lorenzo governance and utility token. Used for protocol governance, fee discounts, ' +
            'and ecosystem incentives.',
        },
      },

      how_it_works: [
        '1. User deposits native BTC or BTCB into Lorenzo Protocol',
        '2. Lorenzo custodies BTC via institutional partners (Cobo, Ceffu, Chainup)',
        '3. BTC is staked with Babylon finality provider nodes on the Bitcoin network',
        '4. User receives stBTC (1 stBTC per 1 BTC) — the liquid principal token',
        '5. User also receives YAT — the yield token representing Babylon rewards + Lorenzo points',
        '6. stBTC can be used freely in DeFi (collateral, LP, lending) while BTC earns Babylon staking rewards via YAT',
        '7. To unstake: burn stBTC → receive BTC principal back; redeem YAT for accumulated yield',
      ],

      babylon_integration: {
        description:
          'Babylon is a Bitcoin-native staking protocol that lets BTC holders trustlessly ' +
          'stake BTC to provide economic security to Proof-of-Stake chains — analogous to ' +
          'how ETH is staked in Ethereum validators. Lorenzo acts as the liquid staking layer ' +
          'on top of Babylon, similar to how Lido is the liquid staking layer on top of Ethereum.',
        babylon_website: 'https://babylonlabs.io',
      },

      key_features: [
        'stBTC/BTC principal maintained at 1:1 — no rebasing complexity',
        'Yield separated into tradeable YAT tokens (sell yield without selling principal)',
        'stBTC usable as DeFi collateral while BTC earns real Bitcoin staking rewards',
        'Cross-chain: stBTC on Ethereum (ERC-20), BSC (BEP-20), and Lorenzo Chain (gas token)',
        'Lorenzo Chain is an EVM-compatible L1 (chain ID 8329) where stBTC is the native gas token',
        'Institutional-grade BTC custody via Cobo, Ceffu, and Chainup',
        'Protocol audited — audit reports available via official docs',
      ],

      supported_chains: [
        { name: 'Ethereum Mainnet', chain_id: 1,              role: 'stBTC ERC-20 deployment' },
        { name: 'BNB Smart Chain',  chain_id: 56,             role: 'stBTC BEP-20 deployment (primary DeFi activity)' },
        { name: 'Lorenzo Chain',    chain_id: LORENZO_CHAIN_ID, role: 'EVM L1 — stBTC is native gas token', rpc: LORENZO_RPC, explorer: LORENZO_EXPLORER },
      ],

      links: {
        website:  'https://www.lorenzo-protocol.xyz',
        app:      'https://app.lorenzo-protocol.xyz',
        docs:     'https://docs.lorenzo-protocol.xyz',
        github:   'https://github.com/Lorenzo-Protocol',
        explorer: LORENZO_EXPLORER,
        twitter:  'https://twitter.com/LorenzoProtocol',
      },
    },
  };
}

async function actionGetExchangeRate(): Promise<SkillExecutionResult> {
  // stBTC is structurally pegged 1:1 to BTC principal. Yield accrues in YAT, not in
  // the stBTC token itself, so the protocol-guaranteed redemption rate is always 1:1.
  // We augment this with the live BTC/USD price from CoinGecko for USD context.

  // TODO: verify if Lorenzo exposes an on-chain price oracle or exchange rate contract
  //       that stores the BTC:stBTC ratio. If a dedicated rate contract exists on
  //       Lorenzo Chain or BSC, replace the static 1:1 with a live readContract call.

  let btc_price_usd: number | null = null;
  let price_error: string | null = null;

  try {
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
    );
    if (resp.ok) {
      const json = await resp.json() as { bitcoin?: { usd?: number } };
      btc_price_usd = json.bitcoin?.usd ?? null;
    } else {
      price_error = `CoinGecko returned HTTP ${resp.status}`;
    }
  } catch (e: any) {
    price_error = e.message ?? 'CoinGecko fetch failed';
  }

  return {
    success: true,
    output: {
      stbtc_per_btc: '1',
      btc_per_stbtc: '1',
      ratio_mechanism:
        'Lorenzo uses a principal-interest separation model. stBTC is the Liquid Principal ' +
        'Token (LPT) — always minted and redeemable at 1:1 with BTC. Yield from Babylon ' +
        'staking does not inflate stBTC supply; instead it flows into YAT (Yield Accruing ' +
        'Token), which holders receive alongside stBTC at staking time.',
      btc_price_usd,
      stbtc_implied_price_usd: btc_price_usd, // stBTC tracks BTC price 1:1
      price_data_source: price_error ? `CoinGecko unavailable: ${price_error}` : 'CoinGecko /simple/price',
      note:
        'stBTC may trade at a small premium or discount on secondary markets. ' +
        'The 1:1 ratio above is the protocol-guaranteed redemption rate for the staked principal.',
    },
  };
}

async function actionGetProtocolStats(): Promise<SkillExecutionResult> {
  // Data sources:
  //   - TVL: DefiLlama public API (no key required)
  //   - stBTC total supply: live on-chain read from BSC (highest stBTC activity)
  //   - BTC/USD price: CoinGecko (for BTC-denominated TVL)
  //   - APY: no stable public endpoint found; documented range used instead
  //
  // TODO: integrate live APY once Lorenzo exposes a public API endpoint.
  //       The Cosmos-SDK path /lorenzo/staking/v1/stats was found in docs but
  //       is not confirmed accessible without authentication.

  let tvl_usd: number | null = null;
  let chain_tvls: Record<string, number> | null = null;
  let defillama_error: string | null = null;

  let btc_price_usd: number | null = null;
  let tvl_btc: number | null = null;

  let stbtc_supply_bsc: string | null = null;
  let stbtc_supply_eth: string | null = null;
  let supply_error: string | null = null;

  // 1. DefiLlama TVL
  try {
    const llamaResp = await fetch('https://api.llama.fi/protocol/lorenzo-protocol', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (llamaResp.ok) {
      const json = await llamaResp.json() as { tvl?: number; currentChainTvls?: Record<string, number> };
      tvl_usd = typeof json.tvl === 'number' ? json.tvl : null;
      chain_tvls = json.currentChainTvls ?? null;
    } else {
      defillama_error = `DefiLlama returned HTTP ${llamaResp.status}`;
    }
  } catch (e: any) {
    defillama_error = e.message ?? 'DefiLlama fetch failed';
  }

  // 2. BTC price for TVL-in-BTC conversion
  try {
    const btcResp = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
    );
    if (btcResp.ok) {
      const json = await btcResp.json() as { bitcoin?: { usd?: number } };
      btc_price_usd = json.bitcoin?.usd ?? null;
      if (btc_price_usd && tvl_usd !== null) {
        tvl_btc = Math.round((tvl_usd / btc_price_usd) * 1000) / 1000;
      }
    }
  } catch { /* non-critical, ignore */ }

  // 3. On-chain stBTC total supply — BSC (highest activity) and Ethereum in parallel
  try {
    const [bscSupply, ethSupply] = await Promise.allSettled([
      getClient('bsc').readContract({ address: STBTC_ADDRESS, abi: STBTC_ABI, functionName: 'totalSupply' }),
      getClient('ethereum').readContract({ address: STBTC_ADDRESS, abi: STBTC_ABI, functionName: 'totalSupply' }),
    ]);
    if (bscSupply.status === 'fulfilled') {
      stbtc_supply_bsc = (Number(bscSupply.value) / 1e18).toFixed(8);
    }
    if (ethSupply.status === 'fulfilled') {
      stbtc_supply_eth = (Number(ethSupply.value) / 1e18).toFixed(8);
    }
    if (bscSupply.status === 'rejected' && ethSupply.status === 'rejected') {
      supply_error = 'Both BSC and Ethereum RPC reads failed';
    }
  } catch (e: any) {
    supply_error = e.message ?? 'RPC read failed';
  }

  return {
    success: true,
    output: {
      protocol:    'Lorenzo Protocol',
      description: 'BTC liquid staking via Babylon',

      tvl: {
        usd:        tvl_usd,
        btc:        tvl_btc,
        chain_breakdown: chain_tvls,
        source:     defillama_error
          ? `DefiLlama unavailable: ${defillama_error}`
          : 'DefiLlama (https://defillama.com/protocol/lorenzo-protocol)',
        note:
          'TVL includes native BTC staked into Babylon finality provider nodes ' +
          'plus stBTC positions on BSC and Ethereum.',
      },

      stbtc_supply: {
        bsc_chain_id_56:       stbtc_supply_bsc,
        ethereum_chain_id_1:   stbtc_supply_eth,
        unit:                  'stBTC (equivalent to BTC)',
        contract:              STBTC_ADDRESS,
        error:                 supply_error,
        note:
          'Lorenzo Chain (chain ID 8329) supply not included — ' +
          'Thirdweb public RPC may have rate limits. Query separately with get_stbtc_balance if needed.',
      },

      apy: {
        value:       null,
        range_pct:   '3–8',
        description:
          'Babylon native BTC staking APY distributed through YAT tokens. ' +
          'Typically 3–8% from Babylon alone; additional BANK token incentives may apply. ' +
          'Flash reports cited 27%+ APY inclusive of BANK incentive programs.',
        source:
          'Public reports (no stable API endpoint confirmed for live APY). ' +
          // TODO: replace with live call once Lorenzo public API is confirmed:
          // Candidate endpoint: GET https://api.lorenzo-protocol.xyz/lorenzo/staking/v1/stats
          'Check https://app.lorenzo-protocol.xyz for current live APY.',
      },

      btc_price_usd,

      token_addresses: {
        stBTC_ethereum: `${STBTC_ADDRESS} (ERC-20, chain ID 1)`,
        stBTC_bsc:      `${STBTC_ADDRESS} (BEP-20, chain ID 56)`,
        stBTC_lorenzo:  `${STBTC_ADDRESS} (native gas, chain ID ${LORENZO_CHAIN_ID})`,
      },
    },
  };
}

async function actionGetStBtcBalance(input: any): Promise<SkillExecutionResult> {
  const address  = input.address ?? input.wallet;
  const rawChain = input.chain ?? input.network;

  if (!isAddress(address)) {
    return {
      success: false,
      error: 'address is required and must be a valid EVM address (0x followed by 40 hex characters)',
    };
  }

  const chain = resolveChain(rawChain);

  const chainMeta: Record<SupportedChain, { name: string; chain_id: number; explorer_base: string }> = {
    ethereum: { name: 'Ethereum Mainnet', chain_id: 1,              explorer_base: 'https://etherscan.io/address' },
    bsc:      { name: 'BNB Smart Chain',  chain_id: 56,             explorer_base: 'https://bscscan.com/address' },
    bnb:      { name: 'BNB Smart Chain',  chain_id: 56,             explorer_base: 'https://bscscan.com/address' },
    lorenzo:  { name: 'Lorenzo Chain',    chain_id: LORENZO_CHAIN_ID, explorer_base: `${LORENZO_EXPLORER}/address` },
  };

  const meta = chainMeta[chain];

  try {
    const client = getClient(chain);
    const rawBalance = await client.readContract({
      address: STBTC_ADDRESS,
      abi:     STBTC_ABI,
      functionName: 'balanceOf',
      args: [address],
    });

    const balanceBtc = Number(rawBalance) / 1e18;

    return {
      success: true,
      output: {
        address,
        chain:             meta.name,
        chain_id:          meta.chain_id,
        stbtc_balance:     balanceBtc.toFixed(8),
        stbtc_balance_wei: rawBalance.toString(),
        token_address:     STBTC_ADDRESS,
        token_symbol:      'stBTC',
        decimals:          18,
        explorer_url:      `${meta.explorer_base}/${address}`,
        note:
          'stBTC balance represents BTC principal staked via Lorenzo/Babylon. ' +
          '1 stBTC = 1 BTC of staked principal. ' +
          'Yield accumulates separately in YAT tokens (not reflected here).',
      },
    };
  } catch (e: any) {
    return {
      success: false,
      error: `Failed to read stBTC balance on ${meta.name}: ${e.message ?? 'RPC error'}`,
    };
  }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const LORENZO_SKILL_METADATA = {
  name: 'Lorenzo Protocol',
  description:
    'BTC liquid staking protocol built on Babylon. Stake BTC to receive stBTC which earns ' +
    'Babylon staking rewards while remaining liquid and usable in DeFi. ' +
    'stBTC is an ERC-20/BEP-20 token (0xf6718b2701D4a6498eF77D7c152b2137Ab28b8A3) deployed on ' +
    'Ethereum, BNB Smart Chain, and Lorenzo Chain (EVM, chain ID 8329). ' +
    'Query protocol info, stBTC/BTC exchange rate, TVL/supply stats, and on-chain stBTC balances.',
  category: 'BTC DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['lorenzo', 'stbtc', 'btc', 'bitcoin', 'liquid-staking', 'babylon', 'defi'],
  external_url: 'https://lorenzo-protocol.xyz',
  logo_url: 'https://icons.llamao.fi/icons/protocols/lorenzo?w=48&h=48',
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
          'get_exchange_rate',
          'get_protocol_stats',
          'get_stbtc_balance',
        ],
        description:
          'get_protocol_info: Lorenzo overview, stBTC/YAT/BANK tokens, Babylon integration, supported chains, and links. ' +
          'get_exchange_rate: stBTC/BTC exchange rate (1:1 principal peg by design) + live BTC/USD price from CoinGecko. ' +
          'get_protocol_stats: TVL from DefiLlama, on-chain stBTC total supply (BSC + Ethereum), APY context. ' +
          'get_stbtc_balance: stBTC balance for a given EVM address on Ethereum, BSC, or Lorenzo Chain.',
      },
      address: {
        type: 'string',
        description: 'EVM wallet address (0x...) — required for get_stbtc_balance.',
      },
      chain: {
        type: 'string',
        enum: ['ethereum', 'bsc', 'bnb', 'lorenzo'],
        description:
          'Chain to query for get_stbtc_balance. Default: ethereum. ' +
          '"bsc" and "bnb" are equivalent (BNB Smart Chain, chain ID 56). ' +
          '"lorenzo" queries Lorenzo Chain (EVM, chain ID 8329).',
      },
    },
  },
  usage_examples: [
    {
      title: 'Protocol overview',
      input: { action: 'get_protocol_info' },
    },
    {
      title: 'stBTC / BTC exchange rate',
      input: { action: 'get_exchange_rate' },
    },
    {
      title: 'Protocol stats (TVL, stBTC supply)',
      input: { action: 'get_protocol_stats' },
    },
    {
      title: 'stBTC balance on BSC',
      input: { action: 'get_stbtc_balance', address: '0xYourAddress', chain: 'bsc' },
    },
    {
      title: 'stBTC balance on Ethereum',
      input: { action: 'get_stbtc_balance', address: '0xYourAddress', chain: 'ethereum' },
    },
  ],
};

// ─── Executor ─────────────────────────────────────────────────────────────────

export async function executeLorenzoSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':  return actionGetProtocolInfo();
      case 'get_exchange_rate':  return await actionGetExchangeRate();
      case 'get_protocol_stats': return await actionGetProtocolStats();
      case 'get_stbtc_balance':  return await actionGetStBtcBalance(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_exchange_rate, get_protocol_stats, get_stbtc_balance`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Lorenzo skill error' };
  }
}
