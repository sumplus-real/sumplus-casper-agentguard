import { NextRequest, NextResponse } from 'next/server';
import {
  getNexusTool,
  normalizeExecutorResult,
  applyInputOverride,
  getAllowedActions,
} from '@/lib/nexus-tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/tools/:slug/invoke
 *
 * Nexus off-chain tool invocation endpoint. The Nexus Leader canonicalizes
 * the invoke URL as `<base>/invoke`, so this path is fixed.
 *
 * Request body: arbitrary JSON matching the tool's input_schema.
 * Response body: one of the output_schema variants —
 *   { ok:  {...} }  on success
 *   { err: { reason: string } }  on failure
 *
 * Both variants return HTTP 200; only infrastructure errors (unknown tool,
 * malformed JSON) use non-200 codes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const tool = getNexusTool(slug);
  if (!tool) {
    return NextResponse.json(
      { err: { reason: `Unknown tool: ${slug}` } },
      { status: 404 },
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { err: { reason: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  // Enforce the action allowlist advertised in /meta's input_schema.
  // Keeps the tool's actual behavior in strict sync with its published
  // schema, even if a caller bypasses schema validation.
  const allowed = getAllowedActions(tool);
  if (allowed) {
    const action =
      input && typeof input === 'object'
        ? (input as Record<string, unknown>).action
        : undefined;
    if (typeof action !== 'string' || !allowed.includes(action)) {
      return NextResponse.json({
        err: {
          reason: `Action "${String(action)}" is not supported by ${tool.fqn}. Available actions: ${allowed.join(', ')}`,
        },
      });
    }
  }

  try {
    const merged = applyInputOverride(tool, input);
    const result = await tool.executor(merged);
    return NextResponse.json(normalizeExecutorResult(result));
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Executor error';
    return NextResponse.json({ err: { reason } });
  }
}
