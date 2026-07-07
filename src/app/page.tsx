"use client";

import { useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Search, Download, Play } from "lucide-react";

/* ── Data ──────────────────────────────────────────────────── */

const SAMPLE_SKILLS = [
  {
    id: "ac6ac13c-e04a-441d-ac0f-ae80231aad2d",
    name: "SUI Blockchain Toolkit",
    description: "Interact with the SUI blockchain. Check wallet balances, query token holdings, inspect NFTs, and retrieve transaction history. Supports SUI mainnet and testnet.",
    category: "DeFi",
    author_type: "official",
    rating_avg: 4.5,
    rating_count: 2,
    is_paid: false,
    tags: ["sui", "wallet", "nft"],
  },
  {
    id: "2384dbf7-10a3-4cf7-9935-62f345e38ebc",
    name: "Uniswap Build Transaction",
    description: "Generate unsigned Uniswap V3 swap calldata ready for wallet signing. Supports Ethereum, Arbitrum, Base, and Optimism with real on-chain quote fetching.",
    category: "DeFi",
    author_type: "official",
    rating_avg: 5.0,
    rating_count: 1,
    is_paid: false,
    tags: ["uniswap", "swap", "evm"],
  },
  {
    id: "9c4cddc5-afa4-4e1f-9877-1b8676debdf1",
    name: "Velodrome V2",
    description: "Real-time pool data, swap quotes, and liquidity positions for Velodrome — the dominant DEX and liquidity hub on Optimism.",
    category: "DeFi",
    author_type: "official",
    rating_avg: 5.0,
    rating_count: 1,
    is_paid: false,
    tags: ["velodrome", "optimism", "dex"],
  },
];

const CATEGORIES = [
  { name: "DeFi",           icon: "◈", desc: "DEX, lending, perps & prediction markets" },
  { name: "Bridge",         icon: "⇄", desc: "Cross-chain token bridging protocols" },
  { name: "BTC DeFi",       icon: "₿", desc: "Bitcoin liquid staking & restaking" },
  { name: "Infrastructure", icon: "⬡", desc: "Wallets, RPC, ENS & payment channels" },
  { name: "Data & Oracles", icon: "▣", desc: "Price feeds, analytics & on-chain data" },
  { name: "AI/Agent",       icon: "◉", desc: "AI-powered DeFi agent interfaces" },
  { name: "Finance",        icon: "◎", desc: "CEX data, RWA & market analytics" },
];

/* logos: chains + Clarity-Act DeFi protocols */
const MARQUEE_LOGOS = [
  /* ── Chains ── */
  { name: "Ethereum",    src: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg" },
  { name: "Solana",      src: "https://icons.llamao.fi/icons/chains/rsz_solana.jpg" },
  { name: "Sui",         src: "https://icons.llamao.fi/icons/chains/rsz_sui.jpg" },
  { name: "Base",        src: "https://icons.llamao.fi/icons/chains/rsz_base.jpg" },
  { name: "Arbitrum",    src: "https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg" },
  { name: "Optimism",    src: "https://icons.llamao.fi/icons/chains/rsz_optimism.jpg" },
  { name: "Polygon",     src: "https://icons.llamao.fi/icons/chains/rsz_polygon.jpg" },
  { name: "Avalanche",   src: "https://icons.llamao.fi/icons/chains/rsz_avalanche.jpg" },
  { name: "BSC",         src: "https://icons.llamao.fi/icons/chains/rsz_bsc.jpg" },
  { name: "Hyperliquid", src: "https://icons.llamao.fi/icons/chains/rsz_hyperliquid.jpg" },
  { name: "HashKey",     src: "https://icons.llamao.fi/icons/chains/rsz_hashkey-chain.jpg" },
  { name: "XLayer",      src: "https://icons.llamao.fi/icons/chains/rsz_x-layer.jpg" },
  { name: "Canton",      src: "https://icons.llamao.fi/icons/protocols/canton.jpg" },
  /* ── DeFi protocols ── */
  { name: "Uniswap",     src: "https://icons.llamao.fi/icons/protocols/uniswap.png" },
  { name: "Aave",        src: "https://icons.llamao.fi/icons/protocols/aave.jpg" },
  { name: "Compound",    src: "https://icons.llamao.fi/icons/protocols/compound-finance.jpg" },
  { name: "MakerDAO",    src: "https://icons.llamao.fi/icons/protocols/makerdao.jpg" },
  { name: "Curve",       src: "https://icons.llamao.fi/icons/protocols/curve-dex.jpg" },
  { name: "Lido",        src: "https://icons.llamao.fi/icons/protocols/lido.png" },
  { name: "Balancer",    src: "https://icons.llamao.fi/icons/protocols/balancer-v3.jpg" },
  { name: "dYdX",        src: "https://icons.llamao.fi/icons/protocols/dydx-v4.jpg" },
  { name: "EigenLayer",  src: "https://icons.llamao.fi/icons/protocols/eigenlayer.png" },
  { name: "Pendle",      src: "https://icons.llamao.fi/icons/protocols/pendle.jpg" },
  { name: "GMX",         src: "https://icons.llamao.fi/icons/protocols/gmx.png" },
  { name: "Rocket Pool", src: "https://icons.llamao.fi/icons/protocols/rocket-pool.jpg" },
  { name: "1inch",       src: "https://icons.llamao.fi/icons/protocols/1inch-network.jpg" },
  { name: "Scallop",     src: "https://icons.llamao.fi/icons/protocols/scallop-lend.jpg" },
  { name: "Cetus",       src: "https://icons.llamao.fi/icons/protocols/cetus.png" },
  { name: "Navi",        src: "https://icons.llamao.fi/icons/protocols/navi-protocol.jpg" },
];

function LogoMarquee() {
  const doubled = [...MARQUEE_LOGOS, ...MARQUEE_LOGOS];
  return (
    <section className="py-10 overflow-hidden border-y border-white/[0.05]" style={{ background: "rgba(255,255,255,0.015)" }}>
      <p className="text-center text-[10px] font-mono text-slate-600 tracking-[0.2em] uppercase mb-6">
        Powering agents across leading ecosystems
      </p>
      <div className="relative overflow-hidden">
        {/* fade edges */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 z-10"
          style={{ background: "linear-gradient(to right, #050510, transparent)" }} />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 z-10"
          style={{ background: "linear-gradient(to left, #050510, transparent)" }} />

        <div className="marquee-track">
          {doubled.map((logo, i) => (
            <div
              key={i}
              className="flex items-center gap-2 mx-5 shrink-0 group cursor-default"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.src}
                alt={logo.name}
                width={28}
                height={28}
                className="rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-300 ring-1 ring-white/10"
                onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }}
              />
              <span className="text-[13px] text-slate-500 group-hover:text-slate-300 transition-colors duration-300 whitespace-nowrap font-medium">
                {logo.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const HOW_IT_WORKS = [
  { step: "01", title: "Search", description: "Semantic search across all skills by intent, category, or keyword.", icon: Search },
  { step: "02", title: "Connect", description: "Access via REST API, MCP interface, or Router — same token works everywhere.", icon: Download },
  { step: "03", title: "Execute", description: "Your agent calls the skill and receives structured results in milliseconds.", icon: Play },
];

/* ── Animation variants ───────────────────────────────────── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = (delayBase = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: delayBase } },
});

/* ── Card Spotlight (mouse-tracking glow) ─────────────────── */

function SpotlightCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const { left, top } = card.getBoundingClientRect();
    card.style.setProperty("--mouse-x", `${e.clientX - left}px`);
    card.style.setProperty("--mouse-y", `${e.clientY - top}px`);
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`card-spotlight ${className}`}
    >
      {children}
    </div>
  );
}

/* ── Star rating display ──────────────────────────────────── */

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 1l1.3 2.7 3 .4-2.2 2.1.5 3L6 7.7 3.4 9.2l.5-3L1.7 4.1l3-.4z"
            fill={i <= Math.round(rating) ? "#2814FE" : "#1e293b"}
          />
        </svg>
      ))}
    </span>
  );
}

/* ── Skill card ───────────────────────────────────────────── */

function SkillCard({ skill }: { skill: typeof SAMPLE_SKILLS[0] }) {
  return (
    <SpotlightCard className="group flex flex-col h-full rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.16] transition-all duration-300 overflow-hidden">
      {/* inner content sits above the spotlight pseudo-element */}
      <div className="relative z-10 p-6 flex flex-col h-full">
        {/* header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#2814FE]/15 text-[#6B83FF] border border-[#2814FE]/20">
              {skill.category}
            </span>
            {skill.author_type === "official" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Official
              </span>
            )}
          </div>
          {skill.is_paid ? (
            <span className="text-xs font-semibold text-white whitespace-nowrap">
              ${(skill as { price?: number }).price?.toFixed(2)}
            </span>
          ) : (
            <span className="text-xs text-slate-500">Free</span>
          )}
        </div>

        <h3 className="text-base font-semibold text-white mb-2 line-clamp-1">{skill.name}</h3>
        <p className="text-sm text-slate-400 leading-relaxed line-clamp-3 flex-1">{skill.description}</p>

        {/* tags */}
        <div className="flex flex-wrap gap-1.5 mt-4 mb-4">
          {skill.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-500">
              #{tag}
            </span>
          ))}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between pt-4 border-t border-white/[0.05]">
          <div className="flex items-center gap-2">
            <Stars rating={skill.rating_avg} />
            <span className="text-xs text-slate-500">
              {skill.rating_avg.toFixed(1)} ({skill.rating_count})
            </span>
          </div>
          <Link
            href={`/skills/${skill.id}`}
            className="text-xs font-medium text-[#029EE7] hover:text-white transition-colors flex items-center gap-1"
          >
            View <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </SpotlightCard>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>

      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden min-h-[92vh] flex items-center bg-grid">
        {/* Glow orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="glow-orb absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(40,20,254,0.18) 0%, transparent 70%)" }} />
          <div className="glow-orb absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(2,158,231,0.12) 0%, transparent 70%)", animationDelay: "2s" }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-24 pb-20 w-full">
          <div className="max-w-4xl mx-auto text-center">

            {/* Logo mark */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex justify-center mb-8"
            >
              <Image src="/logo_blue.svg" alt="Sumplus Arsenal" width={52} height={52} priority />
            </motion.div>

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-slate-400 text-sm"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Skills marketplace for autonomous AI agents
            </motion.div>

            {/* Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-5xl md:text-7xl font-bold leading-[1.08] tracking-tight text-white mb-6"
            >
              The Arsenal
              <br />
              <span className="gradient-text">for AI Agents</span>
            </motion.h1>

            {/* Subheading */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-lg text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed"
            >
              Discover, deploy, and monetize skills that extend what your agents can do —
              from DeFi analytics to real-time market intelligence.
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap items-center justify-center gap-4"
            >
              <Link
                href="/skills"
                className="btn-shimmer inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold shadow-lg shadow-[#2814FE]/25 hover:scale-105 transition-transform duration-200"
              >
                Browse Skills
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold bg-white/[0.05] border border-white/[0.1] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all duration-200"
              >
                API Docs
              </Link>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ── LOGO MARQUEE ───────────────────────────────────── */}
      <LogoMarquee />

      {/* ── FEATURED SKILLS ────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            variants={stagger()}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <motion.div variants={fadeUp} className="flex items-end justify-between mb-10">
              <div>
                <p className="text-xs font-mono text-[#029EE7] mb-2 tracking-widest uppercase">Featured</p>
                <h2 className="text-3xl font-bold text-white">Top Skills</h2>
              </div>
              <Link href="/skills" className="hidden md:flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
                View all <ArrowRight size={14} />
              </Link>
            </motion.div>

            <motion.div variants={stagger(0.05)} className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {SAMPLE_SKILLS.map((skill) => (
                <motion.div key={skill.id} variants={fadeUp}>
                  <SkillCard skill={skill} />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── CATEGORIES BENTO ───────────────────────────────── */}
      <section className="py-16 bg-dots">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            variants={stagger()}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <motion.div variants={fadeUp} className="text-center mb-12">
              <p className="text-xs font-mono text-[#2814FE] mb-2 tracking-widest uppercase">Categories</p>
              <h2 className="text-3xl font-bold text-white">Browse by Domain</h2>
            </motion.div>

            <motion.div variants={stagger(0.05)} className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {CATEGORIES.map((cat, i) => (
                <motion.div key={cat.name} variants={fadeUp}>
                  <Link
                    href={`/skills?category=${encodeURIComponent(cat.name)}`}
                    className={`group block rounded-2xl p-6 bg-white/[0.03] border border-white/[0.07] hover:border-[#2814FE]/30 hover:bg-[#2814FE]/[0.05] transition-all duration-300 ${i === 0 ? "md:col-span-2" : ""}`}
                  >
                    <span className="text-2xl mb-3 block text-slate-400 group-hover:text-[#029EE7] transition-colors">{cat.icon}</span>
                    <h3 className="font-semibold text-white mb-1">{cat.name}</h3>
                    <p className="text-sm text-slate-500 group-hover:text-slate-400 transition-colors">{cat.desc}</p>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <motion.div
            variants={stagger()}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <motion.div variants={fadeUp} className="text-center mb-16">
              <p className="text-xs font-mono text-[#029EE7] mb-2 tracking-widest uppercase">Integration</p>
              <h2 className="text-3xl font-bold text-white">How It Works</h2>
            </motion.div>

            <motion.div variants={stagger(0.08)} className="relative grid grid-cols-1 md:grid-cols-3 gap-10">
              {HOW_IT_WORKS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={step.step} variants={fadeUp} className="relative flex flex-col items-center text-center">
                    {/* connector line */}
                    {i < HOW_IT_WORKS.length - 1 && (
                      <div className="hidden md:block absolute top-8 left-[calc(50%+32px)] right-0 h-px bg-gradient-to-r from-[#2814FE]/40 to-transparent" />
                    )}
                    {/* icon circle */}
                    <div className="relative z-10 w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                      style={{ background: "linear-gradient(135deg, rgba(40,20,254,0.15), rgba(2,158,231,0.15))", border: "1px solid rgba(40,20,254,0.25)" }}>
                      <Icon size={22} className="text-[#029EE7]" />
                    </div>
                    <span className="text-[10px] font-mono text-[#2814FE] font-bold tracking-widest mb-2">{step.step}</span>
                    <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{step.description}</p>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-2xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="border-beam-card text-center p-12">
              {/* logo in CTA */}
              <div className="flex justify-center mb-6">
                <Image src="/logo_white.svg" alt="Sumplus Arsenal" width={56} height={56} />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">
                Ready to supercharge<br />your AI agents?
              </h2>
              <p className="text-slate-400 mb-8 text-sm leading-relaxed">
                Join developers using Sumplus Arsenal to give their agents capabilities
                they couldn&apos;t build alone.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/login"
                  className="btn-shimmer inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold shadow-lg shadow-[#2814FE]/20 hover:scale-105 transition-transform duration-200"
                >
                  Get Started Free
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/docs"
                  className="px-8 py-3.5 rounded-xl text-sm font-semibold bg-white/[0.05] border border-white/[0.1] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all duration-200"
                >
                  Read the Docs
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-14">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            {/* Brand column */}
            <div className="col-span-2">
              <Link href="/" className="flex items-center gap-2.5 mb-4">
                <Image src="/logo_blue.svg" alt="Sumplus Arsenal" width={28} height={28} />
                <span className="font-semibold text-white">Sumplus <span className="text-slate-400 font-normal">Arsenal</span></span>
              </Link>
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
                The skills marketplace built for the AI-native era. Extend your agents. Scale with confidence.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-300 tracking-widest uppercase mb-4">Product</h4>
              <ul className="space-y-2.5 text-sm text-slate-500">
                <li><Link href="/skills" className="hover:text-slate-200 transition-colors">Browse Skills</Link></li>
                <li><Link href="/skills/upload" className="hover:text-slate-200 transition-colors">Upload Skill</Link></li>
                <li><Link href="/docs" className="hover:text-slate-200 transition-colors">API Docs</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-300 tracking-widest uppercase mb-4">Developers</h4>
              <ul className="space-y-2.5 text-sm text-slate-500">
                <li><Link href="/docs" className="hover:text-slate-200 transition-colors">Documentation</Link></li>
                <li><Link href="/docs#mcp" className="hover:text-slate-200 transition-colors">MCP Interface</Link></li>
                <li><Link href="/docs#auth" className="hover:text-slate-200 transition-colors">Authentication</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-300 tracking-widest uppercase mb-4">Account</h4>
              <ul className="space-y-2.5 text-sm text-slate-500">
                <li><Link href="/login" className="hover:text-slate-200 transition-colors">Sign In</Link></li>
                <li><Link href="/login?mode=signup" className="hover:text-slate-200 transition-colors">Create Account</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/[0.05] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-600">© 2026 Sumplus Arsenal. All rights reserved.</p>
            <p className="text-xs text-slate-700 font-mono">Built for the AI-native future</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
