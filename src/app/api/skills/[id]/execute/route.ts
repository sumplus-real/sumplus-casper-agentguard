import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { executeSkillById } from "@/lib/skill-executors";

export const dynamic = "force-dynamic";
export const runtime = 'nodejs';  // Force Node.js runtime (not Edge)

/**
 * POST /api/skills/:id/execute
 *
 * Execute a skill with real implementation
 * Currently supports:
 * - Token Price Query (CoinGecko API)
 * - More skills can be added
 */

const ExecuteInputSchema = z.object({
  input: z.record(z.string(), z.any()),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: skillId } = await params;

    const body = await req.json();
    const parseResult = ExecuteInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { input } = parseResult.data;

    // Execute the skill using shared executor
    const result = await executeSkillById(skillId, input);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`POST /api/skills/${params}/execute error:`, error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
