# Arsenal Agent Integration Guide

Arsenal is a **real DeFi execution layer**. Agents call Arsenal to get live on-chain quotes and build ready-to-sign transactions — across Ethereum, Optimism, BSC, Solana, Sui, and more.

**Production URL**: `https://arsenal.sumplus.xyz`

---

## What Arsenal Does (and Doesn't Do)

| Arsenal does | Arsenal does NOT do |
|---|---|
| Fetch live on-chain quotes (real RPC) | Hold private keys |
| Build ready-to-sign transaction payloads | Submit transactions |
| Route to best liquidity (fee tier scan) | Store user funds |
| Return standardized transaction format | Verify signatures |

The agent (or user's wallet) receives a transaction object and signs it.

---

## Three Ways to Integrate

### Option A: REST API (direct HTTP)

```bash
# Search
curl "https://arsenal.sumplus.xyz/api/skills?search=swap+on+optimism"

# Get quote
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -H "Content-Type: application/json" \
  -d '{"skill_id":"<uuid>","input":{"action":"get_quote","tokenIn":"ETH","tokenOut":"USDC","amountIn":"0.1","chain":"optimism"}}'

# Build transaction
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -H "Content-Type: application/json" \
  -d '{"skill_id":"<uuid>","input":{"action":"build_swap_tx","tokenIn":"ETH","tokenOut":"USDC","amountIn":"0.1","sender":"0xYourAddress","chain":"optimism"}}'
```

### Option B: MCP Tools (Claude / AI agents)

Arsenal exposes four MCP tools:

- `searchSkills` — natural language search, returns skill list
- `getSkill` — fetch full skill schema by UUID
- `executeSkill` — run any skill action
- `getCategories` — list categories

Example MCP flow:
```
1. searchSkills({ query: "swap BNB for USDC on BSC" })
   → finds PancakeSwap V3, UUID: d5a3f2b1-...

2. executeSkill({ skillId: "d5a3f2b1-...", input: { action: "get_quote", token_in: "BNB", token_out: "USDC", amount_in: "1", chain: "bsc" } })
   → { amount_out: "612.4", _operation: "pancakeswap_swap" }

3. executeSkill({ skillId: "d5a3f2b1-...", input: { action: "build_swap_tx", token_in: "BNB", token_out: "USDC", amount_in: "1", sender: "0x...", chain: "bsc" } })
   → { transactions: [{ to, data, value, description }] }

4. Agent passes transactions[] to wallet for signing
```

### Option C: OpenAI Function Calling

```bash
GET https://arsenal.sumplus.xyz/api/functions?category=Blockchain
```
Returns OpenAI-compatible `tools` array. Pass directly to GPT/Claude API `tools` parameter.

---

## Skill Discovery

### Search tips

Arsenal uses hybrid search (vector similarity + keyword boost). Search quality:

| Query | Result |
|-------|--------|
| `"swap ETH for USDC"` | Uniswap, Velodrome |
| `"cetus swap"` | Cetus CLMM (exact match ranked #1) |
| `"bsc pancakeswap"` | PancakeSwap V3 |
| `"solana swap"` | Jupiter, Raydium |
| `"perpetuals"` | Hyperliquid, dYdX, GMX |
| `"lending sui"` | NAVI, Scallop, Suilend |

### Known skill UUIDs

| Skill | UUID |
|-------|------|
| Uniswap V3 | `23225fb6-a6ad-45d4-9ee6-422ecf53f400` |
| Velodrome V2 | *(search "velodrome")* |
| PancakeSwap V3 | `d5a3f2b1-9c4e-4d07-8b5a-1e3c2f6d9a70` |
| Jupiter | *(search "jupiter solana")* |
| Cetus CLMM | *(search "cetus swap")* |
| AAVE V3 | *(search "aave lending")* |

For the full current list, query `/api/skills?limit=100`.

---

## Using the Schema

Always read a skill's `schema` before calling it. The schema is the source of truth for required fields.

```bash
curl https://arsenal.sumplus.xyz/api/skills/<uuid> | jq '.skill.schema'
```

Example — PancakeSwap V3 schema excerpt:
```json
{
  "type": "object",
  "required": ["action"],
  "properties": {
    "action": {
      "enum": ["get_quote", "build_swap_tx"],
      "description": "get_quote: live quote. build_swap_tx: build transactions. Both require amount_in (exact-output not supported)."
    },
    "token_in":  { "description": "BNB, USDC, USDT, BUSD, ETH, BTCB, CAKE, or BEP-20 address" },
    "token_out": { "description": "Output token symbol or BEP-20 address" },
    "amount_in": { "description": "Required. Exact-output (amount_out) is not supported." },
    "sender":    { "description": "EVM wallet address (0x...). Required for build_swap_tx." },
    "chain":     { "enum": ["bsc"], "description": "Always 'bsc'." }
  }
}
```

---

## Execute Response

```json
{
  "success": true,
  "result": { ... },
  "output": { ... },
  "skill_id": "uuid",
  "execution_time_ms": 180
}
```

`result` and `output` are identical. Use either. On failure:

```json
{
  "success": false,
  "error": "No pool found for WBTC→DAI on bsc at any fee tier",
  "skill_id": "uuid",
  "execution_time_ms": 95
}
```

HTTP 422 = skill ran, logical failure. HTTP 500 = infrastructure error.

---

## Swap Quote: `_operation` Field

All quote responses include `_operation` for downstream identification:

```json
{
  "amount_in": "1",
  "amount_out": "612.4",
  "fee": "0.05%",
  "_operation": "pancakeswap_swap"
}
```

Use `_operation` as a cache key or routing hint — you don't need to parse skill names.

---

## Transaction Handling

### EVM chains (Ethereum, Optimism, BSC, Arbitrum, Base, Polygon)

Arsenal returns an ordered `transactions` array:

```json
{
  "transactions": [
    {
      "to": "0xTokenAddress",
      "data": "0x095ea7b3...",
      "value": "0x0",
      "description": "Approve 100 USDC for PancakeSwap SmartRouter"
    },
    {
      "to": "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
      "data": "0x04e45aaf...",
      "value": "0x0",
      "description": "Swap 100 USDC for at least 0.159 BNB via PancakeSwap V3"
    }
  ]
}
```

Rules:
- Execute in order. If an approve tx is present, it must confirm before the swap.
- `value` is a hex string. `"0x0"` = no native token. `"0x16345785d8a0000"` = 0.1 ETH in wei.
- Add `gas` estimate yourself before submitting.
- Display `description` to the user for confirmation.

### Solana

```json
{
  "transaction": "<base64 serialized VersionedTransaction>",
  "amount_in": "0.1",
  "amount_out": "14.83"
}
```

Pass `transaction` (exact field name) to Privy `sendTransaction` or sign with Solana keypair.

---

## Common Mistakes

### Wrong: using `recipient` instead of `sender`
```json
{ "recipient": "0x..." }  // ❌ — ignored, causes error
{ "sender":    "0x..." }  // ✅
```

### Wrong: passing `amount_out` to PancakeSwap
```json
{ "amount_out": "100" }  // ❌ — exact-output not supported
{ "amount_in": "1" }     // ✅
```

### Wrong: treating `result` as blockchain truth for quotes
Quotes reflect the state at execution time. Prices change. Always re-quote before building a swap transaction if the quote is more than ~30 seconds old.

### Wrong: skipping the approve transaction
If Arsenal returns two transactions (approve + swap), both must be submitted in order. Submitting only the swap will revert.

---

## End-to-End Example: Swap BNB → USDC on BSC

```bash
# Step 1: Get quote
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "d5a3f2b1-9c4e-4d07-8b5a-1e3c2f6d9a70",
    "input": {
      "action": "get_quote",
      "token_in": "BNB",
      "token_out": "USDC",
      "amount_in": "1",
      "chain": "bsc"
    }
  }'
# → { "success": true, "result": { "amount_out": "612.4", "_operation": "pancakeswap_swap" } }

# Step 2: Build transactions
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "d5a3f2b1-9c4e-4d07-8b5a-1e3c2f6d9a70",
    "input": {
      "action": "build_swap_tx",
      "token_in": "BNB",
      "token_out": "USDC",
      "amount_in": "1",
      "sender": "0xYourWalletAddress",
      "chain": "bsc"
    }
  }'
# → { "success": true, "result": { "transactions": [{ "to": "0x...", "data": "0x...", "value": "0xde0b6b3a7640000", "description": "Swap 1 BNB for at least 606.2 USDC via PancakeSwap V3" }] } }

# Step 3: Sign and submit via your wallet
# Pass transactions[0] to your EVM wallet/Privy/WalletConnect
```

---

## End-to-End Example: Swap SOL → USDC via Jupiter

```bash
# Step 1: Quote
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "<jupiter-uuid>",
    "input": {
      "action": "jupiter_get_quote",
      "from_token": "SOL",
      "to_token": "USDC",
      "amount": "1",
      "slippage_bps": 50
    }
  }'

# Step 2: Build transaction
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "<jupiter-uuid>",
    "input": {
      "action": "build_swap_tx",
      "from_token": "SOL",
      "to_token": "USDC",
      "amount": "1",
      "sender": "<your-solana-pubkey>",
      "slippage_bps": 50
    }
  }'
# → { "result": { "transaction": "<base64>", "amount_out": "148.3" } }

# Step 3: Sign and submit
# privy.sendTransaction(result.transaction)
```

---

## Supported Chains Reference

| Chain | Chain ID | Identifier | Key Skills |
|-------|----------|------------|------------|
| Ethereum | 1 | `ethereum` | Uniswap V3, AAVE |
| Optimism | 10 | `optimism` | Uniswap V3, Velodrome, AAVE |
| Arbitrum | 42161 | `arbitrum` | Uniswap V3, GMX, AAVE |
| Base | 8453 | `base` | Uniswap V3, AAVE |
| Polygon | 137 | `polygon` | Uniswap V3, AAVE |
| BSC | 56 | `bsc` | PancakeSwap V3 |
| Solana | — | `solana` | Jupiter, Raydium |
| Sui | — | `sui` | Cetus, Aftermath, NAVI, Scallop, Suilend |
