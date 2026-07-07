import type { SkillExecutionResult } from '@/types/skill';

/**
 * The Graph Protocol Skill
 *
 * The Graph is a decentralized indexing protocol for querying blockchain data via GraphQL.
 * - Hosted service endpoint: https://api.thegraph.com/subgraphs/name/[org]/[name]
 * - Decentralized network: https://gateway.thegraph.com/api/[API_KEY]/subgraphs/id/[subgraph-id]
 * - Studio: https://api.studio.thegraph.com/query/[id]/[name]/version/latest
 */

const POPULAR_SUBGRAPHS = [
  {
    name: "Uniswap V3 (Ethereum)",
    url: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
    description: "Uniswap V3 protocol data on Ethereum"
  },
  {
    name: "Aave V3 (Ethereum)",
    url: "https://api.thegraph.com/subgraphs/name/aave/protocol-v3",
    description: "Aave V3 protocol data on Ethereum"
  },
  {
    name: "Compound V3 (Ethereum)",
    url: "https://api.thegraph.com/subgraphs/name/compound-finance/compound-v3",
    description: "Compound V3 protocol data on Ethereum"
  },
  {
    name: "Curve Finance (Ethereum)",
    url: "https://api.thegraph.com/subgraphs/name/messari/curve-finance-ethereum",
    description: "Curve Finance protocol data on Ethereum"
  },
  {
    name: "Balancer V2 (Ethereum)",
    url: "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2",
    description: "Balancer V2 protocol data on Ethereum"
  },
  {
    name: "SushiSwap (Ethereum)",
    url: "https://api.thegraph.com/subgraphs/name/sushiswap/exchange",
    description: "SushiSwap exchange data on Ethereum"
  },
  {
    name: "PancakeSwap V3 (BSC)",
    url: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc",
    description: "PancakeSwap V3 protocol data on Binance Smart Chain"
  },
  {
    name: "MakerDAO (Ethereum)",
    url: "https://api.thegraph.com/subgraphs/name/messari/makerdao-ethereum",
    description: "MakerDAO protocol data on Ethereum"
  },
  {
    name: "Lido (Ethereum)",
    url: "https://api.thegraph.com/subgraphs/name/messari/lido-ethereum",
    description: "Lido liquid staking data on Ethereum"
  },
  {
    name: "GMX (Arbitrum)",
    url: "https://api.thegraph.com/subgraphs/name/gmx-io/gmx-stats",
    description: "GMX protocol stats on Arbitrum"
  }
];

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'The Graph',
      type: 'Data & Oracles',
      website: 'https://thegraph.com',
      docs: 'https://thegraph.com/docs',
      description: [
        'The Graph is a decentralized protocol for indexing and querying data from blockchains.',
        'Anyone can build and publish open APIs, called subgraphs, making data easily accessible.',
        'It uses GraphQL to provide a flexible and efficient way to query blockchain data.'
      ],
      endpoints: [
        'Hosted Service: https://api.thegraph.com/subgraphs/name/[org]/[name] (No API key needed)',
        'Decentralized Network: https://gateway.thegraph.com/api/[API_KEY]/subgraphs/id/[subgraph-id]',
        'Subgraph Studio: https://api.studio.thegraph.com/query/[id]/[name]/version/latest'
      ]
    }
  };
}

async function actionGetPopularSubgraphs(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      subgraphs: POPULAR_SUBGRAPHS,
      count: POPULAR_SUBGRAPHS.length
    }
  };
}

async function actionQuerySubgraph(input: any): Promise<SkillExecutionResult> {
  const { subgraph_url, query, variables } = input;
  
  if (!subgraph_url) {
    return { success: false, error: 'subgraph_url is required.' };
  }
  if (!query) {
    return { success: false, error: 'query is required.' };
  }

  try {
    const res = await fetch(subgraph_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: variables || {} }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!res.ok) {
      throw new Error(`The Graph API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as any;
    
    if (data.errors) {
      return { success: false, error: 'GraphQL execution errors: ' + JSON.stringify(data.errors) };
    }

    return {
      success: true,
      output: {
        data: data.data,
        subgraph_url
      }
    };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Failed to query subgraph' };
  }
}

async function actionGetSubgraphInfo(input: any): Promise<SkillExecutionResult> {
  const { subgraph_url } = input;
  
  if (!subgraph_url) {
    return { success: false, error: 'subgraph_url is required.' };
  }

  // To get subgraph info, we can query its introspection schema to see what's available
  // However, typical "metadata" is just introspection in GraphQL.
  const introspectionQuery = `
    query IntrospectionQuery {
      __schema {
        queryType { name }
        mutationType { name }
        subscriptionType { name }
        types {
          ...FullType
        }
      }
    }
    fragment FullType on __Type {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
      }
    }
  `;

  try {
    const res = await fetch(subgraph_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: introspectionQuery }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!res.ok) {
      throw new Error(`The Graph API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as any;

    if (data.errors) {
      return { success: false, error: 'Failed to introspect subgraph: ' + JSON.stringify(data.errors) };
    }

    // Filter types to those not starting with __
    const customTypes = data.data?.__schema?.types?.filter((t: any) => !t.name.startsWith('__')) || [];
    const queryTypeName = data.data?.__schema?.queryType?.name;
    const queryType = customTypes.find((t: any) => t.name === queryTypeName);
    const topLevelQueries = queryType?.fields?.map((f: any) => f.name) || [];

    return {
      success: true,
      output: {
        subgraph_url,
        status: 'reachable',
        top_level_queries: topLevelQueries,
        entities: customTypes.map((t: any) => t.name).filter((name: string) => name !== 'Query' && name !== 'Subscription')
      }
    };
  } catch (e: any) {
    return { success: false, error: `Failed to fetch info for subgraph: ${e.message}` };
  }
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const THEGRAPH_SKILL_METADATA = {
  name:        'The Graph',
  description:
    'Query blockchain data using The Graph protocol. Access data from popular ' +
    'DeFi protocols (Uniswap, Aave, Compound) via GraphQL queries.',
  category:    'Data & Oracles',
  version:     '1.0.0',
  author_type: 'official',
  is_paid:     false,
  price:       null,
  tags:        ['thegraph', 'graphql', 'data', 'defi', 'indexer'],
  external_url:'https://thegraph.com',
  logo_url:    'https://icons.llamao.fi/icons/protocols/the-graph?w=48&h=48',
  partner_verified: false,
  status:      'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'query_subgraph', 'get_popular_subgraphs', 'get_subgraph_info'],
        description:
          'get_protocol_info: Overview of The Graph and available network endpoints. ' +
          'query_subgraph: Execute arbitrary GraphQL queries against a specific subgraph URL. ' +
          'get_popular_subgraphs: List 10+ popular subgraphs with URLs. ' +
          'get_subgraph_info: Fetch introspection metadata about a subgraph.'
      },
      subgraph_url: {
        type: 'string',
        description: 'The URL of the subgraph endpoint (e.g. hosted service or gateway URL).'
      },
      query: {
        type: 'string',
        description: 'The GraphQL query string to execute.'
      },
      variables: {
        type: 'object',
        description: 'Optional variables object for the GraphQL query.'
      }
    }
  },
  usage_examples: [
    {
      title: 'Get Protocol Info',
      input: { action: 'get_protocol_info' }
    },
    {
      title: 'Get Popular Subgraphs',
      input: { action: 'get_popular_subgraphs' }
    },
    {
      title: 'Query Uniswap V3 Factory',
      input: {
        action: 'query_subgraph',
        subgraph_url: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
        query: '{ factories(first: 1) { id poolCount txCount totalVolumeUSD } }'
      }
    },
    {
      title: 'Get Subgraph Info',
      input: {
        action: 'get_subgraph_info',
        subgraph_url: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3'
      }
    }
  ]
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function executeTheGraphSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':     return actionGetProtocolInfo();
      case 'query_subgraph':        return actionQuerySubgraph(input);
      case 'get_popular_subgraphs': return actionGetPopularSubgraphs();
      case 'get_subgraph_info':     return actionGetSubgraphInfo(input);
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, query_subgraph, get_popular_subgraphs, get_subgraph_info`
        };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'The Graph skill unexpected error' };
  }
}
