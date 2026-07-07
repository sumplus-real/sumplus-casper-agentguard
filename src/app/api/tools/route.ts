import { NextRequest, NextResponse } from 'next/server';
import { listRegistrableTools, getPublicBaseUrl, toolBaseUrl } from '@/lib/nexus-tools';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tools[?network=testnet|mainnet]
 *
 * Nexus batch registration index. Returns Arsenal-hosted Nexus tools that
 * are ready to be registered on the given network. Consumed by the Nexus CLI
 * `--batch` flag:
 *
 *   nexus tool register offchain --url https://arsenal.sumplus.xyz/api/tools --batch
 *
 * Defaults to `network=testnet` because Nexus mainnet isn't live yet and
 * mainnet-only tools would cause Sui mainnet transactions to flow through
 * testnet DAGs (which would be a very bad time for DAG authors).
 */
export function GET(request: NextRequest) {
  const baseUrl = getPublicBaseUrl(request.url);
  const url = new URL(request.url);
  const networkParam = url.searchParams.get('network');
  const network: 'testnet' | 'mainnet' =
    networkParam === 'mainnet' ? 'mainnet' : 'testnet';

  const tools = listRegistrableTools(network).map((spec) => ({
    fqn: spec.fqn,
    url: toolBaseUrl(baseUrl, spec.slug),
  }));
  return NextResponse.json({ network, tools });
}
