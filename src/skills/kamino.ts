/**
 * Official Skill: Kamino Finance (kamino.finance)
 *
 * Kamino is Solana's largest lending protocol and automated-liquidity vault
 * platform. KLend powers supply/borrow markets; KVaults run automated
 * concentrated-liquidity and lending strategies.
 *
 * Skill UUID: 306c6862-1584-45d0-99c9-e20d723420b5
 *
 * Data + transactions both come from Kamino's public REST API
 * (https://api.kamino.finance) — CORS-open, no auth, region-safe. The `/ktx/*`
 * namespace returns ready-to-sign base64 Solana transactions, so no SDK or RPC
 * is needed server-side.
 *
 * Actions:
 *   get_markets       — list the lending markets Kamino runs (Main, JLP, Jito…)
 *   get_reserves      — supply/borrow APY, TVL, utilization for every reserve in a market
 *   get_reserve       — a single reserve by token symbol or mint
 *   get_vaults        — top KVaults (automated strategies) by TVL, with APY
 *   get_prices        — Kamino oracle prices for tokens
 *   build_deposit_tx  — supply/deposit liquidity into a reserve
 *   build_withdraw_tx — withdraw supplied liquidity from a reserve
 *   build_borrow_tx   — borrow against collateral in a reserve
 *   build_repay_tx    — repay borrowed debt in a reserve
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Kamino public API ──────────────────────────────────────────────────────────
const API = 'https://api.kamino.finance';

// ── Lending markets ────────────────────────────────────────────────────────────
// Pubkeys verified live from GET /v2/kamino-market (2026-06-06).
const MARKETS: Record<string, string> = {
  MAIN:     '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF',
  JLP:      'DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek',
  ALTCOINS: 'ByYiZxp8QrdN9qbdtaAiePN8AAr3qvTPppNJDpf5DVJ5',
  JITO:     'H6rHXmXoCQvq8Ue81MqNh7ow5ysPa1dSozwW3PU1dDH6',
  ETHENA:   'BJnbcRHqvppTyGesLzWASGKnmnF1wq9jZu6ExrjT7wvF',
};
const DEFAULT_MARKET = MARKETS.MAIN;

// Resolve a caller-supplied market (alias like "main"/"jlp", or a raw pubkey).
function resolveMarket(m?: string): string {
  if (!m) return DEFAULT_MARKET;
  return MARKETS[m.toUpperCase()] ?? m;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function nodeReq(method: 'GET' | 'POST', urlStr: string, body?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const bodyStr   = body !== undefined ? JSON.stringify(body) : undefined;
    let options: any;
    let client: typeof https | typeof http;
    const baseHeaders: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Arsenal/1.0',
    };
    if (bodyStr) {
      baseHeaders['Content-Type']   = 'application/json';
      baseHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method,
        headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: 30000 };
    } else {
      client  = https;
      options = { hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method,
        headers: baseHeaders, timeout: 30000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if ((res.statusCode ?? 200) >= 400) {
            const msg = parsed?.message || parsed?.error || data.slice(0, 200);
            reject(new Error(`Kamino API ${res.statusCode}: ${msg}`));
          } else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const apiGet  = (path: string) => nodeReq('GET', `${API}${path}`);
const apiPost = (path: string, body: unknown) => nodeReq('POST', `${API}${path}`, body);

function fmtUsd(n: number): string {
  if (!isFinite(n)) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function pct(s: any): string {
  const n = parseFloat(String(s ?? 0));
  return `${(n * 100).toFixed(2)}%`;
}

// Map one raw reserve-metrics entry → a clean row.
function mapReserve(r: any) {
  const supply = parseFloat(r.totalSupply ?? '0');
  const borrow = parseFloat(r.totalBorrow ?? '0');
  return {
    token:            r.liquidityToken,
    mint:             r.liquidityTokenMint,
    reserve:          r.reserve,
    supply_apy:       pct(r.supplyApy),
    borrow_apy:       pct(r.borrowApy),
    total_supply_usd: fmtUsd(parseFloat(r.totalSupplyUsd ?? '0')),
    total_borrow_usd: fmtUsd(parseFloat(r.totalBorrowUsd ?? '0')),
    utilization:      supply > 0 ? `${((borrow / supply) * 100).toFixed(2)}%` : '0%',
    max_ltv:          r.maxLtv != null ? `${r.maxLtv}%` : undefined,
  };
}

// ── Skill metadata ───────────────────────────────────────────────────────────────

export const KAMINO_SKILL_METADATA = {
  name: 'Kamino Finance',
  description:
    "Interact with Kamino Finance (kamino.finance) — Solana's largest lending protocol and " +
    'automated-liquidity vault platform. Read supply/borrow APY, TVL and utilization across ' +
    'its lending markets (Main, JLP, Jito, Altcoins, Ethena), browse automated KVault strategies ' +
    'by APY, look up oracle prices, and build ready-to-sign deposit, withdraw, borrow and repay ' +
    'transactions via Kamino\'s native API.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['kamino', 'solana', 'lending', 'borrow', 'vaults', 'yield', 'defi', 'klend'],
  external_url: 'https://kamino.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/kamino?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_markets', 'get_reserves', 'get_reserve', 'get_vaults', 'get_prices',
          'build_deposit_tx', 'build_withdraw_tx', 'build_borrow_tx', 'build_repay_tx',
        ],
        description:
          'Kamino operation. ' +
          'get_markets: list lending markets. ' +
          'get_reserves: all reserves (APY/TVL/utilization) in a market. ' +
          'get_reserve: one reserve by token. ' +
          'get_vaults: top KVault strategies by TVL+APY. ' +
          'get_prices: Kamino oracle prices. ' +
          'build_deposit_tx / build_withdraw_tx / build_borrow_tx / build_repay_tx: ' +
          'serialised Solana tx (needs token, amount, sender; optional market).',
      },
      market: {
        type: 'string',
        description:
          'Lending market: alias (main, jlp, jito, altcoins, ethena) or a raw market pubkey. ' +
          'Default: main. Used by get_reserves/get_reserve and all build_* actions.',
      },
      token: {
        type: 'string',
        description: 'Token symbol (USDC, SOL, USDT, JLP, PYUSD…) or SPL mint address. Required for get_reserve and all build_* actions.',
      },
      tokens: {
        type: 'array',
        items: { type: 'string' },
        description: 'Token symbols or mints for get_prices. Omit to return all oracle prices.',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount in token units (e.g. "100" = 100 USDC). Required for all build_* actions.',
      },
      sender: {
        type: 'string',
        description: 'Solana wallet public key (base58). Required for all build_* actions; also the transaction signer.',
      },
      limit: {
        type: 'integer',
        description: 'Max rows for get_vaults (default 15, max 50).',
      },
    },
  },
  usage_examples: [
    { title: 'List markets', input: { action: 'get_markets' } },
    { title: 'Main market reserves', input: { action: 'get_reserves', market: 'main' } },
    { title: 'USDC reserve', input: { action: 'get_reserve', token: 'USDC' } },
    { title: 'Top vaults', input: { action: 'get_vaults', limit: 10 } },
    { title: 'Deposit 100 USDC', input: { action: 'build_deposit_tx', token: 'USDC', amount: '100', sender: 'YourWalletPubkey' } },
    { title: 'Borrow 0.5 SOL', input: { action: 'build_borrow_tx', token: 'SOL', amount: '0.5', sender: 'YourWalletPubkey' } },
  ],
};

// ── Reserve resolution (token → reserve pubkey within a market) ──────────────────
async function resolveReserve(market: string, token: string): Promise<any | null> {
  const reserves: any[] = await apiGet(`/kamino-market/${market}/reserves/metrics`);
  if (!Array.isArray(reserves)) return null;
  const t = token.toUpperCase();
  // Match by mint first (exact), then by symbol.
  return (
    reserves.find((r) => (r.liquidityTokenMint ?? '') === token) ||
    reserves.find((r) => (r.liquidityToken ?? '').toUpperCase() === t) ||
    null
  );
}

// Shared builder for the four /ktx/klend actions.
async function buildKlendTx(
  op: 'deposit' | 'withdraw' | 'borrow' | 'repay',
  input: any,
): Promise<SkillExecutionResult> {
  const { token, amount, sender } = input;
  if (!token)  return { success: false, error: 'token is required' };
  if (!amount) return { success: false, error: 'amount is required' };
  if (!sender) return { success: false, error: 'sender (Solana wallet public key) is required' };

  const market   = resolveMarket(input.market);
  const reserveR = await resolveReserve(market, token);
  if (!reserveR) {
    return { success: false, error: `Token "${token}" has no reserve in market ${market}. Try get_reserves to list available tokens.` };
  }

  const resp = await apiPost(`/ktx/klend/${op}`, {
    wallet:  sender,
    market,
    reserve: reserveR.reserve,
    amount:  String(amount), // Kamino expects decimal/human units, not lamports
  });

  if (!resp?.transaction) {
    return { success: false, error: `Kamino did not return a ${op} transaction` };
  }

  return {
    success: true,
    output: {
      transaction: resp.transaction, // base64 Solana VersionedTransaction
      action:      op,
      token:       reserveR.liquidityToken,
      mint:        reserveR.liquidityTokenMint,
      amount:      String(amount),
      reserve:     reserveR.reserve,
      market,
      chain:       'solana',
      usage:       'Pass transaction to Privy sendTransaction or any Solana wallet to sign and submit.',
    },
  };
}

// ── Executor ─────────────────────────────────────────────────────────────────────

export async function executeKaminoSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {

      // ── get_markets ───────────────────────────────────────────────────────
      case 'get_markets': {
        return {
          success: true,
          output: {
            default: 'main',
            markets: Object.entries(MARKETS).map(([alias, pubkey]) => ({
              alias: alias.toLowerCase(),
              market: pubkey,
            })),
            note: 'Pass alias or pubkey as `market` to get_reserves / build_* actions.',
          },
        };
      }

      // ── get_reserves ──────────────────────────────────────────────────────
      case 'get_reserves': {
        const market = resolveMarket(input.market);
        const reserves: any[] = await apiGet(`/kamino-market/${market}/reserves/metrics`);
        if (!Array.isArray(reserves)) return { success: false, error: 'Unexpected response from Kamino reserves API' };
        const rows = reserves
          .map(mapReserve)
          .filter((r) => r.token)
          .sort((a, b) =>
            parseFloat(b.total_supply_usd.replace(/[$BMK]/g, '')) -
            parseFloat(a.total_supply_usd.replace(/[$BMK]/g, '')));
        return { success: true, output: { market, count: rows.length, reserves: rows } };
      }

      // ── get_reserve ───────────────────────────────────────────────────────
      case 'get_reserve': {
        const { token } = input;
        if (!token) return { success: false, error: 'token is required (symbol or mint)' };
        const market = resolveMarket(input.market);
        const r = await resolveReserve(market, token);
        if (!r) return { success: false, error: `Token "${token}" not found in market ${market}` };
        return { success: true, output: { market, ...mapReserve(r) } };
      }

      // ── get_vaults ────────────────────────────────────────────────────────
      case 'get_vaults': {
        const limit = Math.min(input.limit ?? 15, 50);
        const vaults: any[] = await apiGet('/kvaults/vaults');
        if (!Array.isArray(vaults)) return { success: false, error: 'Unexpected response from Kamino vaults API' };

        // Pull metrics for the first N (the list itself is large; metrics are per-vault).
        const slice = vaults.slice(0, Math.min(vaults.length, 60));
        const metrics = await Promise.all(
          slice.map(async (v) => {
            try {
              const m = await apiGet(`/kvaults/vaults/${v.address}/metrics`);
              return {
                vault:    v.address,
                token:    v.state?.tokenMint,
                tvl_usd:  parseFloat(m.tokensInvestedUsd ?? '0'),
                apy:      pct(m.apy),
                apy_7d:   pct(m.apy7d ?? m.apy7D),
                holders:  m.numberOfHolders ? Number(m.numberOfHolders) : undefined,
              };
            } catch { return null; }
          }),
        );
        const rows = metrics
          .filter((x): x is NonNullable<typeof x> => !!x)
          .sort((a, b) => b.tvl_usd - a.tvl_usd)
          .slice(0, limit)
          .map((x) => ({ ...x, tvl_usd: fmtUsd(x.tvl_usd) }));

        return { success: true, output: { count: rows.length, vaults: rows } };
      }

      // ── get_prices ────────────────────────────────────────────────────────
      case 'get_prices': {
        const all: any[] = await apiGet('/oracles/prices');
        if (!Array.isArray(all)) return { success: false, error: 'Unexpected response from Kamino oracle prices API' };
        const wanted: string[] = input.tokens ?? [];
        const wantSet = new Set(wanted.map((t) => t.toUpperCase()));
        const wantMints = new Set(wanted);
        const rows = all
          .filter((p) => wanted.length === 0 || wantSet.has((p.name ?? '').toUpperCase()) || wantMints.has(p.mint))
          .map((p) => ({ token: p.name, mint: p.mint, usd: parseFloat(p.price ?? '0'), timestamp: p.timestamp }));
        return { success: true, output: { count: rows.length, prices: rows } };
      }

      // ── build_* ───────────────────────────────────────────────────────────
      case 'build_deposit_tx':  return await buildKlendTx('deposit',  input);
      case 'build_withdraw_tx': return await buildKlendTx('withdraw', input);
      case 'build_borrow_tx':   return await buildKlendTx('borrow',   input);
      case 'build_repay_tx':    return await buildKlendTx('repay',    input);

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported: get_markets, get_reserves, get_reserve, get_vaults, get_prices, build_deposit_tx, build_withdraw_tx, build_borrow_tx, build_repay_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Kamino skill execution failed' };
  }
}
