/**
 * Official Skill: Sanctum (sanctum.so)
 *
 * Sanctum is Solana's liquid-staking-token (LST) aggregator. It lets any validator
 * launch an LST, provides instant unstake liquidity via the Reserve, and runs
 * Sanctum Infinity (INF), a multi-LST pool whose value tracks a basket of Solana
 * LSTs. This skill surfaces the Sanctum LST universe, per-LST APY, and prices.
 *
 * READ-ONLY skill. Minting/swapping LSTs is best done through the Jupiter or
 * Sanctum swap skill; this skill focuses on discovery and stats.
 *
 * Data sources (all curl-verified region-safe from a cloud IP):
 *   Sanctum extra-api  https://extra-api.sanctum.so
 *                      /v1/lsts                     — the full LST registry (~245 LSTs)
 *                      /v1/sol-value/current?lst=X  — current SOL value of 1 unit of an LST
 *   DefiLlama          https://yields.llama.fi/pools — per-LST APY (matched by symbol)
 *                      https://api.llama.fi/protocol/sanctum — protocol TVL
 *                      https://coins.llama.fi/prices — SOL/USD for price conversion
 *
 * NOTE ON APY: Sanctum's own extra-api /v1/apy/latest currently returns 0.0 for all
 * LSTs (deprecated/broken), so APY is sourced from DefiLlama's yields feed matched by
 * LST symbol (Sanctum Infinity uses the sanctum-infinity pool).
 *
 * Actions:
 *   get_protocol_info — protocol summary + TVL
 *   get_lst_list      — the Sanctum LST registry (symbol, mint, name)
 *   get_lst_apy       — APY for an LST (or a set of top LSTs) via DefiLlama
 *   get_price         — SOL value + USD price of an LST
 */

import type { SkillExecutionResult } from '@/types/skill';

// ── Endpoints ──────────────────────────────────────────────────────────────────
const SANCTUM_API = 'https://extra-api.sanctum.so';
const LLAMA_YIELDS = 'https://yields.llama.fi/pools';
const LLAMA_PROTOCOL = 'https://api.llama.fi/protocol/sanctum';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_PRICE = `https://coins.llama.fi/prices/current/solana:${SOL_MINT}`;
const LAMPORTS = 1e9;

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

async function getSolUsd(): Promise<number | null> {
  try {
    const d = await httpGetJson(SOL_PRICE);
    const p = d?.coins?.[`solana:${SOL_MINT}`]?.price;
    return typeof p === 'number' ? p : null;
  } catch {
    return null;
  }
}

// Build an uppercase-symbol → {apy, tvlUsd} index from DefiLlama Solana pools.
async function loadLstApyIndex(): Promise<Record<string, { apy: number; tvlUsd: number }>> {
  const feed = await httpGetJson(LLAMA_YIELDS);
  const pools: any[] = feed?.data ?? [];
  const idx: Record<string, { apy: number; tvlUsd: number }> = {};
  for (const p of pools) {
    if (p.chain !== 'Solana') continue;
    const sym = String(p.symbol || '').toUpperCase();
    if (!sym) continue;
    const tvl = Number(p.tvlUsd) || 0;
    // Keep the highest-TVL pool per symbol (the canonical LST pool).
    if (!idx[sym] || tvl > idx[sym].tvlUsd) {
      idx[sym] = { apy: Number(p.apy) || 0, tvlUsd: tvl };
    }
  }
  return idx;
}

// ── Skill metadata ───────────────────────────────────────────────────────────
export const SANCTUM_SKILL_METADATA = {
  name: 'Sanctum',
  description:
    "[ARSENAL-HOSTED ✓] Read Sanctum (sanctum.so) — Solana's liquid-staking-token (LST) aggregator and " +
    'Infinity (INF) multi-LST pool. Browse the full LST registry, read per-LST APY and prices, and check ' +
    'protocol TVL. Read-only.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['sanctum', 'solana', 'lst', 'liquid-staking', 'inf', 'aggregator', 'defi'],
  external_url: 'https://www.sanctum.so',
  logo_url: 'https://icons.llamao.fi/icons/protocols/sanctum?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_lst_list', 'get_lst_apy', 'get_price'],
        description:
          'Sanctum operation. ' +
          'get_protocol_info: protocol summary + TVL. ' +
          'get_lst_list: the Sanctum LST registry (symbol, mint, name). ' +
          'get_lst_apy: APY for an LST (via lst) or top LSTs (via DefiLlama). ' +
          'get_price: SOL value + USD price of an LST (via lst).',
      },
      lst: {
        type: 'string',
        description:
          'LST symbol (INF, jupSOL, bSOL, hSOL…). Required for get_price; optional for get_lst_apy (omit for a top set).',
      },
      limit: {
        type: 'integer',
        description: 'Max rows for get_lst_list (default 50, max 245).',
      },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'List LSTs', input: { action: 'get_lst_list', limit: 20 } },
    { title: 'INF APY', input: { action: 'get_lst_apy', lst: 'INF' } },
    { title: 'INF price', input: { action: 'get_price', lst: 'INF' } },
  ],
};

// ── Executor ─────────────────────────────────────────────────────────────────
export async function executeSanctumSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {
      case 'get_protocol_info': {
        const proto = await httpGetJson(LLAMA_PROTOCOL).catch(() => null);
        const tvl = proto?.currentChainTvls?.Solana ?? proto?.tvl ?? 0;
        return {
          success: true,
          output: {
            protocol: 'Sanctum',
            chain: 'solana',
            description:
              'Solana LST aggregator. Any validator can launch an LST; Sanctum provides instant unstake ' +
              'liquidity and runs Infinity (INF), a multi-LST pool tracking a basket of Solana LSTs.',
            total_tvl: fmtUsd(tvl),
            url: 'https://www.sanctum.so',
          },
        };
      }

      case 'get_lst_list': {
        const limit = Math.min(input.limit ?? 50, 245);
        const d = await httpGetJson(`${SANCTUM_API}/v1/lsts`);
        const lsts: any[] = d?.lsts ?? [];
        const rows = lsts.slice(0, limit).map((l) => ({
          symbol: l.symbol,
          name: l.name,
          mint: l.mint,
          decimals: l.decimals,
          program: l.pool?.program,
        }));
        return { success: true, output: { count: rows.length, total_lsts: lsts.length, lsts: rows } };
      }

      case 'get_lst_apy': {
        const idx = await loadLstApyIndex();
        if (input.lst) {
          const sym = String(input.lst).toUpperCase();
          const hit = idx[sym];
          if (!hit) {
            return {
              success: false,
              error: `No APY found for LST "${input.lst}" in DefiLlama's Solana yields. Try get_lst_list for valid symbols.`,
            };
          }
          return {
            success: true,
            output: {
              lst: input.lst,
              apy: `${hit.apy.toFixed(2)}%`,
              tvl_usd: fmtUsd(hit.tvlUsd),
              source: 'DefiLlama',
              note: "Sanctum's native APY endpoint is deprecated; APY is sourced from DefiLlama by symbol.",
            },
          };
        }
        // No lst → return a curated set of major Sanctum-relevant LSTs.
        const top = ['INF', 'JUPSOL', 'JITOSOL', 'MSOL', 'BSOL', 'HSOL', 'BONKSOL', 'DSOL', 'PWRSOL', 'PICOSOL'];
        const rows = top
          .map((sym) => (idx[sym] ? { lst: sym, apy: `${idx[sym].apy.toFixed(2)}%`, tvl_usd: fmtUsd(idx[sym].tvlUsd) } : null))
          .filter(Boolean);
        return {
          success: true,
          output: { count: rows.length, lsts: rows, source: 'DefiLlama', note: 'Pass `lst` for a specific LST.' },
        };
      }

      case 'get_price': {
        const lst = input.lst;
        if (!lst) return { success: false, error: 'lst (LST symbol, e.g. INF) is required' };
        const [sv, solUsd] = await Promise.all([
          httpGetJson(`${SANCTUM_API}/v1/sol-value/current?lst=${encodeURIComponent(lst)}`),
          getSolUsd(),
        ]);
        const raw = sv?.solValues?.[lst];
        if (raw == null) {
          return { success: false, error: `Sanctum has no SOL value for LST "${lst}". Check the symbol via get_lst_list.` };
        }
        const solValue = Number(raw) / LAMPORTS; // SOL per 1 LST
        const usd = solUsd != null ? solValue * solUsd : null;
        return {
          success: true,
          output: {
            lst,
            sol_value: Number(solValue.toFixed(6)),
            usd_price: usd != null ? Number(usd.toFixed(4)) : null,
            sol_usd: solUsd,
            note: 'sol_value is the SOL redeemable per 1 LST; usd_price = sol_value × SOL/USD.',
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported: get_protocol_info, get_lst_list, get_lst_apy, get_price`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Sanctum skill execution failed' };
  }
}
