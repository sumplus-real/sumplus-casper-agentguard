import { NextResponse } from 'next/server';
import { getNexusTool } from '@/lib/nexus-tools';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tools/:slug/health
 *
 * Nexus off-chain tool health endpoint. Returns 200 iff the tool is ready
 * to be invoked. No specific body shape is mandated by the Nexus spec.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const tool = getNexusTool(slug);
  if (!tool) {
    return NextResponse.json(
      { status: 'unknown_tool', slug },
      { status: 404 },
    );
  }
  return NextResponse.json({ status: 'ok', fqn: tool.fqn });
}
