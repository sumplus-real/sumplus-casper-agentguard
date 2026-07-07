"use client";

import Link from "next/link";
import { ShieldCheck, Zap, Search, Code2, ArrowRight, CheckCircle2, Mail } from "lucide-react";

const STEPS = [
  {
    n: "01",
    title: "Reach out",
    body: "Contact us with your protocol overview and a link to your docs. We'll review and get back within a few days.",
  },
  {
    n: "02",
    title: "Co-build the skill",
    body: "Our team works with yours to build the Arsenal skill — covering your core actions, input schema, and response format.",
  },
  {
    n: "03",
    title: "Review & test",
    body: "You review the skill output for accuracy. We run integration tests end-to-end before publishing.",
  },
  {
    n: "04",
    title: "Go live",
    body: "Skill is published with Partner Verified badge, your logo, and a direct link to your dApp. Agents start discovering it immediately.",
  },
];

const BENEFITS = [
  {
    icon: Search,
    title: "Agent-native discovery",
    body: "AI agents find your protocol by semantic search. When they look for 'Sui lending' or 'perpetuals on Base', your skill surfaces first.",
  },
  {
    icon: ShieldCheck,
    title: "Partner Verified badge",
    body: "Signals to agents and developers that the skill was co-built with your team — not scraped or guessed. Agents are explicitly told to prefer verified skills.",
  },
  {
    icon: Zap,
    title: "Zero integration work on your end",
    body: "Arsenal handles the skill build. You review for correctness. No SDK changes, no new endpoints — we work with what you have.",
  },
  {
    icon: Code2,
    title: "Always up to date",
    body: "When your protocol updates, we update the skill. The schema stays in sync with your live API and contract behavior.",
  },
];

const WHAT_WE_NEED = [
  "Protocol documentation or API reference",
  "Logo (SVG preferred) and dApp URL",
  "Core actions you want agents to support",
  "A point of contact for review and updates",
];

export default function IntegratePage() {
  return (
    <div className="min-h-screen bg-[#050510] text-white">
      <div className="max-w-4xl mx-auto px-6 py-20">

        {/* Hero */}
        <div className="mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#029EE7]/10 border border-[#029EE7]/20 text-[#029EE7] text-xs font-medium mb-6">
            <ShieldCheck size={12} />
            For Protocols & Teams
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-5">
            List your protocol<br />
            <span className="text-slate-400 font-normal">on Arsenal</span>
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed max-w-2xl">
            Arsenal is an AI agent skill layer. When your protocol is listed, AI agents across any platform can discover and interact with it — no wallet pop-ups, no manual steps. Just a skill they can call.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <a
              href="mailto:contact@sumplus.xyz"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(90deg, #2814FE, #029EE7)" }}
            >
              <Mail size={14} />
              Apply to Partner
            </a>
            <Link
              href="/skills"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
            >
              Browse existing skills
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* Benefits */}
        <div className="mb-20">
          <h2 className="text-2xl font-semibold text-white mb-8">What you get</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {BENEFITS.map((b) => {
              const Icon = b.icon;
              return (
                <div
                  key={b.title}
                  className="p-6 rounded-xl bg-slate-800/40 border border-white/[0.06] hover:border-white/[0.12] transition-colors"
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="p-1.5 rounded-lg bg-[#029EE7]/10">
                      <Icon size={15} className="text-[#029EE7]" />
                    </div>
                    <h3 className="font-semibold text-white text-sm">{b.title}</h3>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed">{b.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* How it works */}
        <div className="mb-20">
          <h2 className="text-2xl font-semibold text-white mb-8">How it works</h2>
          <div className="space-y-4">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-mono font-bold flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #2814FE22, #029EE722)", border: "1px solid #029EE740", color: "#029EE7" }}
                  >
                    {s.n}
                  </div>
                  {i < STEPS.length - 1 && <div className="w-px flex-1 bg-white/[0.06] my-2" />}
                </div>
                <div className="pb-6">
                  <h3 className="font-semibold text-white mb-1">{s.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What we need */}
        <div className="mb-20">
          <h2 className="text-2xl font-semibold text-white mb-6">What we need from you</h2>
          <div className="p-6 rounded-xl bg-slate-800/40 border border-white/[0.06] space-y-3">
            {WHAT_WE_NEED.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-300 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "linear-gradient(135deg, #2814FE0D, #029EE70D)", border: "1px solid #029EE720" }}
        >
          <h2 className="text-2xl font-semibold text-white mb-3">Ready to get listed?</h2>
          <p className="text-slate-400 mb-6 text-sm">
            Drop us a message with your protocol name and docs. We'll take it from there.
          </p>
          <a
            href="mailto:contact@sumplus.xyz"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105"
            style={{ background: "linear-gradient(90deg, #2814FE, #029EE7)" }}
          >
            <Mail size={14} />
            contact@sumplus.xyz
          </a>
        </div>

      </div>
    </div>
  );
}
