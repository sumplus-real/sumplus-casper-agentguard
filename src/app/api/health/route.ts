/**
 * GET /api/health — live health of every external dependency Arsenal relies on.
 *
 * Probes the keyless PUBLIC RPC endpoints of each registered chain (eth_blockNumber)
 * plus a handful of region-safe data APIs, in parallel, and reports per-provider
 * status, latency, and head block. Results are cached ~45s (see src/lib/health.ts)
 * so a page refresh, an agent poll, or a catalog listing doesn't re-probe every time.
 *
 * Query params:
 *   ?refresh=1  bypass the cache and probe fresh
 *   ?alert=1    (scheduler) if any chain has ALL providers down or a critical API is
 *               down, POST a message to HEALTH_ALERT_WEBHOOK (if configured)
 *
 * The Alchemy URL (which embeds ALCHEMY_API_KEY) is never probed or returned.
 */

import { NextResponse } from 'next/server';
import { getHealthReport, type HealthReport } from '@/lib/health';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function fireAlert(report: HealthReport): Promise<{ alerted: boolean; reason?: string }> {
  const downChains = report.chains.filter((c) => c.status === 'down');
  const downApis = report.apis.filter((a) => !a.ok);
  if (downChains.length === 0 && downApis.length === 0) {
    return { alerted: false, reason: 'all healthy' };
  }
  const webhook = process.env.HEALTH_ALERT_WEBHOOK;
  if (!webhook) return { alerted: false, reason: 'no HEALTH_ALERT_WEBHOOK configured' };

  const lines: string[] = ['⚠️ Arsenal health alert'];
  for (const c of downChains) lines.push(`RPC down: ${c.label} (all ${c.providers.length} providers)`);
  for (const a of downApis) lines.push(`API down: ${a.name} (${a.error ?? a.status_code})`);
  const text = lines.join('\n');

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        down_chains: downChains.map((c) => c.key),
        down_apis: downApis.map((a) => a.name),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return { alerted: true };
  } catch (e) {
    return { alerted: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get('refresh') === '1';
  const alert = searchParams.get('alert') === '1';

  const report = (await getHealthReport({ allowProbe: true, refresh })) as HealthReport;

  const body: HealthReport & { alert?: { alerted: boolean; reason?: string } } = { ...report };
  if (alert) body.alert = await fireAlert(report);

  // Degraded/down still returns 200 (the page renders the detail); never throw.
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
