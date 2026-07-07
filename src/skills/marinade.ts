/**
 * Official Skill: Marinade Finance (marinade.finance)
 *
 * Marinade is Solana's original and largest liquid-staking protocol. Staking SOL
 * mints mSOL, a yield-bearing token whose SOL value grows every epoch as staking
 * rewards accrue. Marinade also runs Marinade Native (delegated native stake).
 *
 * Data sources (all curl-verified region-safe from a cloud IP):
 *   Marinade API  https://api.marinade.finance
 *                 /tlv               — staked SOL/USD, total SOL/USD, liquidity
 *                 /msol/apy/{period} — mSOL APY ({period} = 30d, 1y, …)
 *                 /msol/price_sol    — current SOL value of 1 mSOL
 *   DefiLlama     https://api.llama.fi/protocol/marinade-liquid-staking — TVL fallback
 *   Jupiter lite  https://lite-api.jup.ag — stake/unstake tx building (SOL ⇄ mSOL)
 *
 * build_stake_tx / build_unstake_tx route SOL ⇄ mSOL through Jupiter, which quotes
 * the Marinade stake pool directly (region-safe, no SDK, no RPC). Instant unstake
 * via Jupiter settles at market rate with no unstake delay; the native delayed
 * unstake (1:1, ~1-2 epochs) requires the Marinade SDK.
 *
 * Actions:
 *   get_protocol_info — protocol summary + TVL
 *   get_stats         — mSOL APY, TVL, staked SOL/USD, mSOL price
 *   get_exchange_rate — SOL per mSOL and mSOL per SOL
 *   build_stake_tx    — stake SOL → mSOL (Jupiter-routed)
 *   build_unstake_tx  — unstake mSOL → SOL (Jupiter-routed)
 */

import type { SkillExecutionResult } from '@/types/skill';

// ── Endpoints ──────────────────────────────────────────────────────────────────
const MARINADE_API = 'https://api.marinade.finance';
const LLAMA_PROTOCOL = 'https://api.llama.fi/protocol/marinade-liquid-staking';
const JUP_API = 'https://lite-api.jup.ag/swap/v1';

// ── Constants ──────────────────────────────────────────────────────────────────
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const MSOL_MINT = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';
const LAMPORTS = 1e9; // both SOL and mSOL use 9 decimals

// ── Helpers ─────────────────────────────────────────────────────────────────────
async function httpGetJson(url: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json();
}
async function httpPostJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' },
    body: JSON.stringify(body),
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
function pctFromDecimal(d: any): string {
  const n = Number(d);
  return isFinite(n) ? `${(n * 100).toFixed(2)}%` : 'n/a';
}

// Shared Jupiter swap-tx builder (used by stake + unstake).
async function buildJupSwap(
  inputMint: string,
  outputMint: string,
  amountHuman: string,
  sender: string,
  slippageBps: number,
) {
  const amountUnits = BigInt(Math.round(parseFloat(amountHuman) * LAMPORTS));
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountUnits.toString(),
    swapMode: 'ExactIn',
    slippageBps: String(slippageBps),
  });
  const quote = await httpGetJson(`${JUP_API}/quote?${params}`);
  if (!quote?.outAmount) throw new Error('No route found for this stake/unstake amount');
  const swapResp = await httpPostJson(`${JUP_API}/swap`, {
    quoteResponse: quote,
    userPublicKey: sender,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  });
  if (!swapResp?.swapTransaction) throw new Error('Failed to build swap transaction');
  return {
    transaction: swapResp.swapTransaction as string,
    in_amount: String(Number(quote.inAmount) / LAMPORTS),
    out_amount: String(Number(quote.outAmount) / LAMPORTS),
    route: quote.routePlan?.map((r: any) => r.swapInfo?.label ?? 'unknown').filter(Boolean) ?? [],
  };
}

// ── Skill metadata ───────────────────────────────────────────────────────────
export const MARINADE_SKILL_METADATA = {
  name: 'Marinade Finance',
  description:
    "[ARSENAL-HOSTED ✓] Interact with Marinade Finance (marinade.finance) — Solana's largest liquid-staking " +
    'protocol (mSOL). Read mSOL APY, TVL, staked SOL and the live SOL/mSOL exchange rate, and build stake ' +
    '(SOL → mSOL) and unstake (mSOL → SOL) transactions routed through Jupiter.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['marinade', 'solana', 'liquid-staking', 'msol', 'staking', 'defi', 'lst'],
  external_url: 'https://marinade.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/marinade-liquid-staking?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_stats', 'get_exchange_rate', 'build_stake_tx', 'build_unstake_tx'],
        description:
          'Marinade operation. ' +
          'get_protocol_info: protocol summary + TVL. ' +
          'get_stats: mSOL APY, TVL, staked SOL/USD, mSOL price. ' +
          'get_exchange_rate: SOL per mSOL and inverse. ' +
          'build_stake_tx: stake SOL → mSOL (needs amount, sender). ' +
          'build_unstake_tx: unstake mSOL → SOL (needs amount, sender).',
      },
      amount: {
        type: 'string',
        description:
          'Human-readable amount. For build_stake_tx: SOL to stake. For build_unstake_tx: mSOL to unstake. Required for build_* actions.',
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
    { title: 'Protocol info', input: { action: 'get_protocol_info' } },
    { title: 'mSOL staking stats', input: { action: 'get_stats' } },
    { title: 'SOL/mSOL rate', input: { action: 'get_exchange_rate' } },
    { title: 'Stake 2 SOL', input: { action: 'build_stake_tx', amount: '2', sender: 'YourWalletPubkey' } },
    { title: 'Unstake 1 mSOL', input: { action: 'build_unstake_tx', amount: '1', sender: 'YourWalletPubkey' } },
  ],
};

// ── Executor ─────────────────────────────────────────────────────────────────
export async function executeMarinadeSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {
      case 'get_protocol_info': {
        const [tlv, proto] = await Promise.all([
          httpGetJson(`${MARINADE_API}/tlv`).catch(() => null),
          httpGetJson(LLAMA_PROTOCOL).catch(() => null),
        ]);
        const tvlUsd = tlv?.total_usd ?? proto?.currentChainTvls?.Solana ?? 0;
        return {
          success: true,
          output: {
            protocol: 'Marinade Finance',
            chain: 'solana',
            description:
              "Solana's largest liquid-staking protocol. Staking SOL mints mSOL, a yield-bearing token " +
              'whose SOL value grows each epoch.',
            msol_mint: MSOL_MINT,
            total_tvl: fmtUsd(tvlUsd),
            url: 'https://marinade.finance',
          },
        };
      }

      case 'get_stats': {
        const [tlv, apy30d, apy1y, priceSol] = await Promise.all([
          httpGetJson(`${MARINADE_API}/tlv`),
          httpGetJson(`${MARINADE_API}/msol/apy/30d`).catch(() => null),
          httpGetJson(`${MARINADE_API}/msol/apy/1y`).catch(() => null),
          httpGetJson(`${MARINADE_API}/msol/price_sol`).catch(() => null),
        ]);
        const rate = priceSol != null ? Number(priceSol) : (apy30d?.end_price ?? null);
        return {
          success: true,
          output: {
            msol_apy_30d: apy30d ? pctFromDecimal(apy30d.value) : null,
            msol_apy_1y: apy1y ? pctFromDecimal(apy1y.value) : null,
            sol_per_msol: rate != null ? Number(Number(rate).toFixed(6)) : null,
            total_sol: tlv?.total_sol != null ? Number(Number(tlv.total_sol).toFixed(2)) : null,
            total_usd: fmtUsd(tlv?.total_usd ?? 0),
            staked_sol: tlv?.staked_sol != null ? Number(Number(tlv.staked_sol).toFixed(2)) : null,
            staked_usd: fmtUsd(tlv?.staked_usd ?? 0),
            liquidity_sol: tlv?.liquidity_sol != null ? Number(Number(tlv.liquidity_sol).toFixed(2)) : null,
            msol_mint: MSOL_MINT,
          },
        };
      }

      case 'get_exchange_rate': {
        const priceSol = await httpGetJson(`${MARINADE_API}/msol/price_sol`);
        const solPerMsol = Number(priceSol);
        if (!isFinite(solPerMsol) || solPerMsol <= 0) {
          return { success: false, error: 'Marinade did not return a valid mSOL price' };
        }
        return {
          success: true,
          output: {
            sol_per_msol: Number(solPerMsol.toFixed(6)),
            msol_per_sol: Number((1 / solPerMsol).toFixed(6)),
            msol_mint: MSOL_MINT,
            note: 'mSOL appreciates against SOL each epoch as staking rewards accrue.',
          },
        };
      }

      case 'build_stake_tx': {
        const { amount, sender, slippage = 0.005 } = input;
        if (!amount) return { success: false, error: 'amount (SOL to stake) is required' };
        if (!sender) return { success: false, error: 'sender (Solana wallet public key) is required' };
        const r = await buildJupSwap(SOL_MINT, MSOL_MINT, String(amount), sender, Math.round(slippage * 10000));
        return {
          success: true,
          output: {
            transaction: r.transaction,
            action: 'stake',
            from: 'SOL',
            to: 'mSOL',
            sol_in: r.in_amount,
            msol_out: r.out_amount,
            route: r.route,
            chain: 'solana',
            usage: 'Pass transaction to any Solana wallet (e.g. Privy sendTransaction) to sign and submit.',
          },
        };
      }

      case 'build_unstake_tx': {
        const { amount, sender, slippage = 0.005 } = input;
        if (!amount) return { success: false, error: 'amount (mSOL to unstake) is required' };
        if (!sender) return { success: false, error: 'sender (Solana wallet public key) is required' };
        const r = await buildJupSwap(MSOL_MINT, SOL_MINT, String(amount), sender, Math.round(slippage * 10000));
        return {
          success: true,
          output: {
            transaction: r.transaction,
            action: 'unstake',
            from: 'mSOL',
            to: 'SOL',
            msol_in: r.in_amount,
            sol_out: r.out_amount,
            route: r.route,
            chain: 'solana',
            note: 'Instant unstake via Jupiter (market rate, no delay). For 1:1 native delayed unstake use the Marinade SDK.',
            usage: 'Pass transaction to any Solana wallet to sign and submit.',
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported: get_protocol_info, get_stats, get_exchange_rate, build_stake_tx, build_unstake_tx`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Marinade skill execution failed' };
  }
}
