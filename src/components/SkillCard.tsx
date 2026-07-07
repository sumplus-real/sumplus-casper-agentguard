"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Network, TrendingUp, Database, Zap, Cpu,
  MessageSquare, Shield, BarChart2, ArrowRight, ExternalLink, ShieldCheck,
} from "lucide-react";
import StarRating from "./StarRating";

type IconFC = React.FC<{ size?: number; className?: string }>;

interface CatConfig { color: string; glow: string; icon: IconFC }

const CATEGORY_CONFIG: Record<string, CatConfig> = {
  Blockchain:    { color: "#a855f7", glow: "rgba(168,85,247,0.14)",  icon: Network },
  Finance:       { color: "#22c55e", glow: "rgba(34,197,94,0.14)",   icon: TrendingUp },
  Data:          { color: "#3b82f6", glow: "rgba(59,130,246,0.14)",  icon: Database },
  Productivity:  { color: "#f97316", glow: "rgba(249,115,22,0.14)",  icon: Zap },
  "AI/ML":       { color: "#ec4899", glow: "rgba(236,72,153,0.14)",  icon: Cpu },
  Communication: { color: "#06b6d4", glow: "rgba(6,182,212,0.14)",   icon: MessageSquare },
  Security:      { color: "#ef4444", glow: "rgba(239,68,68,0.14)",   icon: Shield },
  Analytics:     { color: "#eab308", glow: "rgba(234,179,8,0.14)",   icon: BarChart2 },
};
const DEFAULT_CFG: CatConfig = { color: "#6366f1", glow: "rgba(99,102,241,0.14)", icon: Zap };

interface Skill {
  id: string; name: string; description: string; category: string;
  author_type: "official" | "verified" | "community"; author_name?: string | null;
  rating_avg: number; rating_count: number; usage_count?: number;
  tags: string[]; is_paid: boolean; price?: number;
  external_url?: string | null;
  partner_verified?: boolean;
  health?: {
    status: "ok" | "degraded" | "down";
    chains: { key: string; label: string; status: "ok" | "degraded" | "down" }[];
  } | null;
}

// Shown only when a skill's chain is degraded/down; healthy/unmonitored = nothing.
function HealthBadge({ health }: { health?: Skill["health"] }) {
  if (!health || health.status === "ok") return null;
  const down = health.status === "down";
  const color = down ? "#ef4444" : "#f59e0b";
  const label = down ? "chain down" : "degraded";
  const title = health.chains.map((c) => `${c.label}: ${c.status}`).join(", ");
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full mb-1.5"
      style={{ color, background: `${color}14`, border: `1px solid ${color}33` }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function SkillCard({ skill }: { skill: Skill }) {
  const [hovered, setHovered] = useState(false);
  const cfg = CATEGORY_CONFIG[skill.category] ?? DEFAULT_CFG;
  const Icon = cfg.icon;

  return (
    <div
      className="relative flex flex-col bg-[#080c18] rounded-xl overflow-hidden transition-all duration-300"
      style={{
        border: `1px solid ${hovered ? cfg.color + "55" : "rgba(255,255,255,0.06)"}`,
        boxShadow: hovered ? `0 0 28px ${cfg.glow}, 0 4px 24px rgba(0,0,0,0.4)` : "0 2px 8px rgba(0,0,0,0.3)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top accent stripe */}
      <div
        className="h-[2px] w-full flex-shrink-0 transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg, ${cfg.color}dd 0%, ${cfg.color}22 60%, transparent 100%)`,
          opacity: hovered ? 1 : 0.6,
        }}
      />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Row 1: category badge + price */}
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium flex-shrink-0"
            style={{
              background: `${cfg.color}14`,
              color: cfg.color,
              border: `1px solid ${cfg.color}30`,
            }}
          >
            <Icon size={11} />
            {skill.category}
          </div>

          {skill.is_paid ? (
            <span className="text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/[0.08] border border-emerald-500/20 px-2 py-0.5 rounded">
              ${skill.price?.toFixed(2) ?? "Paid"}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-slate-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded">
              FREE
            </span>
          )}
        </div>

        {/* Author badge + name + description */}
        <div className="flex-1">
          {skill.author_type === "official" ? (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "#029EE7", boxShadow: "0 0 6px #029EE7" }}
              />
              <span className="text-[10px] font-mono text-[#029EE7]/80 tracking-[0.15em] uppercase">
                arsenal
              </span>
            </div>
          ) : skill.author_type === "verified" ? (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "#10b981", boxShadow: "0 0 6px #10b981" }}
              />
              <span className="text-[10px] font-mono text-emerald-400/80 tracking-[0.15em] uppercase">
                verified
              </span>
              {skill.author_name && (
                <span className="text-[10px] font-mono text-slate-600">· @{skill.author_name}</span>
              )}
            </div>
          ) : skill.author_name ? (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span className="text-[10px] font-mono text-slate-500 tracking-[0.1em]">
                @{skill.author_name}
              </span>
            </div>
          ) : null}
          {skill.partner_verified && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25 mb-1.5">
              <ShieldCheck size={10} />
              Partner Verified
            </span>
          )}
          <h3 className="font-semibold text-white text-base leading-snug">{skill.name}</h3>
          <div className="mt-1"><HealthBadge health={skill.health} /></div>
          <p className="text-slate-500 text-sm leading-relaxed line-clamp-2 mt-1">{skill.description}</p>
        </div>

        {/* Star rating */}
        <StarRating rating={skill.rating_avg} count={skill.rating_count} readonly />

        {/* Call count */}
        {(skill.usage_count ?? 0) > 0 && (
          <span className="text-[10px] font-mono text-slate-600 tabular-nums">
            ↗ {fmtCount(skill.usage_count!)} calls
          </span>
        )}

        {/* Tags */}
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skill.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-mono text-slate-600 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
            {skill.tags.length > 3 && (
              <span className="text-[11px] font-mono text-slate-700">+{skill.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* CTA buttons */}
        <div className="mt-auto pt-1 flex gap-2">
          <Link
            href={`/skills/${skill.id}`}
            className="group/btn flex items-center justify-between flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200"
            style={hovered ? {
              background: `${cfg.color}22`,
              border: `1px solid ${cfg.color}55`,
              color: cfg.color,
              boxShadow: `0 0 12px ${cfg.glow}`,
            } : {
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "#64748b",
            }}
          >
            <span>Inspect</span>
            <ArrowRight
              size={14}
              className="transition-transform duration-200 group-hover/btn:translate-x-0.5"
            />
          </Link>
          {skill.external_url && (
            <a
              href={skill.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center p-2 rounded-lg transition-all duration-200"
              title="Open dApp"
              style={hovered ? {
                background: `${cfg.color}22`,
                border: `1px solid ${cfg.color}55`,
                color: cfg.color,
              } : {
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "#64748b",
              }}
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
