/**
 * Official Skill: Save (save.finance, formerly Solend)
 *
 * Save is one of Solana's oldest and largest lending protocols (rebranded from
 * Solend). Users supply assets to earn yield and borrow against collateral across
 * multiple isolated lending markets (Main, JLP, Turbo SOL, and permissionless pools).
 *
 * READ-ONLY skill. Supply/borrow/repay/withdraw need the Save/Solend SDK to build
 * on-chain instructions, so build_* actions are deferred.
 *
 * Data sources (all curl-verified region-safe from a cloud IP):
 *   Save/Solend API  https://api.solend.fi
 *                    /v1/markets/configs?scope=all&deployment=production
 *                      — every market with its reserve metadata (symbol, mint, pubkey)
 *                    /v1/reserves?ids=<pubkeys>&deployment=production
 *                      — live supply/borrow APY + on-chain liquidity for TVL
 *   DefiLlama        https://api.llama.fi/protocol/save — protocol TVL fallback
 *
 * Live supply AND borrow APY come from the Solend API's `rates` field; TVL per
 * reserve is computed from on-chain liquidity (available + borrowed) × market price.
 *
 * Actions:
 *   get_protocol_info — protocol summary + TVL
 *   get_markets       — list all Save lending markets
 *   get_reserves      — all reserves in a market (supply/borrow APY, TVL, LTV)
 *   get_reserve       — one reserve by token symbol or mint
 */

import type { SkillExecutionResult } from '@/types/skill';

// ── Endpoints ──────────────────────────────────────────────────────────────────
const SOLEND_API = 'https://api.solend.fi';
const CONFIGS = `${SOLEND_API}/v1/markets/configs?scope=all&deployment=production`;
const LLAMA_PROTOCOL = 'https://api.llama.fi/protocol/save';

// ── Helper ────────────────────────────────────────────────────────────────────
async function httpGetJson(url: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

function fmtUsd(n: number): string {
  if (!isFinite(n) || n <= 0) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function pctStr(s: any): string {
  const n = Number(s);
  return isFinite(n) ? `${n.toFixed(2)}%` : 'n/a';
}

// Resolve a market from the configs list by alias (name), address, or primary default.
function pickMarket(cfgs: any[], marketAlias?: string): any | null {
  if (!Array.isArray(cfgs) || cfgs.length === 0) return null;
  if (!marketAlias) return cfgs.find((c) => c.isPrimary) ?? cfgs[0];
  const a = marketAlias.toLowerCase();
  return (
    cfgs.find((c) => (c.name || '').toLowerCase() === a) ||
    cfgs.find((c) => c.address === marketAlias) ||
    null
  );
}

// Fetch a market's reserves and merge in live rates + computed TVL.
async function loadReserves(marketAlias?: string): Promise<{ market: any; rows: any[] }> {
  const cfgs = await httpGetJson(CONFIGS);
  const market = pickMarket(cfgs, marketAlias);
  if (!market) throw new Error(`Market "${marketAlias}" not found. Use get_markets to list markets.`);

  const reserves: any[] = market.reserves ?? [];
  if (reserves.length === 0) return { market, rows: [] };

  const ids = reserves.map((r) => r.address).join(',');
  const live = await httpGetJson(`${SOLEND_API}/v1/reserves?ids=${ids}&deployment=production`);
  const results: any[] = live?.results ?? [];

  // Index live data by reserve pubkey.
  const byKey = new Map<string, any>();
  for (const x of results) {
    const key = x?.reserve?.pubkey ?? x?.reserve?.address;
    if (key) byKey.set(key, x);
  }

  const rows = reserves.map((r) => {
    const lt = r.liquidityToken ?? {};
    const liveRow = byKey.get(r.address);
    let supplyApy: string | null = null;
    let borrowApy: string | null = null;
    let tvlUsd = 0;
    let ltv: number | null = null;
    if (liveRow) {
      supplyApy = pctStr(liveRow.rates?.supplyInterest);
      borrowApy = pctStr(liveRow.rates?.borrowInterest);
      const liq = liveRow.reserve?.liquidity ?? {};
      const dec = Number(liq.mintDecimals ?? lt.decimals ?? 0);
      const avail = Number(liq.availableAmount ?? 0);
      const borrowed = Number(liq.borrowedAmountWads ?? 0) / 1e18;
      const price = Number(liq.marketPrice ?? 0) / 1e18;
      if (dec >= 0 && price > 0) tvlUsd = ((avail + borrowed) / 10 ** dec) * price;
      const l = liveRow.reserve?.config?.loanToValueRatio;
      if (l != null) ltv = Number(l);
    }
    return {
      symbol: lt.symbol,
      mint: lt.mint,
      reserve: r.address,
      supply_apy: supplyApy,
      borrow_apy: borrowApy,
      tvl_usd: fmtUsd(tvlUsd),
      max_ltv: ltv != null ? `${ltv}%` : null,
      _tvl: tvlUsd,
    };
  });

  rows.sort((a, b) => b._tvl - a._tvl);
  return { market, rows: rows.map(({ _tvl, ...rest }) => rest) };
}

// ── Skill metadata ───────────────────────────────────────────────────────────
export const SAVE_SKILL_METADATA = {
  name: 'Save',
  description:
    '[ARSENAL-HOSTED ✓] Read Save (save.finance, formerly Solend) — one of Solana\'s oldest and largest ' +
    'lending protocols. List lending markets, read per-reserve supply/borrow APY, TVL and max LTV, and ' +
    'check protocol TVL. Read-only.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['save', 'solend', 'solana', 'lending', 'borrow', 'defi', 'yield'],
  external_url: 'https://save.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/save?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_markets', 'get_reserves', 'get_reserve'],
        description:
          'Save operation. ' +
          'get_protocol_info: protocol summary + TVL. ' +
          'get_markets: list all lending markets. ' +
          'get_reserves: all reserves in a market (supply/borrow APY, TVL, LTV). ' +
          'get_reserve: one reserve by token.',
      },
      market: {
        type: 'string',
        description:
          'Lending market: name alias (e.g. "main") or market pubkey. Default: primary (Main) market. Used by get_reserves/get_reserve.',
      },
      token: {
        type: 'string',
        description: 'Token symbol (USDC, SOL, USDT…) or SPL mint address. Required for get_reserve.',
      },
      limit: {
        type: 'integer',
        description: 'Max rows for get_reserves (default 40, max 100).',
      },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'List markets', input: { action: 'get_markets' } },
    { title: 'Main market reserves', input: { action: 'get_reserves', market: 'main' } },
    { title: 'USDC reserve', input: { action: 'get_reserve', token: 'USDC' } },
  ],
};

// ── Executor ─────────────────────────────────────────────────────────────────
export async function executeSaveSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {
      case 'get_protocol_info': {
        const proto = await httpGetJson(LLAMA_PROTOCOL).catch(() => null);
        const tvl = proto?.currentChainTvls?.Solana ?? proto?.tvl ?? 0;
        return {
          success: true,
          output: {
            protocol: 'Save',
            former_name: 'Solend',
            chain: 'solana',
            description:
              "One of Solana's oldest and largest lending protocols. Supply assets for yield or borrow " +
              'against collateral across multiple isolated markets.',
            total_tvl: fmtUsd(tvl),
            url: 'https://save.finance',
          },
        };
      }

      case 'get_markets': {
        const cfgs = await httpGetJson(CONFIGS);
        if (!Array.isArray(cfgs)) return { success: false, error: 'Unexpected response from Save markets API' };
        const markets = cfgs.map((c) => ({
          name: c.name,
          alias: (c.name || '').toLowerCase(),
          address: c.address,
          is_primary: !!c.isPrimary,
          permissionless: !!c.isPermissionless,
          reserve_count: (c.reserves ?? []).length,
        }));
        return { success: true, output: { count: markets.length, default: 'main', markets } };
      }

      case 'get_reserves': {
        const limit = Math.min(input.limit ?? 40, 100);
        const { market, rows } = await loadReserves(input.market);
        return {
          success: true,
          output: {
            market: market.name,
            market_address: market.address,
            count: Math.min(rows.length, limit),
            total_reserves: rows.length,
            reserves: rows.slice(0, limit),
          },
        };
      }

      case 'get_reserve': {
        const { token } = input;
        if (!token) return { success: false, error: 'token is required (symbol or mint)' };
        const { market, rows } = await loadReserves(input.market);
        const t = token.toUpperCase();
        const hit =
          rows.find((r) => r.mint === token) ||
          rows.find((r) => (r.symbol || '').toUpperCase() === t);
        if (!hit) return { success: false, error: `Token "${token}" not found in market ${market.name}` };
        return { success: true, output: { market: market.name, ...hit } };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported: get_protocol_info, get_markets, get_reserves, get_reserve`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Save skill execution failed' };
  }
}
