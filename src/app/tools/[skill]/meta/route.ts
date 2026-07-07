import { NextResponse } from 'next/server';
import { NEXUS_REGISTRY, buildMeta } from '@/lib/nexus-registry';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ skill: string }> },
) {
  const { skill } = await params;
  const entry = NEXUS_REGISTRY[skill];
  if (!entry) {
    return NextResponse.json({ error: `Unknown tool: ${skill}` }, { status: 404 });
  }
  return NextResponse.json(buildMeta(entry), { status: 200 });
}
