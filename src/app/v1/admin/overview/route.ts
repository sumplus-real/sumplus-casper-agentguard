/**
 * GET /v1/admin/overview
 *
 * Read-only usage snapshot for the cross-product Sumplus admin console
 * (https://admin.sumplus.xyz, a thin static client served from the SafeRouter
 * box). The console fetches this directly from the browser, so the endpoint is
 * Bearer-token authenticated and CORS-open.
 *
 * Contract (shared with SafeRouter / Maria): the console renders whatever fields
 * are present and hides absent sections. Arsenal is a skill-execution registry,
 * not an LLM-billing product, so it reports user/key counts and skill-call
 * volume and omits the credit fields (balance / topup / spend), `by_model`,
 * and `invites` that don't apply.
 *
 * Auth: a single static token in env ADMIN_OVERVIEW_TOKEN. Configure every
 * product with the same token so the operator logs into the console once.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const expected = process.env.ADMIN_OVERVIEW_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "admin overview not configured (ADMIN_OVERVIEW_TOKEN unset)" },
      { status: 503, headers: CORS_HEADERS }
    );
  }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  try {
    const supabase = getSupabase();

    // Pull users and every execution's (user_id, created_at). 835-ish rows today
    // — small enough to aggregate in-process; revisit with a SQL rollup if it grows.
    const [{ data: users, error: uErr }, { data: execs, error: eErr }] = await Promise.all([
      supabase.from("users").select("id, email, username, role, api_key, created_at"),
      supabase.from("skill_executions").select("user_id, created_at"),
    ]);
    if (uErr) throw uErr;
    if (eErr) throw eErr;

    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    // Per-user aggregates from the execution log
    const byUser = new Map<string, { requests: number; lastMs: number }>();
    let requestsLast24h = 0;
    for (const ex of execs ?? []) {
      const ms = ex.created_at ? new Date(ex.created_at).getTime() : 0;
      if (ms >= dayAgo) requestsLast24h++;
      if (!ex.user_id) continue;
      const agg = byUser.get(ex.user_id) ?? { requests: 0, lastMs: 0 };
      agg.requests++;
      if (ms > agg.lastMs) agg.lastMs = ms;
      byUser.set(ex.user_id, agg);
    }

    const keyCount = (users ?? []).filter((u) => !!u.api_key).length;

    const userRows = (users ?? []).map((u) => {
      const agg = byUser.get(u.id);
      return {
        id: u.id,
        email: u.email ?? undefined,
        display_name: u.username ?? undefined,
        role: u.role ?? undefined,
        created_at_ms: u.created_at ? new Date(u.created_at).getTime() : undefined,
        keys: u.api_key ? 1 : 0,
        requests: agg?.requests ?? 0,
        last_used_ms: agg?.lastMs || undefined,
      };
    });

    return NextResponse.json(
      {
        product: "arsenal",
        generated_ms: now,
        totals: {
          users: users?.length ?? 0,
          keys: keyCount,
          total_requests: execs?.length ?? 0,
          requests_last_24h: requestsLast24h,
        },
        users: userRows,
      },
      { headers: CORS_HEADERS }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
