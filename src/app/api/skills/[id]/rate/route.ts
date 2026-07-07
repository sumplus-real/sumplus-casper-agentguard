import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { skillsService } from "@/services/skills.service";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const RatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().max(2000).optional(),
  source: z.enum(['human', 'agent']).default('human'),
  execution_id: z.string().uuid().optional(),
});

/**
 * POST /api/skills/:id/rate - Rate a skill
 *
 * Requires authentication. Users can update their existing rating.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: skillId } = await params;

    // Authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabase();

    let userId: string | undefined;

    // Try JWT auth first
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (!authError && user) {
      userId = user.id;
    } else {
      // Fall back to API key auth
      const { data: agentUser } = await supabase
        .from("users")
        .select("id")
        .eq("api_key", token)
        .single();

      if (agentUser) {
        userId = agentUser.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parseResult = RatingSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    // Verify skill exists using shared service
    const skill = await skillsService.getSkill(skillId);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Rate skill using shared service
    await skillsService.rateSkill(
      skillId,
      userId,
      parseResult.data.rating,
      parseResult.data.review,
      parseResult.data.source,
      parseResult.data.execution_id
    );

    return NextResponse.json(
      { message: "Rating submitted successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("POST /api/skills/[id]/rate error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
