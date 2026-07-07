import { NextResponse } from 'next/server';
import { NEXUS_REGISTRY } from '@/lib/nexus-registry';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ skill: string }> },
) {
  const { skill } = await params;
  if (!NEXUS_REGISTRY[skill]) {
    return NextResponse.json({ error: `Unknown tool: ${skill}` }, { status: 404 });
  }
  return NextResponse.json({ status: 'ok', tool: skill }, { status: 200 });
}
