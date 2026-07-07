# Sumplus Arsenal — Development Guide

## Quick Start

```bash
npm install
npm run dev        # http://localhost:3000
npm run test:api   # Jest API tests (47 cases)
npm run test:e2e   # Playwright E2E tests (13 cases)
npm run build      # Production build check
```

## Environment Variables

File: `.env.local` (never commit)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Qwen Embedding (OpenAI-compatible)
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMENSIONS=1536

# x402 Payments
X402_NETWORK=base-sepolia           # or 'base' for mainnet
X402_PAYMENT_RECIPIENT=0x...        # EVM wallet address to receive USDC
X402_FACILITATOR_URL=https://x402.org/facilitator
```

---

## Database Setup

Run once in Supabase SQL Editor, in this order:

1. `supabase-schema.sql` — creates all tables, triggers, RLS policies, pgvector extension
2. `seeds/official-skills.sql` — inserts 3 official skills
3. The pgvector `search_skills_by_embedding` function (from `API.md` or `ARCHITECTURE.md`)
4. `POST /api/admin/backfill-embeddings` — generate embeddings for seeds

If you need to start fresh:
```sql
DROP TABLE IF EXISTS payments, skill_executions, ratings, skills, users CASCADE;
DROP FUNCTION IF EXISTS handle_new_user, update_skill_rating_avg, search_skills_by_embedding CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
```
Then re-run steps 1–4.

---

## How to Add a New API Endpoint

All API routes live in `src/app/api/`. Each route file exports named functions (`GET`, `POST`, `PUT`, `DELETE`).

**Pattern for every route:**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const dynamic = "force-dynamic"; // required — disables static caching

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const MySchema = z.object({ field: z.string() });

export async function POST(req: NextRequest) {
  // 1. Parse body safely
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // 2. Validate with zod
  const result = MySchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Validation failed", details: result.error.flatten() }, { status: 400 });
  }

  // 3. Business logic
  const supabase = getSupabase();
  const { data, error } = await supabase.from("table").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
```

**Auth check pattern:**
```typescript
async function resolveUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!token) return null;
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) return user.id;
  // fallback: agent API key
  const { data } = await supabase.from("users").select("id").eq("api_key", token).single();
  return data?.id ?? null;
}
```

---

## How to Add a New Skill (Seed)

1. Add a row to `seeds/official-skills.sql`:
```sql
INSERT INTO public.skills (id, name, description, category, tags, author_type, status, schema, code, usage_examples, is_paid)
VALUES (
  gen_random_uuid(),
  'My New Skill',
  'What it does...',
  'Blockchain',
  ARRAY['tag1', 'tag2'],
  'official',
  'approved',
  '{"input": {"type":"object","properties":{"action":{"type":"string"}}}, "output": {"type":"object","properties":{"result":{"type":"string"}}}}',
  '// implementation placeholder',
  '[]',
  false
);
```

2. Run the SQL in Supabase SQL Editor.
3. Call `POST /api/admin/backfill-embeddings` to generate its embedding.

---

## How to Add a New Category

Categories are derived dynamically from the `skills.category` column — no config needed. Just use the category name when creating a skill and it appears automatically.

---

## How to Add a New Interface Type (e.g., "Agents Directory")

The pattern is the same as adding MCP or Router. Create a new route file, e.g. `src/app/api/agents/route.ts`, and follow the route pattern above.

To add it to the MCP endpoint, add a new `method` handler in `src/app/mcp/route.ts`:
```typescript
if (method === "agents/list") {
  // ...
}
```

---

## Semantic Search — How It Works

**Embedding generation** (`src/lib/embedding.ts`):
- `generateEmbedding(text)` — calls Qwen API, returns `number[1536]`
- `buildSkillEmbeddingText(skill)` — combines name + description + category + tags into a single string for richer embedding

**Search flow** (`src/app/api/skills/route.ts`):
1. Call `generateEmbedding(searchQuery)`
2. `supabase.rpc('search_skills_by_embedding', { query_embedding, match_count, similarity_threshold: 0.3 })`
3. Returns skills with `similarity` score (0–1). Threshold 0.3 filters noise.
4. On embedding API failure: falls back to `name.ilike.%query%,description.ilike.%query%`

**When to re-embed**: Call `POST /api/admin/backfill-embeddings` whenever skills are imported directly to DB (bypassing the API). The API auto-embeds on `POST /api/skills`.

---

## x402 Payment Flow

**Config** (`src/lib/x402.ts`): `getX402Config()` reads env vars. Set `X402_PAYMENT_RECIPIENT` to your USDC-receiving wallet.

**USDC addresses**:
- Base Sepolia (testnet): `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Base mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

**To make a skill paid**:
1. Set `is_paid: true` and `price: 1.00` (USD) when creating the skill.
2. Execution will automatically return 402 with PaymentRequirements.
3. Agents using `x402-fetch` or `x402-axios` packages handle this automatically.

**Testing payments**: Use Base Sepolia testnet USDC (free from faucets). The facilitator at `https://x402.org/facilitator` handles testnet verification.

---

## Real Skill Execution (Production Upgrade)

Currently, `simulateSkillExecution()` returns mock data based on the output schema. To replace with real execution:

1. **Option A — Lambda**: Store skill code in DB, invoke AWS Lambda per request with isolated runtime
2. **Option B — Edge functions**: Deploy each skill as a Supabase Edge Function
3. **Option C — Docker sandbox**: Spin up container per execution (Firecracker for isolation)

The execution interface in `src/app/api/execute/route.ts` is already structured to swap this out — replace the `simulateSkillExecution()` call with your execution engine.

---

## Testing

### API Tests (Jest)
```bash
npm run test:api
```
- Located in `tests/api/`
- Run against live `localhost:3000` (dev server must be running)
- Creates temporary test users with unique emails (`testuser-{timestamp}@example-test.dev`)
- Covers: auth, skills CRUD, search, execute, rate, MCP, router, payments

### E2E Tests (Playwright, headless Chromium)
```bash
npm run test:e2e
```
- Located in `tests/e2e/`
- Covers: browse page, detail page, navigation, auth signup flow

### Adding a New Test
For API tests, add a `describe` block to the relevant file in `tests/api/`. Follow the pattern:
```typescript
async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`http://localhost:3000${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
```

For E2E, add a `test.describe` block to `tests/e2e/skills.spec.ts` or create a new spec file.

---

## Common Gotchas

### `CREATE TABLE IF NOT EXISTS` silently skips existing tables
If a table already exists with wrong columns, the schema won't apply. Always DROP first when rebuilding.

### PostgREST schema cache
After DDL changes (adding columns, etc.), run in Supabase SQL Editor:
```sql
NOTIFY pgrst, 'reload schema';
```

### Supabase `handle_new_user` trigger
The trigger inserts into `public.users` before the signup route does. The route uses `.upsert({ onConflict: 'id' })` to handle this. If you ever switch back to `.insert()`, you'll get duplicate key errors.

### curl proxy interference
Local proxy (e.g. `127.0.0.1:7890`) may intercept and mangle requests. Use `--noproxy "*"` in curl commands during development.

### `X-PAYMENT` header and x402
The `X-PAYMENT` header must be a base64-encoded `PaymentPayload` matching the x402 spec. The `x402-fetch` npm package generates this automatically. Manual construction: see `https://x402.org` docs.

---

## File Sizes & Complexity Reference

| File | Lines | Complexity |
|------|-------|------------|
| `src/app/api/skills/route.ts` | ~170 | Medium — vector search branch |
| `src/app/api/execute/route.ts` | ~140 | High — x402 payment branching |
| `src/app/mcp/route.ts` | ~215 | Medium — 3 method handlers |
| `src/app/api/router/route.ts` | ~220 | Medium — 3 action handlers |
| `src/app/skills/[id]/page.tsx` | ~400 | High — Try It + Rating UI state |
| `src/lib/x402.ts` | ~110 | Medium — payment protocol utils |
| `src/lib/embedding.ts` | ~45 | Low — simple API wrapper |
| `supabase-schema.sql` | ~180 | Medium — read before modifying |
