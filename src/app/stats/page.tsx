"use client";

import { useEffect, useState } from "react";
import { BarChart2, Link2, Layers, TrendingUp } from "lucide-react";

interface WeekBucket {
  week: string; // "YYYY-MM-DD" (Sunday)
  count: number;
}

interface EcosystemBucket {
  ecosystem: string;
  count: number;
}

interface StatsData {
  total_skills: number;
  total_chains: number;
  total_protocols: number;
  weekly_counts: WeekBucket[];
  ecosystem_counts: EcosystemBucket[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({
  value,
  label,
  icon: Icon,
  gradient,
}: {
  value: number | null;
  label: string;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 overflow-hidden">
      {/* background glow */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10 blur-2xl pointer-events-none"
        style={{ background: gradient }}
      />
      <div className="flex items-start justify-between">
        <div>
          <div
            className="text-4xl font-bold tabular-nums"
            style={{
              background: gradient,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {value === null ? (
              <span className="inline-block w-16 h-10 rounded-lg bg-white/[0.06] animate-pulse" />
            ) : (
              value.toLocaleString()
            )}
          </div>
          <div className="mt-1 text-sm text-slate-400">{label}</div>
        </div>
        <div
          className="p-2.5 rounded-xl"
          style={{ background: gradient + "20" }}
        >
          <Icon size={20} style={{ color: gradient.split(",")[0].replace("linear-gradient(135deg,", "").trim() }} />
        </div>
      </div>
    </div>
  );
}

function BarChart({ data }: { data: WeekBucket[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp size={16} className="text-slate-400" />
        <span className="text-sm font-medium text-slate-300">
          Skills Added per Week
        </span>
        <span className="ml-auto text-xs text-slate-500">last 16 weeks</span>
      </div>

      {/* chart area */}
      <div className="flex items-end gap-1.5 h-40">
        {data.map(({ week, count }) => {
          const CHART_H = 160; // px — matches h-40
          const heightPx = count > 0
            ? Math.max(Math.round((count / max) * CHART_H), 6)
            : 2;
          return (
            <div
              key={week}
              className="group relative flex-1 flex flex-col items-center justify-end"
            >
              {/* tooltip */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex whitespace-nowrap text-xs bg-slate-800 border border-white/[0.08] text-slate-200 rounded-md px-2 py-1 z-10 pointer-events-none gap-1">
                <span className="text-slate-400">{fmtWeek(week)}</span>
                <span className="font-semibold">{count}</span>
              </div>

              {/* bar */}
              <div
                className="w-full rounded-t-md transition-all duration-300"
                style={{
                  height: `${heightPx}px`,
                  background:
                    count > 0
                      ? "linear-gradient(180deg, #029EE7, #2814FE)"
                      : "rgba(255,255,255,0.06)",
                  opacity: count > 0 ? 0.85 : 1,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* x-axis labels — show every 4th week */}
      <div className="flex gap-1.5 mt-2">
        {data.map(({ week }, i) => (
          <div key={week} className="flex-1 text-center">
            {i % 4 === 0 ? (
              <span className="text-[10px] text-slate-600">{fmtWeek(week)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ecosystem meta ────────────────────────────────────────────────────────────

const ECOSYSTEMS: Record<string, { label: string; logo?: string; logos?: string[]; isNew?: boolean }> = {
  sui:         { label: "Sui",        logo: "https://icons.llamao.fi/icons/chains/rsz_sui.jpg" },
  solana:      { label: "Solana",     logo: "https://icons.llamao.fi/icons/chains/rsz_solana.jpg" },
  base:        { label: "Base",       logo: "https://icons.llamao.fi/icons/chains/rsz_base.jpg" },
  ethereum:    { label: "Ethereum",   logo: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg" },
  arbitrum:    { label: "Arbitrum",   logo: "https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg" },
  optimism:    { label: "Optimism",   logo: "https://icons.llamao.fi/icons/chains/rsz_optimism.jpg" },
  bsc:         { label: "BSC",        logo: "https://icons.llamao.fi/icons/chains/rsz_bsc.jpg" },
  polygon:     { label: "Polygon",    logo: "https://icons.llamao.fi/icons/chains/rsz_polygon.jpg" },
  avalanche:   { label: "Avalanche",  logo: "https://icons.llamao.fi/icons/chains/rsz_avalanche.jpg" },
  dydx:        { label: "dYdX",       logo: "https://icons.llamao.fi/icons/chains/rsz_dydx.jpg" },
  hyperliquid: { label: "Hyperliquid",logo: "https://icons.llamao.fi/icons/chains/rsz_hyperliquid.jpg" },
  primate:     { label: "Primate",    logo: "https://icons.llamao.fi/icons/chains/rsz_primate.jpg" },
  tempo:       { label: "Tempo",      logo: "https://icons.llamao.fi/icons/chains/rsz_tempo.jpg" },
  xlayer:      { label: "XLayer",     logo: "https://icons.llamao.fi/icons/chains/rsz_x-layer.jpg" },
  monad:       { label: "Monad",      logo: "https://icons.llamao.fi/icons/chains/rsz_monad.jpg", isNew: true },
  mantle:      { label: "Mantle",     logo: "https://icons.llamao.fi/icons/chains/rsz_mantle.jpg", isNew: true },
  hashkeychain: { label: "HashKey Chain", logo: "https://icons.llamao.fi/icons/chains/rsz_hashkey.jpg", isNew: true },
  canton:       { label: "Canton",        logo: "https://icons.llamao.fi/icons/protocols/canton.jpg", isNew: true },
  bridge:      { label: "Bridge",     logos: ["https://icons.llama.fi/wormhole.jpg", "https://icons.llama.fi/stargate-v2.png", "https://icons.llama.fi/across.png", "https://icons.llama.fi/debridge.jpg"] },
  "cross-chain": { label: "Cross-chain", logos: ["https://icons.llama.fi/wormhole.jpg", "https://icons.llama.fi/stargate-v2.png", "https://icons.llama.fi/across.png", "https://icons.llama.fi/debridge.jpg"] },
};

function EcosystemChart({ data }: { data: EcosystemBucket[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
      <div className="flex items-center gap-2 mb-6">
        <Layers size={16} className="text-slate-400" />
        <span className="text-sm font-medium text-slate-300">
          Skills by Ecosystem
        </span>
        <span className="ml-auto text-xs text-slate-500">sorted by count</span>
      </div>

      <div className="flex flex-col gap-3">
        {data.map(({ ecosystem, count }) => {
          const pct = Math.max((count / max) * 100, 2);
          const meta = ECOSYSTEMS[ecosystem];
          const label = meta?.label ?? ecosystem;
          const logo = meta?.logo;
          const logos = meta?.logos;
          const isNew = meta?.isNew;
          return (
            <div key={ecosystem} className="flex items-center gap-3">
              {/* logo + label */}
              <div className="w-36 shrink-0 flex items-center justify-end gap-2">
                {logos ? (
                  <div className="flex shrink-0">
                    {logos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        width={18}
                        height={18}
                        className="rounded-full ring-1 ring-[#080c18]"
                        style={{ marginLeft: i === 0 ? 0 : -6 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ))}
                  </div>
                ) : logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt={label}
                    width={20}
                    height={20}
                    className="rounded-full shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : null}
                <span className="text-xs text-slate-400 font-medium truncate">{label}</span>
                {isNew && (
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-[#029EE7]/20 text-[#029EE7] leading-none">
                    new
                  </span>
                )}
              </div>
              {/* bar track */}
              <div className="flex-1 h-6 rounded-md bg-white/[0.04] relative overflow-hidden">
                <div
                  className="h-full rounded-md transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, #2814FE, #029EE7)",
                    opacity: 0.85,
                  }}
                />
              </div>
              {/* count */}
              <div className="w-6 shrink-0 text-xs text-slate-400 tabular-nums text-right">
                {count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setStats(d);
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="min-h-screen" style={{ background: "#050510" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* heading */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={18} className="text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Ecosystem Metrics
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Arsenal Stats</h1>
          <p className="text-slate-400 text-sm">
            Live metrics from the Arsenal skill ecosystem.
          </p>
        </div>

        {error && (
          <div className="mb-8 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Failed to load stats: {error}
          </div>
        )}

        {/* stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            value={stats?.total_skills ?? null}
            label="Total Skills"
            icon={Layers}
            gradient="linear-gradient(135deg, #2814FE, #029EE7)"
          />
          <StatCard
            value={stats?.total_chains ?? null}
            label="Supported Chains"
            icon={Link2}
            gradient="linear-gradient(135deg, #a855f7, #ec4899)"
          />
          <StatCard
            value={stats?.total_protocols ?? null}
            label="Protocols"
            icon={BarChart2}
            gradient="linear-gradient(135deg, #22c55e, #06b6d4)"
          />
        </div>

        {/* weekly bar chart */}
        {stats ? (
          <BarChart data={stats.weekly_counts} />
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 h-64 animate-pulse" />
        )}

        {/* ecosystem bar chart */}
        <div className="mt-6">
          {stats?.ecosystem_counts?.length ? (
            <EcosystemChart data={stats.ecosystem_counts} />
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 h-48 animate-pulse" />
          )}
        </div>
      </div>
    </main>
  );
}
