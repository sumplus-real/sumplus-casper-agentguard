import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateEmbedding } from "@/lib/embedding";
import { executeSkillById } from "@/lib/skill-executors";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const RouterSchema = z.object({
  action: z.enum(["search", "get", "execute"]),
  query: z.string().optional(),
  skill_id: z.string().uuid().optional(),
  input: z.unknown().optional(),
});

type SkillRow = {
  id: string;
  name: string;
  description: string;
  schema: Record<string, unknown>;
  code: string;
  is_paid: boolean;
  price: number | null;
  status: string;
  category: string;
  tags: string[];
  rating_avg: number;
  usage_count: number;
};

function simulateExecution(
  skill: SkillRow,
  input: unknown
): { result: unknown; execution_time_ms: number } {
  const start = Date.now();
  const schema = skill.schema as { properties?: Record<string, { type?: string }> };
  const result: Record<string, unknown> = {
    skill_name: skill.name,
    status: "simulated",
    input_received: input,
  };

  if (schema.properties) {
    for (const [key, def] of Object.entries(schema.properties)) {
      switch (def.type) {
        case "string": result[key] = `mock_${key}`; break;
        case "number": case "integer": result[key] = 0; break;
        case "boolean": result[key] = true; break;
        case "array": result[key] = []; break;
        case "object": result[key] = {}; break;
        default: result[key] = null;
      }
    }
  }

  return { result, execution_time_ms: Date.now() - start };
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) return user.id;
  const { data: agentUser } = await supabase
    .from("users").select("id").eq("api_key", token).single();
  return agentUser?.id ?? null;
}

// POST /api/router - Unified agent router
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = RouterSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { action, query, skill_id, input } = parseResult.data;
  const supabase = getSupabase();

  // ── action: search ──────────────────────────────────────
  if (action === "search") {
    if (query) {
      // Vector search path
      try {
        const embedding = await generateEmbedding(query);
        const { data: skills, error } = await supabase.rpc("search_skills_by_embedding", {
          query_embedding: embedding,
          match_count: 20,
          similarity_threshold: 0.3,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ action: "search", skills: skills ?? [], count: (skills ?? []).length });
      } catch {
        // Fall back to ILIKE
        const { data: skills, error } = await supabase
          .from("skills")
          .select("id, name, description, category, tags, is_paid, price, rating_avg, usage_count, schema")
          .eq("status", "approved")
          .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
          .limit(20);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ action: "search", skills: skills ?? [], count: (skills ?? []).length });
      }
    }

    const { data: skills, error } = await supabase
      .from("skills")
      .select("id, name, description, category, tags, is_paid, price, rating_avg, usage_count, schema")
      .eq("status", "approved")
      .limit(20);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ action: "search", skills: skills ?? [], count: (skills ?? []).length });
  }

  // ── action: get ─────────────────────────────────────────
  if (action === "get") {
    if (!skill_id) {
      return NextResponse.json({ error: "skill_id is required for action=get" }, { status: 400 });
    }

    const { data: skill, error } = await supabase
      .from("skills")
      .select("*, ratings(rating, review, created_at)")
      .eq("id", skill_id)
      .single();

    if (error) {
      const status = error.code === "PGRST116" ? 404 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ action: "get", skill });
  }

  // ── action: execute ─────────────────────────────────────
  if (action === "execute") {
    if (!skill_id) {
      return NextResponse.json({ error: "skill_id is required for action=execute" }, { status: 400 });
    }

    const userId = await resolveUserId(req);

    const { data: skill, error: skillError } = await supabase
      .from("skills")
      .select("id, name, description, schema, code, is_paid, price, status, category, tags, rating_avg, usage_count")
      .eq("id", skill_id)
      .single();

    if (skillError || !skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    if (skill.status !== "approved") {
      return NextResponse.json({ error: "Skill is not available for execution" }, { status: 403 });
    }

    if (skill.is_paid) {
      if (!userId) {
        return NextResponse.json({ error: "Authentication required for paid skills" }, { status: 401 });
      }
      const { data: payment } = await supabase
        .from("payments")
        .select("id")
        .eq("skill_id", skill_id)
        .eq("user_id", userId)
        .eq("status", "completed")
        .single();

      if (!payment) {
        return NextResponse.json(
          { error: "Payment required", skill_id, price: skill.price },
          { status: 402 }
        );
      }
    }

    let execStatus: "success" | "error" = "success";
    let errorMessage: string | null = null;
    let execResult: { result: unknown; execution_time_ms: number };

    try {
      const startTime = Date.now();
      const realResult = await executeSkillById(skill_id, input);
      const executionTime = Date.now() - startTime;

      if (realResult.success) {
        execResult = { result: realResult.output, execution_time_ms: executionTime };
      } else {
        execStatus = "error";
        errorMessage = realResult.error || "Execution failed";
        execResult = { result: null, execution_time_ms: executionTime };
      }
    } catch (err) {
      execStatus = "error";
      errorMessage = err instanceof Error ? err.message : "Unknown error";
      execResult = { result: null, execution_time_ms: 0 };
    }

    await supabase.from("skill_executions").insert({
      skill_id,
      user_id: userId,
      input: input as Record<string, unknown>,
      output: execResult.result as Record<string, unknown>,
      status: execStatus,
      execution_time_ms: execResult.execution_time_ms,
      error_message: errorMessage,
    });

    if (execStatus === "error") {
      return NextResponse.json(
        { action: "execute", success: false, error: errorMessage, skill_id },
        { status: 500 }
      );
    }

    return NextResponse.json({
      action: "execute",
      success: true,
      result: execResult.result,
      skill_id,
      execution_time_ms: execResult.execution_time_ms,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
