import { NextResponse } from "next/server";
import { skillsService } from "@/services/skills.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/categories - Return all skill categories
 */
export async function GET() {
  try {
    const categories = await skillsService.getCategories();

    return NextResponse.json({
      categories,
      count: categories.length,
    });
  } catch (error: any) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
