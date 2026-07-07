"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Zap, Globe } from "lucide-react";

// ── types (mirror /api/health) ─────────────────────────────────────────────────

interface ProviderResult {
  url: string;
  ok: boolean;
  latency_ms: number;
  block?: number;
  error?: string;
}
interface ChainResult {
  key: string;
  label: string;
  chain_id: number;
  status: "ok" | "degraded" | "down";
  providers: ProviderResult[];
}
interface ApiResult {
  name: string;
  url: string;
  ok: boolean;
  latency_ms: number;
  status_code?: number;
  error?: string;
}
interface HealthReport {
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

// ── helpers ─────────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<ChainResult["status"], string> = {
  ok: "#22c55e",
  degraded: "#f59e0b",
  down: "#ef4444",
};
const STATUS_LABEL: Record<ChainResult["status"], string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Down",
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: color, boxShadow: `0 0 8px ${color}66` }}
    />
  );
}

// ── sub-components ───────────────────────────────────────────────────────────────

function SummaryBanner({ report }: { report: HealthReport }) {
  const { summary } = report;
  const allGood = summary.chains_down === 0 && summary.apis_down === 0 && summary.chains_degraded === 0;
  const anyDown = summary.chains_down > 0 || summary.apis_down > 0;
  const color = anyDown ? STATUS_COLOR.down : allGood ? STATUS_COLOR.ok : STATUS_COLOR.degraded;
  const headline = anyDown
    ? "Some services are down"
    : allGood
      ? "All systems operational"
      : "Some services degraded";

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 mb-6">
      <div className="flex items-center gap-3">
        <Dot color={color} />
        <span className="text-lg font-semibold text-white">{headline}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-2xl font-bold tabular-nums text-white">{summary.chains_ok}</div>
          <div className="text-slate-500">chains operational</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: STATUS_COLOR.degraded }}>
            {summary.chains_degraded}
          </div>
          <div className="text-slate-500">chains degraded</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: STATUS_COLOR.down }}>
            {summary.chains_down}
          </div>
          <div className="text-slate-500">chains down</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: summary.apis_down ? STATUS_COLOR.down : "#fff" }}>
            {summary.apis_down}
          </div>
          <div className="text-slate-500">APIs down</div>
        </div>
      </div>
    </div>
  );
}

function ChainCard({ chain }: { chain: ChainResult }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Dot color={STATUS_COLOR[chain.status]} />
        <span className="font-medium text-white">{chain.label}</span>
        <span className="text-xs text-slate-600 tabular-nums">#{chain.chain_id}</span>
        <span className="ml-auto text-xs" style={{ color: STATUS_COLOR[chain.status] }}>
          {STATUS_LABEL[chain.status]}
        </span>
      </div>
      <div className="space-y-2">
        {chain.providers.map((p, i) => (
          <div key={p.url} className="flex items-center gap-2 text-xs">
            <Dot color={p.ok ? STATUS_COLOR.ok : STATUS_COLOR.down} />
            <span className="text-slate-300 truncate">{hostOf(p.url)}</span>
            {i === 0 && <span className="text-[10px] text-slate-600 shrink-0">primary</span>}
            <span className="ml-auto tabular-nums shrink-0 text-slate-500">
              {p.ok ? (
                <>
                  {p.latency_ms}ms
                  {typeof p.block === "number" && (
                    <span className="text-slate-600"> · #{p.block.toLocaleString()}</span>
                  )}
                </>
              ) : (
                <span style={{ color: STATUS_COLOR.down }}>{p.error ?? "error"}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiRow({ api }: { api: ApiResult }) {
  return (
    <div className="flex items-center gap-2.5 text-sm py-2.5 border-b border-white/[0.05] last:border-0">
      <Dot color={api.ok ? STATUS_COLOR.ok : STATUS_COLOR.down} />
      <span className="text-slate-200">{api.name}</span>
      <span className="text-xs text-slate-600 truncate hidden sm:inline">{hostOf(api.url)}</span>
      <span className="ml-auto tabular-nums text-xs text-slate-500 shrink-0">
        {api.ok ? (
          `${api.latency_ms}ms`
        ) : (
          <span style={{ color: STATUS_COLOR.down }}>{api.error ?? `HTTP ${api.status_code}`}</span>
        )}
      </span>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/health${refresh ? "?refresh=1" : ""}`);
      const d = await r.json();
      if (d.error) setError(String(d.error));
      else {
        setReport(d);
        setError(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <main className="min-h-screen" style={{ background: "#050510" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* heading */}
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={18} className="text-slate-500" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Infrastructure
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Arsenal Status</h1>
            <p className="text-slate-400 text-sm">
              Live health of the RPC providers and data APIs powering Arsenal skills.
              {report && (
                <span className="text-slate-600">
                  {" "}
                  Last checked {new Date(report.checked_at).toLocaleTimeString()}.
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-8 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Failed to load status: {error}
          </div>
        )}

        {!report ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 h-40 animate-pulse" />
        ) : (
          <>
            <SummaryBanner report={report} />

            <div className="flex items-center gap-2 mb-4 mt-8">
              <Zap size={16} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-300">RPC Providers</span>
              <span className="ml-auto text-xs text-slate-500">per chain, primary first</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {report.chains.map((c) => (
                <ChainCard key={c.key} chain={c} />
              ))}
            </div>

            <div className="flex items-center gap-2 mb-2 mt-8">
              <Globe size={16} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Data APIs</span>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-1">
              {report.apis.map((a) => (
                <ApiRow key={a.name} api={a} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
