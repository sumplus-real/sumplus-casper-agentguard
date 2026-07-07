/**
 * CoreDAO — Bitcoin-Powered EVM Blockchain
 *
 * Core is an EVM-compatible L1 blockchain (Chain ID: 1116) secured by the
 * Satoshi Plus consensus mechanism — a unique combination of:
 *   1. Bitcoin Proof-of-Work (merged mining, ~60% of Core's hashrate)
 *   2. Bitcoin Timelock Staking (BTC holders lock BTC on Bitcoin mainnet,
 *      no bridging required, and delegate to Core validators to earn CORE)
 *   3. CORE Token Staking (on-chain DPoS component)
 *
 * Key tokens & products:
 *   - CORE:    Native gas token + governance (max supply 2.1B, mirroring BTC)
 *   - coreBTC: Synthetic BTC on Core Chain, backed 1:1 by BTC via Lockers
 *   - lstBTC:  Liquid staking token for BTC staked on Core (akin to stETH)
 *   - stCORE:  Liquid staked CORE
 *
 * [ARSENAL-HOSTED ✓] Uses public CoreDAO RPC, CoinGecko, and DeFiLlama APIs.
 * No API key required.
 *
 * RPC:      https://rpc.coredao.org  (Chain ID: 1116)
 * Explorer: https://scan.coredao.org
 * Staking:  https://stake.coredao.org
 * Docs:     https://docs.coredao.org
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Constants ────────────────────────────────────────────────────────────────

const CORE_RPC         = 'https://rpc.coredao.org';
const COINGECKO_BASE   = 'https://api.coingecko.com/api/v3';
const DEFILLAMA_BASE   = 'https://api.llama.fi';
const LLAMA_YIELDS     = 'https://yields.llama.fi';

const CHAIN_ID         = 1116;
const CORE_CG_ID       = 'coredaoorg';   // CoinGecko coin ID for CORE token
const CORE_CHAIN_NAME  = 'Core';         // DeFiLlama chain name

// Well-known contract addresses on Core Chain (Chain ID: 1116)
// stCORE: CoreDAO's native liquid staked CORE token
const STCORE_ADDRESS   = '0x13b49e485b73a3be99b8d1fb8b58dd7c6ead2e23' as const;
// coreBTC: Synthetic BTC on Core Chain (Lockers-backed 1:1)
const COREBTC_ADDRESS  = '0x5832f53d147b3d6Cd4578B9cBD62425C7ea9d0F8' as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function cgFetch<T = any>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${COINGECKO_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CoinGecko API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function llamaFetch<T = any>(path: string, base = DEFILLAMA_BASE): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`DeFiLlama API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function rpcCall<T = any>(method: string, params: any[] = []): Promise<T> {
  const res = await fetch(CORE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Core RPC HTTP ${res.status}`);
  const data = await res.json() as { result?: T; error?: { message: string } };
  if (data.error) throw new Error(`Core RPC error: ${data.error.message}`);
  return data.result as T;
}

/** ERC-20 call: totalSupply() */
async function erc20TotalSupply(address: string): Promise<bigint | null> {
  try {
    const result = await rpcCall<string>('eth_call', [{ to: address, data: '0x18160ddd' }, 'latest']);
    if (!result || result === '0x') return null;
    return BigInt(result);
  } catch {
    return null;
  }
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return 'N/A';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPrice(price: number): string {
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toExponential(4);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Core Chain (CoreDAO)',
      chain_id: CHAIN_ID,
      website: 'https://coredao.org',
      docs: 'https://docs.coredao.org',
      explorer: 'https://scan.coredao.org',
      staking_app: 'https://stake.coredao.org',
      rpc: CORE_RPC,
      evm_compatible: true,
      description: [
        'Core is a Bitcoin-powered EVM-compatible blockchain secured by the Satoshi Plus consensus mechanism.',
        'Satoshi Plus combines three sources of security and decentralization:',
        '  1. Bitcoin Proof-of-Work (merged mining): ~60% of Bitcoin hashrate mines Core concurrently — no extra energy cost.',
        '  2. Bitcoin Timelock Staking: BTC holders lock BTC on Bitcoin mainnet via a CLTV timelock script (no bridge), then delegate to a Core validator. During the lock period the BTC stays on Bitcoin; holders earn CORE rewards.',
        '  3. CORE Token Staking: traditional DPoS where CORE holders delegate tokens to validators.',
        'Validators are ranked by a composite hybrid score combining delegated hash power, delegated CORE, and delegated BTC. The top 23 validators each round produce blocks.',
        'Core inherits Bitcoin security without requiring BTC holders to give up custody or pay bridging costs.',
      ],
      tokens: {
        CORE: {
          role: 'Native gas token and governance token',
          max_supply: '2,100,000,000 (mirrors Bitcoin\'s 21M cap, 100x multiplier)',
          contract: 'Native (no ERC-20 wrapper needed for gas)',
          coingecko_id: CORE_CG_ID,
        },
        coreBTC: {
          role: 'Synthetic BTC on Core Chain, backed 1:1 by real BTC via a permissioned Locker network',
          contract: COREBTC_ADDRESS,
          chain: 'Core Chain',
          note: 'Lockers post CORE collateral as insurance. No bridge required from a user perspective — submit a Bitcoin transaction to a Locker address.',
        },
        lstBTC: {
          role: 'Liquid staking token for BTC staked on Core. Accrues CORE staking rewards while remaining liquid — similar to stETH for ETH.',
          note: 'Holders can trade or use lstBTC in DeFi while continuing to earn CORE rewards from the underlying BTC delegation.',
        },
        stCORE: {
          role: 'Liquid staked CORE — stake CORE, receive stCORE, earn auto-compounded staking rewards',
          contract: STCORE_ADDRESS,
        },
      },
      key_concepts: {
        btc_staking_mechanics: 'BTC holders create a Bitcoin UTXO with a CLTV (Check Lock-Time Verify) timelock script. The script also embeds a Core validator address. When the timelock expires, the BTC is automatically returned to the owner. No bridge or wrapping occurs.',
        validator_election: 'Top 23 validators elected each round (1 day) based on hybrid score = f(delegated_hash_power, delegated_CORE, delegated_BTC). Score is normalized so each component contributes proportionally.',
        rewards: 'Block rewards are split: ~50% to validators proportional to blocks produced; ~50% to delegators (BTC stakers, CORE stakers) proportional to stake weight.',
        coreBTC_lockers: 'Lockers are permissioned entities (with CORE collateral) who receive BTC deposits and issue coreBTC 1:1. They bear slash risk if they misbehave.',
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_network_stats — live chain stats: TVL, CORE price, block number, gas price',
        'get_lstbtc_info — lstBTC overview and DeFiLlama yield data for BTC staking on Core',
        'get_staking_params — BTC timelock staking parameters, durations, and reward context',
      ],
    },
  };
}

async function actionGetNetworkStats(): Promise<SkillExecutionResult> {
  const errors: string[] = [];

  // ── 1. CORE price from CoinGecko ──────────────────────────────────────
  let corePrice: number | null = null;
  let coreMcap: number | null = null;
  let coreVol24h: number | null = null;
  let coreChange24h: number | null = null;
  let coreCircSupply: number | null = null;
  try {
    const markets = await cgFetch<any[]>('/coins/markets', {
      vs_currency: 'usd',
      ids: CORE_CG_ID,
      sparkline: 'false',
    });
    if (markets && markets.length > 0) {
      const d = markets[0];
      corePrice = d.current_price ?? null;
      coreMcap = d.market_cap ?? null;
      coreVol24h = d.total_volume ?? null;
      coreChange24h = d.price_change_percentage_24h ?? null;
      coreCircSupply = d.circulating_supply ?? null;
    }
  } catch (e: any) {
    errors.push(`CORE price: ${e.message}`);
  }

  // ── 2. Core Chain TVL from DeFiLlama ─────────────────────────────────
  let chainTvl: number | null = null;
  let tvl7dChange: number | null = null;
  try {
    const history = await llamaFetch<Array<{ date: number; tvl: number }>>(`/v2/historicalChainTvl/${CORE_CHAIN_NAME}`);
    if (Array.isArray(history) && history.length > 0) {
      chainTvl = history[history.length - 1].tvl;
      if (history.length >= 8) {
        const weekAgo = history[history.length - 8].tvl;
        tvl7dChange = weekAgo > 0 ? ((chainTvl - weekAgo) / weekAgo) * 100 : null;
      }
    }
  } catch (e: any) {
    errors.push(`Chain TVL: ${e.message}`);
  }

  // ── 3. Live chain data from Core RPC ─────────────────────────────────
  let blockNumber: number | null = null;
  let gasPrice: number | null = null;  // in Gwei
  try {
    const [blockHex, gasPriceHex] = await Promise.all([
      rpcCall<string>('eth_blockNumber'),
      rpcCall<string>('eth_gasPrice'),
    ]);
    blockNumber = blockHex ? parseInt(blockHex, 16) : null;
    gasPrice = gasPriceHex ? parseInt(gasPriceHex, 16) / 1e9 : null;
  } catch (e: any) {
    errors.push(`Core RPC: ${e.message}`);
  }

  // ── 4. DeFiLlama yield pools on CORE chain ────────────────────────────
  let topPools: any[] = [];
  try {
    const yieldsData = await llamaFetch<{ data?: any[] }>('/pools', LLAMA_YIELDS);
    const pools = (yieldsData.data ?? [])
      .filter((p: any) => String(p.chain ?? '').toUpperCase() === 'CORE' && (p.apy ?? 0) > 0)
      .sort((a: any, b: any) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .slice(0, 6);
    topPools = pools.map((p: any) => ({
      project: p.project,
      symbol: p.symbol,
      apy: p.apy != null ? `${p.apy.toFixed(2)}%` : 'N/A',
      tvl_usd: formatUsd(p.tvlUsd),
    }));
  } catch (e: any) {
    errors.push(`DeFiLlama yields: ${e.message}`);
  }

  return {
    success: true,
    output: {
      chain: {
        name: 'Core Chain',
        chain_id: CHAIN_ID,
        rpc: CORE_RPC,
        block_number: blockNumber,
        gas_price_gwei: gasPrice != null ? parseFloat(gasPrice.toFixed(2)) : null,
        tvl_usd: formatUsd(chainTvl),
        tvl_raw: chainTvl,
        tvl_7d_change_pct: tvl7dChange != null ? parseFloat(tvl7dChange.toFixed(2)) : null,
      },
      core_token: {
        symbol: 'CORE',
        coingecko_id: CORE_CG_ID,
        price_usd: corePrice != null ? parseFloat(formatPrice(corePrice)) : null,
        price_display: corePrice != null ? `$${formatPrice(corePrice)}` : 'N/A',
        market_cap_usd: formatUsd(coreMcap),
        volume_24h_usd: formatUsd(coreVol24h),
        change_24h_pct: coreChange24h != null ? parseFloat(coreChange24h.toFixed(2)) : null,
        circulating_supply: coreCircSupply != null ? Math.round(coreCircSupply).toLocaleString() : null,
        max_supply: '2,100,000,000',
      },
      top_yield_pools: topPools,
      display: [
        `Core Chain | Block: ${blockNumber?.toLocaleString() ?? 'N/A'} | Gas: ${gasPrice?.toFixed(1) ?? 'N/A'} Gwei`,
        `Chain TVL: ${formatUsd(chainTvl)}${tvl7dChange != null ? ` (7d: ${tvl7dChange > 0 ? '+' : ''}${tvl7dChange.toFixed(1)}%)` : ''}`,
        `CORE: $${corePrice != null ? formatPrice(corePrice) : 'N/A'} | MCap: ${formatUsd(coreMcap)} | 24h: ${coreChange24h != null ? (coreChange24h > 0 ? '+' : '') + coreChange24h.toFixed(2) + '%' : 'N/A'}`,
      ].join(' | '),
      ...(errors.length > 0 ? { _warnings: errors } : {}),
    },
  };
}

async function actionGetLstBtcInfo(): Promise<SkillExecutionResult> {
  const errors: string[] = [];

  // ── 1. Fetch DeFiLlama yield pools for Core to find BTC-related pools ─
  let btcPools: any[] = [];
  let stcorePool: any = null;
  try {
    const yieldsData = await llamaFetch<{ data?: any[] }>('/pools', LLAMA_YIELDS);
    const corePools = (yieldsData.data ?? []).filter(
      (p: any) => String(p.chain ?? '').toUpperCase() === 'CORE',
    );

    // BTC-related pools on Core
    btcPools = corePools
      .filter((p: any) => {
        const sym = String(p.symbol ?? '').toLowerCase();
        return sym.includes('btc') || sym.includes('corebtc') || sym.includes('lstbtc');
      })
      .sort((a: any, b: any) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .slice(0, 8)
      .map((p: any) => ({
        project: p.project,
        symbol: p.symbol,
        apy: p.apy != null ? `${p.apy.toFixed(2)}%` : '0%',
        tvl_usd: formatUsd(p.tvlUsd),
        pool_id: p.pool,
      }));

    // stCORE pool for liquid staking reference
    stcorePool = corePools.find((p: any) =>
      String(p.symbol ?? '').toLowerCase().includes('stcore'),
    ) ?? null;
  } catch (e: any) {
    errors.push(`DeFiLlama: ${e.message}`);
  }

  // ── 2. coreBTC ERC-20 total supply from Core RPC ──────────────────────
  let coreBtcSupply: string | null = null;
  try {
    const raw = await erc20TotalSupply(COREBTC_ADDRESS);
    if (raw != null) {
      // coreBTC is 8 decimals (same as BTC satoshis)
      const btcAmount = Number(raw) / 1e8;
      coreBtcSupply = `${btcAmount.toFixed(4)} coreBTC`;
    }
  } catch (e: any) {
    errors.push(`coreBTC supply RPC: ${e.message}`);
  }

  return {
    success: true,
    output: {
      lstBTC: {
        description: 'lstBTC is Core Chain\'s liquid staking token for Bitcoin. BTC delegated to Core validators via Bitcoin-native CLTV timelocks is tokenized as lstBTC, which accrues CORE staking rewards while remaining liquid and tradeable.',
        mechanism: [
          '1. BTC holder locks BTC on Bitcoin mainnet using a CLTV timelock script (no bridge).',
          '2. Core protocol recognizes the delegation and mints lstBTC to the holder.',
          '3. lstBTC accrues CORE token rewards as the underlying BTC earns staking yield.',
          '4. When the timelock expires, BTC is returned to the owner and lstBTC can be redeemed.',
          '5. lstBTC can be used in Core DeFi (lending, liquidity) while still earning BTC staking rewards.',
        ],
        key_advantage: 'Unlike wrapped BTC or bridged solutions, the underlying BTC never leaves Bitcoin mainnet. The CLTV script is self-executing — no trust in a bridge or custodian.',
        docs: 'https://docs.coredao.org/docs/Learn/products/btc-staking/overview',
      },
      coreBTC: {
        description: 'coreBTC is synthetic BTC on Core Chain, backed 1:1 by real BTC via a network of overcollateralized Lockers. Each Locker posts CORE as insurance against misbehavior.',
        contract: COREBTC_ADDRESS,
        total_supply_on_chain: coreBtcSupply ?? 'Could not fetch (RPC)',
        docs: 'https://docs.coredao.org/docs/Learn/products/coreBTC',
      },
      stCORE: {
        description: 'stCORE is the liquid staking token for CORE. Stake CORE, receive stCORE that auto-compounds validator rewards.',
        contract: STCORE_ADDRESS,
        defillama_apy: stcorePool
          ? `${(stcorePool.apy ?? 0).toFixed(2)}% (TVL: ${formatUsd(stcorePool.tvlUsd)})`
          : 'N/A',
      },
      btc_yield_pools_on_core: btcPools,
      context: [
        'BTC staking on Core (via CLTV) is completely non-custodial — BTC holders never give up possession.',
        'Rewards are paid in CORE tokens, not BTC. APY depends on CORE price and network participation.',
        'lstBTC is a newer product; on-chain TVL data may be limited. Check stake.coredao.org for live figures.',
        'coreBTC is the "classic" synthetic route; lstBTC is the newer liquid staking route — both are backed by real BTC.',
      ],
      ...(errors.length > 0 ? { _warnings: errors } : {}),
    },
  };
}

async function actionGetStakingParams(): Promise<SkillExecutionResult> {
  const errors: string[] = [];

  // ── 1. Get current CORE price for APY context ─────────────────────────
  let corePrice: number | null = null;
  try {
    const simple = await cgFetch<Record<string, Record<string, number>>>(
      '/simple/price',
      { ids: CORE_CG_ID, vs_currencies: 'usd' },
    );
    corePrice = simple?.[CORE_CG_ID]?.usd ?? null;
  } catch (e: any) {
    errors.push(`CORE price: ${e.message}`);
  }

  // ── 2. Pull yield data for CORE staking pools ─────────────────────────
  let b14gApy: number | null = null;
  let stcoreApy: number | null = null;
  try {
    const yieldsData = await llamaFetch<{ data?: any[] }>('/pools', LLAMA_YIELDS);
    const corePools = (yieldsData.data ?? []).filter(
      (p: any) => String(p.chain ?? '').toUpperCase() === 'CORE',
    );
    const b14g = corePools.find(
      (p: any) => p.project === 'b14g' && String(p.symbol ?? '').toUpperCase() === 'CORE',
    );
    const stcore = corePools.find((p: any) =>
      String(p.symbol ?? '').toLowerCase().includes('stcore'),
    );
    b14gApy = b14g?.apy ?? null;
    stcoreApy = stcore?.apy ?? null;
  } catch (e: any) {
    errors.push(`DeFiLlama yields: ${e.message}`);
  }

  return {
    success: true,
    output: {
      btc_staking: {
        overview: 'BTC holders lock BTC natively on Bitcoin mainnet using a CLTV (Check Lock-Time Verify) timelock script. No bridge, no wrapping. At expiry, BTC is auto-returned. During the lock, delegated to a Core validator to earn CORE rewards.',
        minimum_amount_btc: 0.01,
        minimum_amount_note: 'Minimum 0.01 BTC per staking transaction. No on-chain maximum.',
        supported_timelock_durations: [
          { label: '1 month  (~4,320 Bitcoin blocks)',  blocks: 4320,  days: 30  },
          { label: '3 months (~12,960 Bitcoin blocks)', blocks: 12960, days: 90  },
          { label: '6 months (~25,920 Bitcoin blocks)', blocks: 25920, days: 180 },
          { label: '1 year   (~52,560 Bitcoin blocks)', blocks: 52560, days: 365 },
        ],
        timelock_note: 'Durations are approximate — Bitcoin block times average ~10 min but vary. Longer lock = higher weight in hybrid score, which may yield higher rewards.',
        reward_token: 'CORE',
        reward_token_price_usd: corePrice != null ? `$${formatPrice(corePrice)}` : 'N/A',
        custody: 'Non-custodial. BTC stays on Bitcoin mainnet; no bridge or third-party custodian.',
        how_to_stake: [
          '1. Go to https://stake.coredao.org and connect a Bitcoin wallet (Unisat, Xverse, etc.).',
          '2. Choose a validator and timelock duration.',
          '3. The app constructs a CLTV transaction — sign and broadcast it on Bitcoin.',
          '4. Core protocol detects the delegation after sufficient Bitcoin confirmations (~6).',
          '5. CORE rewards accrue each round (1 day). Claim at stake.coredao.org.',
        ],
        staking_docs: 'https://docs.coredao.org/docs/Learn/products/btc-staking/design',
      },
      core_staking: {
        overview: 'CORE holders can stake CORE tokens to validators on Core Chain. Combines with BTC staking and merged mining to elect the top 23 validators each round.',
        minimum_amount_core: 1,
        minimum_amount_note: 'Practical minimum is 1 CORE; very small amounts may not earn meaningful rewards.',
        reward_token: 'CORE',
        current_apy_context: {
          b14g_restaking: b14gApy != null ? `${b14gApy.toFixed(2)}%` : 'N/A',
          stcore_liquid_staking: stcoreApy != null ? `${stcoreApy.toFixed(2)}%` : 'N/A',
          note: 'APY varies by validator performance, network participation, and CORE market price. Check stake.coredao.org for live rates.',
        },
        liquid_staking_option: {
          token: 'stCORE',
          contract: STCORE_ADDRESS,
          description: 'Stake CORE, receive stCORE that auto-compounds rewards. Liquid — can be used in DeFi.',
        },
        staking_docs: 'https://docs.coredao.org/docs/Learn/products/coreBTC',
      },
      validator_set: {
        active_validators: 23,
        election_frequency: 'Daily (each Core epoch)',
        election_mechanism: 'Hybrid score: weighted combination of delegated BTC hashrate (from merged-mining), delegated CORE tokens, and delegated BTC (from CLTV staking). Top 23 by score are elected.',
        slashing: 'Validators can be slashed for double-signing or extended downtime. Delegators share in slash risk proportionally.',
        validator_list: 'https://scan.coredao.org/validators',
      },
      reward_distribution: {
        block_rewards: 'New CORE minted per block + transaction fees',
        split: '~50% to validator (for blocks produced) + ~50% distributed to all delegators proportional to stake weight',
        claim_frequency: 'Claim anytime at stake.coredao.org; rewards accumulate each daily round',
      },
      useful_links: {
        staking_app:      'https://stake.coredao.org',
        explorer:         'https://scan.coredao.org',
        btc_staking_docs: 'https://docs.coredao.org/docs/Learn/products/btc-staking/overview',
        tokenomics:       'https://docs.coredao.org/docs/Learn/core-concepts/tokenomics',
        whitepaper:       'https://whitepaper.coredao.org',
      },
      ...(errors.length > 0 ? { _warnings: errors } : {}),
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const COREDAO_SKILL_METADATA = {
  name: 'CoreDAO',
  description:
    'Bitcoin-powered EVM blockchain with Satoshi Plus consensus. ' +
    'BTC holders can stake BTC natively (no bridge) to earn CORE rewards. ' +
    'Also features lstBTC (liquid staking) and coreBTC (synthetic BTC).',
  category: 'BTC DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['coredao', 'core', 'btc', 'bitcoin', 'staking', 'lstbtc', 'defi'],
  external_url: 'https://coredao.org',
  logo_url: 'https://icons.llamao.fi/icons/protocols/coredao?w=48&h=48',
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
          'get_network_stats',
          'get_lstbtc_info',
          'get_staking_params',
        ],
        description:
          'get_protocol_info: Core Chain overview — Satoshi Plus consensus, BTC staking, token ecosystem. ' +
          'get_network_stats: Live chain data — TVL, CORE price, block number, gas price, top yield pools. ' +
          'get_lstbtc_info: lstBTC and coreBTC overview — supply, APY, BTC yield pools on Core. ' +
          'get_staking_params: BTC staking parameters — min amount, timelock durations, CORE staking APY, validator info.',
      },
    },
  },
  usage_examples: [
    {
      title: 'CoreDAO overview',
      input: { action: 'get_protocol_info' },
    },
    {
      title: 'Core Chain live stats',
      input: { action: 'get_network_stats' },
    },
    {
      title: 'lstBTC and coreBTC info',
      input: { action: 'get_lstbtc_info' },
    },
    {
      title: 'BTC staking parameters',
      input: { action: 'get_staking_params' },
    },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeCoreDaoSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':  return actionGetProtocolInfo();
      case 'get_network_stats':  return actionGetNetworkStats();
      case 'get_lstbtc_info':    return actionGetLstBtcInfo();
      case 'get_staking_params': return actionGetStakingParams();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_network_stats, get_lstbtc_info, get_staking_params`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'CoreDAO skill unexpected error' };
  }
}
