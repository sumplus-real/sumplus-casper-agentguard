# Sumplus Arsenal — Architecture

## What This Is

Arsenal is a **DeFi execution layer for AI agents**. Agents discover skills via semantic search, get live on-chain quotes, and receive ready-to-sign transaction payloads — across Ethereum, Optimism, BSC, Arbitrum, Base, Polygon, Solana, and Sui.

Arsenal does not hold private keys. It constructs transactions; the agent or user signs and submits.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js, App Router, TypeScript |
| Database | Supabase (PostgreSQL + pgvector) |
| Semantic search | Qwen `text-embedding-v4` (1536 dims) + hybrid keyword rerank |
| EVM RPC | Alchemy (`eth_call`, `eth_getLogs`) + public fallbacks |
| Solana RPC | Helius / public |
| Sui RPC | Mysten Labs public |
| Skill execution | In-process TypeScript modules (no sandbox) |
| Deployment | Vercel (serverless) |

---

## Directory Structure

```
sumplus-arsenal/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # Home page
│   │   ├── skills/
│   │   │   ├── page.tsx              # Browse/search skills
│   │   │   └── [id]/page.tsx         # Skill detail + Try It
│   │   ├── login/ signup/ admin/
│   │   └── api/
│   │       ├── skills/route.ts       # GET list + POST create
│   │       ├── skills/[id]/route.ts  # GET / PUT / DELETE
│   │       ├── execute/route.ts      # Skill execution (main entry point)
│   │       ├── categories/route.ts
│   │       ├── functions/route.ts    # OpenAI function definitions
│   │       ├── router/route.ts       # Unified agent router
│   │       ├── auth/                 # signup / login / apikey
│   │       └── admin/                # backfill-embeddings, skills approval
│   ├── mcp/
│   │   └── server.ts                 # MCP server (searchSkills, getSkill, executeSkill)
│   ├── services/
│   │   └── skills.service.ts         # DB queries, semantic search, hybrid rerank
│   ├── lib/
│   │   ├── embedding.ts              # Qwen embedding API wrapper
│   │   ├── skill-executors.ts        # Routes skill_id → executor function
│   │   └── x402.ts                   # x402 payment protocol
│   ├── skills/                       # Skill implementation modules (one file per protocol)
│   │   ├── uniswap.ts               # Uniswap V3 (Ethereum, Optimism, Arbitrum, Base, Polygon)
│   │   ├── velodrome.ts             # Velodrome V2 (Optimism)
│   │   ├── pancakeswap.ts           # PancakeSwap V3 (BSC)
│   │   ├── aave.ts                  # AAVE V3 (multi-chain EVM)
│   │   ├── gmx.ts                   # GMX V2 perpetuals (Arbitrum, Avalanche)
│   │   ├── jupiter.ts               # Jupiter aggregator (Solana)
│   │   ├── raydium.ts               # Raydium AMM (Solana)
│   │   ├── cetus.ts                 # Cetus CLMM (Sui)
│   │   ├── aftermath.ts             # Aftermath Finance (Sui)
│   │   ├── navi.ts                  # NAVI lending (Sui)
│   │   ├── scallop.ts               # Scallop money market (Sui)
│   │   ├── suilend.ts               # Suilend (Sui)
│   │   ├── hyperliquid.ts           # Hyperliquid perpetuals
│   │   ├── dydx.ts                  # dYdX perpetuals
│   │   ├── polymarket.ts            # Polymarket prediction market
│   │   ├── talus-nexus.ts           # Talus Nexus cross-chain
│   │   ├── ika-dwallet.ts           # Ika dWallet
│   │   ├── sui-blockchain.ts        # SUI native queries
│   │   ├── wallet.ts                # Multi-chain wallet
│   │   ├── sumplus-yield.ts         # Sumplus yield products
│   │   └── weex.ts                  # Weex CEX
│   └── types/
│       └── skill.ts                 # TypeScript types
├── supabase-schema.sql              # Full DB schema
└── .env.local                       # Environment variables
```

---

## Execution Flow

### 1. Skill Search

```
GET /api/skills?search="swap ETH for USDC on optimism"
  → generateEmbedding(query)           [src/lib/embedding.ts]
      → Qwen text-embedding-v4 API → float[1536]
  → supabase.rpc('search_skills_by_embedding', { query_embedding })
      → pgvector cosine similarity (HNSW index)
      → returns top-N skills by similarity
  → applyKeywordBoost(skills, query)   [src/services/skills.service.ts]
      → exact name word match → boost +2
      → substring / tag match    → boost +1
      → stable sort preserves semantic order within same boost tier
  → return reranked results
```

Fallback: if embedding API fails, falls back to PostgreSQL `ILIKE` text search.

### 2. Skill Execution

```
POST /api/execute  { skill_id, input }
  → fetch skill from DB (verify status = 'approved')
  → if skill.is_paid:
      → check X-PAYMENT header → verify with x402 facilitator → settle
      → if no payment: return 402 + PaymentRequirements
  → executeSkillById(skill_id, input)  [src/lib/skill-executors.ts]
      → route by UUID → import skill module → call executeXxxSkill(input)
      → skill module:
          1. parse + validate input
          2. make RPC calls (Alchemy / public node) — real on-chain data
          3. encode calldata (ABI encoding, p32 helpers)
          4. return { success, output } or { success: false, error }
  → log to skill_executions table
  → return { success, result: output, output, execution_time_ms }
```

`success: false` from a skill → HTTP 422 (not 500).
500 is reserved for uncaught server errors.

### 3. MCP Execution

```
MCP tool call: executeSkill { skillId, input }
  → SkillsService.executeSkill(skillId, input)
  → same path as REST /api/execute (executeSkillById)
  → return { success, result, output }
```

MCP and REST return identical response shapes.

### 4. Authentication

```
Humans:  POST /api/auth/signup → admin.createUser() → returns user
         POST /api/auth/login  → signInWithPassword() → session.access_token

Agents:  POST /api/auth/apikey → stores api_key in users table
         All endpoints accept: Authorization: Bearer <JWT or api_key>
```

---

## Database Schema

### `public.skills`
```
id            uuid  PK
name          text
description   text
category      text
tags          text[]
author_type   text     -- 'official' | 'community'
version       text
schema        jsonb    -- JSON Schema for input (used by agents + UI)
status        text     -- 'pending' | 'approved' | 'rejected'
embedding     vector(1536)   -- pgvector embedding (Qwen text-embedding-v4)
rating_avg    decimal  -- auto-updated by trigger
rating_count  int      -- auto-updated by trigger
usage_count   int
is_paid       boolean
price         decimal
created_at    timestamptz
updated_at    timestamptz
```

### `public.skill_executions`
```
id                uuid  PK
skill_id          uuid  FK → skills.id
user_id           uuid  nullable
input             jsonb
output            jsonb
status            text  -- 'success' | 'error'
execution_time_ms int
error_message     text
created_at        timestamptz
```

### Vector Search Index
```sql
CREATE INDEX ON public.skills USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### Key DB Functions
- `search_skills_by_embedding(query_embedding, match_count, similarity_threshold)` — pgvector RPC, cosine similarity
- `update_skill_rating_avg()` — trigger on ratings table, auto-updates `rating_avg` + `rating_count`
- `handle_new_user()` — trigger on `auth.users` insert, creates `public.users` row

---

## Skill Module Pattern

Every skill in `src/skills/*.ts` follows the same structure:

```typescript
// src/skills/example.ts
//
// UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
// Registered in: src/lib/skill-executors.ts

// 1. Verified contract addresses (with Etherscan/explorer links)
const CONTRACTS = {
  router: '0x...',  // https://optimistic.etherscan.io/address/0x...
};

// 2. Verified ABI selectors (keccak256 of function signature)
const SEL = {
  exactInputSingle: '04e45aaf',  // SwapRouter02.exactInputSingle(...)
};

// 3. Token registry (symbol → address + decimals)
const TOKEN_REGISTRY = { ... };

// 4. RPC helper
async function ethCall(to: string, data: string): Promise<string> { ... }

// 5. Action handlers
async function actionGetQuote(input: any): Promise<SkillExecutionResult> {
  const { tokenIn, tokenOut, amountIn } = input;
  if (!tokenIn || !tokenOut || !amountIn) {
    return { success: false, error: 'tokenIn, tokenOut, amountIn are required' };
  }
  try {
    const result = await ethCall(CONTRACTS.quoter, buildCalldata(...));
    return { success: true, output: { amount_in: ..., amount_out: ..., _operation: 'example_swap' } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// 6. Main dispatcher
export async function executeExampleSkill(input: any): Promise<SkillExecutionResult> {
  switch (input?.action) {
    case 'get_quote':      return actionGetQuote(input);
    case 'build_swap_tx':  return actionBuildSwapTx(input);
    default: return { success: false, error: `Unknown action: ${input?.action}` };
  }
}
```

### Registering a skill

In `src/lib/skill-executors.ts`:
```typescript
import { executeExampleSkill } from '@/skills/example';

// Inside executeSkillById():
if (skillId === 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx') {
  return await executeExampleSkill(input);
}
```

---

## Transaction Format Spec

### EVM

```typescript
interface EvmTransaction {
  to: string;       // checksummed hex address
  data: string;     // '0x' + ABI-encoded calldata
  value: string;    // hex string — '0x0' for ERC-20, '0x...' for native token
  description: string;  // human-readable, safe for display
  // NO gas field — caller estimates
}
```

`value` must always be a hex string (never decimal integer).

### Solana

```typescript
interface SolanaTransaction {
  transaction: string;  // base64 serialized VersionedTransaction
  // Field name is exactly 'transaction' (case-sensitive)
}
```

---

## Key Design Decisions

### Hybrid search
Pure vector similarity can rank unrelated skills above exact name matches when descriptions are semantically similar (e.g. "The Jupiter of Sui" ranked above Jupiter itself). Post-processing keyword boost solves this: name word exact match = +2, substring/tag = +1, stable sort preserves semantic order within tier.

### No sandbox
Skills run in-process (same Node.js process as Next.js). This is faster and simpler for Vercel serverless. The tradeoff is that a buggy skill can affect other requests. Mitigation: all skill actions catch errors and return `{success: false}` — they never throw to the route handler.

### `service_role` key on all server routes
API routes are server-side only. Using service role bypasses RLS, which is correct — authorization is enforced in application code, not DB policies.

### `admin.createUser()` for signup
Supabase's standard `signUp()` requires valid email MX records. `admin.createUser({ email_confirm: true })` bypasses this, which is necessary for agent accounts with programmatic email addresses.

### Both `result` and `output` in execute response
REST convention uses `result`. MCP callers use `output`. Both keys carry identical data to avoid breaking either integration path.
