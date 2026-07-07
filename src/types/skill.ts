/**
 * Unified Arsenal Skill Data Model
 *
 * Combines database schema with Anthropic Skills standard.
 * Used by all access methods: REST API, MCP Server, and direct database.
 */

// ── Agent skill taxonomy (Maria proposal, 2026-05-01) ────────────────────────

/** Skill kind: protocol (atomic function) vs agent (delegated multi-step) */
export type SkillKind = 'protocol' | 'agent' | 'hybrid';

/** Wire protocol for calling this skill */
export type ExecutionProtocol = 'rest_json' | 'sse_stream' | 'async_task';

/** Input style agents should expect */
export type InputStyle = 'structured' | 'intent' | 'mixed';

/** SSE events emitted by agent skills during execution */
export type AgentSkillEvent = 'thinking' | 'tool_call' | 'tool_result' | 'confirm' | 'result' | 'error' | 'done';

/**
 * Anthropic Skills metadata (YAML frontmatter)
 * @see https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
 */
export interface AnthropicSkillMetadata {
  /** Skill name (kebab-case, 1-64 chars) */
  name: string;

  /** Short description (1-1024 chars) */
  description: string;

  /** Optional features required by this skill */
  features?: SkillFeature[];
}

/**
 * Features that skills can declare they need
 * Agents choose whether to implement these capabilities
 */
export type SkillFeature =
  | 'code-execution'    // Requires ability to execute code
  | 'network-access'    // Requires HTTP/network access
  | 'mcp-tools'         // Requires MCP tool integration
  | 'web3-wallet'       // Requires Web3 wallet connection
  | 'payment-proof';    // Requires payment verification

/**
 * JSON Schema definition for skill input/output
 */
export interface SkillSchema {
  input: Record<string, any>;   // JSON Schema for input validation
  output: Record<string, any>;  // JSON Schema for output format
}

/**
 * Usage example for a skill
 */
export interface SkillExample {
  title: string;
  description: string;
  input: Record<string, any>;
  output: Record<string, any>;
}

/**
 * Skill reference file (progressive disclosure)
 */
export interface SkillReference {
  filename: string;      // e.g., 'API_GUIDE.md', 'EXAMPLES.md'
  content: string;       // Markdown content
  description?: string;  // Optional description of what this reference contains
}

/**
 * Skill script/code file
 */
export interface SkillScript {
  filename: string;     // e.g., 'execute.js', 'validate.py'
  content: string;      // Code content
  language: string;     // e.g., 'javascript', 'python', 'typescript'
  description?: string; // Optional description
}

/**
 * Complete Arsenal Skill
 *
 * This is the unified data model used throughout the system.
 * Different interfaces format this data differently:
 * - REST API: Returns JSON
 * - MCP Server: Returns as Resources + Tools
 * - Anthropic Skills: Returns as SKILL.md + references/
 */
export interface ArsenalSkill {
  // Database fields
  id: string;                    // UUID
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  author_id: string;             // User UUID
  author_type: 'official' | 'community';
  status: 'pending' | 'approved' | 'rejected';

  // Anthropic Skills standard metadata
  name: string;                  // kebab-case, 1-64 chars (e.g., 'uniswap-swap')
  description: string;           // 1-1024 chars

  // Arsenal extensions
  category: string;              // e.g., 'DeFi', 'NFT', 'DAO'
  tags: string[];                // e.g., ['uniswap', 'swap', 'ethereum']
  version: string;               // Semantic version (e.g., '1.0.0')

  // v2.0 Architecture fields
  execution_mode?: 'client-side' | 'server-side' | 'hybrid';  // How this skill should be executed
  tool_definition?: {            // Anthropic standard tool definition
    name: string;
    description: string;
    input_schema: Record<string, any>;
  };
  implementation_guide?: Record<string, any>;  // Structured guide for client-side execution
  mcp_config?: Record<string, any>;            // MCP server configuration for server-side
  capabilities?: Array<{                       // Hybrid mode capabilities
    name: string;
    execution_mode: 'client-side' | 'server-side';
    [key: string]: any;
  }>;

  // Skill content (Anthropic Skills format)
  skill_md?: string;             // Main SKILL.md content (< 500 lines recommended)
  references?: SkillReference[]; // Progressive disclosure references
  scripts?: SkillScript[];       // Optional executable scripts

  // Schema (Arsenal standard)
  schema: SkillSchema;           // JSON Schema for input/output

  // Legacy code field (deprecated, use scripts instead)
  code?: string;

  // Usage and examples
  usage_examples: SkillExample[];

  // Features declaration
  features?: SkillFeature[];     // Required capabilities

  // True when the protocol team officially co-built or endorsed this skill
  partner_verified?: boolean;

  // External link (e.g. dapp URL shown as button in skill card)
  external_url?: string;

  // Project logo URL shown on skill detail page
  logo_url?: string;

  // Payment
  is_paid: boolean;
  price?: number;                // In USDC cents

  // Metrics
  rating_avg?: number;           // 1-5 stars
  rating_count?: number;
  usage_count?: number;

  // Vector search
  embedding?: number[];          // Qwen text-embedding-v4 (1024 dimensions)

  // Agent skill taxonomy (defaults: kind=protocol, execution_protocol=rest_json)
  kind?: SkillKind;
  execution_protocol?: ExecutionProtocol;
  input_style?: InputStyle;
  deterministic?: boolean;
  multi_step?: boolean;
  // Agent-skill-only fields
  supports_streaming_events?: AgentSkillEvent[];
  requires_user_session?: boolean;
  estimated_duration_seconds?: [number, number];
}

/**
 * Database row from Supabase
 * Maps to ArsenalSkill with some optional fields
 */
export interface SkillRow {
  id: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_type: 'official' | 'community';
  status: 'pending' | 'approved' | 'rejected';
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  schema: SkillSchema;
  code?: string;
  usage_examples: SkillExample[];
  is_paid: boolean;
  price?: number;
  rating_avg?: number;
  rating_count?: number;
  usage_count?: number;
  embedding?: number[];

  partner_verified?: boolean;
  external_url?: string;
  logo_url?: string;

  // New fields (may not exist in old rows)
  skill_md?: string;
  references?: SkillReference[];
  scripts?: SkillScript[];
  features?: SkillFeature[];

  // v2.0 Architecture fields
  execution_mode?: 'client-side' | 'server-side' | 'hybrid';
  tool_definition?: {
    name: string;
    description: string;
    input_schema: Record<string, any>;
  };
  implementation_guide?: Record<string, any>;
  mcp_config?: Record<string, any>;
  capabilities?: Array<{
    name: string;
    execution_mode: 'client-side' | 'server-side';
    [key: string]: any;
  }>;

  // Agent skill taxonomy
  kind?: SkillKind;
  execution_protocol?: ExecutionProtocol;
  input_style?: InputStyle;
  deterministic?: boolean;
  multi_step?: boolean;
  supports_streaming_events?: AgentSkillEvent[];
  requires_user_session?: boolean;
  estimated_duration_seconds?: [number, number];
}

/**
 * Convert database row to ArsenalSkill
 */
export function rowToSkill(row: SkillRow): ArsenalSkill {
  return {
    ...row,
    references: row.references || [],
    scripts: row.scripts || [],
    features: row.features || [],
  };
}

/**
 * Filters for skill search
 */
export interface SkillFilters {
  category?: string;
  tags?: string[];
  is_paid?: boolean;
  min_rating?: number;
  author_type?: 'official' | 'community';
  features?: SkillFeature[];
}

/**
 * Skill search result
 */
export interface SkillSearchResult {
  skills: ArsenalSkill[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

/**
 * Skill execution input
 */
export interface SkillExecutionInput {
  skill_id: string;
  input: Record<string, any>;
  payment_proof?: string;  // x402 payment proof (optional)
}

/**
 * Skill execution result
 */
export interface SkillExecutionResult {
  success: boolean;
  output?: Record<string, any>;
  error?: string;
  _note?: string;  // Warning for simulated responses
}
