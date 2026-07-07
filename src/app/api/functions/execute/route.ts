import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { executeSkillById } from "@/lib/skill-executors";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const FunctionExecuteSchema = z.object({
  function_name: z.string().min(1),
  arguments: z.unknown(),
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
};

/** Sanitize name to valid OpenAI function name */
function sanitizeFunctionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64) || "skill";
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

// POST /api/functions/execute
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = FunctionExecuteSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { function_name, arguments: args } = parseResult.data;
  const supabase = getSupabase();

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

  // Fetch all approved skills and find by sanitized name
  const { data: skills, error: fetchError } = await supabase
    .from("skills")
    .select("id, name, description, schema, code, is_paid, price, status")
    .eq("status", "approved");

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const skill = (skills ?? []).find(
    (s) => sanitizeFunctionName(s.name) === function_name
  );

  if (!skill) {
    return NextResponse.json(
      { error: `Function '${function_name}' not found` },
      { status: 404 }
    );
  }

  // Check payment if required
  if (skill.is_paid) {
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required for paid skills" },
        { status: 401 }
      );
    }
    const { data: payment } = await supabase
      .from("payments")
      .select("id")
      .eq("skill_id", skill.id)
      .eq("user_id", userId)
      .eq("status", "completed")
      .single();

    if (!payment) {
      return NextResponse.json(
        { error: "Payment required", skill_id: skill.id, price: skill.price },
        { status: 402 }
      );
    }
  }

  let execResult: { result: unknown; execution_time_ms: number };
  let status: "success" | "error" = "success";
  let errorMessage: string | null = null;

  try {
    const startTime = Date.now();
    const realResult = await executeSkillById(skill.id, args);
    const executionTime = Date.now() - startTime;

    if (realResult.success) {
      execResult = { result: realResult.output, execution_time_ms: executionTime };
    } else {
      status = "error";
      errorMessage = realResult.error || "Execution failed";
      execResult = { result: null, execution_time_ms: executionTime };
    }
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : "Unknown error";
    execResult = { result: null, execution_time_ms: 0 };
  }

  await supabase.from("skill_executions").insert({
    skill_id: skill.id,
    user_id: userId,
    input: args as Record<string, unknown>,
    output: execResult.result as Record<string, unknown>,
    status,
    execution_time_ms: execResult.execution_time_ms,
    error_message: errorMessage,
  });

  if (status === "error") {
    return NextResponse.json(
      {
        role: "tool",
        content: JSON.stringify({ error: errorMessage }),
        name: function_name,
      },
      { status: 500 }
    );
  }

  // OpenAI-compatible tool result format
  return NextResponse.json({
    role: "tool",
    content: JSON.stringify(execResult.result),
    name: function_name,
    skill_id: skill.id,
    execution_time_ms: execResult.execution_time_ms,
  });
}
