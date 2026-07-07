import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { skillsService } from "@/services/skills.service";
import type { SkillFilters } from "@/types/skill";
import { getHealthReport, skillHealthFromReport } from "@/lib/health";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const CreateSkillSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(2000),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  version: z.string().default("1.0.0"),
  schema: z.object({
    input: z.record(z.string(), z.any()),
    output: z.record(z.string(), z.any()),
  }),
  code: z.string().optional(),
  skill_md: z.string().optional(),
  references: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    description: z.string().optional(),
  })).optional(),
  scripts: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    language: z.string(),
    description: z.string().optional(),
  })).optional(),
  features: z.array(z.enum(['code-execution', 'network-access', 'mcp-tools', 'web3-wallet', 'payment-proof'])).optional(),
  usage_examples: z.array(z.any()).default([]),
  is_paid: z.boolean().default(false),
  price: z.number().optional(),
});

/**
 * GET /api/skills - List skills with optional filtering
 *
 * Query parameters:
 * - search: Natural language search query
 * - category: Filter by category
 * - tags: Filter by tags (comma-separated)
 * - is_paid: Filter by payment requirement (true/false)
 * - min_rating: Minimum rating (1-5)
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 20)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    // Build filters
    const filters: SkillFilters = {};

    if (searchParams.get("category")) {
      filters.category = searchParams.get("category")!;
    }

    if (searchParams.get("tags")) {
      filters.tags = searchParams.get("tags")!.split(",");
    }

    if (searchParams.get("is_paid")) {
      filters.is_paid = searchParams.get("is_paid") === "true";
    }

    if (searchParams.get("min_rating")) {
      filters.min_rating = parseFloat(searchParams.get("min_rating")!);
    }

    if (searchParams.get("author_type")) {
      const authorType = searchParams.get("author_type");
      if (authorType === "official" || authorType === "community") {
        filters.author_type = authorType;
      }
    }

    const sort = searchParams.get("sort") || "popular";

    // Use shared service
    const result = await skillsService.searchSkills(search, filters, page, limit, sort);

    // Resolve author names: "arsenal" for official, username for community
    const communityIds = result.skills
      .filter((s: any) => s.author_type === "community" && s.author_id)
      .map((s: any) => s.author_id as string);

    let usernameMap: Record<string, string> = {};
    if (communityIds.length > 0) {
      const supabase = getSupabase();
      const { data: authors } = await supabase
        .from("users")
        .select("id, username")
        .in("id", communityIds);
      if (authors) {
        for (const a of authors as { id: string; username: string | null }[]) {
          if (a.username) usernameMap[a.id] = a.username;
        }
      }
    }

    // Best-effort live chain health, so an agent sees "this chain is degraded"
    // at skill-selection time. One cached probe per request (shared with
    // /api/health + /status); annotation is null for skills on chains we don't
    // monitor (e.g. Sui/Solana). Never let a probe failure break the catalog.
    let healthReport = null;
    try {
      healthReport = await getHealthReport({ allowProbe: true });
    } catch {
      healthReport = null;
    }

    const skills = result.skills.map((s: any) => ({
      ...s,
      author_name: s.author_type === "official"
        ? "arsenal"
        : (s.author_id ? (usernameMap[s.author_id] ?? null) : null),
      health: healthReport ? skillHealthFromReport(healthReport, s.tags ?? []) : null,
    }));

    return NextResponse.json({ ...result, skills });
  } catch (error: any) {
    console.error("GET /api/skills error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills - Create a new skill
 *
 * Requires authentication via Bearer token (JWT or API key)
 */
export async function POST(req: NextRequest) {
  try {
    // Authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabase();

    // Try JWT auth first
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    let userId = user?.id;

    if (authError || !user) {
      // Fall back to API key auth for agents
      const { data: agentUser } = await supabase
        .from("users")
        .select("id")
        .eq("api_key", token)
        .single();

      if (!agentUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      userId = agentUser.id;
    }

    // Validate request body
    const body = await req.json();
    const parseResult = CreateSkillSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    // Create skill using shared service
    const skill = await skillsService.createSkill(parseResult.data as any, userId!);

    return NextResponse.json({ skill }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/skills error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
