/**
 * Shared health-probe engine. Used by:
 *   - GET /api/health  (full report + status page)
 *   - GET /api/skills   (per-skill chain-health annotation, so an agent picking a
 *                        skill sees "this chain is degraded" at selection time)
 *
 * One probe builds one report; a ~45s module cache means the catalog endpoint and
 * the status page share results instead of each re-probing ~20 endpoints. Only the
 * keyless public endpoints are probed (getPublicEndpoints) — the Alchemy URL with
 * the key is never touched here.
 */

import { RPC_REGISTRY, getPublicEndpoints, type RpcChainKey } from '@/lib/rpc';

const RPC_TIMEOUT_MS = 8_000;
const API_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 45_000;

// Region-safe, keyless data APIs Arsenal skills depend on. Extend as needed.
const EXTERNAL_APIS: { name: string; url: string }[] = [
  { name: 'CoinGecko', url: 'https://api.coingecko.com/api/v3/ping' },
  { name: 'DefiLlama', url: 'https://coins.llama.fi/prices/current/coingecko:bitcoin' },
  { name: 'Binance (market data)', url: 'https://data-api.binance.vision/api/v3/ping' },
];

export type ChainStatus = 'ok' | 'degraded' | 'down';

export interface ProviderResult {
  url: string;
  ok: boolean;
  latency_ms: number;
  block?: number;
  error?: string;
}
export interface ChainResult {
  key: RpcChainKey;
  label: string;
  chain_id: number;
  status: ChainStatus;
  providers: ProviderResult[];
}
export interface ApiResult {
  name: string;
  url: string;
  ok: boolean;
  latency_ms: number;
  status_code?: number;
  error?: string;
}
export interface HealthReport {
  checked_at: string;
  summary: {
    chains_total: number;
    chains_ok: number;
    chains_degraded: number;
    chains_down: number;
    apis_total: number;
    apis_down: number;
  };
  chains: ChainResult[];
  apis: ApiResult[];
}

async function probeRpc(url: string): Promise<ProviderResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    const latency = Date.now() - start;
    if (!res.ok) return { url, ok: false, latency_ms: latency, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { result?: string; error?: { message: string } };
    if (data.error) return { url, ok: false, latency_ms: latency, error: data.error.message };
    if (typeof data.result !== 'string') return { url, ok: false, latency_ms: latency, error: 'no result' };
    return { url, ok: true, latency_ms: latency, block: parseInt(data.result, 16) };
  } catch (e) {
    return {
      url,
      ok: false,
      latency_ms: Date.now() - start,
      error: e instanceof Error ? (e.name === 'TimeoutError' ? 'timeout' : e.message) : String(e),
    };
  }
}

async function probeApi(name: string, url: string): Promise<ApiResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    const latency = Date.now() - start;
    return { name, url, ok: res.ok, latency_ms: latency, status_code: res.status };
  } catch (e) {
    return {
      name,
      url,
      ok: false,
      latency_ms: Date.now() - start,
      error: e instanceof Error ? (e.name === 'TimeoutError' ? 'timeout' : e.message) : String(e),
    };
  }
}

async function buildReport(): Promise<HealthReport> {
  const chainKeys = Object.keys(RPC_REGISTRY) as RpcChainKey[];

  const chains = await Promise.all(
    chainKeys.map(async (key): Promise<ChainResult> => {
      const def = RPC_REGISTRY[key];
      const providers = await Promise.all(getPublicEndpoints(key).map(probeRpc));
      const up = providers.filter((p) => p.ok).length;
      const status: ChainStatus = up === 0 ? 'down' : up === providers.length ? 'ok' : 'degraded';
      return { key, label: def.label, chain_id: def.id, status, providers };
    }),
  );

  const apis = await Promise.all(EXTERNAL_APIS.map((a) => probeApi(a.name, a.url)));

  return {
    checked_at: new Date().toISOString(),
    summary: {
      chains_total: chains.length,
      chains_ok: chains.filter((c) => c.status === 'ok').length,
      chains_degraded: chains.filter((c) => c.status === 'degraded').length,
      chains_down: chains.filter((c) => c.status === 'down').length,
      apis_total: apis.length,
      apis_down: apis.filter((a) => !a.ok).length,
    },
    chains,
    apis,
  };
}

// Module-level cache (per warm server instance).
let cache: { report: HealthReport; at: number } | null = null;
let inflight: Promise<HealthReport> | null = null;

interface GetOpts {
  /** Probe fresh if the cache is missing/stale (default true). */
  allowProbe?: boolean;
  /** Force a fresh probe regardless of cache. */
  refresh?: boolean;
}

/**
 * Get the health report. With allowProbe (default) it probes when the cache is
 * stale, coalescing concurrent callers onto one in-flight probe. With
 * allowProbe:false it returns the cached report (even if slightly stale) or null,
 * never blocking — used by the catalog so listing is never slowed by a probe.
 */
export async function getHealthReport(opts: GetOpts = {}): Promise<HealthReport | null> {
  const { allowProbe = true, refresh = false } = opts;
  const fresh = cache && Date.now() - cache.at < CACHE_TTL_MS;

  if (!refresh && fresh) return cache!.report;
  if (!allowProbe) return cache?.report ?? null;

  if (!inflight) {
    inflight = buildReport()
      .then((report) => {
        cache = { report, at: Date.now() };
        return report;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// ── tag → chain mapping (skill tags encode which chain a skill operates on) ──────

const TAG_TO_CHAIN: Record<string, RpcChainKey> = {
  ethereum: 'ethereum',
  polygon: 'polygon',
  matic: 'polygon',
  bsc: 'bsc',
  bnb: 'bsc',
  'bnb-chain': 'bsc',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  avalanche: 'avalanche',
  avax: 'avalanche',
  monad: 'monad',
  mantle: 'mantle',
  xlayer: 'xlayer',
  hashkey: 'hashkey',
  hashkeychain: 'hashkey',
  arc: 'arc',
  eniac: 'eniac',
  eni: 'eniac',
};

/** Distinct chain keys a skill touches, derived from its tags (monitored chains only). */
export function tagsToChainKeys(tags: string[] = []): RpcChainKey[] {
  const out = new Set<RpcChainKey>();
  for (const t of tags) {
    const key = TAG_TO_CHAIN[t.toLowerCase()];
    if (key) out.add(key);
  }
  return [...out];
}

export interface SkillHealth {
  status: ChainStatus;
  chains: { key: RpcChainKey; label: string; status: ChainStatus }[];
}

const SEVERITY: Record<ChainStatus, number> = { ok: 0, degraded: 1, down: 2 };

/**
 * Health annotation for a skill given its tags. Returns null when the skill
 * touches no chain we monitor (e.g. Sui/Solana skills) — so the catalog only
 * annotates skills we can actually speak to.
 */
export function skillHealthFromReport(report: HealthReport, tags: string[] = []): SkillHealth | null {
  const keys = tagsToChainKeys(tags);
  if (keys.length === 0) return null;
  const chains = report.chains
    .filter((c) => keys.includes(c.key))
    .map((c) => ({ key: c.key, label: c.label, status: c.status }));
  if (chains.length === 0) return null;
  const worst = chains.reduce<ChainStatus>(
    (acc, c) => (SEVERITY[c.status] > SEVERITY[acc] ? c.status : acc),
    'ok',
  );
  return { status: worst, chains };
}
