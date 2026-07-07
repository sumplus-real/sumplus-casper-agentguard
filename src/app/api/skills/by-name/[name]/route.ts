import { NextRequest, NextResponse } from "next/server";
import { skillsService } from "@/services/skills.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/skills/by-name/:name
 *
 * Get skill by exact name or fuzzy match
 * Makes it easier for agents to load skills without knowing the ID
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: "Skill name is required" },
        { status: 400 }
      );
    }

    // Use semantic search to find the best match
    const result = await skillsService.searchSkills(name, {}, 1, 1);

    if (result.total === 0) {
      return NextResponse.json(
        {
          error: `Skill '${name}' not found`,
          suggestion: "Try searching with /api/skills?search=<query>"
        },
        { status: 404 }
      );
    }

    // Return the first (most relevant) result
    const skill = result.skills[0];

    return NextResponse.json({
      skill,
      matched_by: skill.name.toLowerCase().includes(name.toLowerCase())
        ? "exact_match"
        : "semantic_search"
    });
  } catch (error: any) {
    console.error("GET /api/skills/by-name/[name] error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
