"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  is_paid: boolean;
  price: number | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "text-amber-400 bg-amber-400/10", icon: <Clock size={14} /> },
  approved: { label: "Approved", color: "text-emerald-400 bg-emerald-400/10", icon: <CheckCircle size={14} /> },
  rejected: { label: "Rejected", color: "text-red-400 bg-red-400/10", icon: <XCircle size={14} /> },
};

export default function AdminPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) { setError("Admin access required"); setLoading(false); return; }
    try {
      const params = new URLSearchParams({ status: filterStatus, limit: "100" });
      const res = await fetch(`/api/admin/skills?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setSkills(data.skills ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  async function updateStatus(skillId: string, status: "approved" | "rejected") {
    setUpdating(skillId);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      await fetch(`/api/admin/skills`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ skill_id: skillId, status }),
      });
      setSkills((prev) => prev.filter((s) => s.id !== skillId));
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-slate-400">Review and moderate skill submissions</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {["pending", "approved", "rejected"].map((status) => {
          const cfg = STATUS_CONFIG[status];
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === status
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {cfg.icon} {cfg.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 size={24} className="animate-spin mr-3" /> Loading...
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-24 text-slate-500">
          No {filterStatus} skills
        </div>
      ) : (
        <div className="space-y-4">
          {skills.map((skill) => {
            const cfg = STATUS_CONFIG[skill.status] ?? STATUS_CONFIG.pending;
            return (
              <div key={skill.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white truncate">{skill.name}</h3>
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded">{skill.category}</span>
                    {skill.is_paid && (
                      <span className="text-xs text-amber-400">$ {skill.price} USDC</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm line-clamp-2">{skill.description}</p>
                  <p className="text-xs text-slate-600 mt-1">{new Date(skill.created_at).toLocaleString()}</p>
                </div>

                {skill.status === "pending" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => updateStatus(skill.id, "approved")}
                      disabled={updating === skill.id}
                      className="flex items-center gap-1 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {updating === skill.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      Approve
                    </button>
                    <button
                      onClick={() => updateStatus(skill.id, "rejected")}
                      disabled={updating === skill.id}
                      className="flex items-center gap-1 bg-red-600/20 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
