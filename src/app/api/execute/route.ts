import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { skillsService } from "@/services/skills.service";
import { resolveUser } from "@/lib/auth";
import {
  getX402Config,
  buildPaymentRequirements,
  verifyWithFacilitator,
  settleWithFacilitator,
  build402Response,
} from "@/lib/x402";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const ExecuteSchema = z.object({
  skill_id: z.string().uuid(),
  input: z.record(z.string(), z.any()).default({}),
});

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";
    const supabase = getSupabase();

    const userId = token ? await resolveUser(token) : null;
    if (!userId) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "API key required. Get yours at arsenal.sumplus.xyz/signup" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parse = ExecuteSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid request body", details: parse.error.flatten() },
        { status: 400 }
      );
    }

    const { skill_id, input } = parse.data;
    const startTime = Date.now();

    // Fetch skill using shared service
    const skill = await skillsService.getSkill(skill_id);
    if (!skill) {
      return NextResponse.json({ error: "SKILL_NOT_FOUND", message: "Skill not found" }, { status: 404 });
    }

  // Check payment for paid skills — supports both x402 header and legacy DB-payment check
  if (skill.is_paid) {
    const xPaymentHeader = req.headers.get("x-payment");

    if (xPaymentHeader) {
      // x402 protocol: verify payment header via Coinbase facilitator
      let x402Config;
      try {
        x402Config = getX402Config();
      } catch {
        return NextResponse.json({ error: "Payment system not configured on server" }, { status: 503 });
      }

      const resourceUrl = req.nextUrl.href;
      const requirements = buildPaymentRequirements(
        skill.price ?? 0,
        skill.name as string,
        resourceUrl,
        x402Config
      );

      const verifyResult = await verifyWithFacilitator(xPaymentHeader, requirements, x402Config.facilitatorUrl);
      if (!verifyResult.isValid) {
        return NextResponse.json(
          { error: "Invalid payment", reason: verifyResult.invalidReason },
          { status: 402 }
        );
      }

      // Settle the payment and record transaction
      const settleResult = await settleWithFacilitator(xPaymentHeader, requirements, x402Config.facilitatorUrl);
      if (settleResult.success && userId) {
        await supabase.from("payments").insert({
          user_id: userId,
          skill_id,
          amount: skill.price,
          currency: "USDC",
          status: "completed",
          payment_method: "x402",
          transaction_id: settleResult.txHash ?? xPaymentHeader.slice(0, 64),
        });
      }
    } else {
      // Legacy: check if user already has a completed payment in DB
      const { data: payment } = await supabase
        .from("payments")
        .select("id")
        .eq("skill_id", skill_id)
        .eq("user_id", userId)
        .eq("status", "completed")
        .single();

      if (!payment) {
        try {
          const x402Config = getX402Config();
          const resourceUrl = req.nextUrl.href;
          const requirements = buildPaymentRequirements(
            skill.price ?? 0,
            skill.name as string,
            resourceUrl,
            x402Config
          );
          return NextResponse.json(build402Response(requirements), { status: 402 });
        } catch {
          return NextResponse.json({ error: "Payment required", skill_id, price: skill.price }, { status: 402 });
        }
      }
    }
  }

    // Execute skill using shared service
    const executionResult = await skillsService.executeSkill({
      skill_id,
      input,
      payment_proof: req.headers.get("x-payment") || undefined,
    });

    const executionTime = Date.now() - startTime;

    // Log execution
    const { data: execRow } = await supabase
      .from("skill_executions")
      .insert({
        skill_id,
        user_id: userId,
        input,
        output: executionResult.output,
        status: executionResult.success ? "success" : "error",
        execution_time_ms: executionTime,
        error_message: executionResult.error,
      })
      .select("id")
      .single();
    const executionId = execRow?.id ?? null;

    // Increment usage_count (fire-and-forget, don't block response)
    if (executionResult.success) {
      supabase.from("skills").select("usage_count").eq("id", skill_id).single()
        .then(({ data }) => {
          supabase.from("skills")
            .update({ usage_count: (data?.usage_count ?? 0) + 1 })
            .eq("id", skill_id)
            .then(() => {});
        });
    }

    if (!executionResult.success) {
      // 422: skill ran but returned a logical failure (bad input, no pool, etc.)
      // Reserve 500 for unexpected server errors (caught below)
      return NextResponse.json(
        { success: false, error: "SKILL_EXECUTION_FAILED", message: executionResult.error, skill_id, execution_id: executionId },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      result: executionResult.output,   // primary key (REST convention)
      output: executionResult.output,   // alias for MCP / execute_skill callers
      skill_id,
      execution_time_ms: executionTime,
      execution_id: executionId,
      _note: executionResult._note,
      _feedback: {
        rate_url: `https://arsenal.sumplus.xyz/api/skills/${skill_id}/rate`,
        hint: "Use your API key to POST { rating: 1-5, review: '...', execution_id, source: 'agent' }",
      },
    });
  } catch (error: any) {
    console.error("POST /api/execute error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
