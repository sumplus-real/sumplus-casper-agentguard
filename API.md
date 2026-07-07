# Sumplus Arsenal — API Reference

**Base URL**: `https://arsenal.sumplus.xyz`

All requests and responses use JSON (`Content-Type: application/json`).

Authentication is optional for read operations. Protected endpoints accept:
- `Authorization: Bearer <JWT>` — from `/api/auth/login` → `session.access_token`
- `Authorization: Bearer <api_key>` — from `/api/auth/apikey`

---

## Authentication

### `POST /api/auth/signup`

```json
{ "email": "agent@example.com", "password": "min8chars", "role": "agent" }
```
`role`: `"user"` | `"agent"` (default: `"user"`)

**Response 201**
```json
{ "user": { "id": "uuid", "email": "...", "role": "agent" } }
```

---

### `POST /api/auth/login`

```json
{ "email": "...", "password": "..." }
```

**Response 200**
```json
{
  "session": { "access_token": "eyJ...", "refresh_token": "...", "expires_at": 1234567890 },
  "user": { "id": "uuid", "email": "..." }
}
```

---

### `POST /api/auth/apikey`
Generate a persistent API key. Requires JWT auth.

**Response 200**
```json
{ "api_key": "sk_live_..." }
```

---

## Skills

### `GET /api/skills`
Search and list approved skills.

**Query params**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `search` | string | — | Semantic search (vector + keyword hybrid). Returns `similarity` score per skill. |
| `category` | string | — | Filter by category (`Blockchain`, `Finance`, etc.) |
| `sort` | string | `created_at` | `created_at` \| `rating_avg` \| `usage_count` \| `name` |
| `order` | string | `desc` | `asc` \| `desc` |
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Results per page (max 100) |

**Response 200**
```json
{
  "skills": [
    {
      "id": "uuid",
      "name": "Velodrome V2",
      "description": "...",
      "category": "Blockchain",
      "tags": ["velodrome", "optimism", "dex", "swap"],
      "schema": { ... },
      "is_paid": false,
      "rating_avg": 4.8,
      "usage_count": 1204,
      "similarity": 0.91
    }
  ],
  "total": 21,
  "page": 1,
  "limit": 20,
  "total_pages": 2
}
```

`similarity` is only present when `search` query is used.

---

### `GET /api/skills/:id`
Full skill details including schema and ratings.

**Response 200**
```json
{
  "skill": {
    "id": "uuid",
    "name": "Uniswap V3",
    "description": "...",
    "category": "Blockchain",
    "tags": [...],
    "schema": {
      "type": "object",
      "required": ["action"],
      "properties": {
        "action": { "type": "string", "enum": ["get_quote", "build_swap_tx"] },
        "tokenIn": { "type": "string", "description": "..." },
        "tokenOut": { "type": "string" },
        "amountIn": { "type": "string" },
        "sender": { "type": "string", "description": "EVM wallet address (0x...)" }
      }
    },
    "is_paid": false,
    "rating_avg": 4.9,
    "rating_count": 87,
    "usage_count": 5621,
    "ratings": [{ "rating": 5, "review": "Works great", "created_at": "..." }]
  }
}
```

**Response 404** — skill not found

---

### `GET /api/categories`

**Response 200**
```json
{ "categories": ["Blockchain", "Finance", "AI/ML"], "count": 3 }
```

---

## Execution

### `POST /api/execute`

Execute a skill action. Returns real on-chain data (RPC calls) for read operations, and ready-to-sign transactions for write operations.

**Body**
```json
{
  "skill_id": "uuid",
  "input": {
    "action": "get_quote",
    "tokenIn": "ETH",
    "tokenOut": "USDC",
    "amountIn": "0.1",
    "chain": "optimism"
  }
}
```

**Response 200 — success**
```json
{
  "success": true,
  "result": { ... },
  "output": { ... },
  "skill_id": "uuid",
  "execution_time_ms": 180,
  "execution_id": "uuid"
}
```

`result` and `output` contain identical data. Both keys are present for compatibility with different callers.

**Response 422 — skill execution failed**
```json
{
  "success": false,
  "error": "No pool found for WBTC→USDC on optimism at any fee tier",
  "skill_id": "uuid",
  "execution_time_ms": 95
}
```

422 means the skill ran but returned a logical failure (bad input, no liquidity, etc.).
500 is reserved for infrastructure errors.

**Response 404** — skill not found

---

### Swap Quote Response

All `get_quote` / `get_swap_quote` actions return:

```json
{
  "amount_in": "0.1",
  "amount_out": "243.52",
  "price_impact": "0.04%",
  "fee": "0.3%",
  "_operation": "velodrome_swap"
}
```

`_operation` identifies the DEX for downstream routing/caching:

| Skill | `_operation` |
|-------|-------------|
| Uniswap V3 | `uniswap_swap` |
| Velodrome V2 | `velodrome_swap` |
| PancakeSwap V3 | `pancakeswap_swap` |
| Jupiter | `jupiter_swap` |
| Cetus CLMM | `cetus_swap` |

---

### Build Swap Transaction Response (EVM)

`build_swap_tx` on EVM skills returns an ordered array of transactions:

```json
{
  "transactions": [
    {
      "to": "0xTokenAddress",
      "data": "0x095ea7b3...",
      "value": "0x0",
      "description": "Approve 0.1 WETH for Velodrome Router V2"
    },
    {
      "to": "0xRouterAddress",
      "data": "0xa4573e8a...",
      "value": "0x0",
      "description": "Swap 0.1 WETH for at least 243.1 USDC via Velodrome V2 (volatile)"
    }
  ],
  "amount_out_estimated": "243.52",
  "amount_out_minimum": "241.1"
}
```

Transaction field spec:
- `to` — contract address (checksummed hex)
- `data` — ABI-encoded calldata (hex)
- `value` — native token amount as **hex string** (e.g. `"0x16345785d8a0000"` or `"0x0"`)
- `description` — human-readable description for display/confirmation UI
- No `gas` field — caller estimates gas

Execute transactions **in order**. If an approve tx is included, it must confirm before the swap tx.

---

### Build Swap Transaction Response (Solana)

`build_swap_tx` on Jupiter returns:

```json
{
  "transaction": "<base64 serialized VersionedTransaction>",
  "amount_in": "0.1",
  "amount_out": "14.83",
  "slippage_bps": 50,
  "chain": "solana"
}
```

Pass `transaction` to Privy `sendTransaction` or sign with your Solana keypair.

---

## Skill Input Conventions

| Parameter | Description |
|-----------|-------------|
| `action` | Which action to invoke (always required) |
| `sender` | Wallet address of the transaction initiator. EVM: `0x...` (40 hex chars). Do **not** use `recipient`. |
| `token_in` / `tokenIn` | Input token — symbol (`ETH`, `USDC`) or contract address |
| `token_out` / `tokenOut` | Output token — symbol or contract address |
| `amount_in` | Human-readable input amount string (e.g. `"0.1"`, `"100"`) |
| `slippage` | Max slippage as decimal fraction (e.g. `0.01` = 1%). Default: 0.01 |
| `chain` | Chain identifier (`ethereum`, `optimism`, `arbitrum`, `base`, `polygon`, `bsc`, `solana`) |

---

## MCP Interface

Arsenal exposes an MCP server. Connect via standard MCP protocol.

### Tools

#### `searchSkills`
```json
{
  "query": "swap tokens on BSC",
  "category": "Blockchain",
  "limit": 10
}
```
Returns: `{ skills: [...], total, page, total_pages }`

#### `getSkill`
```json
{ "skillId": "uuid" }
```
Returns: `{ skill: { ... } }`

#### `executeSkill`
```json
{
  "skillId": "uuid",
  "input": {
    "action": "get_quote",
    "tokenIn": "BNB",
    "tokenOut": "USDC",
    "amount_in": "1",
    "chain": "bsc"
  }
}
```
Returns: `{ success, result, output, execution_time_ms }`

#### `getCategories`
Returns: `{ categories: [...] }`

### Resources

Skills are also available as MCP resources:
```
arsenal://skills/<uuid>
```
Returns skill documentation in Markdown format.

---

## OpenAI Function Calling Interface

### `GET /api/functions`
Returns skills as OpenAI-compatible function definitions.

**Query params**: `category`, `search`, `limit` (max 100)

**Response 200**
```json
{
  "functions": [
    {
      "type": "function",
      "function": {
        "name": "velodrome_v2",
        "description": "Velodrome V2 DEX on Optimism. Swap any tokens...",
        "parameters": {
          "type": "object",
          "required": ["action"],
          "properties": {
            "action": { "type": "string", "enum": ["get_quote", "build_swap_tx"] },
            "tokenIn": { "type": "string" },
            "tokenOut": { "type": "string" },
            "amountIn": { "type": "string" },
            "sender": { "type": "string" }
          }
        }
      }
    }
  ],
  "count": 21
}
```

Pass the `functions` array directly to OpenAI/Claude API `tools` parameter.

### `POST /api/functions/execute`
Execute by function name:
```json
{ "name": "velodrome_v2", "arguments": { "action": "get_quote", "tokenIn": "ETH", "tokenOut": "USDC", "amountIn": "0.1" } }
```

---

## Unified Router

Single endpoint for agents that want a simple interface.

### `POST /api/router`

**Search:**
```json
{ "action": "search", "query": "bsc pancakeswap swap" }
```
Response: `{ "action": "search", "skills": [...], "count": 1 }`

**Get:**
```json
{ "action": "get", "skill_id": "uuid" }
```
Response: `{ "action": "get", "skill": { ... } }`

**Execute:**
```json
{ "action": "execute", "skill_id": "uuid", "input": { "action": "get_quote", ... } }
```
Response: `{ "action": "execute", "success": true, "result": { ... } }`

---

## Error Format

All errors:
```json
{ "error": "Human-readable message" }
```

Validation errors add:
```json
{ "error": "Validation failed", "details": { "fieldErrors": { "email": ["Invalid email"] } } }
```

HTTP status codes:

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Authentication required |
| 402 | Payment required (paid skill) |
| 404 | Not found |
| 422 | Skill execution failed (logical error) |
| 500 | Server / infrastructure error |

---

## Admin

### `POST /api/admin/backfill-embeddings`
Regenerate embeddings for all skills with `embedding IS NULL`.

```json
{ "message": "Backfill complete", "total": 21, "updated": 21, "errors": [] }
```
