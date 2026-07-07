import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { skillsService } from "@/services/skills.service";
import { resolveUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const UpdateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(10).max(5000).optional(),
  category: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
  schema: z.record(z.string(), z.any()).optional(),
  code: z.string().min(1).optional(),
  usage_examples: z.array(z.any()).optional(),
  is_paid: z.boolean().optional(),
  price: z.number().optional(),
  // Admin-only fields
  author_type: z.enum(["official", "verified", "community"]).optional(),
  execution_endpoint: z.string().url().nullable().optional(),
  execution_auth_header: z.string().nullable().optional(),
  execution_skill_id: z.string().nullable().optional(),
});

// GET /api/skills/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const skill = await skillsService.getSkill(id);

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const supabase = getSupabase();

    // Fetch ratings
    const { data: ratings } = await supabase
      .from("ratings")
      .select("rating, review, created_at")
      .eq("skill_id", id);

    // Resolve author name: "arsenal" for official, username for community
    let author_name: string | null = null;
    if (skill.author_type === "official") {
      author_name = "arsenal";
    } else if (skill.author_id) {
      const { data: authorData } = await supabase
        .from("users")
        .select("username")
        .eq("id", skill.author_id)
        .single();
      author_name = (authorData as { username: string | null } | null)?.username ?? null;
    }

    return NextResponse.json({
      skill: {
        ...skill,
        author_name,
        ratings: ratings || []
      }
    });
  } catch (error: any) {
    console.error("GET /api/skills/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/skills/:id
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const userId = token ? await resolveUser(token) : null;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    const { data: skill } = await supabase.from("skills").select("author_id").eq("id", id).single();
    const { data: userData } = await supabase.from("users").select("role").eq("id", userId).single();

    if (skill?.author_id !== userId && userData?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = UpdateSkillSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Validation failed", details: parseResult.error.flatten() }, { status: 400 });
    }

    // Strip admin-only fields unless requester is admin
    const { author_type, execution_endpoint, execution_auth_header, execution_skill_id, ...rest } = parseResult.data;
    const updateData: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
    if (userData?.role === "admin") {
      if (author_type !== undefined)           updateData.author_type = author_type;
      if (execution_endpoint !== undefined)    updateData.execution_endpoint = execution_endpoint;
      if (execution_auth_header !== undefined) updateData.execution_auth_header = execution_auth_header;
      if (execution_skill_id !== undefined)    updateData.execution_skill_id = execution_skill_id;
    }

    const { data: updated, error } = await supabase
      .from("skills")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ skill: updated });
  } catch (error: any) {
    console.error("PUT /api/skills/[id] error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/skills/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const userId = token ? await resolveUser(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const { data: skill } = await supabase.from("skills").select("author_id").eq("id", id).single();
  const { data: userData } = await supabase.from("users").select("role").eq("id", userId).single();

  if (skill?.author_id !== userId && userData?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("skills").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Skill deleted" });
}
