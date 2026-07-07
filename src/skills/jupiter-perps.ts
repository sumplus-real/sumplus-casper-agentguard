/**
 * Official Skill: Jupiter Perpetuals (jup.ag/perps)
 *
 * Jupiter Perps is Solana's highest-volume perpetual-futures venue, an
 * oracle-priced, JLP-backed exchange for SOL / ETH / BTC up to high leverage.
 *
 * Skill UUID: 6f524910-fd50-4a63-b28e-14705a81802d
 *
 * All data and transactions come from Jupiter's public Perps API
 * (https://perps-api.jup.ag/v1) — region-safe, no auth. Build actions return a
 * serialized base64 Solana transaction (Jupiter uses a request-account model:
 * the returned tx creates an on-chain position request that keepers execute).
 *
 * Actions:
 *   get_markets         — SOL/ETH/BTC market price, 24h stats, borrow rate, utilization, liquidity
 *   get_market          — a single market by asset
 *   get_jlp_info        — JLP pool AUM, price, APR/APY, per-asset custodies
 *   get_positions       — open perp positions for a wallet
 *   build_open_position — open / increase a leveraged long or short (returns tx)
 *   build_close_position— close / decrease an open position (returns tx)
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Jupiter Perps API ──────────────────────────────────────────────────────────
const API = 'https://perps-api.jup.ag/v1';

// ── Markets ──────────────────────────────────────────────────────────────────────
// The Perps API keys markets by the underlying token mint.
const MARKETS: Record<string, { mint: string; decimals: number }> = {
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  ETH: { mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', decimals: 8 },
  BTC: { mint: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', decimals: 8 },
};
// Collateral / receive tokens accepted by the perps program.
const COLLATERAL: Record<string, { mint: string; decimals: number }> = {
  SOL:  { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  ETH:  { mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', decimals: 8 },
  BTC:  { mint: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', decimals: 8 },
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
};

function marketKey(asset: string): string { return (asset ?? '').toUpperCase(); }

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
          if ((res.statusCode ?? 200) >= 400) {
            const msg = parsed?.message || parsed?.error || data.slice(0, 200);
            reject(new Error(`Jupiter Perps ${res.statusCode}: ${msg}`));
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

// scale a human amount → integer string in `decimals` base units
function toUnits(amountHuman: string | number, decimals: number): string {
  return BigInt(Math.round(parseFloat(String(amountHuman)) * 10 ** decimals)).toString();
}

async function fetchMarket(asset: string) {
  const m = MARKETS[marketKey(asset)];
  if (!m) throw new Error(`Unknown market "${asset}". Supported: SOL, ETH, BTC.`);
  const [stats, pool] = await Promise.all([
    apiGet(`/market-stats?mint=${m.mint}`),
    apiGet(`/pool-info?mint=${m.mint}`).catch(() => null),
  ]);
  return {
    asset: marketKey(asset),
    mint: m.mint,
    price: stats.price,
    price_change_24h_pct: stats.priceChange24H,
    high_24h: stats.priceHigh24H,
    low_24h: stats.priceLow24H,
    volume_24h_usd: stats.volume,
    long: pool ? {
      borrow_rate_pct_hr: pool.longBorrowRatePercent,
      utilization_pct: pool.longUtilizationPercent,
      available_liquidity: pool.longAvailableLiquidity,
    } : undefined,
    short: pool ? {
      borrow_rate_pct_hr: pool.shortBorrowRatePercent,
      utilization_pct: pool.shortUtilizationPercent,
      available_liquidity: pool.shortAvailableLiquidity,
    } : undefined,
    open_fee_pct: pool?.openFeePercent,
    max_price_impact_fee_pct: pool?.maxPriceImpactFeePercent,
  };
}

// ── Skill metadata ───────────────────────────────────────────────────────────────

export const JUPITER_PERPS_SKILL_METADATA = {
  name: 'Jupiter Perpetuals',
  description:
    "Interact with Jupiter Perpetuals (jup.ag/perps) — Solana's highest-volume perp-futures venue. " +
    'Read SOL / ETH / BTC market price and 24h stats, per-side borrow rate, utilization and available ' +
    'liquidity, inspect the JLP pool (AUM, price, APR/APY, custodies), list a wallet’s open positions, ' +
    'and build transactions to open/increase a leveraged long or short and to close/decrease a position.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['jupiter', 'solana', 'perpetuals', 'perps', 'derivatives', 'leverage', 'jlp', 'defi'],
  external_url: 'https://jup.ag/perps',
  logo_url: 'https://icons.llamao.fi/icons/protocols/jupiter-perpetual-exchange?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_markets', 'get_market', 'get_jlp_info', 'get_positions', 'build_open_position', 'build_close_position'],
        description:
          'Jupiter Perps operation. ' +
          'get_markets: all markets (price, 24h, borrow rate, utilization). ' +
          'get_market: one market by asset. ' +
          'get_jlp_info: JLP pool AUM/price/APY/custodies. ' +
          'get_positions: open positions for a wallet. ' +
          'build_open_position: open/increase a long or short. ' +
          'build_close_position: close/decrease a position.',
      },
      asset:        { type: 'string', enum: ['SOL', 'ETH', 'BTC'], description: 'Market to trade. Required for get_market and build_open_position.' },
      side:         { type: 'string', enum: ['long', 'short'], description: 'Position direction for build_open_position.' },
      collateral_token: { type: 'string', enum: ['SOL', 'ETH', 'BTC', 'USDC'], description: 'Token used to fund the position (build_open_position). Default USDC.' },
      collateral_amount: { type: 'string', description: 'Human-readable collateral amount in collateral_token units (build_open_position).' },
      size_usd:     { type: 'string', description: 'Position size in USD. build_open_position: total size to open (alternative to leverage). build_close_position: USD amount to close (omit with close_all).' },
      leverage:     { type: 'string', description: 'Leverage multiple for build_open_position (e.g. "2", "5"). Provide leverage OR size_usd.' },
      close_all:    { type: 'boolean', description: 'build_close_position: close the entire position (sets size + collateral to full).' },
      collateral_usd: { type: 'string', description: 'build_close_position: USD of collateral to withdraw. Defaults to proportional / full.' },
      receive_token: { type: 'string', enum: ['SOL', 'ETH', 'BTC', 'USDC'], description: 'Token to receive when closing (build_close_position). Default USDC.' },
      position_pubkey: { type: 'string', description: 'The open position account pubkey (from get_positions). Required for build_close_position.' },
      slippage:     { type: 'number', description: 'Max slippage as decimal (0.01 = 1%). Default 0.005. Used by build_* actions.' },
      sender:       { type: 'string', description: 'Solana wallet public key (base58). Required for get_positions and build_* actions; also the signer.' },
    },
  },
  usage_examples: [
    { title: 'All markets', input: { action: 'get_markets' } },
    { title: 'SOL market', input: { action: 'get_market', asset: 'SOL' } },
    { title: 'JLP pool', input: { action: 'get_jlp_info' } },
    { title: 'My positions', input: { action: 'get_positions', sender: 'YourWalletPubkey' } },
    { title: 'Open 2x SOL long w/ 50 USDC', input: { action: 'build_open_position', asset: 'SOL', side: 'long', collateral_token: 'USDC', collateral_amount: '50', leverage: '2', sender: 'YourWalletPubkey' } },
    { title: 'Close position', input: { action: 'build_close_position', position_pubkey: 'PositionAccountPubkey', close_all: true, receive_token: 'USDC', sender: 'YourWalletPubkey' } },
  ],
};

// extract base64 tx from the {serializedTxs:[{serializedTxBase64}], txMetadata} shape
function firstTx(resp: any): { tx: string | null; meta: any; requestPubkey?: string } {
  const item = Array.isArray(resp?.serializedTxs) ? resp.serializedTxs[0] : null;
  return { tx: item?.serializedTxBase64 ?? resp?.serializedTxBase64 ?? null, meta: resp?.txMetadata, requestPubkey: item?.positionRequestPubkey };
}

// ── Executor ─────────────────────────────────────────────────────────────────────

export async function executeJupiterPerpsSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};

  try {
    switch (action) {

      // ── get_markets ───────────────────────────────────────────────────────
      case 'get_markets': {
        const markets = await Promise.all(Object.keys(MARKETS).map((a) => fetchMarket(a)));
        return { success: true, output: { count: markets.length, markets } };
      }

      // ── get_market ────────────────────────────────────────────────────────
      case 'get_market': {
        if (!input.asset) return { success: false, error: 'asset is required (SOL, ETH, BTC)' };
        return { success: true, output: await fetchMarket(input.asset) };
      }

      // ── get_jlp_info ──────────────────────────────────────────────────────
      case 'get_jlp_info': {
        const j = await apiGet('/jlp-info');
        return {
          success: true,
          output: {
            aum_usd: j.aumUsdFormatted,
            jlp_price_usd: j.jlpPriceUsdFormatted,
            jlp_total_supply: j.jlpTotalSupplyFormatted,
            apr_pct: j.jlpAprPct,
            apy_pct: j.jlpApyPct,
            custodies: (j.custodies ?? []).map((c: any) => ({
              symbol: c.symbol, name: c.name, pubkey: c.pubkey,
            })),
          },
        };
      }

      // ── get_positions ─────────────────────────────────────────────────────
      case 'get_positions': {
        if (!input.sender) return { success: false, error: 'sender (wallet public key) is required' };
        const r = await apiGet(`/positions?walletAddress=${input.sender}`);
        return { success: true, output: { count: r.count ?? (r.dataList?.length ?? 0), positions: r.dataList ?? [] } };
      }

      // ── build_open_position ───────────────────────────────────────────────
      case 'build_open_position': {
        const { asset, side, sender, slippage = 0.005 } = input;
        const collToken = (input.collateral_token ?? 'USDC').toUpperCase();
        if (!asset || !MARKETS[marketKey(asset)]) return { success: false, error: 'asset (SOL, ETH, BTC) is required' };
        if (side !== 'long' && side !== 'short')  return { success: false, error: 'side must be "long" or "short"' };
        if (!input.collateral_amount)             return { success: false, error: 'collateral_amount is required' };
        if (!input.leverage && !input.size_usd)   return { success: false, error: 'provide leverage or size_usd' };
        if (!sender)                              return { success: false, error: 'sender (wallet public key) is required' };
        const coll = COLLATERAL[collToken];
        if (!coll) return { success: false, error: `Unsupported collateral_token "${collToken}". Use SOL, ETH, BTC, or USDC.` };

        const body: any = {
          asset: marketKey(asset),
          side,
          inputToken: collToken,
          inputTokenAmount: toUnits(input.collateral_amount, coll.decimals),
          maxSlippageBps: String(Math.round(slippage * 10000)),
          walletAddress: sender,
        };
        if (input.leverage) body.leverage = String(input.leverage);
        if (input.size_usd) body.sizeUsdDelta = toUnits(input.size_usd, 6);

        const resp = await apiPost('/positions/increase', body);
        const { tx, meta, requestPubkey } = firstTx(resp);
        if (!tx) return { success: false, error: 'Jupiter Perps did not return an open-position transaction' };
        return {
          success: true,
          output: {
            transaction: tx, action: 'open', asset: marketKey(asset), side,
            collateral_token: collToken, collateral_amount: String(input.collateral_amount),
            leverage: input.leverage ?? null, size_usd: input.size_usd ?? null,
            position_request: requestPubkey, tx_metadata: meta, chain: 'solana',
            usage: 'Sign and submit with any Solana wallet. Jupiter keepers execute the position request at oracle price.',
          },
        };
      }

      // ── build_close_position ──────────────────────────────────────────────
      case 'build_close_position': {
        const { sender, slippage = 0.005 } = input;
        const recvToken = (input.receive_token ?? 'USDC').toUpperCase();
        if (!input.position_pubkey) return { success: false, error: 'position_pubkey is required (from get_positions)' };
        if (!sender)                return { success: false, error: 'sender (wallet public key) is required' };
        const recv = COLLATERAL[recvToken];
        if (!recv) return { success: false, error: `Unsupported receive_token "${recvToken}". Use SOL, ETH, BTC, or USDC.` };

        // Live API fields (confirmed): positionPubkey, desiredMint, collateralUsdDelta, sizeUsdDelta.
        const body: any = {
          positionPubkey: input.position_pubkey,
          desiredMint: recv.mint,
          walletAddress: sender,
          maxSlippageBps: String(Math.round(slippage * 10000)),
        };
        if (input.close_all) {
          body.entirePosition = true;
          body.sizeUsdDelta = '0';
          body.collateralUsdDelta = '0';
        } else {
          if (!input.size_usd) return { success: false, error: 'provide size_usd (USD to close) or set close_all: true' };
          body.sizeUsdDelta = toUnits(input.size_usd, 6);
          body.collateralUsdDelta = input.collateral_usd ? toUnits(input.collateral_usd, 6) : '0';
        }

        const resp = await apiPost('/positions/decrease', body);
        const { tx, meta, requestPubkey } = firstTx(resp);
        if (!tx) return { success: false, error: 'Jupiter Perps did not return a close-position transaction' };
        return {
          success: true,
          output: {
            transaction: tx, action: 'close', position: input.position_pubkey,
            receive_token: recvToken, close_all: !!input.close_all, size_usd: input.size_usd ?? null,
            position_request: requestPubkey, tx_metadata: meta, chain: 'solana',
            usage: 'Sign and submit with any Solana wallet. Jupiter keepers settle the decrease at oracle price.',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Supported: get_markets, get_market, get_jlp_info, get_positions, build_open_position, build_close_position` };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Jupiter Perps skill execution failed' };
  }
}
