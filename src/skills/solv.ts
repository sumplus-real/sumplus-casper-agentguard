/**
 * Solv Protocol — Multi-chain BTC Yield & Liquidity
 *
 * Solv Protocol lets users deposit BTC or WBTC to receive SolvBTC,
 * a multi-chain BTC-backed liquid token. SolvBTC can then be deployed
 * into yield strategies:
 *   - SolvBTC.BBN: staked in Babylon for BTC staking rewards
 *   - SolvBTC.ENA: deployed into Ethena's yield strategy
 *
 * This skill provides read-only data actions:
 *   - get_protocol_info    — overview of Solv products and supported chains
 *   - get_solvbtc_stats    — total supply, TVL, and strategy APYs via DefiLlama
 *   - get_solvbtc_balance  — on-chain ERC-20 balance check across chains
 *   - get_strategies       — list SolvBTC strategies with APYs
 *
 * Data sources:
 *   - DefiLlama API: TVL, yield pool APYs (no key required)
 *   - Alchemy RPC: on-chain ERC-20 balanceOf reads
 *   - On-chain ERC-20 totalSupply reads via public RPC
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet, bsc, arbitrum } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

// ─── Contract addresses ───────────────────────────────────────────────────────

/**
 * SolvBTC contract addresses per chain (8 decimals, mirrors BTC).
 * Source: Solv Protocol docs & on-chain verification.
 */
const SOLVBTC_ADDRESSES: Record<string, `0x${string}`> = {
  ethereum:  '0x7A56E1C57C7475CCf742a1832B028F0456652F97',
  bsc:       '0x4aae823a6a0b376De6A78e74eCC5b079d38cBCf7',
  arbitrum:  '0x3647c54c4c2C65bC7a2D63c0Da2809B399DBBDC0',
};

/**
 * SolvBTC.BBN (Babylon staking) addresses per chain (8 decimals).
 */
const SOLVBTC_BBN_ADDRESSES: Record<string, `0x${string}`> = {
  ethereum:  '0xd9D920AA40f578ab794426F5C90F6C731D159DEf',
  bsc:       '0x1346b618dC92810EC74163e4c27004c921D446a5',
  arbitrum:  '0x346c574C56e1A4aAa8dc88Cda8F7eb12b39947aB',
};

/**
 * SolvBTC.ENA (Ethena strategy) address — Ethereum mainnet only (8 decimals).
 */
const SOLVBTC_ENA_ADDRESSES: Record<string, `0x${string}`> = {
  ethereum:  '0x309627af60F0926daa6041B8279484312f2bf060',
};

const SOLVBTC_DECIMALS = 8;

// ─── Chain helpers ────────────────────────────────────────────────────────────

const SUPPORTED_CHAINS = ['ethereum', 'bsc', 'arbitrum'] as const;
type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

const CHAIN_IDS: Record<SupportedChain, number> = {
  ethereum: 1,
  bsc:      56,
  arbitrum: 42161,
};

const ALCHEMY_URLS: Record<SupportedChain, string> = {
  ethereum: 'https://eth-mainnet.g.alchemy.com/v2',
  bsc:      'https://bnb-mainnet.g.alchemy.com/v2',
  arbitrum: 'https://arb-mainnet.g.alchemy.com/v2',
};

/** Fallback public RPCs when Alchemy key is unavailable (rate-limited). */
const PUBLIC_RPC_URLS: Record<SupportedChain, string> = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  bsc:      'https://bsc-dataseed.binance.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
};

const VIEM_CHAINS: Record<SupportedChain, typeof mainnet | typeof bsc | typeof arbitrum> = {
  ethereum: mainnet,
  bsc,
  arbitrum,
};

function getRpcUrl(chain: SupportedChain): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (key) return `${ALCHEMY_URLS[chain]}/${key}`;
  return PUBLIC_RPC_URLS[chain];
}

function getClient(chain: SupportedChain) {
  return createPublicClient({
    chain: VIEM_CHAINS[chain],
    transport: http(getRpcUrl(chain)),
  });
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

// ─── Utility helpers ──────────────────────────────────────────────────────────

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function isSupportedChain(v: unknown): v is SupportedChain {
  return typeof v === 'string' && (SUPPORTED_CHAINS as readonly string[]).includes(v);
}

/**
 * Convert raw 8-decimal BTC units to a human-readable BTC string.
 */
function formatBtc(raw: bigint): string {
  const whole = raw / 100_000_000n;
  const frac  = raw % 100_000_000n;
  return `${whole}.${frac.toString().padStart(8, '0')}`;
}

async function llamaFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`https://api.llama.fi${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DefiLlama API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function yieldsLlamaFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`https://yields.llama.fi${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DefiLlama Yields API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Action: get_protocol_info ────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Solv Protocol',
      tagline: 'Multi-chain BTC yield and liquidity layer',
      website: 'https://solv.finance',
      app: 'https://app.solv.finance',
      description: [
        'Solv Protocol is a multi-chain BTC yield and liquidity infrastructure.',
        'Users deposit BTC or WBTC to mint SolvBTC — a fully-backed, liquid BTC token',
        'that can be transferred and used across DeFi protocols.',
        'SolvBTC can further be deployed into yield strategies to earn passive income.',
      ].join(' '),
      products: {
        SolvBTC: {
          description: 'Core liquid BTC token. 1 SolvBTC = 1 BTC, redeemable at any time.',
          decimals: 8,
          supported_chains: ['Ethereum', 'BNB Chain', 'Arbitrum'],
          contract_addresses: {
            ethereum: SOLVBTC_ADDRESSES.ethereum,
            bsc:      SOLVBTC_ADDRESSES.bsc,
            arbitrum: SOLVBTC_ADDRESSES.arbitrum,
          },
        },
        'SolvBTC.BBN': {
          description: 'SolvBTC staked in Babylon Protocol to earn BTC staking rewards. Earns native BTC yield via Babylon\'s PoS security model.',
          decimals: 8,
          supported_chains: ['Ethereum', 'BNB Chain', 'Arbitrum'],
          contract_addresses: {
            ethereum: SOLVBTC_BBN_ADDRESSES.ethereum,
            bsc:      SOLVBTC_BBN_ADDRESSES.bsc,
            arbitrum: SOLVBTC_BBN_ADDRESSES.arbitrum,
          },
        },
        'SolvBTC.ENA': {
          description: 'SolvBTC deployed into Ethena\'s yield strategy (delta-neutral BTC positions). Earns funding rate yield.',
          decimals: 8,
          supported_chains: ['Ethereum'],
          contract_addresses: {
            ethereum: SOLVBTC_ENA_ADDRESSES.ethereum,
          },
        },
      },
      flow: [
        '1. Deposit WBTC or native BTC → receive SolvBTC (1:1 backed)',
        '2. Hold SolvBTC as liquid BTC across chains, or',
        '3. Stake SolvBTC → receive SolvBTC.BBN (Babylon rewards), or',
        '4. Deploy SolvBTC → receive SolvBTC.ENA (Ethena funding yield)',
      ],
      available_actions: [
        'get_protocol_info — this overview',
        'get_solvbtc_stats — total SolvBTC supply, TVL, and strategy APYs',
        'get_solvbtc_balance — SolvBTC/SolvBTC.BBN/SolvBTC.ENA balance for an address',
        'get_strategies — list available yield strategies with current APYs',
      ],
    },
  };
}

// ─── Action: get_solvbtc_stats ────────────────────────────────────────────────

async function actionGetSolvbtcStats(): Promise<SkillExecutionResult> {
  // Fetch protocol TVL from DefiLlama
  const [protocolData, yieldsData] = await Promise.allSettled([
    llamaFetch<any>('/protocol/solv-protocol'),
    yieldsLlamaFetch<{ data: any[] }>('/pools'),
  ]);

  // Parse TVL
  let tvl: number | null = null;
  let chainTvls: Record<string, number> | null = null;
  let tvlError: string | null = null;

  if (protocolData.status === 'fulfilled') {
    const p = protocolData.value;
    tvl = typeof p.tvl === 'number' ? p.tvl : null;
    chainTvls = p.chainTvls
      ? Object.fromEntries(
          Object.entries(p.chainTvls as Record<string, any>).map(([k, v]) => [
            k,
            typeof v === 'number' ? v : (v as any)?.tvl ?? 0,
          ])
        )
      : null;
  } else {
    tvlError = (protocolData.reason as Error)?.message ?? 'TVL fetch failed';
  }

  // Parse yield pools — filter for Solv Protocol entries
  let strategies: any[] = [];
  let yieldsError: string | null = null;

  if (yieldsData.status === 'fulfilled') {
    const pools: any[] = yieldsData.value.data ?? [];
    strategies = pools
      .filter((p) => {
        const proj = String(p.project ?? '').toLowerCase();
        const sym  = String(p.symbol ?? '').toLowerCase();
        return proj.includes('solv') || sym.includes('solvbtc');
      })
      .map((p) => ({
        pool:       p.pool,
        symbol:     p.symbol,
        chain:      p.chain,
        project:    p.project,
        apy:        p.apy,
        apy_base:   p.apyBase,
        apy_reward: p.apyReward,
        tvl_usd:    p.tvlUsd,
        il_risk:    p.ilRisk,
      }))
      .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
  } else {
    yieldsError = (yieldsData.reason as Error)?.message ?? 'Yields fetch failed';
  }

  // On-chain total supply reads for SolvBTC across chains (best-effort)
  const supplyResults: Record<string, string | null> = {};
  await Promise.all(
    (SUPPORTED_CHAINS as readonly SupportedChain[]).map(async (chain) => {
      try {
        const client = getClient(chain);
        const supply = await client.readContract({
          address: SOLVBTC_ADDRESSES[chain],
          abi: ERC20_ABI,
          functionName: 'totalSupply',
        });
        supplyResults[chain] = formatBtc(supply) + ' SolvBTC';
      } catch {
        supplyResults[chain] = null;
      }
    })
  );

  const totalSupplyKnown = Object.values(supplyResults).filter(Boolean).length > 0;

  return {
    success: true,
    output: {
      protocol: 'Solv Protocol',
      tvl_usd: tvl,
      tvl_formatted: tvl != null
        ? tvl >= 1e9
          ? `$${(tvl / 1e9).toFixed(2)}B`
          : tvl >= 1e6
          ? `$${(tvl / 1e6).toFixed(2)}M`
          : `$${tvl.toFixed(0)}`
        : null,
      tvl_by_chain: chainTvls,
      tvl_error: tvlError,
      solvbtc_supply_by_chain: totalSupplyKnown ? supplyResults : null,
      strategies: strategies.length > 0 ? strategies : null,
      strategies_error: yieldsError,
      data_sources: ['DefiLlama API (TVL, APY)', 'On-chain RPC (totalSupply)'],
      note: strategies.length === 0
        ? 'No strategies found in DefiLlama yields pool list. Use get_strategies for a curated list.'
        : undefined,
    },
  };
}

// ─── Action: get_solvbtc_balance ──────────────────────────────────────────────

async function actionGetSolvbtcBalance(input: any): Promise<SkillExecutionResult> {
  const address: unknown = input.address;
  if (!isAddress(address)) {
    return { success: false, error: 'address is required (0x... EVM address, 40 hex chars)' };
  }

  const chainInput: unknown = input.chain;

  // Single-chain query
  if (chainInput !== undefined && chainInput !== null && chainInput !== '') {
    if (!isSupportedChain(chainInput)) {
      return {
        success: false,
        error: `Unsupported chain "${chainInput}". Supported: ${SUPPORTED_CHAINS.join(', ')}`,
      };
    }
    const result = await readBalancesForChain(address, chainInput);
    return {
      success: true,
      output: {
        address,
        chain: chainInput,
        chain_id: CHAIN_IDS[chainInput],
        balances: result,
        note: 'Balances are 8-decimal BTC amounts.',
      },
    };
  }

  // Multi-chain query (all supported chains in parallel)
  const perChain = await Promise.all(
    (SUPPORTED_CHAINS as readonly SupportedChain[]).map(async (chain) => {
      try {
        const balances = await readBalancesForChain(address, chain);
        return { chain, chain_id: CHAIN_IDS[chain], balances, error: null };
      } catch (e: any) {
        return { chain, chain_id: CHAIN_IDS[chain], balances: null, error: e.message ?? 'RPC error' };
      }
    })
  );

  // Aggregate totals across chains
  let totalSolvBtc   = 0;
  let totalBbn       = 0;
  let totalEna       = 0;

  for (const { balances } of perChain) {
    if (!balances) continue;
    totalSolvBtc += balances.SolvBTC?.human ?? 0;
    totalBbn     += balances['SolvBTC.BBN']?.human ?? 0;
    totalEna     += balances['SolvBTC.ENA']?.human ?? 0;
  }

  return {
    success: true,
    output: {
      address,
      all_chains: perChain,
      totals: {
        SolvBTC:       totalSolvBtc.toFixed(8),
        'SolvBTC.BBN': totalBbn.toFixed(8),
        'SolvBTC.ENA': totalEna.toFixed(8),
        total_btc_equivalent: (totalSolvBtc + totalBbn + totalEna).toFixed(8),
      },
      note: 'SolvBTC.ENA is only available on Ethereum.',
    },
  };
}

/**
 * Read all Solv token balances for a given address on a specific chain.
 */
async function readBalancesForChain(
  address: `0x${string}`,
  chain: SupportedChain
): Promise<Record<string, { raw: string; human: number; contract: string }>> {
  const client = getClient(chain);

  const tokens: Array<{ name: string; contract: `0x${string}` | undefined }> = [
    { name: 'SolvBTC',       contract: SOLVBTC_ADDRESSES[chain] },
    { name: 'SolvBTC.BBN',   contract: SOLVBTC_BBN_ADDRESSES[chain] },
    { name: 'SolvBTC.ENA',   contract: SOLVBTC_ENA_ADDRESSES[chain] },
  ];

  const result: Record<string, { raw: string; human: number; contract: string }> = {};

  await Promise.all(
    tokens.map(async ({ name, contract }) => {
      if (!contract) return; // token not deployed on this chain
      try {
        const raw = await client.readContract({
          address: contract,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        });
        result[name] = {
          raw:      raw.toString(),
          human:    Number(raw) / 10 ** SOLVBTC_DECIMALS,
          contract,
        };
      } catch {
        // silently skip if contract call fails (e.g. contract not yet deployed)
      }
    })
  );

  return result;
}

// ─── Action: get_strategies ───────────────────────────────────────────────────

async function actionGetStrategies(): Promise<SkillExecutionResult> {
  // Fetch live APY data from DefiLlama yields
  let liveApys: Record<string, { apy: number | null; tvl_usd: number | null; pool_id: string }> = {};
  let dataError: string | null = null;

  try {
    const yieldsResp = await yieldsLlamaFetch<{ data: any[] }>('/pools');
    const pools: any[] = yieldsResp.data ?? [];

    for (const p of pools) {
      const sym  = String(p.symbol ?? '').toLowerCase();
      const proj = String(p.project ?? '').toLowerCase();
      if (!proj.includes('solv') && !sym.includes('solvbtc')) continue;

      const symKey = String(p.symbol ?? '').toUpperCase();
      if (!liveApys[symKey] || (p.apy ?? 0) > (liveApys[symKey].apy ?? 0)) {
        liveApys[symKey] = {
          apy:     typeof p.apy === 'number' ? p.apy : null,
          tvl_usd: typeof p.tvlUsd === 'number' ? p.tvlUsd : null,
          pool_id: p.pool ?? '',
        };
      }
    }
  } catch (e: any) {
    dataError = (e as Error)?.message ?? 'Failed to fetch APY data from DefiLlama';
  }

  const strategies = [
    {
      id:          'solvbtc',
      name:        'SolvBTC',
      token:       'SolvBTC',
      description: 'Base liquid BTC token. No additional yield — holds BTC value 1:1. Use as DeFi collateral or liquidity.',
      risk:        'low',
      yield_source: 'None — pure BTC holding',
      lockup:      'None (redeemable anytime)',
      supported_chains: ['Ethereum', 'BNB Chain', 'Arbitrum'],
      contracts: {
        ethereum: SOLVBTC_ADDRESSES.ethereum,
        bsc:      SOLVBTC_ADDRESSES.bsc,
        arbitrum: SOLVBTC_ADDRESSES.arbitrum,
      },
      apy: liveApys['SOLVBTC']?.apy ?? 0,
      tvl_usd: liveApys['SOLVBTC']?.tvl_usd ?? null,
      defillama_pool: liveApys['SOLVBTC']?.pool_id ?? null,
    },
    {
      id:          'solvbtc-bbn',
      name:        'SolvBTC.BBN',
      token:       'SolvBTC.BBN',
      description: 'SolvBTC staked in Babylon Protocol — earns native BTC staking rewards by securing Proof-of-Stake chains with Bitcoin economic security.',
      risk:        'low-medium',
      yield_source: 'Babylon BTC staking rewards (PoS chain security)',
      lockup:      'Subject to Babylon unbonding period',
      supported_chains: ['Ethereum', 'BNB Chain', 'Arbitrum'],
      contracts: {
        ethereum: SOLVBTC_BBN_ADDRESSES.ethereum,
        bsc:      SOLVBTC_BBN_ADDRESSES.bsc,
        arbitrum: SOLVBTC_BBN_ADDRESSES.arbitrum,
      },
      apy: liveApys['SOLVBTC.BBN']?.apy ?? null,
      tvl_usd: liveApys['SOLVBTC.BBN']?.tvl_usd ?? null,
      defillama_pool: liveApys['SOLVBTC.BBN']?.pool_id ?? null,
    },
    {
      id:          'solvbtc-ena',
      name:        'SolvBTC.ENA',
      token:       'SolvBTC.ENA',
      description: 'SolvBTC deployed in Ethena\'s delta-neutral BTC yield strategy. Earns BTC perpetual funding rates through a hedged position.',
      risk:        'medium',
      yield_source: 'Ethena delta-neutral funding rate (BTC perp shorts)',
      lockup:      'Subject to Ethena cooldown period',
      supported_chains: ['Ethereum'],
      contracts: {
        ethereum: SOLVBTC_ENA_ADDRESSES.ethereum,
      },
      apy: liveApys['SOLVBTC.ENA']?.apy ?? null,
      tvl_usd: liveApys['SOLVBTC.ENA']?.tvl_usd ?? null,
      defillama_pool: liveApys['SOLVBTC.ENA']?.pool_id ?? null,
    },
  ];

  return {
    success: true,
    output: {
      protocol: 'Solv Protocol',
      strategies,
      strategy_count: strategies.length,
      apy_data_source: dataError ? null : 'DefiLlama Yields API',
      apy_data_error: dataError,
      note: dataError
        ? 'Live APY data unavailable. APY fields may be null. Check https://app.solv.finance for current yields.'
        : 'APYs are sourced from DefiLlama and may lag real-time values by up to 1 hour.',
      last_checked: new Date().toISOString(),
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const SOLV_SKILL_METADATA = {
  name: 'Solv Protocol',
  description:
    'Multi-chain BTC yield protocol. Deposit BTC/WBTC to receive SolvBTC, ' +
    'then deploy into strategies like Babylon staking (SolvBTC.BBN) or Ethena (SolvBTC.ENA) to earn yield.',
  category: 'BTC DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['solv', 'solvbtc', 'btc', 'bitcoin', 'yield', 'babylon', 'defi', 'multi-chain'],
  external_url: 'https://solv.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/solv-protocol?w=48&h=48',
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
          'get_solvbtc_stats',
          'get_solvbtc_balance',
          'get_strategies',
        ],
        description:
          'get_protocol_info: Overview of Solv Protocol, SolvBTC products, and supported chains. ' +
          'get_solvbtc_stats: Total SolvBTC supply across chains, protocol TVL, and live strategy APYs. ' +
          'get_solvbtc_balance: On-chain SolvBTC/SolvBTC.BBN/SolvBTC.ENA balances for an EVM address (requires address; chain is optional, defaults to all chains). ' +
          'get_strategies: Curated list of SolvBTC yield strategies (BBN, ENA) with current APY and risk profile.',
      },
      address: {
        type: 'string',
        description:
          'EVM wallet address (0x..., 40 hex chars). Required for get_solvbtc_balance.',
      },
      chain: {
        type: 'string',
        enum: ['ethereum', 'bsc', 'arbitrum'],
        description:
          'Chain to query for get_solvbtc_balance. ' +
          'Options: "ethereum", "bsc", "arbitrum". ' +
          'Omit to query all supported chains and return a cross-chain aggregate.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Protocol overview',
      input: { action: 'get_protocol_info' },
    },
    {
      title: 'SolvBTC TVL and APY stats',
      input: { action: 'get_solvbtc_stats' },
    },
    {
      title: 'SolvBTC balance across all chains',
      input: { action: 'get_solvbtc_balance', address: '0xYourAddress' },
    },
    {
      title: 'SolvBTC balance on Arbitrum',
      input: { action: 'get_solvbtc_balance', address: '0xYourAddress', chain: 'arbitrum' },
    },
    {
      title: 'Available yield strategies',
      input: { action: 'get_strategies' },
    },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeSolvSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':    return actionGetProtocolInfo();
      case 'get_solvbtc_stats':    return actionGetSolvbtcStats();
      case 'get_solvbtc_balance':  return actionGetSolvbtcBalance(input);
      case 'get_strategies':       return actionGetStrategies();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_solvbtc_stats, get_solvbtc_balance, get_strategies`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Solv Protocol skill error' };
  }
}
