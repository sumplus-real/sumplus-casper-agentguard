import { NextRequest, NextResponse } from 'next/server';
import { getNexusTool, getPublicBaseUrl, toolBaseUrl } from '@/lib/nexus-tools';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tools/:slug
 *
 * The Nexus off-chain tool protocol never calls the base URL directly —
 * Leader nodes always append `/health`, `/meta`, or `/invoke`. This handler
 * exists purely for humans who click the base URL in a browser: instead of
 * seeing a bare 404, they get a tiny JSON describing the three real
 * sub-endpoints and pointing at the Talus spec.
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
  const base = toolBaseUrl(baseUrl, slug);

  return NextResponse.json({
    fqn: tool.fqn,
    description: tool.description,
    base_url: base,
    endpoints: {
      health: `${base}/health`,
      meta:   `${base}/meta`,
      invoke: `${base}/invoke`,
    },
    protocol: 'Talus Nexus off-chain tool',
    spec:     'https://docs.talus.network/developer-docs/index/tool',
    note:
      'This base URL is informational only. Nexus Leader nodes never call it directly; they append /health, /meta, or /invoke per the spec. Use GET /meta for the Tool Definition JSON, or POST /invoke to execute the tool.',
  });
}
