import type { SkillExecutionResult } from '@/types/skill';

export const DEFILLAMA_SKILL_METADATA = {
  name: 'DefiLlama',
  description:
    '[ARSENAL-HOSTED ✓] Read-only DefiLlama API adapter for TVL, yield, and portfolio decision support. ' +
    'Get protocol TVL by slug, list yield pools with filters, historical chain TVL, and stablecoin circulation data. ' +
    'No API key required.',
  category: 'Data & Oracles',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['defillama', 'tvl', 'yield', 'data', 'defi', 'ethereum', 'mainnet'],
  external_url: 'https://defillama.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/defillama?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_tvl', 'list_yields', 'get_chain_tvl', 'get_stablecoin_circulation'],
        description:
          'get_protocol_tvl: TVL for a protocol by slug. ' +
          'list_yields: yield pools with optional chain/project/min_tvl filters. ' +
          'get_chain_tvl: historical chain TVL. ' +
          'get_stablecoin_circulation: stablecoin supply by symbol.',
      },
      protocol_slug: { type: 'string', description: 'Protocol slug (e.g. "uniswap", "aave"). Required for get_protocol_tvl.' },
      chain: { type: 'string', description: 'Chain name filter (e.g. "Ethereum"). Used for list_yields, get_chain_tvl.' },
      project: { type: 'string', description: 'Project name filter for list_yields.' },
      min_tvl: { type: 'number', description: 'Minimum TVL filter for list_yields.' },
      stablecoin: { type: 'string', description: 'Stablecoin symbol or name for get_stablecoin_circulation.' },
    },
  },
  usage_examples: [
    { title: 'Aave TVL', input: { action: 'get_protocol_tvl', protocol_slug: 'aave' } },
    { title: 'ETH yield pools', input: { action: 'list_yields', chain: 'Ethereum', min_tvl: 1000000 } },
    { title: 'USDC circulation', input: { action: 'get_stablecoin_circulation', stablecoin: 'USDC' } },
  ],
};

const BASE = 'https://api.llama.fi';

export async function executeDefiLlamaSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_tvl': {
        const slug = input.protocol_slug ?? input.slug;
        if (!slug) return { success: false, error: 'protocol_slug is required' };
        const r = await fetch(`${BASE}/tvl/${encodeURIComponent(slug)}`);
        if (r.status === 404) return { success: false, error: `Protocol slug "${slug}" not found on DefiLlama` };
        if (!r.ok) return { success: false, error: `DefiLlama API error ${r.status}` };
        const data = await r.json();
        return { success: true, output: data };
      }

      case 'list_yields': {
        const r = await fetch('https://yields.llama.fi/pools');
        if (!r.ok) return { success: false, error: `DefiLlama yields API error ${r.status}` };
        const json = await r.json() as { data?: Array<Record<string, unknown>> };
        let pools = json.data ?? [];
        if (input.chain) pools = pools.filter((p) => String(p.chain ?? '').toLowerCase() === input.chain.toLowerCase());
        if (input.project) pools = pools.filter((p) => String(p.project ?? '').toLowerCase() === input.project.toLowerCase());
        if (input.min_tvl !== undefined) pools = pools.filter((p) => Number(p.tvlUsd ?? 0) >= Number(input.min_tvl));
        return { success: true, output: { count: pools.length, pools: pools.slice(0, 100) } };
      }

      case 'get_chain_tvl': {
        const chain = input.chain;
        if (!chain) return { success: false, error: 'chain is required' };
        const r = await fetch(`${BASE}/v2/historicalChainTvl/${encodeURIComponent(chain)}`);
        if (!r.ok) return { success: false, error: `DefiLlama chain TVL error ${r.status}` };
        const data = await r.json();
        return { success: true, output: data };
      }

      case 'get_stablecoin_circulation': {
        const stablecoin = input.stablecoin;
        if (!stablecoin) return { success: false, error: 'stablecoin is required' };
        const r = await fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true');
        if (!r.ok) return { success: false, error: `DefiLlama stablecoins error ${r.status}` };
        const json = await r.json() as { peggedAssets?: Array<{ symbol?: string; name?: string }> };
        const needle = stablecoin.toLowerCase();
        const found = json.peggedAssets?.find(
          (s) => s.symbol?.toLowerCase() === needle || s.name?.toLowerCase() === needle
        ) ?? null;
        if (!found) return { success: false, error: `Stablecoin "${stablecoin}" not found` };
        return { success: true, output: found };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_protocol_tvl, list_yields, get_chain_tvl, get_stablecoin_circulation` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'DefiLlama skill error' };
  }
}
