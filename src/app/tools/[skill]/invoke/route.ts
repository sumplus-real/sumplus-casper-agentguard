import { NextResponse } from 'next/server';
import { NEXUS_REGISTRY } from '@/lib/nexus-registry';
import { executeSkillById } from '@/lib/skill-executors';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ skill: string }> },
) {
  const { skill } = await params;
  const entry = NEXUS_REGISTRY[skill];
  if (!entry) {
    return NextResponse.json(
      { err: { reason: `Unknown tool: ${skill}` } },
      { status: 404 },
    );
  }

  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json(
      { err: { reason: 'Invalid JSON in request body' } },
      { status: 400 },
    );
  }

  try {
    const result = await executeSkillById(entry.uuid, input);
    if (result.success) {
      return NextResponse.json({ ok: result.output ?? {} }, { status: 200 });
    }
    return NextResponse.json(
      { err: { reason: result.error ?? 'Skill execution failed' } },
      { status: 200 }, // Nexus expects 200 even for logical errors
    );
  } catch (e: any) {
    return NextResponse.json(
      { err: { reason: e?.message ?? 'Internal error' } },
      { status: 200 },
    );
  }
}
