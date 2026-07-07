import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { skillsService } from "@/services/skills.service";
import { resolveUser } from "@/lib/auth";
import type { AgentSkillEvent } from "@/types/skill";

export const dynamic = "force-dynamic";

const enc = new TextEncoder();

function sseEvent(event: AgentSkillEvent | "done", data: Record<string, any>): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const RunSchema = z.object({
  skill_id: z.string().uuid(),
  input: z.record(z.string(), z.any()).default({}),
});

/**
 * POST /api/run
 *
 * Unified skill execution entry point.
 * Inspects skill.execution_protocol and routes automatically:
 *   - rest_json  → JSON response (same as /api/execute)
 *   - sse_stream → SSE stream   (same as /api/agent-invoke)
 *   - async_task → 202 + task_id (future)
 *
 * Callers that always want SSE should use /api/agent-invoke directly.
 * Callers that want auto-routing use this endpoint.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";
  const callingAgentId = req.headers.get("x-calling-agent-id") ?? null;
  const delegatedUserToken = req.headers.get("x-delegated-user-token") ?? null;

  const userId = token ? await resolveUser(token) : null;
  if (!userId) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "API key required" },
      { status: 401 }
    );
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Invalid JSON" }, { status: 400 });
  }

  const parse = RunSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parse.error.flatten() }, { status: 400 });
  }

  const { skill_id, input } = parse.data;

  const skill = await skillsService.getSkill(skill_id);
  if (!skill) {
    return NextResponse.json({ error: "SKILL_NOT_FOUND" }, { status: 404 });
  }

  const protocol = skill.execution_protocol ?? "rest_json";

  if (protocol === "sse_stream") {
    // Agent skill — proxy to SSE path
    if (skill.requires_user_session && !delegatedUserToken) {
      return NextResponse.json(
        { error: "MISSING_DELEGATED_TOKEN", message: "This skill requires X-Delegated-User-Token header" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const startTime = Date.now();
    const executionInput = { ...input };
    if (delegatedUserToken) executionInput._delegated_user_token = delegatedUserToken;
    if (callingAgentId)     executionInput._calling_agent_id     = callingAgentId;

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (event: AgentSkillEvent | "done", data: Record<string, any>) => {
          controller.enqueue(sseEvent(event, data));
        };
        try {
          enqueue("thinking", { text: `Invoking ${skill.name}…` });
          const result = await skillsService.executeSkill({ skill_id, input: executionInput });
          const executionTime = Date.now() - startTime;

          supabase.from("skill_executions").insert({
            skill_id, user_id: userId, input,
            output: result.output,
            status: result.success ? "success" : "error",
            execution_time_ms: executionTime,
            error_message: result.error,
          }).then(() => {});

          if (result.success) {
            enqueue("result", { success: true, output: result.output, skill_id, execution_time_ms: executionTime });
          } else {
            enqueue("error", { code: "SKILL_EXECUTION_FAILED", message: result.error });
          }
        } catch (e: any) {
          controller.enqueue(sseEvent("error", { code: "INTERNAL_ERROR", message: e.message }));
        } finally {
          controller.enqueue(sseEvent("done", {}));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  if (protocol === "async_task") {
    // Future: submit task, return 202 + task_id
    return NextResponse.json(
      { error: "NOT_IMPLEMENTED", message: "async_task protocol not yet supported" },
      { status: 501 }
    );
  }

  // Default: rest_json — same path as /api/execute
  const supabase = getSupabase();
  const startTime = Date.now();

  try {
    const result = await skillsService.executeSkill({ skill_id, input });
    const executionTime = Date.now() - startTime;

    const { data: execRow } = await supabase
      .from("skill_executions")
      .insert({
        skill_id, user_id: userId, input,
        output: result.output,
        status: result.success ? "success" : "error",
        execution_time_ms: executionTime,
        error_message: result.error,
      })
      .select("id")
      .single();

    if (result.success) {
      supabase.from("skills").select("usage_count").eq("id", skill_id).single()
        .then(({ data }) => {
          supabase.from("skills")
            .update({ usage_count: (data?.usage_count ?? 0) + 1 })
            .eq("id", skill_id).then(() => {});
        });
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "SKILL_EXECUTION_FAILED", message: result.error, skill_id, execution_id: execRow?.id },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      result: result.output,
      output: result.output,
      skill_id,
      execution_time_ms: executionTime,
      execution_id: execRow?.id,
      _note: result._note,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: error.message },
      { status: 500 }
    );
  }
}
