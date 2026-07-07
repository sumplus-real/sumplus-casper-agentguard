import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const CreatePaymentSchema = z.object({
  skill_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  transaction_id: z.string().optional(),
});

// POST /api/payments - Create a payment record
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

  const parseResult = CreatePaymentSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { skill_id, amount, currency, transaction_id } = parseResult.data;

  // Verify skill exists
  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .select("id, is_paid, price")
    .eq("id", skill_id)
    .single();

  if (skillError || !skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      skill_id,
      amount,
      currency,
      status: "pending",
      payment_method: "x402",
      transaction_id: transaction_id ?? null,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ payment }, { status: 201 });
}
