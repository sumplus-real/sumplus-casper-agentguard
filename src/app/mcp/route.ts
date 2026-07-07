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

const MCPRequestSchema = z.object({
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional().default({}),
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

function mcpSuccess(result: unknown) {
  return NextResponse.json({ result });
}

function mcpError(code: number, message: string, httpStatus = 200) {
  return NextResponse.json({ error: { code, message } }, { status: httpStatus });
}

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

// POST /mcp - MCP protocol handler
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mcpError(-32700, "Parse error", 400);
  }

  const parseResult = MCPRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return mcpError(-32600, "Invalid Request", 400);
  }

  const { method, params } = parseResult.data;
  const supabase = getSupabase();

  // ── skills/list ────────────────────────────────────────
  if (method === "skills/list") {
    const limit = typeof params.limit === "number" ? Math.min(params.limit, 100) : 50;
    const category = typeof params.category === "string" ? params.category : undefined;
    const search = typeof params.search === "string" ? params.search : undefined;

    if (search) {
      // Vector search path
      try {
        const embedding = await generateEmbedding(search);
        const { data: skills, error } = await supabase.rpc("search_skills_by_embedding", {
          query_embedding: embedding,
          match_count: limit,
          similarity_threshold: 0.3,
        });
        if (error) return mcpError(-32000, error.message, 500);
        const filtered = category ? skills.filter((s: { category: string }) => s.category === category) : skills;
        return mcpSuccess({ skills: filtered ?? [], count: (filtered ?? []).length });
      } catch {
        // Fall back to ILIKE
        let fallback = supabase
          .from("skills")
          .select("id, name, description, category, tags, is_paid, price, rating_avg, usage_count, schema")
          .eq("status", "approved")
          .or(`name.ilike.%${search}%,description.ilike.%${search}%`)
          .limit(limit);
        if (category) fallback = fallback.eq("category", category);
        const { data: skills, error } = await fallback;
        if (error) return mcpError(-32000, error.message, 500);
        return mcpSuccess({ skills: skills ?? [], count: (skills ?? []).length });
      }
    }

    let query = supabase
      .from("skills")
      .select("id, name, description, category, tags, is_paid, price, rating_avg, usage_count, schema")
      .eq("status", "approved")
      .limit(limit);

    if (category) query = query.eq("category", category);

    const { data: skills, error } = await query;
    if (error) return mcpError(-32000, error.message, 500);

    return mcpSuccess({ skills: skills ?? [], count: (skills ?? []).length });
  }

  // ── skills/get ─────────────────────────────────────────
  if (method === "skills/get") {
    const id = typeof params.id === "string" ? params.id : null;
    if (!id) return mcpError(-32602, "params.id is required");

    const { data: skill, error } = await supabase
      .from("skills")
      .select("*, ratings(rating, review, created_at)")
      .eq("id", id)
      .single();

    if (error) {
      const code = error.code === "PGRST116" ? -32001 : -32000;
      return mcpError(code, error.message, error.code === "PGRST116" ? 404 : 500);
    }

    return mcpSuccess({ skill });
  }

  // ── skills/execute ─────────────────────────────────────
  if (method === "skills/execute") {
    const skillId = typeof params.skill_id === "string" ? params.skill_id : null;
    if (!skillId) return mcpError(-32602, "params.skill_id is required");

    const input = params.input ?? {};

    // Authenticate (optional)
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      } else {
        const { data: agentUser } = await supabase
          .from("users").select("id").eq("api_key", token).single();
        if (agentUser) userId = agentUser.id;
      }
    }

    const { data: skill, error: skillError } = await supabase
      .from("skills")
      .select("id, name, description, schema, code, is_paid, price, status, category, tags, rating_avg, usage_count")
      .eq("id", skillId)
      .single();

    if (skillError || !skill) {
      return mcpError(-32001, "Skill not found", 404);
    }

    if (skill.status !== "approved") {
      return mcpError(-32003, "Skill is not available for execution", 403);
    }

    if (skill.is_paid) {
      if (!userId) return mcpError(-32002, "Authentication required for paid skills", 401);
      const { data: payment } = await supabase
        .from("payments")
        .select("id")
        .eq("skill_id", skillId)
        .eq("user_id", userId)
        .eq("status", "completed")
        .single();

      if (!payment) {
        return mcpError(-32004, "Payment required to execute this skill", 402);
      }
    }

    let execResult: { result: unknown; execution_time_ms: number };
    let execStatus: "success" | "error" = "success";
    let errorMessage: string | null = null;

    try {
      const startTime = Date.now();
      // Use real execution instead of simulation
      const realResult = await executeSkillById(skillId, input);
      const executionTime = Date.now() - startTime;

      if (realResult.success) {
        execResult = {
          result: realResult.output,
          execution_time_ms: executionTime
        };
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
      skill_id: skillId,
      user_id: userId,
      input: input as Record<string, unknown>,
      output: execResult.result as Record<string, unknown>,
      status: execStatus,
      execution_time_ms: execResult.execution_time_ms,
      error_message: errorMessage,
    });

    if (execStatus === "error") {
      return mcpError(-32000, errorMessage ?? "Execution failed", 500);
    }

    return mcpSuccess({
      result: execResult.result,
      skill_id: skillId,
      execution_time_ms: execResult.execution_time_ms,
    });
  }

  // Method not found
  return mcpError(-32601, `Method '${method}' not found`);
}
