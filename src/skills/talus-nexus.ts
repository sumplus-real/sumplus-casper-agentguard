/**
 * Talus Nexus Toolkit
 *
 * Talus Network's Nexus is the world's first fully onchain agentic workflow
 * engine built on Sui. Workflows are defined as Directed Acyclic Graphs (DAGs)
 * where each node is a call to a Nexus Tool — auditable, composable, and
 * verifiable on-chain.
 *
 * This skill is Arsenal's integration with the Talus ecosystem:
 * - Discover all standard Nexus tools and their schemas
 * - Build DAG workflow templates
 * - Query the Nexus devnet for live chain state
 * - Get started guides for agent developers
 *
 * [ARSENAL × TALUS ✓] Official partnership integration.
 *
 * Nexus Devnet:
 *   RPC:      grpc.ssfn.devnet.production.taluslabs.dev
 *   GraphQL:  graphql.devnet.production.taluslabs.dev/graphql
 *   Explorer: https://explorer.devnet.taluslabs.dev
 *   Faucet:   https://faucet.devnet.production.taluslabs.dev/gas
 */

import type { SkillExecutionResult } from '@/types/skill';

const NEXUS_GQL = 'https://graphql.devnet.production.taluslabs.dev/graphql';

// ─── Nexus Standard Tool Registry ───────────────────────────────────────────
// Source: github.com/Talus-Network/nexus-tools  (Apache 2.0)

interface NexusTool {
  fqn:         string;
  version:     string;
  category:    string;
  description: string;
  auth:        'none' | 'bearer_token' | 'oauth1' | 'api_key';
  inputs:      Array<{ name: string; type: string; required: boolean; description?: string }>;
  outputs:     Array<{ variant: string; ports: Array<{ name: string; type: string }> }>;
}

const NEXUS_TOOLS: NexusTool[] = [
  // ── Math ───────────────────────────────────────────────────────────────
  {
    fqn: 'xyz.taluslabs.math.i64.add@1', version: '1', category: 'Math',
    description: 'Adds two i64 integers. Returns overflow error on out-of-range result.',
    auth: 'none',
    inputs:  [{ name: 'a', type: 'i64', required: true }, { name: 'b', type: 'i64', required: true }],
    outputs: [{ variant: 'ok', ports: [{ name: 'result', type: 'i64' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
  {
    fqn: 'xyz.taluslabs.math.i64.mul@1', version: '1', category: 'Math',
    description: 'Multiplies two i64 integers.',
    auth: 'none',
    inputs:  [{ name: 'a', type: 'i64', required: true }, { name: 'b', type: 'i64', required: true }],
    outputs: [{ variant: 'ok', ports: [{ name: 'result', type: 'i64' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
  {
    fqn: 'xyz.taluslabs.math.i64.cmp@1', version: '1', category: 'Math',
    description: 'Compares two i64 values and routes to lt/gt/eq branch — enables conditional DAG branching.',
    auth: 'none',
    inputs:  [{ name: 'a', type: 'i64', required: true }, { name: 'b', type: 'i64', required: true }],
    outputs: [{ variant: 'lt', ports: [{ name: 'a', type: 'i64' }] }, { variant: 'gt', ports: [{ name: 'a', type: 'i64' }] }, { variant: 'eq', ports: [{ name: 'a', type: 'i64' }] }],
  },
  {
    fqn: 'xyz.taluslabs.math.i64.sum@1', version: '1', category: 'Math',
    description: 'Sums an array of i64 values.',
    auth: 'none',
    inputs:  [{ name: 'vec', type: 'Vec<i64>', required: true }],
    outputs: [{ variant: 'ok', ports: [{ name: 'result', type: 'i64' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
  // ── HTTP ───────────────────────────────────────────────────────────────
  {
    fqn: 'xyz.taluslabs.http.request@1', version: '1', category: 'HTTP',
    description: 'Makes arbitrary outbound HTTP requests with auth, retries, JSON schema validation, and response parsing. Localhost is blocked for security.',
    auth: 'api_key',
    inputs: [
      { name: 'method',           type: 'String',              required: true,  description: 'GET | POST | PUT | DELETE | PATCH' },
      { name: 'url',              type: 'String | {base_url, path}', required: true },
      { name: 'headers',          type: 'Map<String,String>',  required: false },
      { name: 'query',            type: 'Map<String,String>',  required: false },
      { name: 'auth',             type: 'AuthConfig',          required: false, description: 'BearerToken | ApiKeyHeader | ApiKeyQuery | BasicAuth' },
      { name: 'body',             type: 'RequestBody',         required: false, description: 'Json | Form | Multipart | Raw' },
      { name: 'expect_json',      type: 'bool',                required: false },
      { name: 'json_schema',      type: 'HttpJsonSchema',      required: false },
      { name: 'timeout_ms',       type: 'u64',                 required: false, description: 'Default 5000, max 30000' },
      { name: 'retries',          type: 'u32',                 required: false, description: 'Default 0, max 5' },
      { name: 'follow_redirects', type: 'bool',                required: false },
    ],
    outputs: [
      { variant: 'ok', ports: [{ name: 'status', type: 'u16' }, { name: 'text', type: 'String?' }, { name: 'json', type: 'Value?' }] },
      { variant: 'err', ports: [{ name: 'reason', type: 'String' }, { name: 'kind', type: 'String' }] },
    ],
  },
  // ── LLM ────────────────────────────────────────────────────────────────
  {
    fqn: 'xyz.taluslabs.llm.openai.chat-completion@1', version: '1', category: 'LLM',
    description: 'Calls OpenAI chat completions. Supports plain text or structured JSON output with schema validation.',
    auth: 'api_key',
    inputs: [
      { name: 'api_key',                type: 'String',        required: true },
      { name: 'prompt',                 type: 'MessageBag',    required: true,  description: '{role, value} or array of messages' },
      { name: 'context',                type: 'MessageBag',    required: false, description: 'Prepended system/context messages' },
      { name: 'model',                  type: 'String',        required: false, description: 'e.g. gpt-4o' },
      { name: 'max_completion_tokens',  type: 'u32',           required: false },
      { name: 'temperature',            type: 'f32',           required: false, description: '0.0–2.0' },
      { name: 'json_schema',            type: 'OpenAIJsonSchema', required: false, description: 'Forces structured JSON output mode' },
    ],
    outputs: [
      { variant: 'text', ports: [{ name: 'completion', type: 'String' }, { name: 'role', type: 'String' }] },
      { variant: 'json', ports: [{ name: 'completion', type: 'Value' }] },
      { variant: 'err',  ports: [{ name: 'reason', type: 'String' }] },
    ],
  },
  {
    fqn: 'xyz.taluslabs.llm-openai-chat-prep@1', version: '1', category: 'LLM',
    description: 'Converts an i64 number into a chat message. Bridges math tool outputs into LLM prompt inputs.',
    auth: 'none',
    inputs:  [{ name: 'number', type: 'i64', required: true }, { name: 'role', type: 'Role', required: false }],
    outputs: [{ variant: 'ok', ports: [{ name: 'message.role', type: 'String' }, { name: 'message.value', type: 'String' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
  // ── Storage (Walrus) ───────────────────────────────────────────────────
  {
    fqn: 'xyz.taluslabs.storage.walrus.upload-json@1', version: '1', category: 'Storage',
    description: "Upload a JSON string to Walrus (Sui's decentralized blob storage). Returns a blob_id for future retrieval.",
    auth: 'none',
    inputs: [
      { name: 'json',          type: 'String', required: true },
      { name: 'publisher_url', type: 'String', required: false },
      { name: 'epochs',        type: 'u64',    required: false, description: 'Storage epochs, default 1' },
    ],
    outputs: [
      { variant: 'newly_created',    ports: [{ name: 'blob_id', type: 'String' }, { name: 'end_epoch', type: 'u64' }] },
      { variant: 'already_certified',ports: [{ name: 'blob_id', type: 'String' }] },
      { variant: 'err',              ports: [{ name: 'reason', type: 'String' }] },
    ],
  },
  {
    fqn: 'xyz.taluslabs.storage.walrus.read-json@1', version: '1', category: 'Storage',
    description: 'Read a blob from Walrus by blob_id and return its JSON content. Optionally validate against a JSON schema.',
    auth: 'none',
    inputs:  [{ name: 'blob_id', type: 'String', required: true }, { name: 'json_schema', type: 'WalrusJsonSchema', required: false }],
    outputs: [{ variant: 'ok', ports: [{ name: 'json', type: 'Value' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
  {
    fqn: 'xyz.taluslabs.storage.walrus.verify-blob@1', version: '1', category: 'Storage',
    description: 'Verify that a Walrus blob is certified and available.',
    auth: 'none',
    inputs:  [{ name: 'blob_id', type: 'String', required: true }],
    outputs: [{ variant: 'verified', ports: [] }, { variant: 'unverified', ports: [] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
  // ── Exchanges (Coinbase) ───────────────────────────────────────────────
  {
    fqn: 'xyz.taluslabs.exchanges.coinbase.get-spot-price@1', version: '1', category: 'Exchanges',
    description: 'Get current or historical Coinbase spot price for a currency pair (e.g. BTC-USD).',
    auth: 'none',
    inputs: [
      { name: 'currency_pair', type: 'String', required: true, description: 'e.g. "BTC-USD" or ["BTC","USD"]' },
      { name: 'date',          type: 'String', required: false, description: 'YYYY-MM-DD for historical price' },
    ],
    outputs: [{ variant: 'ok', ports: [{ name: 'amount', type: 'String' }, { name: 'base', type: 'String' }, { name: 'currency', type: 'String' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
  {
    fqn: 'xyz.taluslabs.exchanges.coinbase.get-product-ticker@1', version: '1', category: 'Exchanges',
    description: 'Real-time Coinbase ticker: bid, ask, price, and volume.',
    auth: 'none',
    inputs:  [{ name: 'product_id', type: 'String', required: true, description: 'e.g. "BTC-USD"' }],
    outputs: [{ variant: 'ok', ports: [{ name: 'price', type: 'String' }, { name: 'bid', type: 'String' }, { name: 'ask', type: 'String' }, { name: 'volume', type: 'String' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
  {
    fqn: 'xyz.taluslabs.exchanges.coinbase.get-product-stats@1', version: '1', category: 'Exchanges',
    description: '24h OHLCV stats for a Coinbase product.',
    auth: 'none',
    inputs:  [{ name: 'product_id', type: 'String', required: true }],
    outputs: [{ variant: 'ok', ports: [{ name: 'open', type: 'String' }, { name: 'high', type: 'String' }, { name: 'low', type: 'String' }, { name: 'volume', type: 'String' }, { name: 'last', type: 'String' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
  // ── Social (Twitter) — 33 tools ────────────────────────────────────────
  ...([
    ['get-tweet@1',                         'bearer_token', 'Fetch a single tweet by ID'],
    ['get-tweets@1',                        'bearer_token', 'Fetch multiple tweets by IDs (up to 100)'],
    ['get-user-tweets@1',                   'bearer_token', "Fetch a user's timeline (5–100 results)"],
    ['get-recent-search-tweets@1',          'bearer_token', 'Search recent tweets matching a query (10–100 results)'],
    ['get-recent-tweet-count@1',            'bearer_token', 'Count recent tweets matching a query'],
    ['get-mentioned-tweets@1',              'bearer_token', 'Get tweets mentioning a specific user'],
    ['get-user-by-id@1',                    'bearer_token', 'Fetch Twitter user profile by user ID'],
    ['get-user-by-username@1',              'bearer_token', 'Fetch Twitter user profile by username'],
    ['get-users-by-username@1',             'bearer_token', 'Fetch multiple users by usernames'],
    ['get-users@1',                         'bearer_token', 'Fetch multiple users by IDs'],
    ['get-list@1',                          'bearer_token', 'Get a Twitter List by ID'],
    ['get-list-tweets@1',                   'bearer_token', 'Get tweets from a Twitter List'],
    ['get-list-members@1',                  'bearer_token', 'Get members of a Twitter List'],
    ['get-user-lists@1',                    'bearer_token', 'Get Twitter Lists owned by a user'],
    ['get-conversation-messages@1',         'bearer_token', 'Get DM conversation messages by participant ID'],
    ['get-conversation-messages-by-id@1',   'bearer_token', 'Get DM conversation messages by conversation ID'],
    ['post-tweet@1',                        'oauth1', 'Post a new tweet'],
    ['delete-tweet@1',                      'oauth1', 'Delete a tweet by ID'],
    ['like-tweet@1',                        'oauth1', 'Like a tweet'],
    ['unlike-tweet@1',                      'oauth1', 'Remove a like from a tweet'],
    ['retweet-tweet@1',                     'oauth1', 'Retweet a tweet'],
    ['undo-retweet-tweet@1',                'oauth1', 'Undo a retweet'],
    ['upload-media@1',                      'oauth1', 'Upload media (image/video) for attaching to tweets'],
    ['follow-user@1',                       'oauth1', 'Follow a Twitter user'],
    ['unfollow-user@1',                     'oauth1', 'Unfollow a Twitter user'],
    ['create-list@1',                       'oauth1', 'Create a new Twitter List'],
    ['delete-list@1',                       'oauth1', 'Delete a Twitter List'],
    ['update-list@1',                       'oauth1', 'Update Twitter List name/description'],
    ['add-member@1',                        'oauth1', 'Add a member to a Twitter List'],
    ['remove-member@1',                     'oauth1', 'Remove a member from a Twitter List'],
    ['send-direct-message@1',               'oauth1', 'Send a Direct Message to a user'],
    ['create-group-conversation@1',         'oauth1', 'Create a group DM conversation'],
    ['send-message-to-group-conversation@1','oauth1', 'Send a message to a group DM conversation'],
  ] as [string, string, string][]).map(([op, auth, desc]) => ({
    fqn:      `xyz.taluslabs.social.twitter.${op}`,
    version:  '1',
    category: 'Social/Twitter',
    description: desc,
    auth:     auth as 'bearer_token' | 'oauth1',
    inputs:   auth === 'bearer_token'
      ? [{ name: 'bearer_token', type: 'String', required: true, description: 'Twitter API v2 Bearer Token' }]
      : [{ name: 'auth', type: 'TwitterAuth', required: true, description: '{ consumer_key, consumer_secret_key, access_token, access_token_secret }' }],
    outputs:  [{ variant: 'ok', ports: [{ name: 'data', type: 'Value' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }, { name: 'kind', type: 'String' }] }],
  })),
  // ── Templating ─────────────────────────────────────────────────────────
  {
    fqn: 'xyz.taluslabs.templating.jinja@1', version: '1', category: 'Templating',
    description: 'Renders Jinja2 templates (via MiniJinja). Undefined variables are preserved as {{placeholders}} rather than erroring, enabling partial rendering for multi-step chains.',
    auth: 'none',
    inputs: [
      { name: 'template', type: 'String',           required: true,  description: 'Jinja2 template with {{variable}} syntax' },
      { name: 'args',     type: 'Map<String,String>', required: false, description: 'Variable map for batch substitution' },
      { name: 'name',     type: 'String',            required: false, description: 'Single variable name' },
      { name: 'value',    type: 'String',            required: false, description: 'Single variable value' },
    ],
    outputs: [{ variant: 'ok', ports: [{ name: 'result', type: 'String' }] }, { variant: 'err', ports: [{ name: 'reason', type: 'String' }] }],
  },
];

// ─── Actions ────────────────────────────────────────────────────────────────

function actionGetTools(input: any): SkillExecutionResult {
  const { category } = input ?? {};

  const categories = [...new Set(NEXUS_TOOLS.map(t => t.category))].sort();
  let tools = NEXUS_TOOLS;
  if (category) {
    tools = tools.filter(t => t.category.toLowerCase() === category.toLowerCase());
  }

  return {
    success: true,
    output: {
      source:          'Talus Nexus Standard Tools',
      github:          'github.com/Talus-Network/nexus-tools',
      total_tools:     NEXUS_TOOLS.length,
      categories,
      filtered_count:  tools.length,
      tools: tools.map(t => ({
        fqn:         t.fqn,
        category:    t.category,
        description: t.description,
        auth:        t.auth,
      })),
    },
  };
}

function actionGetToolDetail(input: any): SkillExecutionResult {
  const { fqn } = input ?? {};
  if (!fqn) return { success: false, error: 'fqn is required (e.g. xyz.taluslabs.math.i64.add@1)' };

  const tool = NEXUS_TOOLS.find(t => t.fqn === fqn || t.fqn.includes(fqn));
  if (!tool) {
    return {
      success: false,
      error: `Tool "${fqn}" not found. Use get_tools to list all available tools.`,
    };
  }

  return { success: true, output: tool };
}

function actionBuildDagTemplate(input: any): SkillExecutionResult {
  const { workflow } = input ?? {};

  const templates: Record<string, object> = {
    // Math + LLM: compute a value, then use it in an LLM prompt
    math_to_llm: {
      _description: 'Add two numbers, then pass the result to an LLM to interpret',
      default_values: [
        { vertex: 'add', input_port: 'b', value: { storage: 'inline', data: 10 } }
      ],
      vertices: [
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.math.i64.add@1' },              name: 'add',        entry_ports: [{ name: 'a' }] },
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.llm-openai-chat-prep@1' },       name: 'to_message' },
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.llm.openai.chat-completion@1' }, name: 'llm',        entry_ports: [{ name: 'api_key' }] },
      ],
      edges: [
        { from: { vertex: 'add',        output_variant: 'ok',   output_port: 'result'  }, to: { vertex: 'to_message', input_port: 'number'  } },
        { from: { vertex: 'to_message', output_variant: 'ok',   output_port: 'message' }, to: { vertex: 'llm',        input_port: 'prompt'  } },
      ],
    },
    // Branching: compare two numbers and route to different paths
    branching: {
      _description: 'Compare a number and route to different LLM prompts based on lt/gt/eq',
      default_values: [
        { vertex: 'compare', input_port: 'b', value: { storage: 'inline', data: 0 } }
      ],
      vertices: [
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.math.i64.cmp@1' },             name: 'compare', entry_ports: [{ name: 'a' }] },
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.templating.jinja@1' },          name: 'msg_pos', entry_ports: [{ name: 'args' }] },
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.templating.jinja@1' },          name: 'msg_neg', entry_ports: [{ name: 'args' }] },
      ],
      edges: [
        { from: { vertex: 'compare', output_variant: 'gt', output_port: 'a' }, to: { vertex: 'msg_pos', input_port: 'value' } },
        { from: { vertex: 'compare', output_variant: 'lt', output_port: 'a' }, to: { vertex: 'msg_neg', input_port: 'value' } },
      ],
    },
    // HTTP → Walrus: fetch data and store it on-chain
    http_to_walrus: {
      _description: 'Fetch JSON from an external API and upload the result to Walrus storage',
      vertices: [
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.http.request@1' },             name: 'fetch', entry_ports: [{ name: 'url' }, { name: 'method' }] },
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.storage.walrus.upload-json@1' }, name: 'store' },
      ],
      edges: [
        { from: { vertex: 'fetch', output_variant: 'ok', output_port: 'text' }, to: { vertex: 'store', input_port: 'json' } },
      ],
    },
    // Twitter search → LLM summarize
    twitter_to_llm: {
      _description: 'Search recent tweets and pass results to an LLM for analysis',
      vertices: [
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.social.twitter.get-recent-search-tweets@1' }, name: 'search', entry_ports: [{ name: 'bearer_token' }, { name: 'query' }] },
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.templating.jinja@1' },                        name: 'format', entry_ports: [{ name: 'template' }] },
        { kind: { variant: 'off_chain', tool_fqn: 'xyz.taluslabs.llm.openai.chat-completion@1' },              name: 'llm',    entry_ports: [{ name: 'api_key' }] },
      ],
      edges: [
        { from: { vertex: 'search', output_variant: 'ok', output_port: 'data'   }, to: { vertex: 'format', input_port: 'value'  } },
        { from: { vertex: 'format', output_variant: 'ok', output_port: 'result' }, to: { vertex: 'llm',    input_port: 'prompt' } },
      ],
    },
  };

  const keys = Object.keys(templates);
  if (workflow && templates[workflow]) {
    return { success: true, output: { workflow, dag: templates[workflow] } };
  }

  return {
    success: true,
    output: {
      available_workflows: keys,
      usage: 'Call with { "action": "build_dag_template", "workflow": "<name>" } to get the DAG JSON',
      templates,
    },
  };
}

async function actionQueryDevnet(input: any): Promise<SkillExecutionResult> {
  const { query_type = 'chain_info' } = input ?? {};

  if (query_type === 'chain_info') {
    // Query Nexus devnet GraphQL for basic chain state
    try {
      const res = await fetch(NEXUS_GQL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: '{ chainIdentifier epoch { epochId } }' }),
        signal:  AbortSignal.timeout(10_000),
      });
      const data = await res.json() as any;
      return {
        success: true,
        output: {
          source:      'Nexus Devnet',
          graphql_url: NEXUS_GQL,
          chain:       data?.data ?? 'Unable to parse response',
          explorer:    'https://explorer.devnet.taluslabs.dev',
          faucet:      'https://faucet.devnet.production.taluslabs.dev/gas',
          rpc:         'grpc.ssfn.devnet.production.taluslabs.dev',
        },
      };
    } catch (err: any) {
      return {
        success: true, // non-fatal, return what we know
        output: {
          source:      'Nexus Devnet (static info)',
          graphql_url: NEXUS_GQL,
          explorer:    'https://explorer.devnet.taluslabs.dev',
          faucet:      'https://faucet.devnet.production.taluslabs.dev/gas',
          rpc:         'grpc.ssfn.devnet.production.taluslabs.dev',
          _note:       `Devnet may be temporarily unreachable: ${err.message}`,
        },
      };
    }
  }

  return { success: false, error: `Unknown query_type "${query_type}". Supported: chain_info` };
}

function actionGetProtocolInfo(): SkillExecutionResult {
  return {
    success: true,
    output: {
      name:        'Talus Nexus',
      tagline:     "The world's first fully onchain agentic workflow engine",
      chain:       'Sui',
      status:      'Devnet (mainnet coming soon)',
      website:     'https://talus.network',
      docs:        'https://docs.talus.network',
      github:      'https://github.com/Talus-Network/nexus-tools',
      blog:        'https://blog.talus.network/introducing-nexus-the-worlds-first-fully-onchain-agentic-framework',

      architecture: {
        overview:    'Workflows are Directed Acyclic Graphs (DAGs) executed by a Nexus Leader node on Sui',
        dag_node:    'Each node in a DAG calls one Nexus Tool — an off-chain HTTP server or on-chain Sui Move module',
        onchain:     'DAG definitions and execution proofs are stored on-chain for full auditability',
        verifiable:  'Tool calls are signed with Ed25519 — all inputs/outputs are verifiable',
        composable:  'Any tool output can be wired to any compatible input port across tools',
      },

      tool_categories: {
        Math:           '4 tools — i64 arithmetic and comparison for conditional branching',
        HTTP:           '1 tool — arbitrary outbound HTTP with auth, retries, JSON schema validation',
        LLM:            '2 tools — OpenAI chat completions + numeric-to-message adapter',
        Storage:        '4 tools — Walrus decentralized blob storage (upload/read/verify)',
        Exchanges:      '3 tools — Coinbase spot price, ticker, 24h stats (no API key)',
        'Social/Twitter': '33 tools — full Twitter/X API v2 coverage (read + write)',
        Templating:     '1 tool — Jinja2 rendering for dynamic prompt/message construction',
      },

      total_standard_tools: NEXUS_TOOLS.length,

      nexus_tool_fqn_format: '<org>.<namespace>.<category>.<operation>@<version>',
      fqn_example:           'xyz.taluslabs.math.i64.add@1',

      cli: {
        install:   'brew tap talus-network/tap && brew install nexus-cli',
        dag_ops:   ['nexus dag validate <file>', 'nexus dag publish <file>', 'nexus dag execute <dag_id>'],
      },

      devnet: {
        rpc:      'grpc.ssfn.devnet.production.taluslabs.dev',
        graphql:  'graphql.devnet.production.taluslabs.dev/graphql',
        explorer: 'https://explorer.devnet.taluslabs.dev',
        faucet:   'https://faucet.devnet.production.taluslabs.dev/gas',
      },

      arsenal_integration: {
        status: 'Official partnership — Arsenal × Talus',
        value:  'Arsenal makes Nexus tools discoverable by AI agents in the Sumplus ecosystem',
        note:   'Nexus tools run on the Talus network; Arsenal provides discovery, docs, and DAG templates',
      },
    },
  };
}

// ─── Skill metadata ───────────────────────────────────────────────────────────

export const TALUS_NEXUS_SKILL_METADATA = {
  name: 'Talus Nexus Toolkit',
  description:
    'Arsenal × Talus official integration. ' +
    'Talus Nexus is the world\'s first fully onchain agentic workflow engine built on Sui. ' +
    'Discover all standard Nexus tools and their schemas, build DAG workflow templates, ' +
    'and query the Nexus devnet for live chain state. ' +
    'Workflows are Directed Acyclic Graphs (DAGs) where each node is an auditable onchain tool call.',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['talus', 'nexus', 'sui', 'dag', 'workflow', 'onchain', 'agent', 'twitter', 'walrus', 'openai'],
  external_url: 'https://talus.network',
  logo_url: 'https://talus.network/favicon.ico',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_tools', 'get_tool_detail', 'build_dag_template', 'query_devnet', 'get_protocol_info'],
        description:
          'get_tools: list all standard Nexus tools (filterable by category). ' +
          'get_tool_detail: full schema for one tool (requires fqn). ' +
          'build_dag_template: generate a DAG workflow template (requires use_case). ' +
          'query_devnet: query Nexus devnet GraphQL for live state (requires query). ' +
          'get_protocol_info: Talus Nexus architecture overview.',
      },
      category: { type: 'string', description: 'Filter tools by category (e.g. Math, Twitter, OpenAI, Walrus). For get_tools.' },
      fqn:      { type: 'string', description: 'Fully-qualified tool name (e.g. xyz.taluslabs.social.twitter.post@1). For get_tool_detail.' },
      use_case: { type: 'string', description: 'Workflow description (e.g. "tweet AI-generated market summary"). For build_dag_template.' },
      query:    { type: 'string', description: 'GraphQL query string for query_devnet.' },
    },
  },
  usage_examples: [
    { title: 'List all tools', input: { action: 'get_tools' } },
    { title: 'Twitter tools', input: { action: 'get_tools', category: 'Twitter' } },
    { title: 'Build a workflow', input: { action: 'build_dag_template', use_case: 'post AI market summary to Twitter' } },
  ],
};

// ─── Main executor ───────────────────────────────────────────────────────────

export async function executeTalusNexusSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_tools':         return actionGetTools(input);
      case 'get_tool_detail':   return actionGetToolDetail(input);
      case 'build_dag_template':return actionBuildDagTemplate(input);
      case 'query_devnet':      return await actionQueryDevnet(input);
      case 'get_protocol_info': return actionGetProtocolInfo();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_tools, get_tool_detail, build_dag_template, query_devnet, get_protocol_info`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in Talus Nexus skill' };
  }
}
