"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Network, TrendingUp, Database, Zap, Cpu,
  Shield, BarChart2, SlidersHorizontal, X,
  LayoutGrid, List, ArrowRight, Star, Tag, ArrowLeftRight,
  Server, Coins,
} from "lucide-react";
import SkillCard from "../../components/SkillCard";
import SearchBar from "../../components/SearchBar";
import Link from "next/link";

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

// Small badge shown only when a skill's chain is degraded/down, so an agent or
// user sees the warning at selection time. Healthy/unmonitored skills show nothing.
function HealthBadge({ health }: { health?: Skill["health"] }) {
  if (!health || health.status === "ok") return null;
  const down = health.status === "down";
  const color = down ? "#ef4444" : "#f59e0b";
  const label = down ? "chain down" : "degraded";
  const title = health.chains.map((c) => `${c.label}: ${c.status}`).join(", ");
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded flex-shrink-0"
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

const CATEGORIES = [
  "DeFi", "Bridge", "Infrastructure", "Data & Oracles", "AI/Agent", "BTC DeFi", "Finance",
];

type IconFC = React.FC<{ size?: number; className?: string }>;
const CATEGORY_META: Record<string, { color: string; icon: IconFC }> = {
  DeFi:             { color: "#f97316", icon: TrendingUp },
  Bridge:           { color: "#06b6d4", icon: ArrowLeftRight },
  Infrastructure:   { color: "#64748b", icon: Server },
  "Data & Oracles": { color: "#3b82f6", icon: Database },
  "AI/Agent":       { color: "#a78bfa", icon: Cpu },
  "BTC DeFi":       { color: "#f59e0b", icon: Coins },
  Finance:          { color: "#22c55e", icon: BarChart2 },
};

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular",   apiField: "usage_count", apiOrder: "desc" },
  { value: "rating",  label: "Highest Rated",  apiField: "rating_avg",  apiOrder: "desc" },
  { value: "newest",  label: "Newest",         apiField: "created_at",  apiOrder: "desc" },
  { value: "name",    label: "Name A→Z",       apiField: "name",        apiOrder: "asc"  },
];

const FALLBACK_SKILLS: Skill[] = [
  { id: "1", name: "SUI Blockchain Toolkit", description: "Query balances, tokens, NFTs and transactions on the SUI blockchain.", category: "Blockchain", author_type: "official", rating_avg: 4.8, rating_count: 0, tags: ["sui", "blockchain", "defi"], is_paid: false },
  { id: "2", name: "Crypto Wallet Manager",  description: "Multi-chain wallet operations: aggregate balances, estimate gas, validate addresses.", category: "Blockchain", author_type: "official", rating_avg: 4.7, rating_count: 0, tags: ["wallet", "ethereum", "polygon"], is_paid: false },
  { id: "3", name: "Sumplus Yield Optimizer", description: "Discover and optimize yield opportunities on the Sumplus platform at sumpl.us.", category: "Finance", author_type: "official", rating_avg: 4.9, rating_count: 0, tags: ["yield", "defi", "sumplus"], is_paid: true, price: 2.99 },
];

const ITEMS_PER_PAGE = 20;

function SkeletonCard() {
  return (
    <div className="bg-[#080c18] border border-white/[0.06] rounded-xl overflow-hidden animate-pulse">
      <div className="h-[2px] bg-slate-800/80" />
      <div className="p-5 flex flex-col gap-3">
        <div className="flex gap-2 items-center">
          <div className="h-6 w-24 bg-slate-800 rounded" />
          <div className="ml-auto h-5 w-10 bg-slate-800 rounded" />
        </div>
        <div>
          <div className="h-4 w-2/3 bg-slate-800 rounded mb-2" />
          <div className="h-3 w-full bg-slate-800/60 rounded mb-1" />
          <div className="h-3 w-4/5 bg-slate-800/60 rounded" />
        </div>
        <div className="flex gap-0.5">
          {[...Array(5)].map((_, i) => <div key={i} className="w-4 h-4 bg-slate-800 rounded" />)}
        </div>
        <div className="flex gap-1.5">
          {[...Array(3)].map((_, i) => <div key={i} className="h-5 w-14 bg-slate-800 rounded" />)}
        </div>
        <div className="h-9 bg-slate-800 rounded-lg" />
      </div>
    </div>
  );
}

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
      <div className="h-5 w-10 bg-slate-800 rounded flex-shrink-0" />
      <div className="h-7 w-20 bg-slate-800 rounded flex-shrink-0" />
    </div>
  );
}

function SkillRow({ skill, activeTag }: { skill: Skill; activeTag?: string | null }) {
  const CATEGORY_COLOR: Record<string, string> = {
    DeFi: "#f97316", Bridge: "#06b6d4", Infrastructure: "#64748b",
    "Data & Oracles": "#3b82f6", "AI/Agent": "#a78bfa", "BTC DeFi": "#f59e0b", Finance: "#22c55e",
  };
  const color = CATEGORY_COLOR[skill.category] ?? "#6366f1";
  const stars = Math.round(skill.rating_avg);
  const displayTags = skill.tags.slice(0, 2);

  return (
    <Link
      href={`/skills/${skill.id}`}
      className="group flex items-center gap-4 px-5 py-4 bg-[#080c18] border border-white/[0.06] rounded-xl hover:border-white/[0.12] hover:bg-[#0a0f1e] transition-all"
    >
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span
          className="text-[11px] font-medium px-2.5 py-0.5 rounded"
          style={{ background: `${color}14`, color, border: `1px solid ${color}30` }}
        >
          {skill.category}
        </span>
        {activeTag && skill.tags.includes(activeTag) && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
            {activeTag}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white text-sm truncate">{skill.name}</span>
          {skill.author_type === "official" ? (
            <span className="text-[10px] font-mono text-[#029EE7]/70 tracking-wider flex-shrink-0">arsenal</span>
          ) : skill.author_type === "verified" ? (
            <span className="text-[10px] font-mono text-emerald-500/70 tracking-wider flex-shrink-0">verified</span>
          ) : skill.author_name ? (
            <span className="text-[10px] font-mono text-slate-600 flex-shrink-0">@{skill.author_name}</span>
          ) : null}
          <HealthBadge health={skill.health} />
        </div>
        <p className="text-slate-500 text-xs mt-0.5 truncate">{skill.description}</p>
      </div>

      {displayTags.length > 0 && (
        <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
          {displayTags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 text-[10px] font-mono text-slate-600 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded">
              <Tag size={9} />{tag}
            </span>
          ))}
        </div>
      )}

      <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            size={11}
            className={i < stars ? "text-amber-400" : "text-slate-700"}
            fill={i < stars ? "currentColor" : "none"}
          />
        ))}
      </div>

      {(skill.usage_count ?? 0) > 0 ? (
        <span className="hidden md:block text-[10px] font-mono text-slate-600 flex-shrink-0 tabular-nums">
          ↗ {fmtCount(skill.usage_count!)}
        </span>
      ) : (
        <span className="hidden md:block w-8 flex-shrink-0" />
      )}

      <span className="flex-shrink-0 text-[11px] font-mono">
        {skill.is_paid
          ? <span className="text-emerald-400">${skill.price?.toFixed(2)}</span>
          : <span className="text-slate-700">FREE</span>
        }
      </span>

      <ArrowRight size={14} className="flex-shrink-0 text-slate-700 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

function SkillsPageInner() {
  const rawSearchParams = useSearchParams();
  const router = useRouter();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [totalSkills, setTotalSkills] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("popular");
  const [showPaidOnly, setShowPaidOnly] = useState(false);
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const tagFilter = rawSearchParams.get("tag");

  const sentinelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  // Track the "filter key" so we know when to reset vs append
  const filterKeyRef = useRef("");

  // Close filter popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams({
      page: String(p),
      limit: String(ITEMS_PER_PAGE),
      sort: sortBy,
    });
    if (searchQuery) params.set("search", searchQuery);
    if (selectedCategories.length === 1) params.set("category", selectedCategories[0]);
    if (tagFilter) params.set("tags", tagFilter);
    return params;
  }, [searchQuery, selectedCategories, sortBy, tagFilter]);

  // Initial load / filter change — resets skill list
  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    setPage(1);
    setHasMore(true);

    try {
      const res = await fetch(`/api/skills?${buildParams(1)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      let fetched: Skill[] = data.skills ?? [];

      // Client-side filters that the API doesn't handle
      if (selectedCategories.length > 1) fetched = fetched.filter((s) => selectedCategories.includes(s.category));
      if (showPaidOnly) fetched = fetched.filter((s) => s.is_paid);
      if (showFreeOnly) fetched = fetched.filter((s) => !s.is_paid);

      setSkills(fetched);
      setTotalSkills(data.total ?? fetched.length);
      setHasMore(fetched.length === ITEMS_PER_PAGE && (data.total ?? 0) > ITEMS_PER_PAGE);
      setUsingFallback(false);
    } catch {
      let fallback = [...FALLBACK_SKILLS];
      if (searchQuery) { const q = searchQuery.toLowerCase(); fallback = fallback.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q))); }
      if (selectedCategories.length > 0) fallback = fallback.filter((s) => selectedCategories.includes(s.category));
      if (showPaidOnly) fallback = fallback.filter((s) => s.is_paid);
      if (showFreeOnly) fallback = fallback.filter((s) => !s.is_paid);
      setSkills(fallback);
      setTotalSkills(fallback.length);
      setHasMore(false);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [buildParams, searchQuery, selectedCategories, showPaidOnly, showFreeOnly]);

  // Load next page — appends to existing list
  const fetchNextPage = useCallback(async (nextPage: number) => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const res = await fetch(`/api/skills?${buildParams(nextPage)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      let fetched: Skill[] = data.skills ?? [];

      if (selectedCategories.length > 1) fetched = fetched.filter((s) => selectedCategories.includes(s.category));
      if (showPaidOnly) fetched = fetched.filter((s) => s.is_paid);
      if (showFreeOnly) fetched = fetched.filter((s) => !s.is_paid);

      setSkills((prev) => [...prev, ...fetched]);
      setHasMore(fetched.length === ITEMS_PER_PAGE);
      setPage(nextPage);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [buildParams, loadingMore, hasMore, selectedCategories, showPaidOnly, showFreeOnly]);

  // Reset when filters change
  useEffect(() => {
    const key = JSON.stringify({ searchQuery, selectedCategories, sortBy, showPaidOnly, showFreeOnly, tagFilter });
    if (filterKeyRef.current === key) return;
    filterKeyRef.current = key;
    fetchFirstPage();
  }, [fetchFirstPage, searchQuery, selectedCategories, sortBy, showPaidOnly, showFreeOnly, tagFilter]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          fetchNextPage(page + 1);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, fetchNextPage]);

  const handleSearch = useCallback((q: string) => { setSearchQuery(q); }, []);
  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  };

  return (
    <div
      className="min-h-screen bg-[#050510] py-10"
      style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.035) 1px, transparent 0)`,
        backgroundSize: "32px 32px",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-[11px] text-slate-600 tracking-[0.2em] uppercase select-none">// Arsenal</span>
            <div className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-3">Skill Registry</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 8px #34d399" }} />
              <span className="font-mono text-xs text-emerald-400 tracking-widest">ONLINE</span>
            </div>
            <span className="text-slate-700 font-mono text-xs select-none">│</span>
            {loading ? (
              <span className="font-mono text-xs text-slate-600 animate-pulse">scanning modules...</span>
            ) : (
              <span className="font-mono text-xs text-slate-500">
                <span className="text-slate-300 font-semibold">{totalSkills}</span> modules indexed
              </span>
            )}
            {usingFallback && (
              <>
                <span className="text-slate-700 font-mono text-xs select-none">│</span>
                <span className="font-mono text-xs text-amber-500/70">demo mode — db offline</span>
              </>
            )}
          </div>
        </div>

        {/* ── CLARITY Act banner ── */}
        {tagFilter === "clarity-act" && (
          <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06]">
            <span className="text-base">⚡</span>
            <div className="flex-1 min-w-0">
              <span className="text-amber-300 font-semibold text-sm">CLARITY Act</span>
              <span className="text-slate-500 text-xs ml-2">DeFi skills aligned with the CLARITY Act legislation</span>
            </div>
            <button
              onClick={() => router.replace("/skills")}
              className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
              title="Clear filter"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Search bar ── */}
        <div className="mb-5">
          <SearchBar onSearch={handleSearch} />
        </div>

        <div>
          {/* ── Skills list ── */}
          <div>
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {/* Filter button + popover */}
              <div className="relative flex-shrink-0" ref={filterRef}>
                <button
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] transition-colors text-sm"
                  onClick={() => setSidebarOpen((v) => !v)}
                >
                  <SlidersHorizontal size={13} />
                  <span className="font-mono text-xs">filters</span>
                  {(selectedCategories.length > 0 || showPaidOnly || showFreeOnly) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#029EE7]" />
                  )}
                </button>

                {sidebarOpen && (
                  <div className="absolute top-full left-0 mt-2 z-50 w-56 rounded-xl bg-[#0b0e1f] border border-white/[0.08] shadow-2xl shadow-black/60 p-4">

                    {/* Categories */}
                    <p className="font-mono text-[10px] text-slate-600 tracking-[0.15em] uppercase mb-2">Category</p>
                    <div className="flex flex-col gap-0.5 mb-4">
                      {CATEGORIES.map((cat) => {
                        const meta = CATEGORY_META[cat] ?? { color: "#6366f1", icon: Zap };
                        const Icon = meta.icon;
                        const active = selectedCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            onClick={() => toggleCategory(cat)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all text-left w-full"
                            style={active ? {
                              background: `${meta.color}12`, color: meta.color,
                              borderLeft: `2px solid ${meta.color}`, paddingLeft: "6px",
                            } : { color: "#64748b", borderLeft: "2px solid transparent", paddingLeft: "6px" }}
                          >
                            <Icon size={12} />
                            {cat}
                          </button>
                        );
                      })}
                    </div>

                    {/* Pricing */}
                    <p className="font-mono text-[10px] text-slate-600 tracking-[0.15em] uppercase mb-2">Pricing</p>
                    <div className="flex flex-col gap-0.5 mb-4">
                      {[
                        { label: "Free only", active: showFreeOnly, toggle: () => { setShowFreeOnly((v) => !v); setShowPaidOnly(false); } },
                        { label: "Paid only", active: showPaidOnly, toggle: () => { setShowPaidOnly((v) => !v); setShowFreeOnly(false); } },
                      ].map(({ label, active, toggle }) => (
                        <button
                          key={label}
                          onClick={toggle}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all text-left w-full"
                          style={active ? {
                            color: "#029EE7", background: "rgba(2,158,231,0.08)",
                            borderLeft: "2px solid #029EE7", paddingLeft: "6px",
                          } : { color: "#64748b", borderLeft: "2px solid transparent", paddingLeft: "6px" }}
                        >
                          <span
                            className="w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center"
                            style={{ borderColor: active ? "#029EE7" : "#334155", background: active ? "rgba(2,158,231,0.2)" : "transparent" }}
                          >
                            {active && <span className="text-[#029EE7] text-[9px] font-bold leading-none">✓</span>}
                          </span>
                          {label}
                        </button>
                      ))}
                    </div>

                    {(selectedCategories.length > 0 || showPaidOnly || showFreeOnly) && (
                      <button
                        onClick={() => { setSelectedCategories([]); setShowPaidOnly(false); setShowFreeOnly(false); }}
                        className="flex items-center gap-1.5 text-[11px] font-mono text-red-500/70 hover:text-red-400 transition-colors"
                      >
                        <X size={11} /> clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              <span className="text-slate-800 font-mono text-xs select-none flex-shrink-0">│</span>

              {/* Sort pills */}
              <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-mono transition-all flex-shrink-0"
                    style={sortBy === opt.value ? {
                      background: "rgba(2,158,231,0.12)",
                      color: "#029EE7",
                      border: "1px solid rgba(2,158,231,0.3)",
                    } : {
                      background: "rgba(255,255,255,0.03)",
                      color: "#475569",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Right: result count + view toggle */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                <p className="font-mono text-xs text-slate-600 hidden sm:block">
                  {loading ? "—" : `${skills.length} result${skills.length !== 1 ? "s" : ""}`}
                </p>
                <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode("grid")}
                    title="Grid view"
                    className={"flex items-center justify-center w-7 h-7 rounded transition-all " + (viewMode === "grid" ? "bg-white/[0.1] text-white" : "text-slate-600 hover:text-slate-400")}
                  >
                    <LayoutGrid size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    title="List view"
                    className={"flex items-center justify-center w-7 h-7 rounded transition-all " + (viewMode === "list" ? "bg-white/[0.1] text-white" : "text-slate-600 hover:text-slate-400")}
                  >
                    <List size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Initial loading skeletons */}
            {loading ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {[...Array(8)].map((_, i) => <SkeletonRow key={i} />)}
                </div>
              )
            ) : skills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="font-mono text-5xl text-slate-800 mb-4 select-none">[ ]</div>
                <h3 className="text-lg font-semibold text-slate-400 mb-2">No modules found</h3>
                <p className="font-mono text-sm text-slate-600">adjust filters or search query</p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {skills.map((skill) => <SkillCard key={skill.id} skill={skill} />)}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {skills.map((skill) => <SkillRow key={skill.id} skill={skill} activeTag={tagFilter} />)}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {/* Loading more spinner */}
            {loadingMore && (
              <div className="flex justify-center py-8">
                <div className="flex items-center gap-2 font-mono text-xs text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#029EE7] animate-pulse" />
                  loading more...
                </div>
              </div>
            )}

            {/* End of list */}
            {!loading && !loadingMore && !hasMore && skills.length > 0 && (
              <div className="flex justify-center py-8">
                <span className="font-mono text-xs text-slate-700">— end of registry —</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SkillsPage() {
  return (
    <Suspense fallback={null}>
      <SkillsPageInner />
    </Suspense>
  );
}
