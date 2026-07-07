"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { ChevronRight, Copy, Check, Tag, Code2, FileJson, Sparkles, AlertCircle, ExternalLink, ShieldCheck } from "lucide-react";
import StarRating from "../../../components/StarRating";
import SkillCard from "../../../components/SkillCard";

interface Review {
  author?: string;
  rating: number;
  review?: string;
  comment?: string;
  created_at?: string;
  date?: string;
}

interface RelatedSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  author_type: "official" | "community";
  rating_avg: number;
  rating_count: number;
  tags: string[];
  is_paid: boolean;
  price?: number;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  author_type: "official" | "community";
  author?: string;
  author_name?: string | null;
  version?: string;
  rating_avg: number;
  rating_count: number;
  tags: string[];
  is_paid: boolean;
  price?: number;
  usage_examples?: { title: string; code: string }[];
  schema?: { input?: object; output?: object };
  ratings?: Review[];
  external_url?: string | null;
  logo_url?: string | null;
  partner_verified?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors bg-slate-700/50 hover:bg-slate-700 px-2.5 py-1.5 rounded"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SkeletonDetail() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
        <div className="flex gap-2 mb-4">
          <div className="h-6 w-24 bg-slate-700 rounded-full" />
          <div className="h-6 w-20 bg-slate-700 rounded-full" />
        </div>
        <div className="h-8 w-2/3 bg-slate-700 rounded mb-3" />
        <div className="h-4 w-32 bg-slate-700 rounded mb-5" />
        <div className="h-4 w-40 bg-slate-700 rounded" />
      </div>
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
        <div className="h-6 w-32 bg-slate-700 rounded mb-4" />
        <div className="space-y-2">
          <div className="h-4 w-full bg-slate-700/50 rounded" />
          <div className="h-4 w-5/6 bg-slate-700/50 rounded" />
          <div className="h-4 w-4/6 bg-slate-700/50 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [skill, setSkill] = useState<Skill | null>(null);
  const [relatedSkills, setRelatedSkills] = useState<RelatedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingMessage, setRatingMessage] = useState("");
  const [tryInput, setTryInput] = useState("{}");
  const [tryResult, setTryResult] = useState("");
  const [tryLoading, setTryLoading] = useState(false);
  const [tryError, setTryError] = useState("");

  useEffect(() => {
    async function loadSkill() {
      setLoading(true);
      try {
        const res = await fetch(`/api/skills/${id}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        const s: Skill = data.skill;
        setSkill(s);

        // Pre-fill Try It with first usage example input if available
        if (s.usage_examples && s.usage_examples.length > 0) {
          setTryInput(s.usage_examples[0].code);
        } else if (s.schema?.input) {
          setTryInput(JSON.stringify({}, null, 2));
        }

        // Fetch related skills in same category
        const relRes = await fetch(`/api/skills?category=${encodeURIComponent(s.category)}&limit=3`);
        if (relRes.ok) {
          const relData = await relRes.json();
          setRelatedSkills((relData.skills ?? []).filter((r: RelatedSkill) => r.id !== id).slice(0, 3));
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    loadSkill();
  }, [id]);

  const handleTry = async () => {
    if (!skill) return;
    setTryLoading(true);
    setTryResult("");
    setTryError("");
    try {
      let parsedInput: object = {};
      try { parsedInput = JSON.parse(tryInput); } catch { /* use empty object */ }

      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_id: skill.id, input: parsedInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTryError(data.error ?? `Error ${res.status}`);
      } else {
        setTryResult(JSON.stringify(data.result ?? data, null, 2));
      }
    } catch {
      setTryError("Failed to connect to execution API");
    } finally {
      setTryLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!skill || userRating === 0) return;
    setRatingSubmitting(true);
    setRatingMessage("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch(`/api/skills/${skill.id}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rating: userRating, review: reviewText || undefined }),
      });
      if (res.status === 401) {
        setRatingMessage("Please sign in to rate this skill.");
      } else if (res.ok) {
        setRatingMessage("Rating submitted! Thank you.");
        setUserRating(0);
        setReviewText("");
      } else {
        const d = await res.json();
        setRatingMessage(d.error ?? "Failed to submit rating.");
      }
    } catch {
      setRatingMessage("Network error. Please try again.");
    } finally {
      setRatingSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-8">
            <Link href="/" className="hover:text-slate-300">Home</Link>
            <ChevronRight size={14} />
            <Link href="/skills" className="hover:text-slate-300">Skills</Link>
            <ChevronRight size={14} />
            <span className="text-slate-600">Loading...</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2"><SkeletonDetail /></div>
            <div className="space-y-6">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 h-48 animate-pulse" />
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 h-32 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !skill) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="text-slate-500 mx-auto mb-4" size={48} />
          <h2 className="text-2xl font-bold text-white mb-2">Skill Not Found</h2>
          <p className="text-slate-400 mb-6">This skill may have been removed or does not exist.</p>
          <Link href="/skills" className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors">
            Browse Skills
          </Link>
        </div>
      </div>
    );
  }

  const reviews: Review[] = skill.ratings ?? [];

  return (
    <div className="min-h-screen bg-[#0a0f1e] py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-8">
          <Link href="/" className="hover:text-slate-300 transition-colors">Home</Link>
          <ChevronRight size={14} />
          <Link href="/skills" className="hover:text-slate-300 transition-colors">Skills</Link>
          <ChevronRight size={14} />
          <span className="text-slate-300">{skill.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">

            {/* Skill Header */}
            <div className="relative bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
              {/* Open dApp — top right */}
              {skill.external_url && (
                <a
                  href={skill.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-6 right-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#029EE7] hover:bg-[#0288cc] transition-colors duration-200 shadow-lg shadow-[#029EE7]/20"
                >
                  Open dApp
                  <ExternalLink size={13} />
                </a>
              )}

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <span className="text-sm font-medium px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">{skill.category}</span>
                <span className="text-sm font-medium px-3 py-1 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/30">
                  {skill.author_type === "official" ? "Official" : "Community"}
                </span>
                {skill.partner_verified && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <ShieldCheck size={13} />
                    Partner Verified
                  </span>
                )}
                {skill.version && <span className="text-sm text-slate-500">v{skill.version}</span>}
                {skill.is_paid && (
                  <span className="text-sm font-medium px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ${skill.price?.toFixed(2)} / use
                  </span>
                )}
              </div>

              {/* Logo + Name */}
              <div className="flex items-center gap-4 mb-3">
                {(skill.logo_url || skill.external_url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={skill.logo_url ?? `https://www.google.com/s2/favicons?domain=${new URL(skill.external_url!).hostname}&sz=64`}
                    alt=""
                    width={48}
                    height={48}
                    className="rounded-xl border border-white/10 bg-slate-700/50 flex-shrink-0 object-contain p-1"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <h1 className="text-3xl font-bold text-white">{skill.name}</h1>
              </div>

              {(skill.author_name || skill.author) && (
                <p className="text-slate-400 mb-5 ml-[64px]">
                  by{" "}
                  <span className="text-[#029EE7]">
                    {skill.author_name ?? skill.author}
                  </span>
                </p>
              )}
              {!(skill.author_name || skill.author) && <div className="mb-5" />}
              <StarRating rating={skill.rating_avg} count={skill.rating_count} readonly />
            </div>

            {/* Description */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
              <h2 className="text-xl font-semibold text-white mb-4">Description</h2>
              <div className="text-slate-300 leading-relaxed whitespace-pre-line">{skill.description}</div>
              {skill.tags && skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-5">
                  {skill.tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 text-xs text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
                      <Tag size={11} /> {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Usage Examples */}
            {skill.usage_examples && skill.usage_examples.length > 0 && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-center gap-2 mb-5">
                  <Code2 className="text-blue-400" size={20} />
                  <h2 className="text-xl font-semibold text-white">Usage Examples</h2>
                </div>
                <div className="space-y-5">
                  {skill.usage_examples.map((ex, i) => (
                    <div key={i}>
                      <p className="text-sm font-medium text-slate-300 mb-2">{ex.title}</p>
                      <div className="relative">
                        <div className="absolute top-3 right-3"><CopyButton text={ex.code} /></div>
                        <pre className="bg-slate-900 border border-slate-700 rounded-xl p-4 pr-20 text-sm text-green-300 font-mono overflow-x-auto">{ex.code}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Schema */}
            {skill.schema && (skill.schema.input || skill.schema.output) && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-center gap-2 mb-5">
                  <FileJson className="text-purple-400" size={20} />
                  <h2 className="text-xl font-semibold text-white">Schema</h2>
                </div>
                <div className="space-y-5">
                  {skill.schema.input && (
                    <div>
                      <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">Input Schema</p>
                      <div className="relative">
                        <div className="absolute top-3 right-3"><CopyButton text={JSON.stringify(skill.schema.input, null, 2)} /></div>
                        <pre className="bg-slate-900 border border-slate-700 rounded-xl p-4 pr-20 text-sm text-blue-200 font-mono overflow-x-auto">{JSON.stringify(skill.schema.input, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                  {skill.schema.output && (
                    <div>
                      <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">Output Schema</p>
                      <div className="relative">
                        <div className="absolute top-3 right-3"><CopyButton text={JSON.stringify(skill.schema.output, null, 2)} /></div>
                        <pre className="bg-slate-900 border border-slate-700 rounded-xl p-4 pr-20 text-sm text-blue-200 font-mono overflow-x-auto">{JSON.stringify(skill.schema.output, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reviews */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
              <h2 className="text-xl font-semibold text-white mb-6">
                Reviews {reviews.length > 0 && <span className="text-slate-500 text-base font-normal">({reviews.length})</span>}
              </h2>
              {reviews.length === 0 ? (
                <p className="text-slate-500">No reviews yet. Be the first to rate this skill!</p>
              ) : (
                <div className="space-y-5">
                  {reviews.map((review, i) => (
                    <div key={i} className="border-b border-slate-700/50 pb-5 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-slate-300">{review.author ?? "Anonymous"}</span>
                        <span className="text-xs text-slate-500">
                          {review.created_at ? new Date(review.created_at).toLocaleDateString() : review.date ?? ""}
                        </span>
                      </div>
                      <div className="mb-2"><StarRating rating={review.rating} readonly /></div>
                      {(review.review ?? review.comment) && (
                        <p className="text-slate-400 text-sm">{review.review ?? review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Sidebar */}
          <div className="space-y-6">

            {/* Try It Panel */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="text-yellow-400" size={18} />
                <h3 className="font-semibold text-white">Try It</h3>
              </div>
              <div className="mb-3">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Input (JSON)</label>
                <textarea
                  value={tryInput}
                  onChange={(e) => setTryInput(e.target.value)}
                  rows={6}
                  className="w-full mt-1 p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-green-300 font-mono focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              {tryError && (
                <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-400 text-xs">{tryError}</p>
                </div>
              )}
              <button
                onClick={handleTry}
                disabled={tryLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-medium rounded-lg transition-colors text-sm"
              >
                {tryLoading ? "Running..." : "Execute Skill"}
              </button>
              {tryResult && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Result</label>
                    <CopyButton text={tryResult} />
                  </div>
                  <pre className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-blue-300 font-mono overflow-x-auto max-h-64">{tryResult}</pre>
                </div>
              )}
            </div>

            {/* Rate This Skill */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="font-semibold text-white mb-4">Rate This Skill</h3>
              <StarRating rating={userRating} onRate={setUserRating} />
              {userRating > 0 && (
                <div className="mt-4">
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Share your experience (optional)"
                    rows={3}
                    className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                  <button
                    onClick={handleSubmitRating}
                    disabled={ratingSubmitting}
                    className="mt-2 w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {ratingSubmitting ? "Submitting..." : "Submit Rating"}
                  </button>
                </div>
              )}
              {ratingMessage && (
                <p className="mt-3 text-sm text-slate-400">{ratingMessage}</p>
              )}
            </div>

            {/* Related Skills */}
            {relatedSkills.length > 0 && (
              <div>
                <h3 className="font-semibold text-white mb-4">Related Skills</h3>
                <div className="space-y-4">
                  {relatedSkills.map((s) => (
                    <SkillCard key={s.id} skill={s} />
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
