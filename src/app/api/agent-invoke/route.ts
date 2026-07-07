import { NextRequest } from "next/server";
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

const InvokeSchema = z.object({
  skill_id: z.string().uuid(),
  input: z.record(z.string(), z.any()).default({}),
});

/**
 * POST /api/agent-invoke
 *
 * SSE execution endpoint for agent skills (execution_protocol: sse_stream).
 * Also accepts protocol skills — wraps their result in SSE envelope for uniform callers.
 *
 * Headers:
 *   Authorization: Bearer <api_key>          (required)
 *   X-Delegated-User-Token: <jwt>            (required for requires_user_session skills)
 *   X-Calling-Agent-Id: <agent_identifier>   (recommended, used for audit/billing)
 *
 * SSE event stream:
 *   event: thinking   data: { text }
 *   event: result     data: { success, output }
 *   event: error      data: { code, message }
 *   event: done       data: {}
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";
  const callingAgentId = req.headers.get("x-calling-agent-id") ?? null;
  const delegatedUserToken = req.headers.get("x-delegated-user-token") ?? null;

  const userId = token ? await resolveUser(token) : null;
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "UNAUTHORIZED", message: "API key required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(
      JSON.stringify({ error: "VALIDATION_ERROR", message: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const parse = InvokeSchema.safeParse(body);
  if (!parse.success) {
    return new Response(
      JSON.stringify({ error: "VALIDATION_ERROR", details: parse.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { skill_id, input } = parse.data;

  const skill = await skillsService.getSkill(skill_id);
  if (!skill) {
    return new Response(
      JSON.stringify({ error: "SKILL_NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Agent skills with requires_user_session must receive a delegated user token
  if (skill.requires_user_session && !delegatedUserToken) {
    return new Response(
      JSON.stringify({
        error: "MISSING_DELEGATED_TOKEN",
        message: "This skill requires X-Delegated-User-Token header",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = getSupabase();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: AgentSkillEvent | "done", data: Record<string, any>) => {
        controller.enqueue(sseEvent(event, data));
      };

      try {
        enqueue("thinking", { text: `Invoking ${skill.name}…` });

        // For real agent skills: execution happens inside the skill executor,
        // which can push intermediate events via a future streaming API.
        // For now all skills (protocol + agent) are executed synchronously here.
        const executionInput: Record<string, any> = { ...input };
        if (delegatedUserToken) executionInput._delegated_user_token = delegatedUserToken;
        if (callingAgentId)     executionInput._calling_agent_id     = callingAgentId;

        const result = await skillsService.executeSkill({ skill_id, input: executionInput });
        const executionTime = Date.now() - startTime;

        // Log execution (fire-and-forget)
        supabase.from("skill_executions").insert({
          skill_id,
          user_id: userId,
          input,
          output: result.output,
          status: result.success ? "success" : "error",
          execution_time_ms: executionTime,
          error_message: result.error,
        }).then(() => {});

        if (result.success) {
          if (executionTime > 200) {
            supabase.from("skills").select("usage_count").eq("id", skill_id).single()
              .then(({ data }) => {
                supabase.from("skills")
                  .update({ usage_count: (data?.usage_count ?? 0) + 1 })
                  .eq("id", skill_id).then(() => {});
              });
          }
          enqueue("result", {
            success: true,
            output: result.output,
            skill_id,
            execution_time_ms: executionTime,
          });
        } else {
          enqueue("error", { code: "SKILL_EXECUTION_FAILED", message: result.error });
        }
      } catch (e: any) {
        enqueue("error", { code: "INTERNAL_ERROR", message: e.message ?? "Unexpected error" });
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
