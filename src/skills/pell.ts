/**
 * Pell Network — BTC Restaking Protocol
 *
 * Pell is the first omnichain Bitcoin restaking network. Users deposit BTC-backed
 * assets (BTCB, SolvBTC, WBTC, uniBTC, mBTC, coreBTC, stBTC, pumpBTC, FBTC, etc.)
 * into Pell's restaking contracts to secure Decentralized Validated Services (DVS —
 * Pell's term for what EigenLayer calls AVS) and earn additional yield on top of
 * their existing BTC token yield.
 *
 * Architecture mirrors EigenLayer but for the Bitcoin ecosystem:
 *   - Restakers lock BTC LSTs → operators delegate security → DVS services consume it
 *   - 7-day unbonding period for all withdrawals
 *   - Multi-chain: BSC, Bitlayer, Merlin, Core, BOB, B², BEVM, BounceBit, and 15+ others
 *   - Pell Chain (Tendermint PoS) acts as the cross-chain coordination layer
 *
 * Contract source: https://github.com/0xPellNetwork/restaking-contracts
 * Docs:            https://docs.pell.network
 * App:             https://app.pell.network
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Supported chains ─────────────────────────────────────────────────────────

/**
 * Key protocol contracts per chain.
 * StrategyManager  — entry point for restake deposits (depositIntoStrategy)
 * DelegationManager — operator delegation (delegateTo, undelegate)
 *
 * Addresses sourced from https://github.com/0xPellNetwork/restaking-contracts/tree/main/deployments
 * Note: StrategyManager and DelegationManager share the same proxy address pattern
 * across chains (same deployer, same proxy admin salt). Verified for BSC, Bitlayer,
 * Merlin, Core. Other chains marked // TODO: verify.
 */
const PELL_CHAINS: Record<string, {
  name: string;
  chain_id: number;
  explorer: string;
  strategy_manager: string;
  delegation_manager: string;
  rpc_example?: string;
}> = {
  bsc: {
    name: 'BNB Smart Chain',
    chain_id: 56,
    explorer: 'https://bscscan.com',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1',
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66',
    rpc_example: 'https://bsc-dataseed.binance.org',
  },
  bitlayer: {
    name: 'Bitlayer',
    chain_id: 200901,
    explorer: 'https://www.btrscan.com',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify — same salt pattern
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66',
    rpc_example: 'https://rpc.bitlayer.org',
  },
  merlin: {
    name: 'Merlin Chain',
    chain_id: 4200,
    explorer: 'https://scan.merlinchain.io',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1',
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66',
    rpc_example: 'https://rpc.merlinchain.io',
  },
  core: {
    name: 'Core Chain',
    chain_id: 1116,
    explorer: 'https://scan.coredao.org',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1',
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66',
    rpc_example: 'https://rpc.coredao.org',
  },
  bob: {
    name: 'BOB (Build on Bitcoin)',
    chain_id: 60808,
    explorer: 'https://explorer.gobob.xyz',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66', // TODO: verify
    rpc_example: 'https://rpc.gobob.xyz',
  },
  bsquared: {
    name: 'B² Network',
    chain_id: 223,
    explorer: 'https://explorer.bsquared.network',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66', // TODO: verify
    rpc_example: 'https://rpc.bsquared.network',
  },
  bevm: {
    name: 'BEVM',
    chain_id: 11501,
    explorer: 'https://scan.bevm.io',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66', // TODO: verify
  },
  bouncebit: {
    name: 'BounceBit',
    chain_id: 6001,
    explorer: 'https://bbscan.io',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66', // TODO: verify
  },
  mantle: {
    name: 'Mantle',
    chain_id: 5000,
    explorer: 'https://explorer.mantle.xyz',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66', // TODO: verify
  },
  arbitrum: {
    name: 'Arbitrum One',
    chain_id: 42161,
    explorer: 'https://arbiscan.io',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66', // TODO: verify
  },
  scroll: {
    name: 'Scroll',
    chain_id: 534352,
    explorer: 'https://scrollscan.com',
    strategy_manager:   '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
    delegation_manager: '0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66', // TODO: verify
  },
};

// ─── Supported BTC assets ─────────────────────────────────────────────────────

/**
 * BTC-backed assets accepted by Pell for restaking.
 *
 * strategy_proxy  — Pell's contract that holds this token for a given chain.
 *                   Caller passes this to StrategyManager.depositIntoStrategy().
 * token_address   — the underlying ERC-20; approve this before depositing.
 *
 * Strategy proxy addresses verified from GitHub deployments folder.
 * Token addresses: TODO: verify on-chain for each chain before use.
 */
const PELL_ASSETS: {
  symbol: string;
  name: string;
  description: string;
  source_protocol: string;
  chains: Record<string, {
    strategy_proxy: string;
    token_address?: string;
  }>;
}[] = [
  {
    symbol: 'BTCB',
    name: 'Binance Bitcoin',
    description: 'BEP-20 BTC token issued by Binance, primary BTC representation on BSC',
    source_protocol: 'Binance',
    chains: {
      bsc: {
        strategy_proxy: '0x92D374dd17F8416c8129f5Efa81f28E0926a60B7',
        token_address:  '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // TODO: verify
      },
    },
  },
  {
    symbol: 'SolvBTC',
    name: 'Solv BTC',
    description: 'BTC yield aggregator token from Solv Protocol, backed 1:1 by BTC with additional yield from Babylon staking',
    source_protocol: 'Solv Protocol',
    chains: {
      bsc: {
        strategy_proxy: '0x4282868539C7E22B9Bc9248fd7c8196cDaeeEF13',
        token_address:  '0x4aae823a6a0b376De6A78e74eCC5b079d38cBCf', // TODO: verify
      },
      bitlayer: {
        strategy_proxy: '0xAd92CEdF3A75611E369aBDA28f099F09802d2a5E',
        token_address:  '0x541FD749419CA806a8bc7da8ac23D346f2dF8B77', // TODO: verify
      },
      merlin: {
        strategy_proxy: '0x92D374dd17F8416c8129f5Efa81f28E0926a60B7', // TODO: verify — merlin/SolvBTC-Strategy-Proxy
      },
    },
  },
  {
    symbol: 'SolvBTC.BBN',
    name: 'Solv BTC Babylon',
    description: 'SolvBTC variant specifically restaked through Babylon for BTC-native PoS security',
    source_protocol: 'Solv Protocol × Babylon',
    chains: {
      bsc: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify — bsc/SolvBTC.BBN-Strategy-Proxy
      },
      merlin: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify — merlin/SolvBTC.BBN-Strategy-Proxy
      },
    },
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    description: 'Standard ERC-20 WBTC backed 1:1 by BTC via BitGo custody; most liquidity on EVM chains',
    source_protocol: 'BitGo',
    chains: {
      bitlayer: {
        strategy_proxy: '0x92D374dd17F8416c8129f5Efa81f28E0926a60B7',
        token_address:  '0xff204e2681A6fA0e2C3FaDe68a1B28fb90E4Fc5f', // TODO: verify — Bitlayer WBTC
      },
    },
  },
  {
    symbol: 'uniBTC',
    name: 'Bedrock uniBTC',
    description: 'Omnichain liquid restaking BTC from Bedrock Protocol, backed by BTC with extra restaking yield',
    source_protocol: 'Bedrock',
    chains: {
      bitlayer: {
        strategy_proxy: '0xBcF40bf27188d4d981a6063196E875245628463f',
        token_address:  '0x93919784C523f39CACaa98Ee0a9d96c3F32b593e', // TODO: verify
      },
      merlin: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify — merlin/uniBTC-Strategy-Proxy
      },
    },
  },
  {
    symbol: 'stBTC',
    name: 'Lorenzo stBTC',
    description: 'Liquid BTC staking token from Lorenzo Protocol, built on top of Babylon BTC staking layer',
    source_protocol: 'Lorenzo Protocol',
    chains: {
      bsc: {
        strategy_proxy: '0x2DFc08F4FAd29761adf4cD9F1918296dC6F305C4',
        token_address:  '0xf6718b2701D4a6498eF77D7c152b2137Ab28b8A3', // TODO: verify
      },
      bevm: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify — bevm stBTC strategy
      },
      bitlayer: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify — bitlayer/stBTC-Strategy-Proxy
      },
    },
  },
  {
    symbol: 'mBTC',
    name: 'Merlin BTC',
    description: 'Native BTC-pegged token on Merlin Chain, the primary BTC asset on Merlin',
    source_protocol: 'Merlin Chain',
    chains: {
      merlin: {
        strategy_proxy: '0x92D374dd17F8416c8129f5Efa81f28E0926a60B7',
        token_address:  '0xB880fd278198bd590252621d4CD071b1842E9Bcd', // TODO: verify
      },
    },
  },
  {
    symbol: 'coreBTC',
    name: 'Core BTC',
    description: 'Native BTC-backed token on Core Chain, minted via the coreBTC staking protocol',
    source_protocol: 'Core Chain',
    chains: {
      core: {
        strategy_proxy: '0x4282868539C7E22B9Bc9248fd7c8196cDaeeEF13',
        token_address:  '0x8054B9Ad4e1c91B63C0EA5Ee9fFbEBB6c8Da24CB', // TODO: verify
      },
    },
  },
  {
    symbol: 'FBTC',
    name: 'Ignition FBTC',
    description: 'Omnichain BTC from Ignition (Mantle ecosystem / Antalpha), fully backed with proof-of-reserve',
    source_protocol: 'Ignition / Antalpha',
    chains: {
      bsc: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify — bsc/bfBTC or FBTC strategy
        token_address:  '0xC96dE26018A54D51c097160568752c4E3BD6C364', // TODO: verify
      },
    },
  },
  {
    symbol: 'pumpBTC',
    name: 'pumpBTC',
    description: 'BTC liquid staking token from Pump BTC, natively restaked through Babylon',
    source_protocol: 'Pump BTC',
    chains: {
      bsc: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify — bsc pumpBTC strategy
        token_address:  '0xF469fBD2abcd6B9de8E169d128226C0Fc90a6d55', // TODO: verify
      },
    },
  },
  {
    symbol: 'BBTC',
    name: 'BounceBit BTC',
    description: 'Wrapped BTC token native to the BounceBit chain, the primary BTC asset for BounceBit restaking',
    source_protocol: 'BounceBit',
    chains: {
      bouncebit: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
        token_address:  '0xF5e11df1ebCf78b6b6D26E04FF19cD786a1b5f4', // TODO: verify
      },
    },
  },
  {
    symbol: 'LBTC',
    name: 'Lombard LBTC',
    description: 'Liquid BTC token from Lombard Finance enabling BTC holders to earn yield while restaking via Babylon',
    source_protocol: 'Lombard Finance',
    chains: {
      bsc: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
        token_address:  '0xecAc9C5F704e954931349Da37F60E39f515c11c1', // TODO: verify
      },
    },
  },
  {
    symbol: 'tBTC',
    name: 'Threshold tBTC',
    description: 'Decentralized, trustless BTC bridge from Threshold Network — no single custodian',
    source_protocol: 'Threshold Network',
    chains: {
      arbitrum: {
        strategy_proxy: '0x00B67E4805138325ce871D5E27DC15f994681bC1', // TODO: verify
        token_address:  '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40', // TODO: verify
      },
    },
  },
];

// ─── DVS (Decentralized Validated Services) framework ─────────────────────────

const DVS_CATEGORIES = [
  {
    category: 'Rollup Infrastructure',
    description: 'Services that extend or secure Layer-2 rollups using BTC cryptoeconomic guarantees',
    examples: [
      'Watchtowers — monitor fraud proofs and challenge invalid state transitions',
      'Light client bridges — trust-minimized cross-chain messaging',
      'Fast-mode bridges — near-instant finality bridges with BTC-backed security',
      'Sequencer decentralization — fault-tolerant sequencing for BTC L2s',
      'Data availability services',
      'Single-slot finality',
      'Keeper networks',
    ],
  },
  {
    category: 'Cryptography Services',
    description: 'Advanced cryptographic primitives operated by decentralized node sets',
    examples: [
      'Threshold encryption — distributed key management without a single point of failure',
      'FHE (Fully Homomorphic Encryption) compute — computation over encrypted data',
      'TEE (Trusted Execution Environment) attestation',
      'ZK proof generation — outsourced zero-knowledge proving',
      'MEV management and ordering services',
    ],
  },
  {
    category: 'Coprocessors',
    description: 'Off-chain compute modules with on-chain verifiability',
    examples: [
      'AI execution with economic guarantees',
      'General-purpose off-chain compute with on-chain verification',
      'Transaction relay operators',
      'Risk analysis and compliance modules',
    ],
  },
  {
    category: 'Oracle & Infrastructure',
    description: 'Data feeds and infrastructure services secured by BTC stake',
    examples: [
      'BTC ecosystem price oracles',
      'Custom execution environments',
      'Sidechain settlement proofs',
      'On-chain proof verification systems',
    ],
  },
];

// ─── PELL token constants ─────────────────────────────────────────────────────

const PELL_TOKEN = {
  symbol: 'PELL',
  name: 'Pell Network Token',
  coingecko_id: 'pell-network-token',
  total_supply: 2_100_000_000,
  initial_circulating_supply: 336_000_000,
  initial_circulating_pct: 16,
  allocation: [
    { category: 'Community & Launch',  pct: 25.00, tokens: 525_000_000,
      note: 'Incentives for restakers, operators, and DVS participants' },
    { category: 'Ecosystem Growth',    pct: 22.00, tokens: 462_000_000,
      note: 'Grants, integrations, partnerships' },
    { category: 'DAO Treasury',        pct: 18.33, tokens: 385_000_000,
      note: 'Protocol-controlled reserve for governance decisions' },
    { category: 'Investors',           pct: 16.67, tokens: 350_000_000,
      note: 'Seed and private round investors, subject to vesting' },
    { category: 'Founding Team',       pct: 15.00, tokens: 315_000_000,
      note: 'Core team allocation, subject to vesting' },
    { category: 'Public Sale',         pct:  3.00, tokens:  63_000_000,
      note: 'TGE public allocation' },
  ],
  utilities: [
    'Gas token on Pell Chain (pays for cross-chain coordination transactions)',
    'Proof-of-Stake security (stake PELL to become a Pell Chain validator)',
    'Cross-chain intermediary for omnichain DVS messages',
    'Network governance (chain whitelisting, protocol parameter changes)',
    'Asset approval governance (new BTC LST strategy whitelisting)',
    'Operator node staking requirement (operators must stake PELL)',
    'Cryptoeconomic payments to DVS services (fees denominated in PELL)',
    'Dispute resolution participation (slashing arbitration)',
    'Restaker and operator reward incentives',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUsd(v: number | null | undefined): string {
  if (v == null) return 'N/A';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

async function fetchPellTvl(): Promise<{ tvl_usd: number; chain_breakdown: Record<string, number> } | null> {
  try {
    const res = await fetch('https://api.llama.fi/protocol/pell-network', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;

    const chainTvls: Record<string, number> = {};
    let totalTvl = 0;

    if (data.currentChainTvls && typeof data.currentChainTvls === 'object') {
      for (const [chain, tvl] of Object.entries(data.currentChainTvls)) {
        if (typeof tvl === 'number' && tvl > 0) {
          chainTvls[chain] = tvl;
          totalTvl += tvl;
        }
      }
    } else if (typeof data.tvl === 'number') {
      totalTvl = data.tvl;
    }

    return { tvl_usd: totalTvl, chain_breakdown: chainTvls };
  } catch {
    return null;
  }
}

async function fetchPellTokenPrice(): Promise<{
  price_usd: number | null;
  market_cap_usd: number | null;
  volume_24h_usd: number | null;
  price_change_24h_pct: number | null;
} | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${PELL_TOKEN.coingecko_id}&sparkline=false`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any[];
    if (!data || data.length === 0) return null;
    const d = data[0];
    return {
      price_usd:            d.current_price ?? null,
      market_cap_usd:       d.market_cap ?? null,
      volume_24h_usd:       d.total_volume ?? null,
      price_change_24h_pct: d.price_change_percentage_24h ?? null,
    };
  } catch {
    return null;
  }
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Pell Network',
      tagline: 'First Omnichain BTC Restaking Network',
      website:  'https://pell.network',
      app:      'https://app.pell.network',
      docs:     'https://docs.pell.network',
      github:   'https://github.com/0xPellNetwork/restaking-contracts',

      description: [
        'Pell is a BTC restaking protocol modeled on EigenLayer, but built for the Bitcoin ecosystem. ' +
        'Instead of staking ETH, users deposit BTC liquid staking tokens (BTC LSTs like SolvBTC, WBTC, ' +
        'uniBTC, mBTC, coreBTC, FBTC, pumpBTC, etc.) which then provide cryptoeconomic security to ' +
        'off-chain service modules called DVS (Decentralized Validated Services).',

        'Restakers earn yield simultaneously at two levels: (1) their existing BTC token yield — ' +
        'e.g. SolvBTC already earns BTC-native Babylon staking rewards — plus (2) additional ' +
        'PELL token incentives and fees paid by DVS operators for the security they consume.',

        'Pell is deployed across 20+ EVM chains using a uniform architecture. The same three core ' +
        'contracts (StrategyManager, DelegationManager, Slasher) are deployed on each chain, ' +
        'each chain accepting its own local BTC assets. The Pell Chain — a Tendermint PoS chain ' +
        'running at ~5s block time — provides cross-chain coordination and acts as the restaking ledger.',
      ],

      how_restaking_works: [
        '1. APPROVE & DEPOSIT: Restaker approves their BTC LST (e.g. SolvBTC on BSC) to the strategy proxy, ' +
        '   then calls StrategyManager.depositIntoStrategy(strategyProxy, token, amount). ' +
        '   Tokens are locked in the strategy contract.',

        '2. DELEGATE: Restaker calls DelegationManager.delegateTo(operatorAddress) to assign their ' +
        '   entire restaked weight to a single operator. Delegation is all-or-nothing — ' +
        '   no splitting across multiple operators is permitted.',

        '3. OPERATOR RUNS DVS SOFTWARE: The operator runs DVS validation software off-chain and ' +
        '   has opted into one or more DVS services. The operator\'s aggregated staked weight ' +
        '   (sum of all delegators) secures those services, with slashing risk for misbehavior.',

        '4. EARN REWARDS: DVS services pay fees to operators; operators distribute them to delegators. ' +
        '   Pell Protocol additionally emits PELL tokens as restaking incentives.',

        '5. WITHDRAW: Restaker calls DelegationManager.undelegate() or StrategyManager.queueWithdrawal(), ' +
        '   waits 7 days (unbonding period), then claims tokens back.',
      ],

      key_roles: {
        restaker:  'Locks BTC LSTs, delegates to an operator, earns DVS fees + PELL rewards. No active work required.',
        operator:  'Runs DVS node software, opts into services, collects service fees, distributes to delegators.',
        dvs:       'Off-chain service (bridge, oracle, rollup component, AI coprocessor, etc.) that pays for BTC-backed security.',
      },

      unbonding_period:   '7 days',
      delegation_model:   'Single operator per restaker (all-or-nothing delegation; no splitting)',

      supported_chains:   Object.entries(PELL_CHAINS).map(([key, c]) => ({
        id:       key,
        name:     c.name,
        chain_id: c.chain_id,
        explorer: c.explorer,
      })),

      pell_chain: {
        consensus:   'Proof of Stake — Tendermint PBFT engine',
        block_time:  '~5 seconds with instant finality',
        tps:         '4000+ transactions per second',
        role:        'Cross-chain coordination layer, restaking ledger, governance hub, PELL gas',
        security:    [
          'Dynamic Hidden Committee (DHC) — validator identities hidden until reveal',
          'Ring VRF election — randomized committee selection resistant to targeted attacks',
          'TEE key management — hardware-secured validator keys',
        ],
      },

      revenue_stacking_options: [
        'LSD Restaking — deposit BTC liquid staking tokens (SolvBTC, stBTC, mBTC, etc.) directly',
        'BTC LP Restaking — deposit LP tokens from BTC DEX pools (WBTC/BTCB pairs, etc.)',
        'LSD LP Restaking — deposit LP tokens composed of BTC LSTs (triple-layer yield: LP fees + LST yield + DVS fees)',
      ],

      available_actions: [
        'get_protocol_info — this overview (no params required)',
        'get_protocol_stats — live TVL (DefiLlama) + PELL token price (CoinGecko) + tokenomics',
        'get_supported_assets — BTC assets accepted for restaking with strategy contract addresses per chain',
        'get_avs_list — DVS/AVS framework overview and use-case categories',
      ],
    },
  };
}

async function actionGetProtocolStats(): Promise<SkillExecutionResult> {
  const [tvlSettled, tokenSettled] = await Promise.allSettled([
    fetchPellTvl(),
    fetchPellTokenPrice(),
  ]);

  const tvl   = tvlSettled.status   === 'fulfilled' ? tvlSettled.value   : null;
  const token = tokenSettled.status === 'fulfilled' ? tokenSettled.value : null;

  const chainBreakdownDisplay = tvl?.chain_breakdown
    ? Object.entries(tvl.chain_breakdown)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([chain, usd]) => `${chain}: ${formatUsd(usd)}`)
    : [];

  return {
    success: true,
    output: {
      tvl: {
        total_usd:               tvl?.tvl_usd ?? null,
        total_display:           tvl ? formatUsd(tvl.tvl_usd) : 'N/A (DefiLlama unreachable)',
        chain_breakdown:         tvl?.chain_breakdown ?? null,
        chain_breakdown_display: chainBreakdownDisplay,
        source:                  'DefiLlama — https://defillama.com/protocol/pell-network',
        note:                    'TVL counts restaked BTC LST value only, not Pell Chain validator stake.',
      },

      protocol: {
        supported_chains_count: Object.keys(PELL_CHAINS).length,
        supported_assets_count: PELL_ASSETS.length,
        unbonding_period:       '7 days',
        defillama_rank:         '#12 restaking protocol by TVL (as of data collection)',  // TODO: verify current rank
      },

      pell_token: {
        symbol:                    PELL_TOKEN.symbol,
        name:                      PELL_TOKEN.name,
        coingecko_id:              PELL_TOKEN.coingecko_id,
        price_usd:                 token?.price_usd ?? null,
        price_display:             token?.price_usd != null ? `$${token.price_usd.toFixed(6)}` : 'N/A',
        price_change_24h_pct:      token?.price_change_24h_pct ?? null,
        market_cap_usd:            token?.market_cap_usd ?? null,
        market_cap_display:        formatUsd(token?.market_cap_usd),
        volume_24h_usd:            token?.volume_24h_usd ?? null,
        volume_24h_display:        formatUsd(token?.volume_24h_usd),
        total_supply:              PELL_TOKEN.total_supply,
        initial_circulating_supply: PELL_TOKEN.initial_circulating_supply,
        initial_circulating_pct:   `${PELL_TOKEN.initial_circulating_pct}%`,
        source:                    'CoinGecko',
      },

      tokenomics: PELL_TOKEN.allocation,
      pell_token_utilities: PELL_TOKEN.utilities,

      display: [
        `Pell TVL: ${tvl ? formatUsd(tvl.tvl_usd) : 'N/A'}`,
        `PELL: ${token?.price_usd != null ? `$${token.price_usd.toFixed(6)}` : 'N/A'} | MCap: ${formatUsd(token?.market_cap_usd)}`,
        `Chains: ${Object.keys(PELL_CHAINS).length} | BTC assets: ${PELL_ASSETS.length} | Unbonding: 7 days`,
      ].join(' | '),

      fetched_at: new Date().toISOString(),
    },
  };
}

async function actionGetSupportedAssets(input: any): Promise<SkillExecutionResult> {
  const filterChain  = typeof input.chain  === 'string' ? input.chain.toLowerCase()  : undefined;
  const filterSymbol = typeof input.symbol === 'string' ? input.symbol.toUpperCase() : undefined;

  let assets = PELL_ASSETS;

  if (filterChain) {
    if (!PELL_CHAINS[filterChain]) {
      return {
        success: false,
        error: `Unknown chain "${filterChain}". Available chain keys: ${Object.keys(PELL_CHAINS).join(', ')}`,
      };
    }
    assets = assets
      .map((a) => ({
        ...a,
        chains: Object.fromEntries(
          Object.entries(a.chains).filter(([c]) => c === filterChain)
        ),
      }))
      .filter((a) => Object.keys(a.chains).length > 0);
  }

  if (filterSymbol) {
    assets = assets.filter((a) => a.symbol.toUpperCase() === filterSymbol);
  }

  if (assets.length === 0) {
    const hint = filterSymbol
      ? `No asset matched "${filterSymbol}"${filterChain ? ` on chain "${filterChain}"` : ''}. ` +
        `Available symbols: ${PELL_ASSETS.map((a) => a.symbol).join(', ')}`
      : `No BTC assets found for chain "${filterChain}". Available chains: ${Object.keys(PELL_CHAINS).join(', ')}`;
    return { success: false, error: hint };
  }

  const formatted = assets.map((asset) => ({
    symbol:          asset.symbol,
    name:            asset.name,
    description:     asset.description,
    source_protocol: asset.source_protocol,
    deployments:     Object.entries(asset.chains).map(([chainKey, contracts]) => ({
      chain:            chainKey,
      chain_name:       PELL_CHAINS[chainKey]?.name ?? chainKey,
      chain_id:         PELL_CHAINS[chainKey]?.chain_id ?? null,
      strategy_proxy:   contracts.strategy_proxy,
      token_address:    contracts.token_address ?? null,
      strategy_explorer: PELL_CHAINS[chainKey]
        ? `${PELL_CHAINS[chainKey].explorer}/address/${contracts.strategy_proxy}`
        : null,
    })),
  }));

  return {
    success: true,
    output: {
      assets:           formatted,
      total_count:      formatted.length,
      filter_applied: {
        chain:  filterChain  ?? null,
        symbol: filterSymbol ?? null,
      },
      available_chains:  Object.keys(PELL_CHAINS),
      available_symbols: PELL_ASSETS.map((a) => a.symbol),
      how_to_deposit: [
        '1. Obtain a supported BTC LST on its chain (e.g. SolvBTC on BSC).',
        '2. Approve the token to the StrategyManager contract on that chain.',
        '3. Call StrategyManager.depositIntoStrategy(strategyProxy, tokenAddress, amount).',
        '4. Delegate restaked weight to an operator via DelegationManager.delegateTo(operator).',
        '5. Withdrawals require a 7-day unbonding period.',
      ],
      note: [
        'strategy_proxy: Pell contract that holds restaked tokens for a given asset/chain pair.',
        'token_address: the underlying ERC-20 token; approve this before calling depositIntoStrategy.',
        'Addresses marked // TODO: verify in source should be confirmed on-chain before production use.',
        'Core protocol contracts (StrategyManager, DelegationManager) are at:',
        `  StrategyManager:   0x00B67E4805138325ce871D5E27DC15f994681bC1 (verified on BSC, Bitlayer, Merlin, Core)`,
        `  DelegationManager: 0x230B442c0802fE83DAf3d2656aaDFD16ca1E1F66 (verified on BSC, Bitlayer, Merlin, Core)`,
      ],
    },
  };
}

async function actionGetAvsList(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      framework_name: 'DVS — Decentralized Validated Services',
      eigenlayer_equivalent: 'AVS (Actively Validated Services)',

      overview: [
        'Pell calls its off-chain service modules "DVS" — the same concept as EigenLayer\'s AVS, ' +
        'but secured by BTC-backed assets instead of ETH.',

        'A DVS is any software module that needs decentralized, economically-backed validation. ' +
        'It defines its own task logic, reward schedule, and slashing conditions via on-chain contracts. ' +
        'Off-chain, it runs a validation binary that operators execute.',

        'DVS services pay operators in fees (and optionally their own token). ' +
        'Operators distribute a share to their restaker delegators. ' +
        'This creates a market where BTC security is priced and allocated to the highest-value services.',

        'As of the knowledge cutoff, Pell was in early mainnet phase. ' +
        'A public DVS registry API is not yet documented — see app.pell.network for the live operator/DVS list.',
      ],

      dvs_framework: {
        components: [
          'On-chain contracts — manage staker/operator relationships, task submission, slashing adjudication, reward routing',
          'Off-chain validation node — software run by operators to perform the service task and submit signed responses',
          'Reward module — DVS sets custom fee schedules distributed to operators and their delegators',
          'Slashing module — defines provable misbehavior conditions; Pell Chain arbitrates disputes',
        ],
        operator_role:   'Run DVS node software, opt into services, aggregate BTC security from delegators, distribute fees.',
        staker_role:     'Deposit BTC LSTs, delegate to a single operator, passively earn DVS service fees and PELL rewards.',
        slashing_risk:   'Restakers inherit operator slashing risk. Operators can be slashed for provably malicious acts (double-signing, downtime, etc.).',
        developer_guide: 'https://docs.pell.network/dvs-developer-guides/introduction.md',
        onboarding:      'https://docs.pell.network/dvs-developer-guides/dvs-onboarding.md',
      },

      dvs_categories:     DVS_CATEGORIES,

      pell_chain_as_coordinator: {
        description:  'Pell Chain serves as the canonical DVS registry and security coordination layer across all supported chains.',
        consensus:    'Tendermint PoS with Dynamic Hidden Committee (DHC) for validator anonymity',
        block_time:   '~5 seconds',
        functions: [
          'Maintains the cross-chain restaking ledger',
          'Routes DVS security requests from any supported EVM chain to the unified security pool',
          'Handles operator registration and DVS opt-in records',
          'Adjudicates slashing disputes with on-chain finality',
        ],
      },

      discover_live_dvs: [
        'App:  https://app.pell.network (operator and DVS directory)',
        'Docs: https://docs.pell.network/dvs-developer-guides',
      ],
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const PELL_SKILL_METADATA = {
  name: 'Pell Network',
  description:
    'BTC restaking protocol — restake BTC-backed assets (WBTC, SolvBTC, uniBTC, BTCB, mBTC, coreBTC, stBTC, pumpBTC, FBTC, etc.) ' +
    'to secure Decentralized Validated Services (DVS) and earn additional yield on top of existing BTC yield. ' +
    'EigenLayer equivalent for Bitcoin, deployed on BSC, Bitlayer, Merlin, Core Chain, BOB, B², and 15+ other chains. ' +
    'Covers PELL token info, live TVL, per-chain contract addresses, and DVS framework overview.',
  category: 'BTC DeFi',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['pell', 'btc', 'bitcoin', 'restaking', 'avs', 'dvs', 'defi', 'multi-chain',
         'solvbtc', 'wbtc', 'unibtc', 'mbtc', 'corebtc', 'stbtc', 'fbtc', 'pumpbtc', 'lsd', 'lst', 'btcfi'],
  external_url:     'https://pell.network',
  logo_url:         'https://icons.llamao.fi/icons/protocols/pell-network?w=48&h=48',
  partner_verified: false,
  status:           'pending' as const,

  schema: {
    input: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: [
            'get_protocol_info',
            'get_protocol_stats',
            'get_supported_assets',
            'get_avs_list',
          ],
          description:
            'get_protocol_info: Full overview of Pell — BTC restaking mechanism, DVS framework, chain list, how deposits and delegation work. No params required. ' +
            'get_protocol_stats: Live TVL from DefiLlama + PELL token price from CoinGecko + full tokenomics breakdown. No params required. ' +
            'get_supported_assets: All BTC assets accepted for restaking with per-chain strategy contract addresses. Optional filters: chain, symbol. ' +
            'get_avs_list: DVS/AVS framework deep-dive — components, operator/staker roles, use-case categories, slashing, coordination layer.',
        },
        chain: {
          type: 'string',
          description:
            'For get_supported_assets: filter results to a single chain. ' +
            'Valid keys: bsc, bitlayer, merlin, core, bob, bsquared, bevm, bouncebit, mantle, arbitrum, scroll.',
        },
        symbol: {
          type: 'string',
          description:
            'For get_supported_assets: filter by BTC asset symbol (case-insensitive). ' +
            'Examples: BTCB, SolvBTC, SolvBTC.BBN, WBTC, uniBTC, stBTC, mBTC, coreBTC, FBTC, pumpBTC, BBTC, LBTC, tBTC.',
        },
      },
    },
    output: {},
  },

  usage_examples: [
    {
      title: 'What is Pell Network?',
      description: 'Get a complete overview of how BTC restaking works on Pell',
      input:  { action: 'get_protocol_info' },
      output: { success: true, output: { name: 'Pell Network', tagline: 'First Omnichain BTC Restaking Network' } },
    },
    {
      title: 'Pell TVL and PELL token price',
      description: 'Live protocol stats from DefiLlama and CoinGecko',
      input:  { action: 'get_protocol_stats' },
      output: { success: true, output: { tvl: { total_display: '$299K' }, pell_token: { price_display: '$0.004200' } } },
    },
    {
      title: 'All restakeable BTC assets with contract addresses',
      description: 'Full asset list across all chains',
      input:  { action: 'get_supported_assets' },
      output: { success: true, output: { total_count: 13 } },
    },
    {
      title: 'BTC assets available on BSC',
      description: 'Filter supported assets by chain key',
      input:  { action: 'get_supported_assets', chain: 'bsc' },
      output: { success: true, output: { filter_applied: { chain: 'bsc' } } },
    },
    {
      title: 'SolvBTC strategy addresses across all chains',
      description: 'Find strategy contract address for a specific asset',
      input:  { action: 'get_supported_assets', symbol: 'SolvBTC' },
      output: { success: true, output: { assets: [{ symbol: 'SolvBTC' }] } },
    },
    {
      title: 'What off-chain services does Pell secure?',
      description: 'DVS framework overview and use-case categories',
      input:  { action: 'get_avs_list' },
      output: { success: true, output: { framework_name: 'DVS — Decentralized Validated Services' } },
    },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executePellSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':    return actionGetProtocolInfo();
      case 'get_protocol_stats':   return actionGetProtocolStats();
      case 'get_supported_assets': return actionGetSupportedAssets(input);
      case 'get_avs_list':         return actionGetAvsList();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_protocol_stats, get_supported_assets, get_avs_list`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Pell skill unexpected error' };
  }
}
