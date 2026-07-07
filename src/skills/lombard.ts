import { createPublicClient, formatUnits, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const LOMBARD_SKILL_METADATA = {
  name: 'Lombard Finance',
  description:
    '[ARSENAL-HOSTED ✓] Lombard Finance read-only adapter for LBTC on Ethereum mainnet. ' +
    'Returns protocol information, the LBTC/BTC exchange rate, LBTC supply and TVL stats, ' +
    'and per-address LBTC balances.',
  category: 'BTC DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['lombard', 'lbtc', 'btc', 'bitcoin', 'liquid-staking', 'babylon', 'defi'],
  logo_url: 'https://icons.llamao.fi/icons/protocols/lombard?w=48&h=48',
  external_url: 'https://lombard.finance',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_exchange_rate', 'get_lbtc_stats', 'get_lbtc_balance'],
        description:
          'get_protocol_info: Lombard and LBTC overview. ' +
          'get_exchange_rate: current LBTC/BTC rate (1 LBTC = X BTC). ' +
          'get_lbtc_stats: LBTC supply, BTC-denominated TVL, USD TVL, and estimated 14-day trailing APY. ' +
          'get_lbtc_balance: LBTC balance for an Ethereum address.',
      },
      address: { type: 'string', description: 'Ethereum address for get_lbtc_balance (0x...).' },
    },
  },
  usage_examples: [
    { title: 'Protocol overview', input: { action: 'get_protocol_info' } },
    { title: 'LBTC exchange rate', input: { action: 'get_exchange_rate' } },
    { title: 'LBTC stats', input: { action: 'get_lbtc_stats' } },
    { title: 'LBTC balance', input: { action: 'get_lbtc_balance', address: '0xYourAddress' } },
  ],
};

const LBTC = '0x8236a87084f8b84306f72007f36f2618a5634494' as `0x${string}`;
const LBTC_BTC_ORACLE = '0x5c29868c58b6e15e2b962943278969ab6a7d3212' as `0x${string}`;
const BTC_USD_ORACLE = '0xf4030086522a5beea4988f8ca5b36dbc97bee88c' as `0x${string}`;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const TRAILING_WINDOW_SECONDS = 14 * 24 * 60 * 60;

const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]);

const AGGREGATOR_V3_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)',
  'function getRoundData(uint80 _roundId) view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)',
]);

const SUPPORTED_CHAINS = [
  'Ethereum',
  'Base',
  'Arbitrum',
  'BNB Chain',
  'Sonic',
  'Sui',
  'Monad',
  'MegaETH',
  'Stable',
  'Katana',
  'Ink',
  'Solana',
  'Berachain',
  'Scroll',
  'Mantle',
  'Linea',
  'Mode',
  'Starknet',
  'Cosmos Hub',
  'Babylon Genesis',
];

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function normalizeAnswer(answer: bigint, decimals: number): number {
  return Number(formatUnits(answer, decimals));
}

async function readPrice(
  client: ReturnType<typeof getClient>,
  oracle: `0x${string}`,
): Promise<{ value: number; updated_at: number; round_id: bigint; decimals: number }> {
  const [decimals, round] = await Promise.all([
    client.readContract({ address: oracle, abi: AGGREGATOR_V3_ABI, functionName: 'decimals' }),
    client.readContract({ address: oracle, abi: AGGREGATOR_V3_ABI, functionName: 'latestRoundData' }),
  ]);
  const [, answer, , updatedAt] = round;
  return {
    value: normalizeAnswer(answer, Number(decimals)),
    updated_at: Number(updatedAt),
    round_id: round[0],
    decimals: Number(decimals),
  };
}

async function findHistoricalLbtcRate(
  client: ReturnType<typeof getClient>,
  latestRoundId: bigint,
  cutoffTimestamp: number,
  decimals: number,
): Promise<{ value: number; updated_at: number } | null> {
  for (let offset = 1n; offset <= 64n && latestRoundId > offset; offset += 1n) {
    try {
      const round = await client.readContract({
        address: LBTC_BTC_ORACLE,
        abi: AGGREGATOR_V3_ABI,
        functionName: 'getRoundData',
        args: [latestRoundId - offset],
      });
      const [, answer, , updatedAt] = round;
      const updatedAtNumber = Number(updatedAt);
      if (updatedAtNumber <= cutoffTimestamp) {
        return {
          value: normalizeAnswer(answer, decimals),
          updated_at: updatedAtNumber,
        };
      }
    } catch {
      // Some Chainlink feeds can have missing rounds; continue walking backward.
    }
  }
  return null;
}

function annualizeRateChange(current: number, previous: number, elapsedSeconds: number): number | null {
  if (current <= 0 || previous <= 0 || elapsedSeconds <= 0) return null;
  return (Math.pow(current / previous, SECONDS_PER_YEAR / elapsedSeconds) - 1) * 100;
}

export async function executeLombardSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    const c = getClient();

    switch (action) {
      case 'get_protocol_info': {
        const [name, symbol, decimals] = await Promise.all([
          c.readContract({ address: LBTC, abi: ERC20_ABI, functionName: 'name' }),
          c.readContract({ address: LBTC, abi: ERC20_ABI, functionName: 'symbol' }),
          c.readContract({ address: LBTC, abi: ERC20_ABI, functionName: 'decimals' }),
        ]);
        return {
          success: true,
          output: {
            protocol: 'Lombard Finance',
            overview:
              'Lombard Finance mints LBTC against native BTC deposited into Babylon-backed staking. ' +
              'LBTC is a yield-bearing Bitcoin token whose BTC redemption value increases as rewards accrue.',
            token: {
              name,
              symbol,
              address: LBTC,
              chain: 'Ethereum',
              chain_id: 1,
              decimals: Number(decimals),
              backing: 'Native BTC',
              yield_source: 'Babylon staking rewards',
            },
            supported_chains: SUPPORTED_CHAINS,
          },
        };
      }

      case 'get_exchange_rate': {
        const rate = await readPrice(c, LBTC_BTC_ORACLE);
        return {
          success: true,
          output: {
            lbtc_per_btc: rate.value === 0 ? null : 1 / rate.value,
            btc_per_lbtc: rate.value,
            updated_at: rate.updated_at,
            source: 'Chainlink LBTC/BTC oracle',
            oracle: LBTC_BTC_ORACLE,
          },
        };
      }

      case 'get_lbtc_stats': {
        const [tokenDecimals, totalSupplyRaw, lbtcRate, btcUsd] = await Promise.all([
          c.readContract({ address: LBTC, abi: ERC20_ABI, functionName: 'decimals' }),
          c.readContract({ address: LBTC, abi: ERC20_ABI, functionName: 'totalSupply' }),
          readPrice(c, LBTC_BTC_ORACLE),
          readPrice(c, BTC_USD_ORACLE),
        ]);
        const totalSupply = Number(formatUnits(totalSupplyRaw, Number(tokenDecimals)));
        const tvlBtc = totalSupply * lbtcRate.value;
        const tvlUsd = tvlBtc * btcUsd.value;
        const historical = await findHistoricalLbtcRate(
          c,
          lbtcRate.round_id,
          lbtcRate.updated_at - TRAILING_WINDOW_SECONDS,
          lbtcRate.decimals,
        );
        const trailingApy = historical
          ? annualizeRateChange(lbtcRate.value, historical.value, lbtcRate.updated_at - historical.updated_at)
          : null;

        return {
          success: true,
          output: {
            total_supply_raw: totalSupplyRaw.toString(),
            total_supply_lbtc: totalSupply,
            tvl_btc: tvlBtc,
            tvl_usd: tvlUsd,
            apy_14d_trailing_percent: trailingApy,
            exchange_rate_btc_per_lbtc: lbtcRate.value,
            updated_at: lbtcRate.updated_at,
            sources: {
              total_supply: 'LBTC ERC-20 totalSupply()',
              exchange_rate: 'Chainlink LBTC/BTC oracle',
              btc_usd: 'Chainlink BTC/USD oracle',
              apy: historical ? 'Derived from LBTC/BTC oracle history' : null,
            },
          },
        };
      }

      case 'get_lbtc_balance': {
        if (!isAddress(input.address)) return { success: false, error: 'address must be a valid 0x address' };
        const [decimals, balanceRaw] = await Promise.all([
          c.readContract({ address: LBTC, abi: ERC20_ABI, functionName: 'decimals' }),
          c.readContract({ address: LBTC, abi: ERC20_ABI, functionName: 'balanceOf', args: [input.address] }),
        ]);
        return {
          success: true,
          output: {
            address: input.address,
            token: LBTC,
            balance_raw: balanceRaw.toString(),
            balance_lbtc: formatUnits(balanceRaw, Number(decimals)),
          },
        };
      }

      default:
        return {
          success: false,
          error:
            `Unknown action "${action}". Available: ` +
            'get_protocol_info, get_exchange_rate, get_lbtc_stats, get_lbtc_balance',
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Lombard skill error' };
  }
}
