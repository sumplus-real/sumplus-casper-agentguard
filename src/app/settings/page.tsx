"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Settings, User, Check, AlertCircle, LogOut } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  role: string;
  username: string | null;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("arsenal_token");
    if (!stored) {
      window.location.href = "/login";
      return;
    }
    setToken(stored);

    fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          localStorage.removeItem("arsenal_token");
          localStorage.removeItem("arsenal_user");
          window.location.href = "/login";
          return;
        }
        setProfile(data.user);
        setUsername(data.user.username ?? "");
      })
      .catch(() => {
        window.location.href = "/login";
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveResult({ ok: false, msg: data.error ?? "Failed to save" });
      } else {
        setSaveResult({ ok: true, msg: "Username saved!" });
        setProfile((p) => (p ? { ...p, username } : p));
      }
    } catch {
      setSaveResult({ ok: false, msg: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("arsenal_token");
    localStorage.removeItem("arsenal_user");
    window.location.href = "/";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050510] flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-white/20 border-t-[#2814FE] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050510] px-4 py-12">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #2814FE22, #029EE722)", border: "1px solid #2814FE33" }}>
            <Settings size={18} className="text-[#029EE7]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
            <p className="text-sm text-slate-500">{profile?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.12]"
          >
            <LogOut size={13} />
            Log out
          </button>
        </div>

        {/* Profile card */}
        <div className="bg-[#080c18] border border-white/[0.06] rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
              <User size={18} className="text-slate-400" />
            </div>
            <div>
              <p className="text-white font-medium">{profile?.username ?? <span className="text-slate-500">no username yet</span>}</p>
              <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setSaveResult(null);
                }}
                placeholder="e.g. maria_agent"
                pattern="[a-zA-Z0-9_]+"
                minLength={3}
                maxLength={32}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#2814FE]/60 focus:ring-1 focus:ring-[#2814FE]/40 transition-colors font-mono"
              />
              <p className="text-xs text-slate-600 mt-1.5">
                3–32 characters, letters, numbers and underscores only.
                Shown as the author name on skills you publish.
              </p>
            </div>

            {saveResult && (
              <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl ${
                saveResult.ok
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}>
                {saveResult.ok ? <Check size={14} /> : <AlertCircle size={14} />}
                {saveResult.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || username.length < 3}
              className="w-full flex items-center justify-center gap-2 py-3 text-white font-semibold rounded-xl transition-all hover:scale-[1.01] disabled:opacity-50 disabled:scale-100"
              style={{ background: "linear-gradient(90deg, #2814FE, #029EE7)" }}
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Save Username"
              )}
            </button>
          </form>
        </div>

        <div className="text-center">
          <Link href="/skills" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ← Back to Skills
          </Link>
        </div>
      </div>
    </div>
  );
}
