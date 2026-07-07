import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

// GET /api/users/me/skills — return all skills authored by the current user
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();

  // Resolve user (JWT or API key)
  let userId: string | null = null;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) {
    userId = user.id;
  } else {
    const { data } = await supabase.from("users").select("id").eq("api_key", token).single();
    userId = (data as { id: string } | null)?.id ?? null;
  }

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: skills, error } = await supabase
    .from("skills")
    .select("id, name, description, category, tags, is_paid, price, status, author_type, rating_avg, rating_count, created_at, updated_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ skills: skills ?? [], count: skills?.length ?? 0 });
}
