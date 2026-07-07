/**
 * Amnis Finance — Liquid Staking on Aptos
 *
 * Amnis is the leading liquid staking protocol on Aptos. Users stake APT and
 * receive two tokens:
 *   - amAPT: a 1:1 APT-pegged liquid token (the base receipt / stablecoin-like)
 *   - stAPT: a yield-bearing token whose exchange rate to amAPT grows over time
 *     as validator rewards accrue (like stETH for Aptos)
 *
 * Data is sourced from:
 *   1. Aptos fullnode  — live on-chain exchange rate, supplies, balances
 *   2. DeFiLlama       — protocol TVL (project == "amnis-finance")
 *
 * Amnis package: 0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a
 * Docs:          https://docs.amnis.finance
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Constants ────────────────────────────────────────────────────────────────

const APTOS_NODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const LLAMA_BASE = 'https://api.llama.fi';
const YIELDS_BASE = 'https://yields.llama.fi';
const DEFILLAMA_SLUG = 'amnis-finance';

/** Amnis Finance package address (Aptos mainnet) */
const AMNIS_ADDR = '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a';
const AMAPT_COIN = `${AMNIS_ADDR}::amapt_token::AmnisApt`;
const STAPT_COIN = `${AMNIS_ADDR}::stapt_token::StakedApt`;

/** stapt_price() returns amAPT-per-stAPT scaled by 1e8 */
const PRICE_SCALE = 1e8;
/** amAPT and stAPT both use 8 decimals (octas), same as APT */
const OCTAS = 1e8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function aptosView<T = any>(func: string, typeArgs: string[], args: any[]): Promise<T> {
  const res = await fetch(`${APTOS_NODE}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ function: func, type_arguments: typeArgs, arguments: args }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Aptos view ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function llamaFetch<T = any>(base: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function formatUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

/** stapt_token::stapt_price() -> u64 (amAPT per stAPT, scaled 1e8) */
async function fetchStaptPrice(): Promise<number> {
  const [raw] = await aptosView<string[]>(`${AMNIS_ADDR}::stapt_token::stapt_price`, [], []);
  return Number(raw) / PRICE_SCALE;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  const llama = await llamaFetch<any>(LLAMA_BASE, `/protocol/${DEFILLAMA_SLUG}`);
  const tvlUsd: number | null = llama?.currentChainTvls?.Aptos ?? llama?.tvl ?? null;

  return {
    success: true,
    output: {
      name: 'Amnis Finance',
      type: 'Liquid Staking Protocol (Aptos)',
      chain: 'Aptos',
      website: 'https://amnis.finance',
      docs: 'https://docs.amnis.finance',
      package: AMNIS_ADDR,
      tvl_usd: tvlUsd,
      tvl_display: tvlUsd != null ? `TVL: ${formatUsd(tvlUsd)}` : 'TVL: unavailable',
      description: [
        'Amnis Finance is the leading liquid staking protocol on Aptos.',
        'Stake APT to receive amAPT (a 1:1 APT-pegged liquid token) and optionally',
        'stake amAPT into stAPT — a yield-bearing token whose exchange rate to amAPT',
        'grows as Aptos validator rewards accrue, similar to stETH on Ethereum.',
        'Both tokens stay liquid and composable across Aptos DeFi.',
      ],
      tokens: {
        amAPT: { type: 'Liquid staking receipt (1:1 APT peg)', coin_type: AMAPT_COIN, decimals: 8 },
        stAPT: { type: 'Yield-bearing staked APT', coin_type: STAPT_COIN, decimals: 8 },
      },
      available_actions: [
        'get_protocol_info — this overview with TVL',
        'get_stats — TVL, total amAPT/stAPT supply, amount staked, exchange rate',
        'get_exchange_rate — live stAPT ⇄ amAPT/APT conversion rate',
        'get_stapt_balance — amAPT & stAPT balances for an Aptos address',
      ],
    },
  };
}

async function actionGetStats(): Promise<SkillExecutionResult> {
  const [llama, yields, viewsSettled] = await Promise.allSettled([
    llamaFetch<any>(LLAMA_BASE, `/protocol/${DEFILLAMA_SLUG}`),
    llamaFetch<{ data: any[] }>(YIELDS_BASE, '/pools'),
    Promise.all([
      aptosView<string[]>(`${AMNIS_ADDR}::stapt_token::stapt_price`, [], []),
      aptosView<string[]>(`${AMNIS_ADDR}::amapt_token::total_supply`, [], []),
      aptosView<string[]>(`${AMNIS_ADDR}::stapt_token::total_supply`, [], []),
      aptosView<string[]>(`${AMNIS_ADDR}::stapt_token::total_amapt_staked`, [], []),
    ]),
  ]);

  const llamaData = llama.status === 'fulfilled' ? llama.value : null;
  const tvlUsd: number | null = llamaData?.currentChainTvls?.Aptos ?? llamaData?.tvl ?? null;

  // APY (if DeFiLlama happens to list an Amnis staking pool)
  let apyPct: number | null = null;
  if (yields.status === 'fulfilled' && yields.value?.data) {
    const pool = yields.value.data.find(
      (p: any) =>
        p.chain === 'Aptos' &&
        (p.project === DEFILLAMA_SLUG || p.project === 'amnis') &&
        /amapt|stapt/i.test(p.symbol ?? '')
    );
    apyPct = pool?.apy ?? pool?.apyBase ?? null;
  }

  let exchangeRate: number | null = null;
  let amaptSupply: number | null = null;
  let staptSupply: number | null = null;
  let amaptStaked: number | null = null;
  if (viewsSettled.status === 'fulfilled') {
    const [price, amaptTs, staptTs, staked] = viewsSettled.value;
    exchangeRate = Number(price[0]) / PRICE_SCALE;
    amaptSupply = Number(amaptTs[0]) / OCTAS;
    staptSupply = Number(staptTs[0]) / OCTAS;
    amaptStaked = Number(staked[0]) / OCTAS;
  }

  return {
    success: true,
    output: {
      protocol: 'Amnis Finance',
      chain: 'Aptos',
      tvl_usd: tvlUsd,
      apy_pct: apyPct,
      exchange_rate_stapt_to_apt: exchangeRate,
      total_amapt_supply: amaptSupply,
      total_stapt_supply: staptSupply,
      total_amapt_staked: amaptStaked,
      display: [
        tvlUsd != null ? `TVL ${formatUsd(tvlUsd)}` : 'TVL n/a',
        exchangeRate != null ? `1 stAPT = ${exchangeRate.toFixed(6)} APT` : 'rate n/a',
        amaptSupply != null ? `amAPT supply ${amaptSupply.toFixed(2)}` : '',
        staptSupply != null ? `stAPT supply ${staptSupply.toFixed(2)}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      data_sources: ['DeFiLlama (TVL)', 'Aptos fullnode (on-chain supplies + exchange rate)'],
    },
  };
}

async function actionGetExchangeRate(): Promise<SkillExecutionResult> {
  try {
    const rate = await fetchStaptPrice();
    return {
      success: true,
      output: {
        pair: 'stAPT / amAPT',
        note: 'amAPT is pegged 1:1 to APT, so stAPT→amAPT ≈ stAPT→APT.',
        stapt_to_amapt: rate,
        amapt_to_stapt: rate > 0 ? 1 / rate : null,
        stapt_to_apt: rate,
        apt_to_stapt: rate > 0 ? 1 / rate : null,
        display: `1 stAPT = ${rate.toFixed(6)} amAPT (≈ APT) | 1 amAPT = ${(1 / rate).toFixed(6)} stAPT`,
        source: 'Aptos fullnode view: stapt_token::stapt_price',
      },
    };
  } catch (err: any) {
    return { success: false, error: `Failed to read stAPT exchange rate: ${err.message}` };
  }
}

async function actionGetStaptBalance(input: Record<string, any>): Promise<SkillExecutionResult> {
  const address: string | undefined = input.address;
  if (!address || !address.startsWith('0x')) {
    return { success: false, error: 'Provide "address" as a valid Aptos address (starts with 0x).' };
  }

  async function coinBalance(coinType: string): Promise<number> {
    try {
      const [raw] = await aptosView<string[]>('0x1::coin::balance', [coinType], [address]);
      return Number(raw) / OCTAS;
    } catch {
      return 0;
    }
  }

  let rate: number | null = null;
  try {
    rate = await fetchStaptPrice();
  } catch {
    /* non-fatal */
  }

  const [amapt, stapt] = await Promise.all([coinBalance(AMAPT_COIN), coinBalance(STAPT_COIN)]);
  const staptInApt = rate != null ? stapt * rate : null;

  return {
    success: true,
    output: {
      address,
      amapt_balance: amapt,
      stapt_balance: stapt,
      stapt_value_in_apt: staptInApt,
      exchange_rate_stapt_to_apt: rate,
      display: [
        `amAPT: ${amapt.toFixed(6)}`,
        `stAPT: ${stapt.toFixed(6)}${staptInApt != null ? ` (≈ ${staptInApt.toFixed(6)} APT)` : ''}`,
      ].join(' | '),
      source: 'Aptos fullnode view: 0x1::coin::balance',
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const AMNIS_SKILL_METADATA = {
  name: 'Amnis Finance',
  description:
    '[ARSENAL-HOSTED ✓] Leading liquid staking protocol on Aptos. Stake APT for amAPT (1:1 APT peg) ' +
    'or stAPT (yield-bearing). Get protocol TVL, staking stats, the live stAPT⇄APT exchange rate, ' +
    'and amAPT/stAPT balances for any address. Data from Aptos fullnode + DeFiLlama.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['amnis', 'aptos', 'liquid-staking', 'staking', 'amapt', 'stapt', 'apt', 'defi'],
  external_url: 'https://amnis.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/amnis-finance?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_stats', 'get_exchange_rate', 'get_stapt_balance'],
        description:
          'get_protocol_info: Amnis overview, TVL, and token model (amAPT/stAPT). ' +
          'get_stats: TVL, APY, total amAPT/stAPT supply, amount staked, exchange rate. ' +
          'get_exchange_rate: Live stAPT ⇄ amAPT/APT conversion rate. ' +
          'get_stapt_balance: amAPT & stAPT balances for an Aptos address (requires address).',
      },
      address: {
        type: 'string',
        description: 'Aptos wallet address (0x…). Required for get_stapt_balance.',
      },
    },
  },
  usage_examples: [
    { title: 'Amnis overview', input: { action: 'get_protocol_info' } },
    { title: 'Staking stats (TVL + supplies)', input: { action: 'get_stats' } },
    { title: 'stAPT ⇄ APT exchange rate', input: { action: 'get_exchange_rate' } },
    {
      title: 'amAPT/stAPT balance lookup',
      input: {
        action: 'get_stapt_balance',
        address: '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a',
      },
    },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeAmnisSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info': return actionGetProtocolInfo();
      case 'get_stats': return actionGetStats();
      case 'get_exchange_rate': return actionGetExchangeRate();
      case 'get_stapt_balance': return actionGetStaptBalance(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_stats, get_exchange_rate, get_stapt_balance`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Amnis skill unexpected error' };
  }
}
