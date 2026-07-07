import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(["user", "agent"]).default("user"),
});

// POST /api/auth/signup
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = SignupSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { email, role } = parseResult.data;
  // For agents, auto-generate password if not provided
  const password = parseResult.data.password ?? (role === "agent" ? crypto.randomBytes(16).toString("hex") : undefined);
  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }
  const supabase = getSupabase();

  // Use admin API to bypass email domain validation and confirmation requirements
  const { data: authData, error: signupError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm so agents/tests can log in immediately
  });

  if (signupError) {
    return NextResponse.json({ error: signupError.message }, { status: 400 });
  }

  if (!authData.user) {
    return NextResponse.json({ error: "User creation failed" }, { status: 500 });
  }

  const apiKey = crypto.randomBytes(32).toString("hex");

  const { error: insertError } = await supabase.from("users").upsert({
    id: authData.user.id,
    email: authData.user.email!,
    role,
    api_key: apiKey,
  }, { onConflict: "id" });

  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const response: Record<string, unknown> = {
    user: { id: authData.user.id, email: authData.user.email, role },
    api_key: apiKey,
  };
  // Return auto-generated password so agent owner can save it
  if (role === "agent" && !parseResult.data.password) {
    response.password = password;
  }
  return NextResponse.json(response, { status: 201 });
}
