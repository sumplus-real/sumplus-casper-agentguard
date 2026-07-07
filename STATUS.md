# Arsenal — Current Status

**Last Updated**: 2026-05-21

## What Arsenal Is

Arsenal is a **DeFi execution layer for AI agents**. Agents call Arsenal to search, quote, and execute on-chain operations across multiple blockchains. Arsenal handles protocol complexity (ABI encoding, RPC calls, liquidity queries, transaction construction) and returns ready-to-sign transaction payloads. Arsenal never holds private keys — the agent or user signs and submits.

**Production**: `https://arsenal.sumplus.xyz`

---

## Phase Summary

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Foundation | ✅ Complete | Skill catalog, semantic search, auth, execute API |
| Phase 2: Execution & Payments | 🔄 In Progress | 70+ live skills, x402 EVM payments (Base/Avalanche/BSC), A2A (Maria) |
| Phase 3: Canton 402 Settlement | 📋 Planned | Canton Coin settlement layer, Canton-native skills |

---

## Live Capabilities

### Skill Execution

- **70+ approved skills** across 12+ chains (96 total registered, 25 in review pipeline)
- Execution is **real**: each skill calls actual protocol SDKs, RPC endpoints, or public APIs — no mock data
- Arsenal does **not** hold private keys or submit transactions. For on-chain actions, Arsenal returns signed-ready transaction objects; the caller submits
- Skills without a registered executor return a schema + `implementation_guide` for agent self-execution

### Supported Chains

| Ecosystem | Chains |
|-----------|--------|
| EVM | Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, XLayer, HashKey Chain |
| Solana | Mainnet |
| Sui | Mainnet |
| Canton | Read-only (market data); execution in Phase 3 |

### Interfaces

| Interface | Status | Notes |
|-----------|--------|-------|
| REST API (`/api/execute`) | ✅ Live | Primary interface |
| MCP (`/mcp`) | ✅ Live | Model Context Protocol |
| OpenAI Function Calling | ✅ Live | Via `/api/functions/execute` |
| Anthropic Skills | ✅ Live | Via `/api/anthropic-skill` |
| A2A (Agent-to-Agent) | ✅ Live | Maria integration (`/api/agent-invoke`) |

### Payment (x402)

- x402 protocol is **implemented** for EVM — Arsenal returns HTTP 402 with payment requirements for paid skills
- Settlement: USDC on Base or Avalanche (Coinbase facilitator); USDC on BSC (Binance facilitator)
- Current status: framework live, 1 paid skill (`sumplus-yield`), wallet config pending for full activation
- **Canton 402** (Canton Coin settlement extension of x402): planned for Phase 3 — not yet implemented

### Search & Discovery

- Semantic search: Qwen `text-embedding-v4` embeddings + pgvector (Supabase)
- `partner_verified` skills are weighted higher in search results — this is disclosed as an intentional ranking signal (see `ROUTING_COMPLIANCE.md`)
- Categories, tags, chain filter, and rating (1–5) available

---

## Skill Count by Category

| Category | Live |
|----------|------|
| DeFi (swap, lend, perp, yield) | 45+ |
| Data & Infra (price, gas, ENS) | 8 |
| Bridge & Cross-chain | 4 |
| Canton Network | 1 |
| Agent Services (Maria) | 4 |

---

## Not In Scope (by design)

- Private key management or custody
- Transaction signing or broadcasting
- Order-flow routing across protocols (Arsenal executes on a specified protocol, it does not route between protocols for best execution)

---

## Key Files

| File | Purpose |
|------|---------|
| `README.md` | Full technical overview |
| `API.md` | REST API reference |
| `SKILL_DEV_GUIDE.md` | How to add a new skill |
| `AGENT_GUIDE.md` | How agents use Arsenal |
| `ROUTING_COMPLIANCE.md` | Routing & conflict-of-interest disclosure |
| `X402_CANTON_SPEC.md` | x402 compatibility & Canton 402 roadmap |
| `ARCHITECTURE.md` | System architecture |
