import { NextRequest, NextResponse } from 'next/server';
import { getNexusTool, buildToolMeta, getPublicBaseUrl } from '@/lib/nexus-tools';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tools/:slug/meta
 *
 * Returns the Nexus Tool Definition JSON for this tool:
 *
 *   { fqn, type: "offchain", url, description, input_schema, output_schema }
 *
 * The `url` field must match the URL this tool was registered with — we
 * derive it from the request origin (or NEXUS_TOOL_PUBLIC_BASE_URL when set).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const tool = getNexusTool(slug);
  if (!tool) {
    return NextResponse.json(
      { error: `Unknown tool: ${slug}` },
      { status: 404 },
    );
  }
  const baseUrl = getPublicBaseUrl(request.url);
  return NextResponse.json(buildToolMeta(tool, baseUrl));
}
