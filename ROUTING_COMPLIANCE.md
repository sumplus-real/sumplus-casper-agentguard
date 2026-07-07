# Arsenal Routing & Compliance Disclosure

**Document type**: Conflict-of-interest and routing transparency disclosure  
**Audience**: Institutional users, compliance reviewers, due diligence  
**Last Updated**: 2026-05-19

---

## 1. What Arsenal Is (and Is Not) as a Routing Layer

Arsenal is a **skill catalog and execution layer** — not an order-flow routing engine.

When an agent calls Arsenal to execute a DeFi operation (e.g., a swap on Uniswap), it specifies the protocol by selecting a skill (`skill_id`). Arsenal executes that specific skill against that specific protocol. Arsenal does **not**:

- Route between multiple protocols to find best execution
- Compare quotes across protocols automatically
- Select the "best" protocol on the agent's behalf

The agent (or the user behind it) decides which skill to call. Arsenal's role ends at execution.

**Analogy**: Arsenal is a library of protocol adapters. The agent is the router. This is the same model as calling a protocol SDK directly — Arsenal provides the SDK interface, the caller decides which protocol to use.

---

## 2. Skill Ranking & Discovery — Disclosed Ranking Signals

When an agent uses Arsenal's **semantic search** to discover skills, the ranking algorithm applies the following signals (in order of influence):

| Signal | Description | Disclosed |
|--------|-------------|-----------|
| Semantic relevance | Vector similarity between query and skill description (Qwen embeddings) | ✅ |
| `partner_verified` flag | Skills marked `partner_verified: true` are weighted higher | ✅ |
| Category / tag match | Exact category or tag matches boost relevance | ✅ |
| Rating | User rating (1–5) influences ranking | ✅ |
| Recency | Recently added skills get a small boost | ✅ |

### `partner_verified` weighting — conflict-of-interest disclosure

Skills marked `partner_verified` are ranked higher in search results. This flag is set when a protocol team has a formal partnership with Sumplus. The weighting is intentional and **disclosed here** as a commercial ranking signal.

**Mitigation**:
- The `partner_verified` field is visible on every skill's public API response — agents and users can inspect it
- Non-partner skills are not excluded from results; they appear below partner skills for equivalent queries
- Arsenal does not sell "sponsored placement" separate from the `partner_verified` partnership track

---

## 3. Revenue Model

| Revenue source | Description | Conflict risk |
|---------------|-------------|---------------|
| x402 skill fees | Agent pays per-execution for `is_paid: true` skills (USDC on Base) | Arsenal sets the price on its own paid skills; disclosed in skill metadata |
| Partnership fees | Protocol teams may pay Sumplus for `partner_verified` status | Influences search ranking (disclosed above) |
| Kickback / rebate from protocols | None. Arsenal does not receive volume-based fees from any downstream protocol | N/A |
| Dynamic fees | Arsenal does not apply dynamic or variable fees on top of protocol fees | N/A |

Arsenal does **not** take a spread, slippage fee, or referral fee from protocol execution. For swap skills, the agent receives the raw protocol quote; Arsenal does not adjust it.

---

## 4. Order-Flow Practices

| Practice | Arsenal's position |
|----------|-------------------|
| Payment for order flow | Not applicable — Arsenal does not route orders between competing venues |
| Front-running protection | Not applicable — Arsenal does not hold or observe pending transactions |
| MEV extraction | Not applicable — Arsenal does not submit transactions (agents submit) |
| Dark pool routing | Not applicable |

Because Arsenal returns ready-to-sign transaction payloads and never submits transactions itself, it has no ability to front-run, extract MEV, or route order flow to preferred venues.

---

## 5. Audit & Transparency

- **Skill metadata** (including `partner_verified`, `is_paid`, `price`) is publicly readable via `GET /api/skills/{id}` — no auth required
- **Search ranking signals** are described in this document; no additional hidden signals exist
- **Execution logs**: Arsenal logs skill executions (skill_id, timestamp, success/fail) associated with the API key. Institutional users can request log exports for audit purposes
- **Source code**: Arsenal's skill executor routing (`src/lib/skill-executors.ts`) is reviewable — each skill routes to a deterministic implementation with no probabilistic routing

---

## 6. Regulatory Status

Arsenal is infrastructure software, not a financial intermediary. It does not:
- Hold or manage client funds
- Provide investment advice or recommendations
- Execute trades on behalf of users (agents submit their own transactions)

Compliance with applicable regulations (AML, KYC, securities law) is the responsibility of the agent operator and the underlying protocols, not Arsenal.

---

## Contact

For compliance questions or institutional due diligence requests: contact Sumplus via `https://sumplus.xyz`.
