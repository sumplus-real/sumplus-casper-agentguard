import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateEmbedding, buildSkillEmbeddingText } from "@/lib/embedding";

function getSupabaseForAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

async function requireAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = getSupabaseForAdmin();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!userData || userData.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin role required" }, { status: 403 });
  }

  return { userId: user.id };
}

export const dynamic = "force-dynamic";

const SkillSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  schema: z.any(), // Accept any valid JSON schema structure
  code: z.string().optional().default(""),
  usage_examples: z.array(z.any()).default([]),
  is_paid: z.boolean().default(false),
  price: z.number().nullable().optional(),
  author_type: z.enum(["official", "verified", "community"]).default("official"),
  status: z.enum(["pending", "approved", "rejected"]).default("approved"),
  // External provider proxy fields (admin-only, never exposed to users)
  execution_endpoint: z.string().url().optional(),
  execution_auth_header: z.string().optional(),
  execution_skill_id: z.string().optional(), // provider's own skill ID to send in proxy call
});

const UploadSchema = z.object({
  skills: z.array(SkillSchema),
  auto_embed: z.boolean().default(true),
});

/**
 * POST /api/admin/upload-skills
 *
 * Admin endpoint for batch uploading skills via JSON.
 * Accepts an array of skill objects and optionally generates embeddings.
 *
 * Request body:
 * {
 *   "skills": [
 *     {
 *       "name": "Skill Name",
 *       "description": "Description...",
 *       "category": "Blockchain",
 *       "tags": ["tag1", "tag2"],
 *       "schema": { "input": {...}, "output": {...} },
 *       "code": "// implementation",
 *       "usage_examples": [...],
 *       "is_paid": false,
 *       "price": null,
 *       "author_type": "official",
 *       "status": "approved"
 *     }
 *   ],
 *   "auto_embed": true  // default true
 * }
 *
 * Authentication: Requires admin access (future: check admin role)
 */
export async function POST(req: NextRequest) {
  // 0. Admin auth guard
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  // 1. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // 2. Validate
  const result = UploadSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: result.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { skills, auto_embed } = result.data;

  // 3. Insert skills with embeddings
  const supabase = getSupabaseForAdmin();
  const results: {
    success: Array<{ name: string; id: string }>;
    failed: Array<{ name: string; error: string }>;
  } = {
    success: [],
    failed: [],
  };

  for (const skill of skills) {
    try {
      // Generate embedding if enabled
      let embedding: number[] | null = null;
      if (auto_embed) {
        const embeddingText = buildSkillEmbeddingText({
          name: skill.name,
          description: skill.description,
          category: skill.category,
          tags: skill.tags,
        });
        embedding = await generateEmbedding(embeddingText);
      }

      // Insert skill
      const { data, error } = await supabase
        .from("skills")
        .insert({
          name: skill.name,
          description: skill.description,
          category: skill.category,
          tags: skill.tags,
          schema: skill.schema,
          code: skill.code,
          usage_examples: skill.usage_examples,
          is_paid: skill.is_paid,
          price: skill.price,
          author_type: skill.author_type,
          status: skill.status,
          embedding,
          execution_endpoint: skill.execution_endpoint ?? null,
          execution_auth_header: skill.execution_auth_header ?? null,
          execution_skill_id: skill.execution_skill_id ?? null,
        })
        .select("id, name")
        .single();

      if (error) throw error;

      results.success.push({
        name: data.name,
        id: data.id,
      });
    } catch (err) {
      results.failed.push({
        name: skill.name,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    total: skills.length,
    success_count: results.success.length,
    failed_count: results.failed.length,
    success: results.success,
    failed: results.failed,
  });
}
