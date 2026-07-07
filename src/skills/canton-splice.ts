/**
 * Canton Network / Splice Protocol
 *
 * Canton is Digital Asset's privacy-enabled enterprise blockchain powering
 * institutional DeFi. Splice is the native DeFi layer — Canton Coin (CC)
 * issuance, governance, and the reference AMM/DEX on the Global Synchronizer.
 *
 * [ARSENAL-HOSTED ✓] Read-only: protocol info + Canton Coin market data.
 * Market data via CoinGecko public API (no key required).
 *
 * Canton Network: https://canton.network
 * Splice docs:    https://docs.dev.sync.global
 */

import type { SkillExecutionResult } from '@/types/skill';

const CG_BASE = 'https://api.coingecko.com/api/v3';
const CNT_ID  = 'canton-network';   // CC / Canton Coin
const WCC_ID  = 'wrapped-canton-coin';

const LLAMA_BASE  = 'https://api.llama.fi';
const LLAMA_CHAIN = 'Canton';       // DefiLlama chain name

export const CANTON_SPLICE_SKILL_METADATA = {
  id: 'ada380e4-bc52-4129-b5b2-ac12480b62ac',
  name: 'Canton Network',
  description:
    '[ARSENAL-HOSTED ✓] Canton Network & Splice Protocol toolkit for AI agents. ' +
    'Query Canton Coin (CC) price & market data, get Splice DEX and governance overview, ' +
    'and retrieve Canton Network architecture details. ' +
    'Canton is the enterprise-grade privacy blockchain built by Digital Asset, ' +
    'powering institutional DeFi, tokenized assets, and the Global Synchronizer.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['canton', 'canton-network', 'splice', 'institutional-defi', 'digital-asset', 'cnt', 'privacy-blockchain'],
  external_url: 'https://canton.network',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_cnt_price', 'get_cnt_market_data', 'get_splice_info', 'get_network_tvl', 'get_ecosystem'],
        description:
          'get_protocol_info: Canton Network architecture, Splice protocol overview, and use cases. ' +
          'get_cnt_price: Current Canton Coin (CC) price in USD and major currencies. ' +
          'get_cnt_market_data: Full market stats for Canton Coin — price, market cap, volume, 24h change. ' +
          'get_splice_info: Splice DEX & governance protocol details, validator economics, and CC tokenomics. ' +
          'get_network_tvl: Live total value locked on the Canton chain plus 7d/30d TVL trend (DefiLlama). ' +
          'get_ecosystem: On-chain Canton apps tracked by DefiLlama (DEXs, bridges) with per-protocol TVL and change.',
      },
      currency: {
        type: 'string',
        description: 'Quote currency for price data. Defaults to usd. Examples: usd, eur, btc, eth.',
      },
    },
  },
  usage_examples: [
    { title: 'Canton Network overview',   input: { action: 'get_protocol_info' } },
    { title: 'Canton Coin price',         input: { action: 'get_cnt_price' } },
    { title: 'CC market data',            input: { action: 'get_cnt_market_data' } },
    { title: 'Splice protocol details',   input: { action: 'get_splice_info' } },
    { title: 'Canton chain TVL & trend',  input: { action: 'get_network_tvl' } },
    { title: 'Canton on-chain ecosystem', input: { action: 'get_ecosystem' } },
  ],
};

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

async function llamaFetch<T = any>(path: string, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`${LLAMA_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`DefiLlama ${res.status}: ${await res.text().catch(() => res.statusText)}`);
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

export async function executeCantonSplice(params: Record<string, unknown>): Promise<SkillExecutionResult> {
  const action = params.action as string;
  const currency = ((params.currency as string) || 'usd').toLowerCase();

  try {
    switch (action) {

      case 'get_protocol_info': {
        return {
          success: true,
          output: {
            protocol: 'Canton Network',
            built_by: 'Digital Asset',
            description:
              'Canton is a privacy-enabled, enterprise-grade Layer-1 blockchain purpose-built for ' +
              'institutional financial markets. Unlike public blockchains, Canton uses a unique ' +
              'sub-transaction privacy model — parties only see contract state they are a participant in.',
            key_features: [
              'Sub-transaction privacy: each participant sees only their own data',
              'DAML smart contracts: functional, formally verifiable language for financial agreements',
              'Global Synchronizer: trustless cross-domain synchronization layer',
              'Institutional DeFi: tokenized securities, repo, FX, derivatives settlement',
              'Splice Protocol: native DeFi layer with Canton Coin (CC) issuance & governance',
              'Interoperability: bridging between Canton domains and public chains',
            ],
            notable_participants: [
              'Goldman Sachs (GS DAP)',
              'BNP Paribas',
              'Broadridge',
              'Deutsche Börse Group',
              'SIX Digital Exchange',
              'Microsoft (Azure integration)',
              "Moody's",
            ],
            canton_coin: {
              symbol: 'CC',
              role: 'Native utility token for validator economics, transaction fees, and Splice governance',
              wrapped_version: 'WCC (Wrapped Canton Coin) — ERC-20 compatible for cross-chain use',
            },
            splice_protocol: 'Decentralized governance and DeFi layer for Canton Network — manages validator set, CC issuance schedules, and reference DEX',
            developer_resources: {
              docs: 'https://docs.digitalasset.com',
              splice_docs: 'https://docs.dev.sync.global',
              canton_network: 'https://canton.network',
              sdk: '@canton-network/wallet-sdk, @canton-network/dapp-sdk',
            },
          },
        };
      }

      case 'get_cnt_price': {
        const vsCurrencies = currency === 'usd' ? 'usd,eur,btc,eth' : `usd,${currency}`;
        const data = await cgFetch<Record<string, Record<string, number>>>(
          '/simple/price',
          { ids: `${CNT_ID},${WCC_ID}`, vs_currencies: vsCurrencies, include_24hr_change: 'true' },
        );
        const cc  = data[CNT_ID]  ?? {};
        const wcc = data[WCC_ID] ?? {};
        return {
          success: true,
          output: {
            canton_coin: {
              symbol: 'CC',
              price_usd: cc.usd != null ? `$${cc.usd}` : 'N/A',
              price_eur: cc.eur != null ? `€${cc.eur}` : 'N/A',
              price_btc: cc.btc != null ? `${cc.btc} BTC` : 'N/A',
              price_eth: cc.eth != null ? `${cc.eth} ETH` : 'N/A',
              ...(currency !== 'usd' && cc[currency] != null
                ? { [`price_${currency}`]: cc[currency] }
                : {}),
              change_24h: fmtPct(cc.usd_24h_change),
            },
            wrapped_canton_coin: {
              symbol: 'WCC',
              price_usd: wcc.usd != null ? `$${wcc.usd}` : 'N/A',
              note: 'ERC-20 representation of CC for cross-chain DeFi',
            },
          },
        };
      }

      case 'get_cnt_market_data': {
        const data = await cgFetch<any>(`/coins/${CNT_ID}`, {
          localization: 'false',
          tickers: 'false',
          community_data: 'false',
          developer_data: 'false',
        });
        const md = data.market_data ?? {};
        return {
          success: true,
          output: {
            name: data.name,
            symbol: (data.symbol as string)?.toUpperCase(),
            coingecko_rank: data.market_cap_rank,
            price_usd: fmtUsd(md.current_price?.usd),
            market_cap_usd: fmtUsd(md.market_cap?.usd),
            fully_diluted_valuation: fmtUsd(md.fully_diluted_valuation?.usd),
            volume_24h: fmtUsd(md.total_volume?.usd),
            circulating_supply: md.circulating_supply != null
              ? `${(md.circulating_supply as number).toLocaleString()} CC`
              : 'N/A',
            total_supply: md.total_supply != null
              ? `${(md.total_supply as number).toLocaleString()} CC`
              : 'N/A',
            price_change: {
              '1h':  fmtPct(md.price_change_percentage_1h_in_currency?.usd),
              '24h': fmtPct(md.price_change_percentage_24h),
              '7d':  fmtPct(md.price_change_percentage_7d),
              '30d': fmtPct(md.price_change_percentage_30d),
            },
            ath: {
              price: fmtUsd(md.ath?.usd),
              date: md.ath_date?.usd ? new Date(md.ath_date.usd).toLocaleDateString() : 'N/A',
              change_from_ath: fmtPct(md.ath_change_percentage?.usd),
            },
            last_updated: data.last_updated,
          },
        };
      }

      case 'get_splice_info': {
        return {
          success: true,
          output: {
            protocol: 'Splice',
            tagline: 'Decentralized governance and DeFi infrastructure for Canton Network',
            description:
              'Splice is the open-source application layer that powers the Global Synchronizer — ' +
              'the trust anchor for all Canton Network domains. It manages Canton Coin issuance, ' +
              'validator economics, and provides a reference DEX for CC liquidity.',
            core_components: {
              global_synchronizer: {
                role: 'Trustless cross-domain transaction coordination layer',
                operators: 'Super Validators (SVs) — institutional operators running the network',
                governance: 'On-chain governance via DSO (Decentralized Synchronizer Operator)',
              },
              canton_coin_cc: {
                use_cases: [
                  'Transaction fees for the Global Synchronizer',
                  'Validator rewards (SV rewards)',
                  'App rewards for Canton application developers',
                  'Governance participation',
                ],
                issuance: 'Algorithmic, managed by Splice governance rules',
              },
              splice_dex: {
                type: 'Reference AMM/DEX on Canton Network',
                pairs: 'CC-based trading pairs',
                note: 'Privacy-preserving swaps — counterparties only see their own trade legs',
              },
            },
            validator_economics: {
              super_validators: 'Institutional operators that run the Global Synchronizer',
              rewards: 'SVs earn CC rewards proportional to stake and uptime',
              requirements: 'Enterprise-grade infrastructure + Digital Asset partnership',
            },
            canton_network_stats: {
              type: 'Enterprise / permissioned with public Canton Coin layer',
              consensus: 'BFT-based (Byzantine Fault Tolerant)',
              privacy_model: 'Sub-transaction privacy — DAML contract-level data isolation',
              finality: 'Deterministic, sub-second on Global Synchronizer',
            },
            links: {
              splice_github: 'https://github.com/digital-asset/decentralized-canton-sync',
              splice_docs: 'https://docs.dev.sync.global',
              validator_onboarding: 'https://canton.network/validators',
            },
          },
        };
      }

      case 'get_network_tvl': {
        const [chains, history] = await Promise.all([
          llamaFetch<Array<{ name: string; tvl: number; tokenSymbol: string | null; gecko_id: string | null; cmcId: string | null }>>('/v2/chains'),
          llamaFetch<Array<{ date: number; tvl: number }>>(`/v2/historicalChainTvl/${LLAMA_CHAIN}`),
        ]);
        const chain = chains.find((c) => c.name === LLAMA_CHAIN);
        if (!chain) return { success: false, error: 'Canton chain not found on DefiLlama' };

        const series = Array.isArray(history) ? history : [];
        const latest = series.length ? series[series.length - 1] : null;
        const at = (daysBack: number) => {
          if (!latest || series.length < 2) return null;
          const target = latest.date - daysBack * 86_400;
          // series is chronological; find the last point at or before target
          let pick: { date: number; tvl: number } | null = null;
          for (const p of series) { if (p.date <= target) pick = p; else break; }
          return pick;
        };
        const pct = (from: number | null | undefined, to: number | null | undefined) =>
          from && to ? ((to - from) / from) * 100 : null;
        const peak = series.reduce((m, p) => (p.tvl > m.tvl ? p : m), series[0] ?? { date: 0, tvl: 0 });

        const d7 = at(7);
        const d30 = at(30);
        return {
          success: true,
          output: {
            chain: 'Canton',
            tvl_usd: fmtUsd(chain.tvl),
            native_token: chain.tokenSymbol ?? 'CC',
            coingecko_id: chain.gecko_id,
            cmc_id: chain.cmcId,
            trend: {
              change_7d:  fmtPct(pct(d7?.tvl, latest?.tvl)),
              change_30d: fmtPct(pct(d30?.tvl, latest?.tvl)),
              tvl_7d_ago:  d7  ? fmtUsd(d7.tvl)  : 'N/A',
              tvl_30d_ago: d30 ? fmtUsd(d30.tvl) : 'N/A',
            },
            peak_tvl: { value: fmtUsd(peak.tvl), date: peak.date ? new Date(peak.date * 1000).toLocaleDateString() : 'N/A' },
            history_points: series.length,
            source: 'DefiLlama',
            note: 'Chain-level TVL aggregated by DefiLlama. Canton on-chain DeFi is early-stage; figures are small relative to CC market cap.',
          },
        };
      }

      case 'get_ecosystem': {
        const protocols = await llamaFetch<Array<{
          name: string; slug: string; category: string; url: string | null;
          tvl: number | null; chainTvls?: Record<string, number>;
          change_1d: number | null; change_7d: number | null;
        }>>('/protocols', 30_000);
        const onCanton = protocols
          .filter((p) => Array.isArray((p as any).chains) && (p as any).chains.includes(LLAMA_CHAIN))
          .map((p) => ({
            name: p.name,
            category: p.category,
            tvl_usd: fmtUsd(p.chainTvls?.[LLAMA_CHAIN] ?? p.tvl ?? 0),
            tvl_raw: p.chainTvls?.[LLAMA_CHAIN] ?? p.tvl ?? 0,
            change_24h: fmtPct(p.change_1d),
            change_7d: fmtPct(p.change_7d),
            url: p.url,
            defillama: `https://defillama.com/protocol/${p.slug}`,
          }))
          .sort((a, b) => b.tvl_raw - a.tvl_raw);

        const totalTvl = onCanton.reduce((s, p) => s + (p.tvl_raw || 0), 0);
        return {
          success: true,
          output: {
            chain: 'Canton',
            protocol_count: onCanton.length,
            total_tracked_tvl: fmtUsd(totalTvl),
            protocols: onCanton.map(({ tvl_raw, ...rest }) => rest),
            source: 'DefiLlama',
            note: onCanton.length
              ? 'On-chain Canton apps tracked by DefiLlama. Coverage is partial; institutional/private Canton activity is not indexed publicly.'
              : 'No Canton protocols currently tracked by DefiLlama.',
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
