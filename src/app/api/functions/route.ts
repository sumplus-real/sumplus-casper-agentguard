import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

type SkillRow = {
  id: string;
  name: string;
  description: string;
  schema: Record<string, unknown>;
  category: string;
  tags: string[];
  is_paid: boolean;
  price: number | null;
};

type OpenAIFunction = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/** Sanitize name to valid OpenAI function name: ^[a-zA-Z0-9_-]{1,64}$ */
function sanitizeFunctionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64) || "skill";
}

function toOpenAIFunction(skill: SkillRow): OpenAIFunction {
  return {
    type: "function",
    function: {
      name: sanitizeFunctionName(skill.name),
      description: skill.description,
      parameters: {
        type: "object",
        ...skill.schema,
      },
    },
  };
}

// GET /api/functions
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

  const supabase = getSupabase();

  let query = supabase
    .from("skills")
    .select("id, name, description, schema, category, tags, is_paid, price")
    .eq("status", "approved")
    .limit(limit);

  if (category) query = query.eq("category", category);
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);

  const { data: skills, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const functions = (skills ?? []).map((s) => toOpenAIFunction(s as SkillRow));

  return NextResponse.json({ functions, count: functions.length });
}
