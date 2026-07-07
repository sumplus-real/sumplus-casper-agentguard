import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateEmbedding, buildSkillEmbeddingText } from "@/lib/embedding";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

// POST /api/admin/backfill-embeddings
// Generates embeddings for all approved skills that don't have one yet.
// Requires SUPABASE_SERVICE_ROLE_KEY to be set (server-side only, no user auth needed for internal admin use).
export async function POST(_req: NextRequest) {
  const supabase = getSupabase();

  const { data: skills, error } = await supabase
    .from("skills")
    .select("id, name, description, category, tags")
    .is("embedding", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!skills || skills.length === 0) {
    return NextResponse.json({ message: "No skills need backfilling", updated: 0 });
  }

  let updated = 0;
  const errors: { id: string; error: string }[] = [];

  for (const skill of skills) {
    try {
      const text = buildSkillEmbeddingText(skill);
      const embedding = await generateEmbedding(text);

      const { error: updateError } = await supabase
        .from("skills")
        .update({ embedding })
        .eq("id", skill.id);

      if (updateError) {
        errors.push({ id: skill.id, error: updateError.message });
      } else {
        updated++;
      }
    } catch (err) {
      errors.push({ id: skill.id, error: String(err) });
    }
  }

  return NextResponse.json({
    message: `Backfill complete`,
    total: skills.length,
    updated,
    errors,
  });
}
