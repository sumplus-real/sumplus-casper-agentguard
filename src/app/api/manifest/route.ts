import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/manifest
 *
 * Machine-readable product manifest for AI agents.
 * Returns a structured JSON document describing Sumplus Arsenal's
 * capabilities, interfaces, authentication, and endpoint schemas.
 *
 * No authentication required. Designed to be the first request an
 * agent makes when discovering this service.
 */
export async function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://arsenal.sumplus.xyz";

  const manifest = {
    // ── Identity ───────────────────────────────────────────────
    schema_version: "1.0",
    name: "Sumplus Arsenal",
    tagline: "The skills marketplace for AI agents",
    description:
      "Sumplus Arsenal is a curated marketplace of executable skills for autonomous AI agents. " +
      "Agents can discover skills by semantic search, execute them via REST or MCP, " +
      "and pay per-execution using the x402 protocol (USDC on Base).",
    base_url: base,
    docs_url: `${base}/docs`,
    manifest_url: `${base}/api/manifest`,

    // ── Agent quick-start ──────────────────────────────────────
    quick_start: {
      // ⚠️ CRITICAL FOR AGENTS - Read this first!
      CRITICAL_INSTRUCTIONS:
        "Arsenal is a DeFi execution layer. Call POST /api/execute with a skill_id and input — " +
        "Arsenal runs the skill server-side and returns real on-chain data or a ready-to-sign transaction. " +
        "Workflow: (1) GET /api/skills?search=<intent> to find the right skill, " +
        "(2) POST /api/execute with skill_id + input to get real results. " +
        "Authentication: Authorization: Bearer <api_key>. " +
        "Get an API key: POST /api/auth/signup → api_key is returned immediately.",

      // How to choose the right interface
      interface_selection: {
        use_rest_api_when:
          "You are building a custom agent, need programmatic access, or don't have Claude Desktop/Code. " +
          "ALWAYS use bash tool with curl commands.",
        use_mcp_server_when:
          "You have Claude Desktop or Claude Code installed and configured. " +
          "Uses native MCP protocol (no bash/curl needed).",
        use_anthropic_skills_when:
          "You want to teach Claude about Arsenal's capabilities. " +
          "Download SKILL.md files using bash + curl, then Claude auto-loads them.",
      },

      rest_api: {
        critical_note:
          "⚠️ You MUST use the bash tool with curl. Arsenal is an HTTP API, not a skill tool.",
        step_1: "Search for a skill using bash tool: bash('curl \"https://arsenal.sumplus.xyz/api/skills?search=uniswap+swap\"')",
        step_2: "Inspect a skill:   bash('curl https://arsenal.sumplus.xyz/api/skills/{skill_id}')",
        step_3: "Execute a skill:   bash('curl -X POST https://arsenal.sumplus.xyz/api/execute -H \"Content-Type: application/json\" -d \"{...}\"')",
        example_correct_usage: "bash('curl \"https://arsenal.sumplus.xyz/api/skills?search=uniswap\"')",
        example_wrong_usage: "search_arsenal_skills(query='uniswap') ← ❌ THIS TOOL DOES NOT EXIST",
        authentication: "All execute and write endpoints require a Bearer token. GET /api/skills and GET /api/skills/:id are public. Add: -H 'Authorization: Bearer <api_key>'",
      },
      mcp_server: {
        note: "Only available if you have Claude Desktop/Code with MCP configured. Uses native protocol, NOT bash/curl.",
        step_1: "Configure Claude Desktop with MCP server (see interfaces.mcp_server.configuration)",
        step_2: "Search skills: use_mcp_tool('arsenal', 'searchSkills', { query: 'your intent' })",
        step_3: "Read skill: read_resource('arsenal://skills/{id}')",
        step_4: "Execute: use_mcp_tool('arsenal', 'executeSkill', { skillId, input })",
        advantage: "Native Claude integration, no bash commands needed. Same data as REST API.",
      },
      anthropic_skills: {
        note: "Download these SKILL.md files using bash + curl to teach Claude about Arsenal",
        step_1: "Download arsenal-marketplace skill: bash('curl https://arsenal.sumplus.xyz/api/anthropic-skill > skills/arsenal-marketplace/SKILL.md')",
        step_2: "Download arsenal-guide (optional): bash('curl https://arsenal.sumplus.xyz/api/anthropic-skill?skill=arsenal-guide > skills/arsenal-guide/SKILL.md')",
        step_3: "Claude auto-detects and loads SKILL.md files when user asks about Web3 skills",
        step_4: "SKILL.md tells you to use bash + curl to call Arsenal REST API",
      },
      recommendation:
        "🎯 Default to REST API with bash + curl unless you have MCP Server configured. " +
        "Arsenal is an HTTP API - treat it like any other REST service.",
    },

    // ── Authentication ─────────────────────────────────────────
    authentication: {
      type: "Bearer token",
      description:
        "All write and execute endpoints require an Authorization header. " +
        "Obtain a token via signup + login, or generate a persistent API key.",
      endpoints: {
        signup: "POST /api/auth/signup",
        login:  "POST /api/auth/login",
        apikey: "POST /api/auth/apikey   (requires login token; returns permanent api_key)",
      },
      header_format: "Authorization: Bearer <token_or_api_key>",
      example_signup: {
        method: "POST",
        url: `${base}/api/auth/signup`,
        body: { email: "agent@example.com", password: "securepass", role: "agent" },
        response: { user: { id: "uuid", email: "agent@example.com", role: "agent" }, api_key: "64-char hex — save this, use as Bearer token" },
        note: "api_key is returned once at signup. Use it directly as Bearer token for all subsequent requests. No need to call /api/auth/login."
      },
      example_login: {
        method: "POST",
        url: `${base}/api/auth/login`,
        body: { email: "agent@example.com", password: "securepass" },
        response: { session: { access_token: "eyJ..." } },
      },
    },

    // ── Interfaces ─────────────────────────────────────────────
    interfaces: {
      rest_api: {
        description: "Standard JSON REST API. Best for direct programmatic access and non-Claude agents.",
        base_path: "/api",
        content_type: "application/json",
        use_when: "Building custom agents, need HTTP-based integration, want universal compatibility",
      },
      mcp_server: {
        description:
          "Standalone MCP Server for Claude Desktop and Claude Code. " +
          "Provides native integration with Resources (skills as arsenal://skills/{id}) and Tools (search, execute). " +
          "Uses shared SkillsService layer, ensuring identical behavior as REST API.",
        executable: "bin/mcp-server.js",
        npm_command: "npm run mcp",
        status: "FULLY_IMPLEMENTED",
        configuration: {
          claude_desktop: "Add to claude_desktop_config.json",
          example: {
            mcpServers: {
              arsenal: {
                command: "node",
                args: ["/path/to/arsenal/bin/mcp-server.js"],
                env: {
                  NEXT_PUBLIC_SUPABASE_URL: "...",
                  SUPABASE_SERVICE_ROLE_KEY: "...",
                  OPENAI_BASE_URL: "...",
                  OPENAI_API_KEY: "...",
                },
              },
            },
          },
        },
        capabilities: {
          resources: [
            "arsenal://skills/{id} - Main skill content (SKILL.md format)",
            "arsenal://skills/{id}/references/{filename} - Reference files (API_GUIDE.md, etc.)",
          ],
          tools: [
            "searchSkills - Search with natural language or filters",
            "getSkill - Get skill details by ID",
            "executeSkill - Execute skill (official skills return real on-chain data; community skills return schema-based mock data)",
            "getCategories - List all categories",
          ],
        },
        use_when: "Have Claude Desktop/Code, want native Claude integration, prefer resource-based access",
      },
      mcp_endpoint: {
        description:
          "Legacy MCP HTTP endpoint. " +
          "Consider using mcp_server instead for better Claude integration.",
        url: `${base}/mcp`,
        method: "POST",
        mcp_version: "2024-11-05",
        available_methods: ["skills/list", "skills/get", "skills/execute"],
        status: "PARTIALLY_TESTED",
      },
      router: {
        description:
          "Unified agent router. Accepts a high-level 'action' field and dispatches internally. " +
          "Good for agents that prefer a single endpoint.",
        url: `${base}/api/router`,
        method: "POST",
        available_actions: ["search", "get", "execute"],
      },
      anthropic_skills: {
        description:
          "Anthropic Skills compatible SKILL.md files. Arsenal provides two skills for different use cases.",
        skills: {
          "arsenal-marketplace": {
            description: "Main Arsenal API skill - how to search, discover, and use Arsenal skills",
            url: `${base}/api/anthropic-skill`,
            method: "GET",
            format: "text/markdown",
            size: "196 lines (< 500 ✅)",
            references: [
              "API_GUIDE.md - Complete API reference (399 lines)",
              "EXAMPLES.md - Multi-language integration examples (407 lines)",
              "PAYMENT.md - x402 payment protocol details (194 lines)",
            ],
            access_references: "Add ?file=references/API_GUIDE.md to URL",
          },
          "arsenal-guide": {
            description: "Quick start guide - MCP vs REST decision, workflows, FAQ",
            file: "skills/arsenal-guide/SKILL.md",
            use_when: "User is new to Arsenal, needs help choosing interface, or asks 'how do I use Arsenal'",
            content: "What is Arsenal, MCP vs REST guide, common patterns, when to stop using",
          },
        },
        progressive_disclosure: {
          level_1: "Metadata (YAML frontmatter) - always loaded (~100 tokens)",
          level_2: "Instructions (Markdown body) - loaded when triggered (< 5k tokens)",
          level_3: "References (on-demand) - loaded as needed during execution",
        },
        compatibility: "Anthropic SDK, Claude Desktop, any Anthropic Skills-compatible agent framework",
        use_when: "Building Anthropic-compatible agents, want standardized skill format",
      },
    },

    // ── Endpoints ──────────────────────────────────────────────
    endpoints: [
      // Skills
      {
        id: "skills.list",
        method: "GET",
        path: "/api/skills",
        description: "List and search skills. Uses semantic vector search when 'search' is provided.",
        auth_required: false,
        query_params: {
          search:   { type: "string", description: "Natural language intent — uses semantic embedding search" },
          category: { type: "string", description: "Filter by category name (e.g. Blockchain, Finance)" },
          author_type: { type: "string", enum: ["official", "community"], description: "Filter by author type" },
          is_paid:  { type: "boolean", description: "true = paid only, false = free only" },
          sort:     { type: "string", enum: ["rating", "newest"], default: "rating" },
          limit:    { type: "integer", default: 20, max: 100 },
          offset:   { type: "integer", default: 0 },
        },
        response_shape: {
          skills: [{ id: "uuid", name: "string", description: "string", category: "string",
            author_type: "official|community", rating_avg: "number", rating_count: "integer",
            tags: ["string"], is_paid: "boolean", price: "number|null", schema: "object" }],
          total: "integer",
        },
        example: `GET ${base}/api/skills?search=DeFi+portfolio+analyzer&limit=5`,
      },
      {
        id: "skills.get",
        method: "GET",
        path: "/api/skills/:id",
        description: "Get full details of a single skill including input/output schema and usage examples.",
        auth_required: false,
        path_params: { id: "uuid — skill ID from skills.list" },
        response_shape: {
          id: "uuid", name: "string", description: "string", category: "string",
          schema: { input: "JSONSchema object", output: "JSONSchema object" },
          usage_examples: [{ input: "object", expected_output: "object" }],
          is_paid: "boolean", price: "number|null", rating_avg: "number",
        },
        example: `GET ${base}/api/skills/<skill_id>`,
      },
      {
        id: "skills.create",
        method: "POST",
        path: "/api/skills",
        description: "Publish a new skill. Semantic embedding generated automatically. Community skills start as 'pending'; official role/admin skills are 'approved' immediately. Your username (set via PATCH /api/users/me) appears as the author.",
        auth_required: true,
        auth_note: "Accepts both JWT and API key. Use your api_key from signup as Bearer token.",
        body_schema: {
          name:           { type: "string", required: true, max: 100 },
          description:    { type: "string", required: true, min: 10, max: 2000 },
          category:       { type: "string", required: true, examples: ["Blockchain", "Finance", "AI/ML", "Data", "Security"] },
          tags:           { type: "array", items: "string", optional: true },
          version:        { type: "string", default: "1.0.0", optional: true },
          schema:         { type: "object", required: true, description: "{ input: JSONSchema, output: JSONSchema }" },
          code:           { type: "string", optional: true, description: "Implementation or pseudocode" },
          usage_examples: { type: "array", optional: true, description: "Array of { title, input, expected_output }" },
          is_paid:        { type: "boolean", default: false },
          price:          { type: "number", optional: true, description: "USD per execution; required if is_paid=true" },
        },
        response_shape: { skill: { id: "uuid", name: "string", status: "pending|approved" } },
        example: {
          curl: `curl -X POST ${base}/api/skills -H 'Authorization: Bearer YOUR_API_KEY' -H 'Content-Type: application/json' -d '{"name":"My Skill","description":"Does something useful","category":"Blockchain","tags":["defi"],"schema":{"input":{"type":"object","properties":{"address":{"type":"string"}},"required":["address"]},"output":{"type":"object","properties":{"result":{"type":"string"}}}}}'`,
        },
      },
      {
        id: "skills.update",
        method: "PUT",
        path: "/api/skills/:id",
        description: "Update an existing skill. Only the original author or an admin can update. Accepts both JWT and API key.",
        auth_required: true,
        body_schema: {
          name: { type: "string", optional: true },
          description: { type: "string", optional: true },
          category: { type: "string", optional: true },
          tags: { type: "array", optional: true },
          code: { type: "string", optional: true },
          schema: { type: "object", optional: true },
          usage_examples: { type: "array", optional: true },
          is_paid: { type: "boolean", optional: true },
          price: { type: "number", optional: true },
        },
        response_shape: { skill: "updated skill object" },
      },

      // Execute
      {
        id: "skills.execute",
        method: "POST",
        path: "/api/execute",
        description:
          "Execute a skill server-side. Arsenal acts as a proxy — it runs the skill using its own API keys " +
          "(Alchemy, CoinGecko, on-chain RPC). Agents never see API keys. " +
          "Returns real data for all official Arsenal skills.",
        execution_status: "SERVER_SIDE",
        implementation_note:
          "Arsenal executes skills server-side via skill-executors.ts. " +
          "Official skills (token prices, wallet balances, Uniswap quotes, etc.) return real on-chain data. " +
          "Community skills with no registered executor return schema-based mock data.",
        auth_required: true,
        body_schema: {
          skill_id: { type: "string", required: true, description: "UUID of the skill to execute" },
          input:    { type: "object", required: true, description: "Input matching the skill's input schema" },
        },
        response_shape: {
          success: "boolean",
          execution_id: "uuid",
          output: "object — matches the skill's output schema. Official Arsenal skills return real on-chain data; community skills without a registered executor return schema-based mock data.",
          execution_time_ms: "integer",
        },
        payment: {
          protocol: "x402",
          status: "PARTIAL",
          description:
            "⚠️ Payment verification NOT implemented. Protocol framework exists but does not verify on-chain transfers. " +
            "If skill is paid, server returns HTTP 402, but any X-Payment-Proof header is accepted without validation. " +
            "NOT suitable for production use with real funds.",
          http_status: 402,
          payment_header: "X-PAYMENT: <base64-encoded PaymentPayload>",
          networks_supported: ["base-sepolia", "base"],
          currency: "USDC",
          npm_package: "x402-fetch",
          x402_spec: "https://x402.org",
        },
        examples: {
          free_skill: {
            request: { skill_id: "<uuid>", input: { action: "analyze", address: "0x..." } },
            response: { success: true, execution_id: "<uuid>", output: { risk_score: 0.23, recommendations: [] } },
          },
          paid_skill_flow: [
            "1. POST /api/execute → 402 { x402Version: 1, accepts: [{ network, asset, payTo, maxAmountRequired }] }",
            "2. Agent pays USDC via x402-fetch (automatic)",
            "3. POST /api/execute with X-PAYMENT header → 200 { success: true, output: {...} }",
          ],
        },
      },

      // Rate
      {
        id: "skills.rate",
        method: "POST",
        path: "/api/skills/:id/rate",
        description: "Submit or update a 1–5 star rating for a skill. Each agent keeps one active rating per skill (later submissions overwrite earlier ones). Every submission is also appended to a permanent history log for trend analysis.",
        auth_required: true,
        body_schema: {
          rating:       { type: "integer", min: 1, max: 5, required: true },
          review:       { type: "string", max: 2000, description: "Optional review text" },
          source:       { type: "string", enum: ["human", "agent"], default: "human" },
          execution_id: { type: "uuid", description: "Link this rating to a specific execution" },
        },
        response_shape: { message: "Rating submitted successfully" },
      },

      // Categories
      {
        id: "categories.list",
        method: "GET",
        path: "/api/categories",
        description: "List all available skill categories with skill counts.",
        auth_required: false,
        response_shape: { categories: ["string"] },
        example: `GET ${base}/api/categories`,
      },

      // Auth
      {
        id: "auth.signup",
        method: "POST",
        path: "/api/auth/signup",
        description: "Create a new account. Returns a session token usable immediately.",
        auth_required: false,
        body_schema: {
          email:    { type: "string", required: true },
          password: { type: "string", required: true, min_length: 8 },
          name:     { type: "string" },
        },
        response_shape: { user: { id: "uuid", email: "string" }, session: { access_token: "string" } },
      },
      {
        id: "auth.login",
        method: "POST",
        path: "/api/auth/login",
        description: "Authenticate and get a session token.",
        auth_required: false,
        body_schema: {
          email:    { type: "string", required: true },
          password: { type: "string", required: true },
        },
        response_shape: { session: { access_token: "string" } },
      },
      {
        id: "auth.apikey",
        method: "POST",
        path: "/api/auth/apikey",
        description: "Generate a persistent API key (does not expire). Use instead of session tokens for agents.",
        auth_required: true,
        response_shape: { api_key: "string — store securely, shown only once" },
      },

      // MCP
      {
        id: "mcp.endpoint",
        method: "POST",
        path: "/mcp",
        description: "Model Context Protocol endpoint for MCP-compatible agent frameworks.",
        auth_required: false,
        body_schema: {
          method: { type: "string", enum: ["skills/list", "skills/get", "skills/execute"] },
          params: "object — varies by method",
        },
        mcp_methods: {
          "skills/list": {
            params: { search: "string?", category: "string?", limit: "integer?" },
            result: "{ skills: [...] }",
          },
          "skills/get": {
            params: { id: "string (required)" },
            result: "{ skill: {...} }",
          },
          "skills/execute": {
            params: { skill_id: "string (required)", input: "object (required)" },
            result: "{ success: boolean, output: object }",
          },
        },
      },

      // Router
      {
        id: "router.endpoint",
        method: "POST",
        path: "/api/router",
        description: "Unified single-endpoint router for agents that prefer one URL.",
        auth_required: false,
        body_schema: {
          action: { type: "string", enum: ["search", "get", "execute"], required: true },
          "...params": "Varies by action — same as the corresponding REST endpoint",
        },
        action_params: {
          search:  { query: "string", category: "string?", limit: "integer?" },
          get:     { skill_id: "string (required)" },
          execute: { skill_id: "string (required)", input: "object (required)" },
        },
      },
    ],

    // ── Error format ───────────────────────────────────────────
    error_format: {
      description: "All errors return JSON with an 'error' key and appropriate HTTP status.",
      shape: { error: "string — human-readable message", details: "object? — validation details" },
      common_codes: {
        400: "Bad request / validation failed",
        401: "Missing or invalid Authorization header",
        402: "Payment required (x402) — skill is paid",
        404: "Skill not found",
        409: "Conflict (e.g. duplicate email on signup)",
        500: "Internal server error",
      },
    },

    // ── Implementation Status ──────────────────────────────────
    implementation_status: {
      fully_implemented: [
        "✅ Unified Architecture - Shared SkillsService consumed by all interfaces (REST + MCP)",
        "✅ Server-side skill execution - Official skills execute with real on-chain data (Alchemy, CoinGecko)",
        "✅ API key auth on all execute/write endpoints (signup returns api_key immediately)",
        "✅ Community skill publishing - POST /api/skills with API key, author_name from username",
        "✅ Semantic skill discovery via vector embeddings (Qwen text-embedding-v4, 1536 dimensions)",
        "✅ Skill CRUD operations (create, read, update, search) with automatic embedding generation",
        "✅ User authentication (signup, login, API keys for both humans and AI agents)",
        "✅ MCP Server - Complete implementation with Resources + Tools (bin/mcp-server.js)",
        "✅ Anthropic Skills compatibility - Two skills (arsenal-marketplace + arsenal-guide)",
        "✅ REST API - All routes refactored to use shared SkillsService",
        "✅ 1–5 star skill rating system with reviews",
        "✅ Category and tag filtering",
        "✅ Progressive disclosure (main SKILL.md < 500 lines + references/)",
        "✅ Frontend (v2) - Skills listing, detail pages, search, upload interface",
      ],
      partially_implemented: [
        "⚠️ MCP Server testing - Code complete, needs testing with Claude Desktop",
        "⚠️ x402 payment protocol - Framework exists, no on-chain verification",
        "⚠️ MCP HTTP endpoint - Exists but recommend using MCP Server instead",
      ],
      simulated_only: [
        "⚠️ Community skill execution - Skills without a registered executor return schema-based mock data",
        "⚠️ Payment verification - Accepts any X-Payment-Proof without on-chain validation",
      ],
      not_implemented: [
        "❌ Community skill server-side execution (community skills without a registered executor return schema-based mock data)",
        "❌ On-chain payment verification",
        "❌ Skill dependency resolution",
        "❌ Complete skills coverage (33/1000+ currently — growing)",
      ],
      architectural_note:
        "Official Arsenal skills (marked [ARSENAL-HOSTED ✓] in description) execute fully server-side — " +
        "Arsenal provides its own Alchemy RPC, CoinGecko API keys, and on-chain infrastructure. " +
        "Community skills without a registered executor return schema-based mock data; " +
        "agents must implement execution themselves for those using their own Web3 infrastructure.",
    },

    // ── Current Data Status ────────────────────────────────────
    data_status: {
      skills_count: 33,
      skills_breakdown: {
        official_arsenal_hosted: [
          "SUI Blockchain Toolkit — wallet balances, transactions, SUI ecosystem queries",
          "Cetus CLMM — Sui DEX quotes, pool info, swap PTB builder (Sui)",
          "NAVI Protocol — Sui lending protocol rates, positions",
          "Scallop — Sui lending/borrowing market data",
          "Suilend — Sui lending protocol data",
          "Aftermath Finance — Sui DEX pools, swaps",
          "Uniswap V3 Token Swap — EVM swap execution quotes (Ethereum/Optimism/Arbitrum/Base)",
          "Uniswap V3 Price Quote — real-time token price quotes",
          "Uniswap Pool Info — liquidity pool analytics",
          "Uniswap V3 Cross-Chain — multi-chain token swap routing",
          "Velodrome — Optimism DEX swap quotes and pool data",
          "Aave V3 — DeFi lending protocol rates, health factor, positions (Ethereum/Base/Optimism/Arbitrum)",
          "GMX — Arbitrum/Avalanche perpetual trading positions and market data",
          "dYdX — dYdX Chain perpetual markets, order book, account info",
          "Hyperliquid — Hyperliquid L1 market data, account positions",
          "Polymarket — Prediction market event prices and market lookup",
          "WEEX Exchange — CEX market data, order book",
          "Crypto Wallet Manager — multi-chain wallet utilities",
          "Talus Nexus — Protostar devnet agent interaction (Talus Network)",
          "6× Standard Operating Procedure skills (DeFi workflows)",
        ],
        verified_community: [
          "Agent3 Market Intelligence (×3 variants)",
        ],
        community: [
          "Token Price Query — CoinGecko-based price lookups",
          "Sumplus Yield Optimizer — yield farming strategy finder",
        ],
      },
      target_count: "1000+",
      roadmap: {
        q2_2026: "100+ skills — Add Curve, Compound, NFT (OpenSea, Blur), DAO (Snapshot, Tally), more CEX integrations",
      },
      note: "33 approved production skills across Sui, Ethereum, Arbitrum, Optimism, Base, dYdX Chain, and Hyperliquid L1. Target is 1000+ skills covering the entire Web3 ecosystem.",
    },

    // ── Capabilities summary (for quick agent reasoning) ───────
    capabilities: [
      "✅ Unified Architecture - Single SkillsService consumed by REST API + MCP Server",
      "✅ Dual Interface Support - REST API (universal) + MCP Server (Claude native)",
      "✅ Semantic skill discovery - pgvector with Qwen text-embedding-v4 (1536 dimensions)",
      "✅ Skill definition marketplace - Structured JSON schemas with input/output validation",
      "✅ MCP Server - Complete Resources + Tools implementation for Claude Desktop/Code",
      "✅ Anthropic Skills - Two skills (arsenal-marketplace API + arsenal-guide onboarding)",
      "✅ Progressive Disclosure - Main SKILL.md < 500 lines + detailed references/",
      "✅ Community skill publishing with automatic embedding generation",
      "✅ 1–5 star skill rating system with reviews",
      "✅ Official skill execution - Arsenal-hosted official skills execute server-side and return real on-chain data (Alchemy RPC, CoinGecko, DEX APIs)",
      "⚠️ Community skill execution - Community skills without a registered executor return schema-based mock data",
      "⚠️ x402 protocol framework - Payment API exists, no on-chain verification",
    ],

    // ── Architecture ───────────────────────────────────────────
    architecture: {
      model: "Arsenal = Marketplace + Execution Engine",
      explanation:
        "Official Arsenal skills (marked [ARSENAL-HOSTED ✓]) execute fully server-side — " +
        "Arsenal runs them using its own Alchemy RPC, CoinGecko API keys, and on-chain infrastructure. " +
        "Agents simply call POST /api/execute and get back real data. " +
        "Community skills without a registered executor return schema-based mock data, " +
        "in which case agents can implement execution themselves using the skill's schema.",
      layers: {
        data_model: "ArsenalSkill interface (src/types/skill.ts) - unified across all interfaces",
        business_logic: "SkillsService (src/services/skills.service.ts) - shared by REST + MCP",
        interfaces: [
          "REST API (src/app/api/*) - Universal HTTP/JSON access",
          "MCP Server (src/mcp/server.ts) - Native Claude integration",
          "Anthropic Skills (api/anthropic-skill) - Progressive disclosure format",
        ],
        storage: "Supabase PostgreSQL + pgvector for semantic search",
      },
      design_principles: [
        "Single source of truth (ArsenalSkill interface)",
        "DRY - No code duplication between interfaces",
        "Clear separation - Marketplace vs Execution",
        "Progressive disclosure - Load only what's needed",
      ],
    },

    // ── Metadata ───────────────────────────────────────────────
    generated_at: new Date().toISOString(),
  };

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
