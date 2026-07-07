import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  getX402Config,
  buildPaymentRequirements,
  verifyWithFacilitator,
  settleWithFacilitator,
} from "@/lib/x402";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const VerifyPaymentSchema = z.object({
  payment_id: z.string().uuid(),
  x402_payment_header: z.string().min(1),
});

// POST /api/payments/verify
// Verifies an x402 payment header against the stored payment record using Coinbase's facilitator,
// then settles it on-chain and marks the DB record as completed.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = getSupabase();

  let userId: string | undefined;

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (!authError && user) {
    userId = user.id;
  } else {
    const { data: agentUser } = await supabase
      .from("users").select("id").eq("api_key", token).single();
    if (agentUser) userId = agentUser.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = VerifyPaymentSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { payment_id, x402_payment_header } = parseResult.data;

  // Fetch payment record
  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, user_id, status, skill_id, amount, currency")
    .eq("id", payment_id)
    .single();

  if (fetchError || !payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (payment.status === "completed") {
    return NextResponse.json({ payment, message: "Payment already verified" });
  }

  // Get x402 config
  let x402Config;
  try {
    x402Config = getX402Config();
  } catch (err) {
    return NextResponse.json(
      { error: "Payment system not configured on server", detail: String(err) },
      { status: 503 }
    );
  }

  // Fetch the skill to build proper PaymentRequirements
  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .select("id, name, price")
    .eq("id", payment.skill_id)
    .single();

  if (skillError || !skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const resourceUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("supabase.co", "vercel.app") || "https://arsenal.sumpl.us"}/api/execute`;
  const requirements = buildPaymentRequirements(
    skill.price ?? payment.amount,
    skill.name as string,
    resourceUrl,
    x402Config
  );

  // Verify with Coinbase facilitator
  const verifyResult = await verifyWithFacilitator(x402_payment_header, requirements, x402Config.facilitatorUrl);
  if (!verifyResult.isValid) {
    return NextResponse.json(
      { error: "Payment verification failed", reason: verifyResult.invalidReason },
      { status: 402 }
    );
  }

  // Settle on-chain via facilitator
  const settleResult = await settleWithFacilitator(x402_payment_header, requirements, x402Config.facilitatorUrl);

  // Mark payment as completed regardless of settle result (verify already confirmed it)
  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update({
      status: "completed",
      transaction_id: settleResult.txHash ?? x402_payment_header.slice(0, 64),
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    payment: updated,
    message: "Payment verified and settled",
    x402_verified: true,
    tx_hash: settleResult.txHash,
  });
}
