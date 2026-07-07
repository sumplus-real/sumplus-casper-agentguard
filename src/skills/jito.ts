/**
 * Official Skill: Jito (jito.network)
 *
 * Jito runs Solana's largest liquid-staking token (jitoSOL) and the dominant
 * MEV / block-engine tipping market. This skill surfaces (a) jitoSOL staking
 * economics, (b) live Jito bundle tip floors, and builds (c) stake / unstake
 * transactions by routing SOL ⇄ jitoSOL through Jupiter (region-safe, single-hop
 * through the Jito stake pool).
 *
 * Skill UUID: 378a0d53-22a6-4cce-a902-63c11f774c82
 *
 * Data sources (all curl-verified region-safe):
 *   Kobe          https://kobe.mainnet.jito.network — stake-pool stats time-series
 *   Bundles       https://bundles.jito.wtf          — MEV tip floor percentiles
 *   Jupiter lite  https://lite-api.jup.ag           — price + swap tx building
 *
 * Actions:
 *   get_stake_stats  — jitoSOL APY, TVL, supply, SOL/jitoSOL exchange rate, validators, MEV rewards
 *   get_mev_tips     — current Jito bundle tip floor (percentiles + EMA, in SOL)
 *   get_price        — jitoSOL / SOL USD prices (Jupiter)
 *   build_stake_tx   — stake SOL → jitoSOL (Jupiter-routed)
 *   build_unstake_tx — unstake jitoSOL → SOL (Jupiter-routed)
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Endpoints ────────────────────────────────────────────────────────────────────
const KOBE_STATS = 'https://kobe.mainnet.jito.network/api/v1/stake_pool_stats';
const TIP_FLOOR  = 'https://bundles.jito.wtf/api/v1/bundles/tip_floor';
const PRICE_API  = 'https://lite-api.jup.ag/price/v3';
const JUP_API    = 'https://lite-api.jup.ag/swap/v1';

// ── Constants ────────────────────────────────────────────────────────────────────
const SOL_MINT     = 'So11111111111111111111111111111111111111112';
const JITOSOL_MINT = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';
const JITO_STAKE_POOL = 'Jito4APyf642JPZPx3hGc6WWaQwsvfXdRoiZjL2EAtJ';
const LAMPORTS = 1e9; // both SOL and jitoSOL use 9 decimals

// ── Helpers ─────────────────────────────────────────────────────────────────────

function nodeReq(method: 'GET' | 'POST', urlStr: string, body?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const bodyStr   = body !== undefined ? JSON.stringify(body) : undefined;
    let options: any;
    let client: typeof https | typeof http;
    const baseHeaders: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' };
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
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
const httpGet  = (u: string) => nodeReq('GET', u);
const httpPost = (u: string, b: unknown) => nodeReq('POST', u, b);

// last numeric value of a Kobe `[{data,date}]` time-series array
function lastData(arr: any): number | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const v = arr[arr.length - 1]?.data;
  return typeof v === 'number' ? v : (v != null ? Number(v) : null);
}

// Shared Jupiter swap-tx builder (used by stake + unstake).
async function buildJupSwap(inputMint: string, outputMint: string, amountHuman: string, sender: string, slippageBps: number) {
  const amountUnits = BigInt(Math.round(parseFloat(amountHuman) * LAMPORTS));
  const params = new URLSearchParams({
    inputMint, outputMint, amount: amountUnits.toString(), swapMode: 'ExactIn', slippageBps: String(slippageBps),
  });
  const quote = await httpGet(`${JUP_API}/quote?${params}`);
  if (!quote?.outAmount) throw new Error('No route found for this stake/unstake amount');
  const swapResp = await httpPost(`${JUP_API}/swap`, {
    quoteResponse:             quote,
    userPublicKey:             sender,
    wrapAndUnwrapSol:          true,
    dynamicComputeUnitLimit:   true,
    prioritizationFeeLamports: 'auto',
  });
  if (!swapResp?.swapTransaction) throw new Error('Failed to build swap transaction');
  return {
    transaction: swapResp.swapTransaction as string,
    in_amount:  String(Number(quote.inAmount)  / LAMPORTS),
    out_amount: String(Number(quote.outAmount) / LAMPORTS),
    route:      quote.routePlan?.map((r: any) => r.swapInfo?.label ?? 'unknown').filter(Boolean) ?? [],
  };
}

// ── Skill metadata ───────────────────────────────────────────────────────────────

export const JITO_SKILL_METADATA = {
  name: 'Jito',
  description:
    "Interact with Jito (jito.network) — Solana's largest liquid-staking token (jitoSOL) and " +
    'leading MEV / block-engine tipping market. Read jitoSOL staking economics (APY, TVL, supply, ' +
    'SOL exchange rate, validator count, MEV rewards), check the live Jito bundle tip floor for ' +
    'landing transactions, and build stake (SOL → jitoSOL) and unstake (jitoSOL → SOL) transactions.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['jito', 'solana', 'liquid-staking', 'jitosol', 'mev', 'staking', 'defi', 'lst'],
  external_url: 'https://jito.network',
  logo_url: 'https://icons.llamao.fi/icons/protocols/jito?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_stake_stats', 'get_mev_tips', 'get_price', 'build_stake_tx', 'build_unstake_tx'],
        description:
          'Jito operation. ' +
          'get_stake_stats: jitoSOL APY, TVL, supply, exchange rate, validators, MEV rewards. ' +
          'get_mev_tips: current bundle tip floor (percentiles + EMA, in SOL). ' +
          'get_price: jitoSOL / SOL USD prices. ' +
          'build_stake_tx: stake SOL → jitoSOL (needs amount, sender). ' +
          'build_unstake_tx: unstake jitoSOL → SOL (needs amount, sender).',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount. For build_stake_tx: SOL to stake. For build_unstake_tx: jitoSOL to unstake. Required for build_* actions.',
      },
      sender: {
        type: 'string',
        description: 'Solana wallet public key (base58). Required for build_* actions; also the signer.',
      },
      slippage: {
        type: 'number',
        description: 'Max slippage as decimal (0.005 = 0.5%). Default 0.005. Used by build_* actions.',
      },
    },
  },
  usage_examples: [
    { title: 'jitoSOL staking stats', input: { action: 'get_stake_stats' } },
    { title: 'Current tip floor', input: { action: 'get_mev_tips' } },
    { title: 'jitoSOL price', input: { action: 'get_price' } },
    { title: 'Stake 2 SOL', input: { action: 'build_stake_tx', amount: '2', sender: 'YourWalletPubkey' } },
    { title: 'Unstake 1 jitoSOL', input: { action: 'build_unstake_tx', amount: '1', sender: 'YourWalletPubkey' } },
  ],
};

// ── Executor ─────────────────────────────────────────────────────────────────────

export async function executeJitoSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {

      // ── get_stake_stats ───────────────────────────────────────────────────
      case 'get_stake_stats': {
        const s = await httpGet(KOBE_STATS);
        const apy        = lastData(s.apy);            // decimal, e.g. 0.05
        const tvlLamports = lastData(s.tvl);           // lamports
        const supply      = lastData(s.supply);        // whole jitoSOL units (NOT lamports)
        const validators  = lastData(s.num_validators);
        const mevDaily    = lastData(s.mev_rewards);   // lamports
        const tvlSol = tvlLamports != null ? tvlLamports / LAMPORTS : null;
        const exchangeRate = (tvlSol != null && supply) ? tvlSol / supply : null;
        return {
          success: true,
          output: {
            jitosol_apy:        apy != null ? `${(apy * 100).toFixed(2)}%` : null,
            tvl_sol:            tvlSol != null ? Number(tvlSol.toFixed(2)) : null,
            jitosol_supply:     supply != null ? Number(supply.toFixed(2)) : null,
            sol_per_jitosol:    exchangeRate != null ? Number(exchangeRate.toFixed(6)) : null,
            validators,
            mev_rewards_sol_24h: mevDaily != null ? Number((mevDaily / LAMPORTS).toFixed(4)) : null,
            mev_rewards_sol_total: s.aggregated_mev_rewards != null ? Number((Number(s.aggregated_mev_rewards) / LAMPORTS).toFixed(2)) : null,
            jitosol_mint:       JITOSOL_MINT,
            stake_pool:         JITO_STAKE_POOL,
          },
        };
      }

      // ── get_mev_tips ──────────────────────────────────────────────────────
      case 'get_mev_tips': {
        const arr = await httpGet(TIP_FLOOR);
        const t = Array.isArray(arr) ? arr[0] : arr;
        if (!t) return { success: false, error: 'No tip floor data returned' };
        return {
          success: true,
          output: {
            time: t.time,
            unit: 'SOL',
            tip_floor: {
              p25: t.landed_tips_25th_percentile,
              p50: t.landed_tips_50th_percentile,
              p75: t.landed_tips_75th_percentile,
              p95: t.landed_tips_95th_percentile,
              p99: t.landed_tips_99th_percentile,
            },
            ema_p50: t.ema_landed_tips_50th_percentile,
            note: 'ema_p50 is the standard value to set a competitive Jito bundle tip.',
          },
        };
      }

      // ── get_price ─────────────────────────────────────────────────────────
      case 'get_price': {
        const data = await httpGet(`${PRICE_API}?ids=${JITOSOL_MINT},${SOL_MINT}`);
        const read = (mint: string) => {
          const e = data?.[mint];
          return e && e.usdPrice != null
            ? { usd: e.usdPrice, mint, price_change_24h: e.priceChange24h ?? null }
            : { usd: null, mint, error: 'price not available' };
        };
        return { success: true, output: { prices: { JITOSOL: read(JITOSOL_MINT), SOL: read(SOL_MINT) } } };
      }

      // ── build_stake_tx (SOL → jitoSOL) ────────────────────────────────────
      case 'build_stake_tx': {
        const { amount, sender, slippage = 0.005 } = input;
        if (!amount) return { success: false, error: 'amount (SOL to stake) is required' };
        if (!sender) return { success: false, error: 'sender (Solana wallet public key) is required' };
        const r = await buildJupSwap(SOL_MINT, JITOSOL_MINT, String(amount), sender, Math.round(slippage * 10000));
        return {
          success: true,
          output: {
            transaction: r.transaction,
            action: 'stake', from: 'SOL', to: 'jitoSOL',
            sol_in: r.in_amount, jitosol_out: r.out_amount, route: r.route, chain: 'solana',
            usage: 'Pass transaction to any Solana wallet (e.g. Privy sendTransaction) to sign and submit.',
          },
        };
      }

      // ── build_unstake_tx (jitoSOL → SOL) ──────────────────────────────────
      case 'build_unstake_tx': {
        const { amount, sender, slippage = 0.005 } = input;
        if (!amount) return { success: false, error: 'amount (jitoSOL to unstake) is required' };
        if (!sender) return { success: false, error: 'sender (Solana wallet public key) is required' };
        const r = await buildJupSwap(JITOSOL_MINT, SOL_MINT, String(amount), sender, Math.round(slippage * 10000));
        return {
          success: true,
          output: {
            transaction: r.transaction,
            action: 'unstake', from: 'jitoSOL', to: 'SOL',
            jitosol_in: r.in_amount, sol_out: r.out_amount, route: r.route, chain: 'solana',
            note: 'Instant unstake via Jupiter (market rate, no unstake delay). For 1:1 native unstake use the Jito stake pool directly.',
            usage: 'Pass transaction to any Solana wallet to sign and submit.',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Supported: get_stake_stats, get_mev_tips, get_price, build_stake_tx, build_unstake_tx` };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Jito skill execution failed' };
  }
}
