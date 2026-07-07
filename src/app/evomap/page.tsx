"use client";

import { useRef, useCallback, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  Dna,
  Wallet,
  TrendingUp,
  Search,
  ArrowRight,
  Copy,
  Check,
  ExternalLink,
  Zap,
  Globe,
  Shield,
  Layers,
} from "lucide-react";
import { DEFI_AGENT_GENOME } from "@/data/defi-agent-genome";
import type { Gene } from "@/types/evomap";
import DnaHelix from "@/components/DnaHelix";

/* ── Animation variants (same pattern as home page) ───── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const stagger = (delayBase = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: delayBase },
  },
});

/* ── SpotlightCard (mouse-tracking glow) ──────────────── */

function SpotlightCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      if (!card) return;
      const { left, top } = card.getBoundingClientRect();
      card.style.setProperty("--mouse-x", `${e.clientX - left}px`);
      card.style.setProperty("--mouse-y", `${e.clientY - top}px`);
    },
    []
  );

  return (
    <div ref={cardRef} onMouseMove={handleMouseMove} className={`card-spotlight ${className}`}>
      {children}
    </div>
  );
}

/* ── CodeBlock with copy button ───────────────────────── */

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700 my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <span className="text-xs font-mono text-slate-400">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-slate-900 p-4 text-sm font-mono text-slate-200 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ── Gene icon + color mapping ────────────────────────── */

const GENE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  "uniswap-operations": Layers,
  "wallet-manager": Wallet,
  "yield-optimizer": TrendingUp,
  "token-price-query": Search,
};

const CATEGORY_COLORS: Record<string, string> = {
  Blockchain: "bg-purple-500/15 text-purple-300 border-purple-500/20",
  Finance: "bg-green-500/15 text-green-300 border-green-500/20",
  DeFi: "bg-[#2814FE]/15 text-[#6B83FF] border-[#2814FE]/20",
};

/* ── GeneCard ─────────────────────────────────────────── */

function GeneCard({ gene }: { gene: Gene }) {
  const Icon = GENE_ICONS[gene.id] || Zap;
  const catColor =
    CATEGORY_COLORS[gene.category] ||
    "bg-slate-500/15 text-slate-300 border-slate-500/20";

  return (
    <SpotlightCard className="group flex flex-col h-full rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.16] transition-all duration-300 overflow-hidden">
      <div className="relative z-10 p-6 flex flex-col h-full">
        {/* Header: Icon + Category + Paid/Free */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(40,20,254,0.15), rgba(2,158,231,0.15))",
                border: "1px solid rgba(40,20,254,0.25)",
              }}
            >
              <Icon size={20} className="text-[#029EE7]" />
            </div>
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${catColor}`}
            >
              {gene.category}
            </span>
          </div>
          {gene.is_paid ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Paid
            </span>
          ) : (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Free
            </span>
          )}
        </div>

        {/* Name + Description */}
        <h3 className="text-lg font-semibold text-white mb-2">{gene.name}</h3>
        <p className="text-sm text-slate-400 leading-relaxed mb-4">
          {gene.description}
        </p>

        {/* Capabilities */}
        <ul className="space-y-1.5 mb-4 flex-1">
          {gene.capabilities.map((cap) => (
            <li key={cap} className="flex items-start gap-2 text-sm text-slate-300">
              <Zap
                size={12}
                className="text-[#029EE7] mt-1 flex-shrink-0"
              />
              <span>{cap}</span>
            </li>
          ))}
        </ul>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-white/[0.05]">
          {gene.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-500"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </SpotlightCard>
  );
}

/* ── Stat ─────────────────────────────────────────────── */

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: string | number;
  label: string;
}) {
  return (
    <motion.div variants={fadeUp} className="flex flex-col items-center text-center gap-2">
      <Icon size={18} className="text-[#2814FE]" />
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </motion.div>
  );
}

/* ── Page ─────────────────────────────────────────────── */

export default function EvoMapPage() {
  const genome = DEFI_AGENT_GENOME;
  const totalCapabilities = genome.genes.reduce(
    (sum, g) => sum + g.capabilities.length,
    0
  );
  const paidCount = genome.genes.filter((g) => g.is_paid).length;

  const curlExample = `curl https://arsenal.sumplus.xyz/api/evomap/defi-agent`;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* ── HERO ───────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-grid">
        {/* Glow orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="glow-orb absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse, rgba(40,20,254,0.18) 0%, transparent 70%)",
            }}
          />
          <div
            className="glow-orb absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse, rgba(2,158,231,0.12) 0%, transparent 70%)",
              animationDelay: "2s",
            }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 lg:px-8 pt-20 pb-16">
          <div className="flex items-start gap-8 lg:gap-12">
            {/* Left: Text content */}
            <div className="flex-1 min-w-0">
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-slate-400 text-sm"
              >
                <Dna size={14} className="text-[#029EE7]" />
                Genome Evolution Protocol
              </motion.div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-4xl md:text-6xl font-bold leading-[1.08] tracking-tight text-white mb-6"
              >
                {genome.name}
              </motion.h1>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.35 }}
                className="text-lg text-slate-400 max-w-2xl mb-6 leading-relaxed"
              >
                {genome.description}
              </motion.p>

              {/* Persona */}
              <motion.blockquote
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="border-l-2 border-[#2814FE]/50 pl-4 text-sm text-slate-500 italic max-w-2xl mb-8 leading-relaxed"
              >
                &ldquo;{genome.persona}&rdquo;
              </motion.blockquote>

              {/* CTA buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45 }}
                className="flex flex-wrap gap-4 mb-8"
              >
                <a
                  href="/api/evomap/defi-agent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-shimmer inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-[#2814FE]/25 hover:scale-105 transition-transform duration-200"
                >
                  Load Genome
                  <ExternalLink size={14} />
                </a>
                <Link
                  href="/skills"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-white/[0.05] border border-white/[0.1] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all duration-200"
                >
                  Browse Skills
                  <ArrowRight size={14} />
                </Link>
              </motion.div>

              {/* Chain pills */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.55 }}
                className="flex flex-wrap gap-2"
              >
                {genome.supported_chains.map((chain) => (
                  <span
                    key={chain}
                    className="text-xs px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-400 capitalize"
                  >
                    {chain}
                  </span>
                ))}
              </motion.div>
            </div>

            {/* Right: DNA Helix */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="hidden lg:flex items-center justify-center flex-shrink-0"
            >
              <DnaHelix width={280} height={520} />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────── */}
      <section className="border-y border-white/[0.06] py-8">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            variants={stagger(0.1)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6"
          >
            <Stat icon={Dna} value={genome.genes.length} label="Genes" />
            <Stat icon={Zap} value={totalCapabilities} label="Capabilities" />
            <Stat
              icon={Globe}
              value={genome.supported_chains.length}
              label="Chains"
            />
            <Stat icon={Shield} value={`${paidCount} Paid`} label="Pricing" />
          </motion.div>
        </div>
      </section>

      {/* ── GENE CARDS ─────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <motion.div
            variants={stagger()}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <motion.div variants={fadeUp} className="text-center mb-12">
              <p className="text-xs font-mono text-[#029EE7] mb-2 tracking-widest uppercase">
                Genome Composition
              </p>
              <h2 className="text-3xl font-bold text-white">Skill Genes</h2>
            </motion.div>

            <motion.div
              variants={stagger(0.05)}
              className="grid grid-cols-1 md:grid-cols-2 gap-5"
            >
              {genome.genes.map((gene) => (
                <motion.div key={gene.id} variants={fadeUp}>
                  <GeneCard gene={gene} />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── LOAD SECTION ───────────────────────────────── */}
      <section className="py-16 bg-dots">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="border-beam-card p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Load This Genome
              </h2>
              <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                Fetch the genome definition via API. Your agent can parse the
                JSON to discover and load each skill gene, then use the persona
                to configure its DeFi expert behavior.
              </p>
              <CodeBlock code={curlExample} language="bash" />
              <p className="text-xs text-slate-600 mt-4">
                Returns structured JSON with gene definitions, capabilities,
                skill references, and agent persona.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
