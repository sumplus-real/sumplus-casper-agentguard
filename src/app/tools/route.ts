/**
 * GET /tools
 * Returns a list of all registered Nexus-compatible Arsenal tools.
 * Useful for discovery — Talus can call this to see all available skills.
 */
import { NextResponse } from 'next/server';
import { NEXUS_REGISTRY, BASE_URL, buildMeta } from '@/lib/nexus-registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tools = Object.values(NEXUS_REGISTRY).map((entry) => ({
    ...buildMeta(entry),
    endpoints: {
      health: `${BASE_URL}/tools/${entry.slug}/health`,
      meta:   `${BASE_URL}/tools/${entry.slug}/meta`,
      invoke: `${BASE_URL}/tools/${entry.slug}/invoke`,
    },
  }));

  return NextResponse.json({ tools, count: tools.length }, { status: 200 });
}
