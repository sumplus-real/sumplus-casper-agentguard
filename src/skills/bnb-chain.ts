/**
 * BNB Chain Ecosystem Skill
 *
 * BNB Chain is Binance's high-performance EVM-compatible blockchain — home to
 * PancakeSwap, Venus, Lista DAO, and 1,000+ DeFi protocols. Arsenal natively
 * supports Binance x402 on BNB Chain: AI agents can pay for skills using USDT,
 * USDC, or USD1 directly on BSC with EIP-3009 / Permit2 payment flows.
 *
 * [ARSENAL-HOSTED ✓] Read-only: chain info, BNB market data, x402 payment details.
 * Market data via CoinGecko public API (no key required).
 *
 * BNB Chain: https://www.bnbchain.org
 * Binance x402: https://www.binance.com
 */

import type { SkillExecutionResult } from '@/types/skill';
import { NETWORK_ASSETS, COINBASE_FACILITATOR } from '@/lib/x402';

const CG_BASE = 'https://api.coingecko.com/api/v3';

async function cgFetch<T = any>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${CG_BASE}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json() as Promise<T>;
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null) return 'N/A';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(4)}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return 'N/A';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export const BNB_CHAIN_SKILL_METADATA = {
  id: 'e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9',
  name: 'BNB Chain',
  description:
    '[ARSENAL-HOSTED ✓] BNB Chain ecosystem toolkit for AI agents. ' +
    'Get BNB market data and chain overview, explore the BNB Chain DeFi ecosystem ' +
    '(PancakeSwap, Venus, Lista DAO, Binance Bridge), ' +
    'and get full details on Binance x402 — the HTTP-native stablecoin payment protocol ' +
    'for AI agents on BNB Chain supporting USDT, USDC, and USD1 with EIP-3009 and Permit2 flows. ' +
    'Arsenal natively supports Binance x402 on BNB Chain.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['bnb-chain', 'bsc', 'binance', 'bnb', 'pancakeswap', 'venus', 'x402', 'binance-x402', 'usdt', 'agent-payments', 'defi'],
  external_url: 'https://www.bnbchain.org',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_chain_info', 'get_bnb_price', 'get_x402_info'],
        description:
          'get_chain_info: BNB Chain overview — architecture, key protocols, TVL, and why it matters for AI agents. ' +
          'get_bnb_price: Current BNB price and market data (price, market cap, 24h change, ATH). ' +
          'get_x402_info: Full Binance x402 integration details — supported stablecoins, contract addresses, payment schemes, and how Arsenal agents pay on BNB Chain.',
      },
      currency: {
        type: 'string',
        description: 'Quote currency for price data. Defaults to usd. Examples: usd, eur, btc, eth.',
      },
    },
  },
  usage_examples: [
    { title: 'BNB Chain overview',       input: { action: 'get_chain_info' } },
    { title: 'BNB price',                input: { action: 'get_bnb_price' } },
    { title: 'Binance x402 details',     input: { action: 'get_x402_info' } },
  ],
};

export async function executeBnbChainSkill(params: Record<string, unknown>): Promise<SkillExecutionResult> {
  const action = params.action as string;
  const currency = ((params.currency as string) || 'usd').toLowerCase();

  try {
    switch (action) {

      case 'get_chain_info': {
        return {
          success: true,
          output: {
            chain: 'BNB Chain (BSC)',
            chain_id: 56,
            native_token: 'BNB',
            tagline: 'High-performance EVM blockchain by Binance — the backbone of Binance ecosystem DeFi',
            description:
              'BNB Chain (formerly Binance Smart Chain) is an EVM-compatible Layer-1 blockchain ' +
              'with ~3-second block times and sub-cent transaction fees. It is the settlement layer ' +
              'for Binance ecosystem products and hosts some of the highest-volume DeFi protocols globally.',
            key_stats: {
              consensus: 'Proof of Staked Authority (PoSA) — 21 elected validators',
              block_time: '~3 seconds',
              avg_tx_fee: '<$0.01 USD',
              evm_compatible: true,
            },
            major_protocols: [
              { name: 'PancakeSwap', category: 'DEX / AMM', note: 'Largest DEX on BNB Chain by volume' },
              { name: 'Venus Protocol', category: 'Lending / Borrowing', note: 'Largest money market on BSC' },
              { name: 'Lista DAO', category: 'Liquid Staking / CDP', note: 'lisBNB liquid staking + LISTA governance' },
              { name: 'Thena', category: 've(3,3) DEX', note: 'Next-gen AMM with THENA governance' },
              { name: 'ApeSwap', category: 'DEX / Yield', note: 'Multi-chain DEX with BSC roots' },
              { name: 'Binance Bridge', category: 'Bridge', note: 'Official cross-chain bridge for BNB Chain assets' },
            ],
            ai_agent_relevance: {
              x402_support: 'Arsenal natively supports Binance x402 on BNB Chain — agents can pay for API access with USDT, USDC, or USD1 directly on BSC',
              low_fees: 'Sub-cent gas fees make BNB Chain ideal for high-frequency agent micro-transactions',
              stable_liquidity: 'Deep USDT liquidity ($5B+) — reliable for agent payment flows',
              binance_ecosystem: 'Direct integration with Binance Pay and Trust Wallet AgentKit',
            },
            developer_resources: {
              docs: 'https://docs.bnbchain.org',
              rpc: 'https://bsc-dataseed.binance.org',
              explorer: 'https://bscscan.com',
              faucet_testnet: 'https://www.bnbchain.org/en/testnet-faucet',
            },
          },
        };
      }

      case 'get_bnb_price': {
        const vsCurrencies = currency === 'usd' ? 'usd,eur,btc,eth' : `usd,${currency}`;
        const data = await cgFetch<Record<string, Record<string, number>>>(
          '/simple/price',
          { ids: 'binancecoin', vs_currencies: vsCurrencies, include_24hr_change: 'true', include_market_cap: 'true' },
        );
        const bnb = data['binancecoin'] ?? {};
        return {
          success: true,
          output: {
            token: 'BNB',
            chain: 'BNB Chain (BSC)',
            price_usd:   bnb.usd    != null ? `$${bnb.usd}`       : 'N/A',
            price_eur:   bnb.eur    != null ? `€${bnb.eur}`       : 'N/A',
            price_btc:   bnb.btc    != null ? `${bnb.btc} BTC`    : 'N/A',
            price_eth:   bnb.eth    != null ? `${bnb.eth} ETH`    : 'N/A',
            market_cap:  bnb.usd_market_cap != null ? fmtUsd(bnb.usd_market_cap) : 'N/A',
            change_24h:  fmtPct(bnb.usd_24h_change),
            ...(currency !== 'usd' && bnb[currency] != null
              ? { [`price_${currency}`]: bnb[currency] }
              : {}),
          },
        };
      }

      case 'get_x402_info': {
        const bscAssets = NETWORK_ASSETS['bsc'] ?? {};
        const binanceFacilitator = process.env.X402_BINANCE_FACILITATOR_URL ?? null;

        return {
          success: true,
          output: {
            protocol: 'Binance x402',
            network: 'BNB Smart Chain (BSC)',
            chain_id: 56,
            launched: 'May 2026',
            description:
              'Binance x402 is HTTP-native stablecoin payments for AI agents on BNB Chain. ' +
              'It implements the x402 open standard — when an API requires payment, ' +
              'it returns HTTP 402 with BNB Chain payment requirements. ' +
              'The agent pays on-chain and retries with an X-Payment proof header.',
            arsenal_support:
              'Arsenal natively supports Binance x402. The x402 Payment Protocol skill ' +
              'auto-selects the Binance facilitator for BSC requests and can probe, ' +
              'decode, and verify Binance x402 payment flows.',
            supported_assets: [
              {
                symbol: 'USDT',
                name: 'Tether USD',
                contract: bscAssets.usdt ?? '0x55d398326f99059ff775485246999027b3197955',
                decimals: 18,
                note: 'Primary payment asset for Binance x402',
              },
              {
                symbol: 'USDC',
                name: 'USD Coin',
                contract: bscAssets.usdc ?? '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
                decimals: 18,
              },
              {
                symbol: 'USD1',
                name: 'USD1 (WLFI)',
                contract: bscAssets.usd1 ?? '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0D',
                decimals: 18,
                note: 'World Liberty Financial stablecoin, listed on Binance',
              },
            ],
            payment_schemes: [
              { scheme: 'exact',         description: 'Standard x402 exact-amount ERC-20 transfer' },
              { scheme: 'eip3009',       description: 'EIP-3009 signed transfer authorization (gasless for payer)' },
              { scheme: 'permit2-exact', description: 'Uniswap Permit2 exact-amount approval + transfer' },
              { scheme: 'permit2-upto',  description: 'Uniswap Permit2 up-to-amount approval (flexible)' },
            ],
            facilitator: {
              operator: 'Binance',
              status: binanceFacilitator
                ? `Configured: ${binanceFacilitator}`
                : 'URL not yet publicly disclosed by Binance — set X402_BINANCE_FACILITATOR_URL env var when available',
              fallback: COINBASE_FACILITATOR,
              note: 'Binance operates their own proprietary facilitator for BSC settlement. Arsenal falls back to the Coinbase facilitator until Binance publishes the endpoint.',
            },
            wallet_support: [
              'Trust Wallet (native AgentKit x402 support)',
              'Any EIP-3009 / Permit2 compatible EVM wallet',
              'Binance Wallet (Agentic Wallet, in development)',
            ],
            how_to_use: {
              step1: 'Call probe_resource with the target API URL using the x402 Payment Protocol skill',
              step2: 'Receive BSC payment requirements (asset, amount, payTo address)',
              step3: 'Sign and submit payment on BSC using your agent wallet (USDT/USDC/USD1)',
              step4: 'Call verify_payment to confirm the proof is valid',
              step5: 'Retry the original API request with X-Payment: <signed-proof> header',
            },
            links: {
              bnb_chain: 'https://www.bnbchain.org',
              bscscan: 'https://bscscan.com',
              x402_spec: 'https://x402.org',
            },
          },
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
