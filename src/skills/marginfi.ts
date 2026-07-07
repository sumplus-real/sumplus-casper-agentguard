/**
 * Official Skill: marginfi (app.marginfi.com)
 *
 * marginfi runs mrgnlend, one of Solana's largest permissionless lending
 * protocols. Users supply assets to earn yield and borrow against collateral
 * across ~80 isolated banks (one bank per asset).
 *
 * READ-ONLY skill. Deposit / borrow / repay / withdraw require the marginfi
 * SDK to build on-chain instructions client-side, so build_* actions are
 * deferred.
 *
 * Data sources (all curl-verified region-safe from a cloud IP):
 *   Bank list   https://storage.googleapis.com/mrgn-public/mrgn-bank-metadata-cache.json
 *               — the public bank registry (bank pubkey, token mint, name, symbol).
 *   TVL / size  https://api.llama.fi/protocol/marginfi
 *               — protocol TVL plus a per-asset USD size breakdown (tokensInUsd).
 *
 * NOTE ON APY: marginfi's app has no unauthenticated REST endpoint for live
 * per-bank supply/borrow APY (app.marginfi.com/api/* 404s), and DefiLlama's
 * yields feed does not carry mrgnlend lending pools. Live APY is only derivable
 * from on-chain bank state via the marginfi SDK, which is out of scope for a
 * region-safe read-only skill. This skill therefore returns bank inventory and
 * per-asset supplied USD size, and flags APY as SDK-only.
 *
 * Actions:
 *   get_protocol_info — protocol summary + total TVL
 *   get_banks         — all mrgnlend banks with per-asset supplied USD size
 *   get_markets       — alias of get_banks
 *   get_bank          — a single bank by token symbol or mint
 */

import type { SkillExecutionResult } from '@/types/skill';

const BANK_CACHE =
  'https://storage.googleapis.com/mrgn-public/mrgn-bank-metadata-cache.json';
const LLAMA_PROTOCOL = 'https://api.llama.fi/protocol/marginfi';

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

// Normalise a token symbol for matching against DefiLlama's uppercase keys.
function normSym(s: string): string {
  return (s || '').replace(/^\$/, '').toUpperCase();
}

interface Bank {
  bankAddress: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
}

// Fetch banks + the latest per-token USD size snapshot from DefiLlama.
async function loadBanks(): Promise<{ banks: any[]; totalTvl: number }> {
  const [rawBanks, proto] = await Promise.all([
    httpGetJson(BANK_CACHE) as Promise<Bank[]>,
    httpGetJson(LLAMA_PROTOCOL).catch(() => null),
  ]);

  // Latest per-token USD size (supplied liquidity) from DefiLlama.
  let tokenUsd: Record<string, number> = {};
  let totalTvl = 0;
  if (proto) {
    totalTvl = proto?.currentChainTvls?.Solana ?? 0;
    const series = proto?.tokensInUsd;
    if (Array.isArray(series) && series.length) {
      const latest = series[series.length - 1]?.tokens ?? {};
      for (const [k, v] of Object.entries(latest)) tokenUsd[normSym(k)] = Number(v) || 0;
    }
  }

  const banks = (Array.isArray(rawBanks) ? rawBanks : [])
    .map((b) => {
      const sym = normSym(b.tokenSymbol);
      const usd = tokenUsd[sym] ?? 0;
      return {
        symbol: b.tokenSymbol,
        name: b.tokenName,
        mint: b.tokenAddress,
        bank: b.bankAddress,
        supplied_usd: usd > 0 ? fmtUsd(usd) : null,
        _usd: usd,
      };
    })
    .sort((a, b) => b._usd - a._usd)
    .map(({ _usd, ...rest }) => rest);

  return { banks, totalTvl };
}

// ── Skill metadata ───────────────────────────────────────────────────────────
export const MARGINFI_SKILL_METADATA = {
  name: 'marginfi',
  description:
    "[ARSENAL-HOSTED ✓] Read marginfi (app.marginfi.com) — one of Solana's largest permissionless " +
    'lending protocols (mrgnlend). Browse every lending bank (one per asset), see per-asset supplied ' +
    'USD size, and read protocol-wide TVL. Read-only: deposit/borrow require the marginfi SDK.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['marginfi', 'solana', 'lending', 'borrow', 'mrgnlend', 'defi', 'yield'],
  external_url: 'https://app.marginfi.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/marginfi?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_banks', 'get_markets', 'get_bank'],
        description:
          'marginfi operation. ' +
          'get_protocol_info: protocol summary + total TVL. ' +
          'get_banks: all mrgnlend banks with per-asset supplied USD size. ' +
          'get_markets: alias of get_banks. ' +
          'get_bank: one bank by token symbol or mint.',
      },
      token: {
        type: 'string',
        description: 'Token symbol (USDC, SOL, mSOL…) or SPL mint address. Required for get_bank.',
      },
      limit: {
        type: 'integer',
        description: 'Max rows for get_banks/get_markets (default 50, max 100).',
      },
    },
  },
  usage_examples: [
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'List banks', input: { action: 'get_banks', limit: 20 } },
    { title: 'USDC bank', input: { action: 'get_bank', token: 'USDC' } },
  ],
};

// ── Executor ─────────────────────────────────────────────────────────────────
export async function executeMarginfiSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  const APY_NOTE =
    'Live per-bank supply/borrow APY is not available from a region-safe unauthenticated source; ' +
    'it must be read from on-chain bank state via the marginfi SDK.';

  try {
    switch (action) {
      case 'get_protocol_info': {
        const { totalTvl, banks } = await loadBanks();
        return {
          success: true,
          output: {
            protocol: 'marginfi',
            product: 'mrgnlend',
            chain: 'solana',
            description: 'Permissionless over-collateralized lending on Solana; one isolated bank per asset.',
            total_tvl: fmtUsd(totalTvl),
            bank_count: banks.length,
            url: 'https://app.marginfi.com',
            apy_note: APY_NOTE,
          },
        };
      }

      case 'get_banks':
      case 'get_markets': {
        const limit = Math.min(input.limit ?? 50, 100);
        const { banks, totalTvl } = await loadBanks();
        return {
          success: true,
          output: {
            total_tvl: fmtUsd(totalTvl),
            count: Math.min(banks.length, limit),
            total_banks: banks.length,
            banks: banks.slice(0, limit),
            apy_note: APY_NOTE,
          },
        };
      }

      case 'get_bank': {
        const { token } = input;
        if (!token) return { success: false, error: 'token is required (symbol or mint)' };
        const { banks } = await loadBanks();
        const t = normSym(token);
        const hit =
          banks.find((b) => b.mint === token) ||
          banks.find((b) => normSym(b.symbol) === t);
        if (!hit) return { success: false, error: `No marginfi bank found for "${token}"` };
        return { success: true, output: { ...hit, apy_note: APY_NOTE } };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported: get_protocol_info, get_banks, get_markets, get_bank`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'marginfi skill execution failed' };
  }
}
