import { formatUnits, parseAbi } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';
import { getPublicClient } from '@/lib/rpc';

export const CHAINLINK_SKILL_METADATA = {
  name: 'Chainlink',
  description:
    '[ARSENAL-HOSTED ✓] Read-only Chainlink Data Feeds adapter for EVM networks. ' +
    'Resolve common USD feeds, inspect a static feed catalog, and fetch the latest on-chain answer ' +
    'from any AggregatorV3-compatible feed address.',
  category: 'Data & Oracles',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['chainlink', 'oracle', 'price-feed', 'data-feeds', 'ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism', 'base'],
  external_url: 'https://chain.link/data-feeds',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_price', 'get_feed_by_symbol', 'list_feeds'],
        description:
          'get_protocol_info: Chainlink overview and feed mechanics. ' +
          'get_price: read latestRoundData from a feed address. ' +
          'get_feed_by_symbol: resolve a known symbol on a supported chain and return its latest price. ' +
          'list_feeds: return the built-in catalog of well-known feeds.',
      },
      feed_address: { type: 'string', description: 'AggregatorV3-compatible feed address (0x...). Required for get_price.' },
      chain_id: { type: 'number', description: 'EVM chain id for get_price. Defaults to Ethereum mainnet (1).' },
      symbol: { type: 'string', description: 'Base symbol such as ETH, BTC, LINK, AAVE, or UNI. Required for get_feed_by_symbol.' },
      chain: {
        type: 'string',
        enum: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism', 'base'],
        description: 'Supported Chainlink feed network. Defaults to ethereum for get_feed_by_symbol.',
      },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'Read ETH/USD on Ethereum', input: { action: 'get_price', feed_address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' } },
    { title: 'Resolve BTC on Ethereum', input: { action: 'get_feed_by_symbol', symbol: 'BTC', chain: 'ethereum' } },
    { title: 'List known feeds', input: { action: 'list_feeds' } },
  ],
};

const AGGREGATOR_V3_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

// Chain ids Chainlink feeds are catalogued for. RPC endpoints + failover live
// in the central registry (@/lib/rpc); this only needs to validate the chain.
const CHAIN_CONFIG = {
  ethereum: { id: 1 },
  polygon: { id: 137 },
  bsc: { id: 56 },
  avalanche: { id: 43114 },
  arbitrum: { id: 42161 },
  optimism: { id: 10 },
  base: { id: 8453 },
} as const;

type SupportedChain = keyof typeof CHAIN_CONFIG;

const CHAIN_BY_ID = Object.values(CHAIN_CONFIG).reduce<Record<number, (typeof CHAIN_CONFIG)[SupportedChain]>>(
  (out, config) => {
    out[config.id] = config;
    return out;
  },
  {},
);

const FEEDS = {
  ethereum: {
    ETH: { pair: 'ETH/USD', address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' },
    BTC: { pair: 'BTC/USD', address: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c' },
    LINK: { pair: 'LINK/USD', address: '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c' },
    AAVE: { pair: 'AAVE/USD', address: '0x547a514d5e3769680Ce22B2361c10Ea13619e8a9' },
    UNI: { pair: 'UNI/USD', address: '0x553303d460EE0afB37EdFf9bE42922D8FF63220e' },
  },
  polygon: {
    ETH: { pair: 'ETH/USD', address: '0xF9680D99D6C9589e2a93A78A04A279e509205945' },
    BTC: { pair: 'BTC/USD', address: '0xc907E116054Ad103354f2D350FD2514433D57F6f' },
  },
  bsc: {
    BTC: { pair: 'BTC/USD', address: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE' },
    AAVE: { pair: 'AAVE/USD', address: '0xA8357BF572460fc40f4B0a21B3F6E90E475f475' },
  },
  avalanche: {
    ETH: { pair: 'ETH/USD', address: '0x976B3D034E162d8bD72D6b9C989d545b839003b0' },
    BTC: { pair: 'BTC/USD', address: '0x2779D32d5166BAaa2b2b658333bA7F3Ec0C65743' },
  },
  arbitrum: {
    ETH: { pair: 'ETH/USD', address: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612' },
    BTC: { pair: 'BTC/USD', address: '0x6ce185860a4963106506C203335A2910413708e9' },
    AAVE: { pair: 'AAVE/USD', address: '0xaD1d5344AaDE45F43E596773Bcc4c423EAbdD034' },
  },
  optimism: {
    ETH: { pair: 'ETH/USD', address: '0x13e3Ee699D1909E989722E753853AE30b17e08c5' },
    BTC: { pair: 'BTC/USD', address: '0xD702DD976Fb76FFFC2D3963D037dfDae5b04E593' },
  },
  base: {
    ETH: { pair: 'ETH/USD', address: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70' },
  },
} as const;

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function getChainConfig(chainId: unknown) {
  const id = chainId == null ? 1 : Number(chainId);
  if (!Number.isInteger(id) || !CHAIN_BY_ID[id]) return null;
  return CHAIN_BY_ID[id];
}

function getClient(chainId: unknown) {
  const config = getChainConfig(chainId);
  if (!config) return null;
  return getPublicClient(config.id);
}

async function readFeed(feedAddress: `0x${string}`, chainId: number) {
  const client = getClient(chainId);
  if (!client) throw new Error(`Unsupported chain_id "${chainId}"`);

  const [decimals, round] = await Promise.all([
    client.readContract({ address: feedAddress, abi: AGGREGATOR_V3_ABI, functionName: 'decimals' }),
    client.readContract({ address: feedAddress, abi: AGGREGATOR_V3_ABI, functionName: 'latestRoundData' }),
  ]);

  const [roundId, answer, startedAt, updatedAt, answeredInRound] = round;
  return {
    feed_address: feedAddress,
    chain_id: chainId,
    round_id: roundId.toString(),
    answer: answer.toString(),
    decimals,
    price: formatUnits(answer, decimals),
    started_at: startedAt.toString(),
    updated_at: updatedAt.toString(),
    answered_in_round: answeredInRound.toString(),
  };
}

function actionGetProtocolInfo(): SkillExecutionResult {
  return {
    success: true,
    output: {
      protocol: 'Chainlink Data Feeds',
      overview:
        'Chainlink Data Feeds are decentralized oracle networks that publish aggregated market data on-chain for smart contracts.',
      supported_chains: Object.keys(CHAIN_CONFIG),
      feed_interface: {
        latestRoundData:
          'latestRoundData() returns (roundId, answer, startedAt, updatedAt, answeredInRound)',
        decimals: 'Use decimals() to scale answer into a human-readable price.',
      },
      notes: [
        'USD feeds commonly use 8 decimals, but consumers should always read decimals() from the feed.',
        'Feeds are network-specific contracts; the same pair uses different addresses on different chains.',
      ],
    },
  };
}

async function actionGetPrice(input: any): Promise<SkillExecutionResult> {
  const feedAddress = input.feed_address;
  if (!isAddress(feedAddress)) return { success: false, error: 'feed_address must be a valid 0x address' };
  const config = getChainConfig(input.chain_id);
  if (!config) return { success: false, error: 'chain_id must be one of: 1, 10, 56, 137, 8453, 42161, 43114' };
  return { success: true, output: await readFeed(feedAddress, config.id) };
}

async function actionGetFeedBySymbol(input: any): Promise<SkillExecutionResult> {
  const symbol = typeof input.symbol === 'string' ? input.symbol.toUpperCase() : '';
  if (!symbol) return { success: false, error: 'symbol is required' };

  const chain = (input.chain ?? 'ethereum') as SupportedChain;
  if (!(chain in FEEDS)) {
    return { success: false, error: 'chain must be one of: ethereum, polygon, bsc, avalanche, arbitrum, optimism, base' };
  }

  const feedsForChain = FEEDS[chain] as Record<string, { pair: string; address: `0x${string}` }>;
  const feed = feedsForChain[symbol];
  if (!feed) return { success: false, error: `No built-in ${symbol} feed for ${chain}` };

  const chainId = CHAIN_CONFIG[chain].id;
  return {
    success: true,
    output: {
      symbol,
      chain,
      pair: feed.pair,
      ...(await readFeed(feed.address, chainId)),
    },
  };
}

function actionListFeeds(): SkillExecutionResult {
  return {
    success: true,
    output: {
      feeds: FEEDS,
      chains: Object.fromEntries(Object.entries(CHAIN_CONFIG).map(([name, config]) => [name, config.id])),
    },
  };
}

export async function executeChainlinkSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':
        return actionGetProtocolInfo();
      case 'get_price':
        return await actionGetPrice(input);
      case 'get_feed_by_symbol':
        return await actionGetFeedBySymbol(input);
      case 'list_feeds':
        return actionListFeeds();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_price, get_feed_by_symbol, list_feeds`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Chainlink skill error' };
  }
}
