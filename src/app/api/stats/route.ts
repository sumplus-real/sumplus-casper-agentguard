import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Canonical chain tag identifiers
const CHAIN_TAGS = new Set([
  "sui",
  "ethereum",
  "optimism",
  "arbitrum",
  "base",
  "polygon",
  "bsc",
  "solana",
  "avalanche",
  "dydx",
  "hyperliquid",
  "primate",
  "tempo",
  "xlayer",
  "monad",
  "mantle",
  "bridge",
  "cross-chain",
  "hashkeychain",
  "canton",
]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

/** Returns the ISO date string for the Sunday that starts the given date's week */
function weekStart(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data: skills, error } = await supabase
      .from("skills")
      .select("id, created_at, tags, name")
      .eq("status", "approved");

    if (error) throw error;

    const chains = new Set<string>();
    const protocols = new Set<string>();

    for (const skill of skills ?? []) {
      protocols.add(skill.name);
      for (const tag of skill.tags ?? []) {
        if (CHAIN_TAGS.has(tag.toLowerCase())) {
          chains.add(tag.toLowerCase());
        }
      }
    }

    // Build last-16-weeks buckets (Sunday-aligned)
    const buckets: Record<string, number> = {};
    const now = new Date();
    for (let i = 15; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i * 7);
      buckets[weekStart(d)] = 0;
    }

    for (const skill of skills ?? []) {
      const key = weekStart(new Date(skill.created_at));
      if (key in buckets) buckets[key]++;
    }

    const weekly_counts = Object.entries(buckets).map(([week, count]) => ({
      week,
      count,
    }));

    // Build ecosystem skill counts (by chain tag)
    const ecosystemMap: Record<string, number> = {};
    for (const skill of skills ?? []) {
      for (const tag of skill.tags ?? []) {
        const t = tag.toLowerCase();
        if (CHAIN_TAGS.has(t)) {
          ecosystemMap[t] = (ecosystemMap[t] ?? 0) + 1;
        }
      }
    }
    const ecosystem_counts = Object.entries(ecosystemMap)
      .map(([ecosystem, count]) => ({ ecosystem, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      total_skills: skills?.length ?? 0,
      total_chains: chains.size,
      total_protocols: protocols.size,
      weekly_counts,
      ecosystem_counts,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
