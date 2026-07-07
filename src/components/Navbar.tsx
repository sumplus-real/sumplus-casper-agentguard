"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, Settings } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/skills", label: "Skills" },
  { href: "/stats", label: "Stats" },
  { href: "/status", label: "Status" },
  { href: "/evomap", label: "EvoMap" },
  { href: "/docs", label: "Docs" },
  { href: "/integrate", label: "Integrate", badge: true },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isClarityActive, setIsClarityActive] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem("arsenal_token"));
  }, []);

  useEffect(() => {
    setIsClarityActive(
      pathname === "/skills" &&
      new URLSearchParams(window.location.search).get("tag") === "clarity-act"
    );
  }, [pathname]);

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="sticky top-0 z-50 bg-[#050510]/80 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="group-hover:scale-110 transition-transform duration-200">
              <Image src="/logo_blue.svg" alt="Sumplus Arsenal" width={28} height={28} />
            </div>
            <span className="font-semibold text-white text-base">
              Sumplus <span className="text-slate-400 font-normal">Arsenal</span>
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => link.badge ? (
              <Link
                key={link.href}
                href={link.href}
                className="shimmer-text px-3 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
              >
                {link.label}
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={"px-3 py-2 rounded-lg text-sm font-medium transition-colors " + (isActive(link.href) ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white hover:bg-white/[0.05]")}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/skills?tag=clarity-act"
              className={"flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all " + (isClarityActive ? "text-amber-300 bg-amber-500/10" : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/[0.08]")}
            >
              CLARITY Act
              <span className="text-[9px] font-mono bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded leading-none">HOT</span>
            </Link>
            {loggedIn && (
              <>
                <Link
                  href="/my-skills"
                  className={"px-3 py-2 rounded-lg text-sm font-medium transition-colors " + (isActive("/my-skills") ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white hover:bg-white/[0.05]")}
                >
                  My Skills
                </Link>
                <Link
                  href="/skills/upload"
                  className={"px-3 py-2 rounded-lg text-sm font-medium transition-colors " + (isActive("/skills/upload") ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white hover:bg-white/[0.05]")}
                >
                  Upload Skill
                </Link>
              </>
            )}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-2">
            {loggedIn ? (
              <Link
                href="/settings"
                className={"p-2 rounded-lg transition-colors " + (isActive("/settings") ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white hover:bg-white/[0.05]")}
                title="Settings"
              >
                <Settings size={17} />
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-all hover:scale-105"
                style={{ background: "linear-gradient(90deg, #2814FE, #029EE7)" }}
              >
                Get Started
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-slate-400 hover:text-white transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#050510] border-t border-white/[0.06] px-4 py-4">
          {/* Mobile Nav Links */}
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => link.badge ? (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="shimmer-text px-3 py-2.5 rounded-lg text-sm font-medium"
              >
                {link.label}
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={"px-3 py-2.5 rounded-lg text-sm font-medium transition-colors " + (isActive(link.href) ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white hover:bg-white/[0.05]")}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/skills?tag=clarity-act"
              onClick={() => setMobileOpen(false)}
              className={"flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all " + (isClarityActive ? "text-amber-300 bg-amber-500/10" : "text-amber-400/80 hover:text-amber-300")}
            >
              CLARITY Act
              <span className="text-[9px] font-mono bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded leading-none">HOT</span>
            </Link>
            {loggedIn && (
              <>
                <Link
                  href="/my-skills"
                  onClick={() => setMobileOpen(false)}
                  className={"px-3 py-2.5 rounded-lg text-sm font-medium transition-colors " + (isActive("/my-skills") ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white hover:bg-white/[0.05]")}
                >
                  My Skills
                </Link>
                <Link
                  href="/skills/upload"
                  onClick={() => setMobileOpen(false)}
                  className={"px-3 py-2.5 rounded-lg text-sm font-medium transition-colors " + (isActive("/skills/upload") ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white hover:bg-white/[0.05]")}
                >
                  Upload Skill
                </Link>
              </>
            )}
          </div>
          {/* Mobile Auth */}
          <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-white/[0.06]">
            {loggedIn ? (
              <Link href="/settings" onClick={() => setMobileOpen(false)} className="py-2.5 text-center text-sm font-medium text-slate-300 hover:text-white border border-white/[0.08] rounded-lg transition-colors flex items-center justify-center gap-2">
                <Settings size={15} /> Settings
              </Link>
            ) : (
              <Link href="/login" onClick={() => setMobileOpen(false)} className="py-2.5 text-center text-sm font-medium text-white rounded-lg transition-colors"
                style={{ background: "linear-gradient(90deg, #2814FE, #029EE7)" }}>
                Get Started
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}