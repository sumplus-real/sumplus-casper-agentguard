"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Tag, Star, Plus, Clock, CheckCircle, XCircle } from "lucide-react";

interface MySkill {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  is_paid: boolean;
  price?: number;
  status: "pending" | "approved" | "rejected";
  author_type: "official" | "community";
  rating_avg: number;
  rating_count: number;
  created_at: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  Blockchain: "#a855f7", Finance: "#22c55e", Data: "#3b82f6",
  Productivity: "#f97316", "AI/ML": "#ec4899", Communication: "#06b6d4",
  Security: "#ef4444", Analytics: "#eab308",
};

const STATUS_CONFIG = {
  pending:  { label: "Pending Review", color: "#f59e0b", icon: Clock },
  approved: { label: "Approved",       color: "#10b981", icon: CheckCircle },
  rejected: { label: "Rejected",       color: "#ef4444", icon: XCircle },
};

function SkeletonRow() {
  return (
    <div className="bg-[#080c18] border border-white/[0.06] rounded-xl animate-pulse flex items-center gap-4 px-5 py-4">
      <div className="h-5 w-24 bg-slate-800 rounded flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-4 w-1/3 bg-slate-800 rounded mb-2" />
        <div className="h-3 w-2/3 bg-slate-800/60 rounded" />
      </div>
      <div className="hidden sm:flex gap-1.5">
        {[...Array(2)].map((_, i) => <div key={i} className="h-5 w-14 bg-slate-800 rounded" />)}
      </div>
      <div className="h-5 w-20 bg-slate-800 rounded flex-shrink-0" />
      <div className="h-5 w-16 bg-slate-800 rounded flex-shrink-0" />
    </div>
  );
}

function SkillRow({ skill }: { skill: MySkill }) {
  const color = CATEGORY_COLOR[skill.category] ?? "#6366f1";
  const stars = Math.round(skill.rating_avg);
  const status = STATUS_CONFIG[skill.status];
  const StatusIcon = status.icon;

  return (
    <Link
      href={`/skills/${skill.id}`}
      className="group flex items-center gap-4 px-5 py-4 bg-[#080c18] border border-white/[0.06] rounded-xl hover:border-white/[0.12] hover:bg-[#0a0f1e] transition-all"
    >
      {/* Category */}
      <span
        className="flex-shrink-0 text-[11px] font-medium px-2.5 py-0.5 rounded"
        style={{ background: `${color}14`, color, border: `1px solid ${color}30` }}
      >
        {skill.category}
      </span>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-white text-sm truncate block">{skill.name}</span>
        <p className="text-slate-500 text-xs mt-0.5 truncate">{skill.description}</p>
      </div>

      {/* Tags */}
      {skill.tags.length > 0 && (
        <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
          {skill.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="flex items-center gap-1 text-[10px] font-mono text-slate-600 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded">
              <Tag size={9} />{tag}
            </span>
          ))}
        </div>
      )}

      {/* Stars (only if approved) */}
      {skill.status === "approved" && (
        <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0">
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={11}
              className={i < stars ? "text-amber-400" : "text-slate-700"}
              fill={i < stars ? "currentColor" : "none"}
            />
          ))}
        </div>
      )}

      {/* Price */}
      <span className="flex-shrink-0 text-[11px] font-mono">
        {skill.is_paid
          ? <span className="text-emerald-400">${skill.price?.toFixed(2)}</span>
          : <span className="text-slate-700">FREE</span>
        }
      </span>

      {/* Status badge */}
      <span
        className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
        style={{ background: `${status.color}14`, color: status.color, border: `1px solid ${status.color}30` }}
      >
        <StatusIcon size={11} />
        {status.label}
      </span>

      <ArrowRight size={14} className="flex-shrink-0 text-slate-700 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

export default function MySkillsPage() {
  const [skills, setSkills] = useState<MySkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  useEffect(() => {
    const token = localStorage.getItem("arsenal_token");
    if (!token) { window.location.href = "/login"; return; }

    fetch("/api/users/me/skills", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setSkills(data.skills ?? []);
      })
      .catch(() => setError("Failed to load skills"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? skills : skills.filter((s) => s.status === filter);

  const counts = {
    all: skills.length,
    pending: skills.filter((s) => s.status === "pending").length,
    approved: skills.filter((s) => s.status === "approved").length,
    rejected: skills.filter((s) => s.status === "rejected").length,
  };

  return (
    <div
      className="min-h-screen bg-[#050510] py-10"
      style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.035) 1px, transparent 0)`,
        backgroundSize: "32px 32px",
      }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-[11px] text-slate-600 tracking-[0.2em] uppercase select-none">// My Skills</span>
            <div className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-white tracking-tight">My Skills</h1>
            <Link
              href="/skills/upload"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-all hover:scale-105"
              style={{ background: "linear-gradient(90deg, #2814FE, #029EE7)" }}
            >
              <Plus size={15} />
              New Skill
            </Link>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1 w-fit">
          {(["all", "approved", "pending", "rejected"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={"flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all " +
                (filter === tab ? "bg-white/[0.1] text-white" : "text-slate-500 hover:text-slate-300")}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className={"font-mono text-[10px] px-1.5 py-0.5 rounded " +
                (filter === tab ? "bg-white/10 text-slate-300" : "bg-white/[0.04] text-slate-600")}
              >
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
        ) : loading ? (
          <div className="flex flex-col gap-2">
            {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="font-mono text-5xl text-slate-800 mb-4 select-none">[ ]</div>
            {skills.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold text-slate-400 mb-2">No skills yet</h3>
                <p className="font-mono text-sm text-slate-600 mb-6">publish your first skill to get started</p>
                <Link
                  href="/skills/upload"
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg"
                  style={{ background: "linear-gradient(90deg, #2814FE, #029EE7)" }}
                >
                  <Plus size={15} /> Publish a Skill
                </Link>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-400 mb-2">No {filter} skills</h3>
                <button onClick={() => setFilter("all")} className="font-mono text-sm text-[#029EE7] hover:underline">
                  show all
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((skill) => <SkillRow key={skill.id} skill={skill} />)}
          </div>
        )}

      </div>
    </div>
  );
}
