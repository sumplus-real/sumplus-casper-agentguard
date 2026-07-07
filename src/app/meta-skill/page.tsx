"use client";

import { useState } from "react";
import { Copy, Check, Search, FileText, Zap, ExternalLink } from "lucide-react";

const SKILL_UUID = "ba521bd9-4da8-44ed-8a9c-525167557a79";
const BASE_URL = "https://arsenal.sumplus.xyz";

// ── copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06]"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-xl overflow-hidden border border-white/[0.08] my-3">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.06]">
        <span className="text-xs font-mono text-slate-500">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-[#050510] p-4 text-sm font-mono text-slate-200 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── integration JSON ──────────────────────────────────────────────────────────
const integrationJson = JSON.stringify(
  {
    name: "Sumplus Arsenal",
    description:
      "Arsenal is an AI skill execution infrastructure platform. One skill gives your agent access to 30+ server-side executable skills across DeFi, payments, and on-chain data — Sui, EVM chains, Solana, Hyperliquid, and more.",
    endpoint: `${BASE_URL}/api/execute`,
    auth: { type: "bearer", header: "Authorization" },
    skill_id: SKILL_UUID,
    schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["search_skills", "get_skill", "execute_skill"] },
        query: { type: "string" },
        category: { type: "string" },
        limit: { type: "number" },
        skill_id: { type: "string" },
        input: { type: "object" },
        api_key: { type: "string" },
      },
    },
    docs_url: `${BASE_URL}/meta-skill`,
  },
  null,
  2
);

// ── examples ──────────────────────────────────────────────────────────────────
const exSearch = `curl -X POST ${BASE_URL}/api/execute \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "skill_id": "${SKILL_UUID}",
    "input": {
      "action": "search_skills",
      "query": "swap",
      "limit": 5
    }
  }'`;

const exGet = `curl -X POST ${BASE_URL}/api/execute \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "skill_id": "${SKILL_UUID}",
    "input": {
      "action": "get_skill",
      "skill_id": "SKILL_UUID_HERE"
    }
  }'`;

const exExecute = `curl -X POST ${BASE_URL}/api/execute \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "skill_id": "${SKILL_UUID}",
    "input": {
      "action": "execute_skill",
      "skill_id": "SKILL_UUID_HERE",
      "input": { "action": "get_quote", "..." : "..." },
      "api_key": "YOUR_API_KEY"
    }
  }'`;

const ACTIONS = [
  {
    name: "search_skills",
    icon: Search,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    tagBg: "bg-blue-500/20 text-blue-300",
    description: "Search the Arsenal skill library by keyword and/or category. Returns skill names, IDs, and descriptions.",
    params: [
      { name: "query", type: "string", required: false, desc: 'Full-text search, e.g. "swap" or "Sui balance"' },
      { name: "category", type: "string", required: false, desc: '"DeFi", "Blockchain", "Finance", …' },
      { name: "limit", type: "number", required: false, desc: "Max results (default 20, max 100)" },
    ],
    example: exSearch,
  },
  {
    name: "get_skill",
    icon: FileText,
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    tagBg: "bg-purple-500/20 text-purple-300",
    description: "Fetch the full schema, parameter documentation, and usage examples for any skill by UUID.",
    params: [
      { name: "skill_id", type: "string", required: true, desc: "UUID of the skill to inspect" },
    ],
    example: exGet,
  },
  {
    name: "execute_skill",
    icon: Zap,
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    tagBg: "bg-green-500/20 text-green-300",
    description: "Run any Arsenal skill on Arsenal's servers and return the result. Handles all RPC calls, SDK interactions, and transaction building.",
    params: [
      { name: "skill_id", type: "string", required: true, desc: "UUID of the skill to execute" },
      { name: "input", type: "object", required: true, desc: "Input params matching the target skill's schema" },
      { name: "api_key", type: "string", required: true, desc: "Arsenal API key — get one at arsenal.sumplus.xyz/signup" },
    ],
    example: exExecute,
  },
];

// ── page ──────────────────────────────────────────────────────────────────────
export default function MetaSkillPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% -20%, #2814FE, transparent)" }}
        />
        <div className="max-w-4xl mx-auto px-6 py-20 relative">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs font-semibold px-3 py-1 rounded-full border"
              style={{ background: "rgba(40,20,254,0.15)", borderColor: "rgba(40,20,254,0.3)", color: "#a0aee8" }}>
              Meta-Skill
            </span>
            <span className="text-xs text-slate-500">by Sumplus</span>
          </div>

          <h1 className="text-5xl font-bold text-white mb-4 leading-tight">
            Sumplus Arsenal
          </h1>
          <p className="text-xl text-slate-400 mb-8 leading-relaxed max-w-2xl">
            One skill. Access to 30+ executable skills for DeFi, payments, and on-chain data —
            across Sui, EVM chains, Solana, Hyperliquid, and more.
          </p>

          {/* UUID pill */}
          <div className="inline-flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 mb-8">
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Skill ID</span>
            <code className="text-sm font-mono text-slate-200">{SKILL_UUID}</code>
            <CopyButton text={SKILL_UUID} />
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/signup"
              className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all hover:scale-105"
              style={{ background: "linear-gradient(90deg, #2814FE, #029EE7)" }}
            >
              Get API Key
            </a>
            <a
              href="/skills"
              className="px-5 py-2.5 text-sm font-medium text-slate-300 rounded-xl border border-white/[0.10] hover:bg-white/[0.05] transition-colors flex items-center gap-2"
            >
              Browse All Skills <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-14 space-y-16">

        {/* What it does */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">What it does</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Discover", desc: "Search 30+ skills by keyword or category. Find the right tool for any on-chain task." },
              { title: "Inspect", desc: "Pull the full parameter schema for any skill before calling it. No guesswork." },
              { title: "Execute", desc: "Run skills server-side on Arsenal's infrastructure. RPC, SDKs, and tx-building handled for you." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <p className="text-sm font-semibold text-white mb-2">{item.title}</p>
                <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Actions */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-2">Actions</h2>
          <p className="text-slate-400 mb-8">All calls go to <code className="text-slate-300 text-sm">POST {BASE_URL}/api/execute</code> with <code className="text-slate-300 text-sm">skill_id: &quot;{SKILL_UUID}&quot;</code>.</p>

          <div className="space-y-6">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <div key={action.name} className={`rounded-2xl border p-6 ${action.bg}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <Icon size={18} className={action.color} />
                    <code className={`text-sm font-bold px-2.5 py-0.5 rounded-lg text-xs ${action.tagBg}`}>
                      {action.name}
                    </code>
                  </div>
                  <p className="text-slate-300 text-sm mb-4 leading-relaxed">{action.description}</p>

                  {/* Params table */}
                  <div className="rounded-xl overflow-hidden border border-white/[0.06] mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Parameter</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Type</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Required</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {action.params.map((p) => (
                          <tr key={p.name}>
                            <td className="px-4 py-2.5 font-mono text-blue-300 text-xs">{p.name}</td>
                            <td className="px-4 py-2.5 text-slate-400 text-xs">{p.type}</td>
                            <td className="px-4 py-2.5 text-xs">
                              {p.required
                                ? <span className="text-amber-400">required</span>
                                : <span className="text-slate-600">optional</span>}
                            </td>
                            <td className="px-4 py-2.5 text-slate-400 text-xs">{p.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <CodeBlock code={action.example} language="bash" />
                </div>
              );
            })}
          </div>
        </section>

        {/* Supported skills preview */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-2">Supported Protocols</h2>
          <p className="text-slate-400 mb-6">Skills available via this meta-skill. Use <code className="text-slate-300 text-sm">search_skills</code> for the full list.</p>
          <div className="flex flex-wrap gap-2">
            {[
              "Jupiter", "Raydium", "Uniswap V3", "Velodrome", "Cetus", "Bluefin Ember",
              "Navi", "Scallop", "Suilend", "Aftermath", "GMX", "Hyperliquid", "dYdX",
              "Aave", "PancakeSwap", "Ika dWallet", "Polymarket", "Talus Nexus",
              "Tempo MPP", "Sumplus Yield",
            ].map((name) => (
              <span key={name} className="text-xs px-3 py-1.5 rounded-full border border-white/[0.08] text-slate-400 bg-white/[0.02]">
                {name}
              </span>
            ))}
          </div>
        </section>

        {/* Platform Integration */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-2">Platform Integration</h2>
          <p className="text-slate-400 mb-4">
            Adding Arsenal to your skill platform? Copy the integration JSON below.
          </p>
          <CodeBlock code={integrationJson} language="json" />
        </section>

        {/* Auth */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Authentication</h2>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-3">
            <p className="text-slate-300 text-sm leading-relaxed">
              <code className="text-blue-300">search_skills</code> and <code className="text-blue-300">get_skill</code> are public — no API key required for the Arsenal execute call itself (though your platform may require auth for its own routing).
            </p>
            <p className="text-slate-300 text-sm leading-relaxed">
              <code className="text-blue-300">execute_skill</code> requires an Arsenal <code className="text-slate-300">api_key</code> passed inside the <code className="text-slate-300">input</code> object, so the end-user or agent authenticates directly with Arsenal.
            </p>
            <a
              href="/signup"
              className="inline-flex items-center gap-2 text-sm font-medium mt-2"
              style={{ color: "#029EE7" }}
            >
              Get a free API key <ExternalLink size={13} />
            </a>
          </div>
        </section>

      </div>
    </div>
  );
}
