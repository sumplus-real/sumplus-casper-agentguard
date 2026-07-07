# x402 Compatibility & Canton 402 Settlement Extension

## Overview

Arsenal supports the **x402 payment protocol** at the API layer (EVM/USDC today) and is building **Canton 402** — a settlement-layer extension of x402 that uses Canton Coin (CC) as the settlement asset on the Canton Global Synchronizer.

The two are related but distinct:

| | x402 (EVM) | Canton 402 (Planned) |
|--|---|---|
| Protocol | x402 spec | x402-compatible (same header format) |
| Settlement asset | USDC | Canton Coin (CC) |
| Settlement layer | Base / Avalanche (EVM) | Canton Global Synchronizer |
| Privacy | Public on-chain | Sub-transaction privacy (parties see only their leg) |
| Facilitator | Coinbase x402 facilitator | Canton-native facilitator (planned) |
| Status | Implemented | Phase 3 roadmap |

---

## Part 1 — x402 (EVM): Current Implementation

### How it works

When an agent calls `/api/execute` on a paid skill (skills with `is_paid: true`):

1. If no `X-Payment` header is present, Arsenal returns **HTTP 402** with payment requirements:

```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "100000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "<arsenal-wallet>",
    "maxTimeoutSeconds": 60,
    "resource": "https://arsenal.sumplus.xyz/api/execute",
    "description": "Access to Sumplus skill: <skill-name>",
    "mimeType": "application/json"
  }]
}
```

2. The agent pays on-chain and retries with the `X-Payment` header containing the signed payment proof.

3. Arsenal calls the Coinbase x402 facilitator (`https://x402.org/facilitator/verify`) to verify the on-chain payment without Arsenal needing a local RPC or wallet.

4. On successful verification, Arsenal executes the skill and calls `/settle` on the facilitator.

### Supported networks

| Network | USDC Address |
|---------|-------------|
| Base (mainnet) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia (testnet) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Avalanche (mainnet) | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6` |
| Avalanche Fuji (testnet) | `0x5425890298aed601595a70AB815c96711a31Bc65` |

### Current status

- Protocol implementation: complete (`src/lib/x402.ts`)
- API integration: complete (`src/app/api/execute/route.ts`)
- Paid skills: `sumplus-yield` (1 skill currently; x402 gate activates for any `is_paid: true` skill)
- Wallet configuration: `X402_PAYMENT_RECIPIENT` env var required; testnet operational, mainnet pending final wallet setup

---

## Part 2 — Canton 402: Settlement Extension (Phase 3)

### Why Canton 402, not just x402?

x402 with USDC works for EVM-native agents. Canton 402 adds:

1. **Regulated asset flows** — Institutions operating on Canton require settlement in regulated instruments (CC or tokenized assets), not permissionless stablecoins
2. **Sub-transaction privacy** — Canton's DAML contract model means only the payer and Arsenal see the payment leg; it is not publicly visible on a transparent chain
3. **Party-aware settlement** — Canton's Global Synchronizer can enforce multi-party conditions natively (e.g., "payment clears only if execution succeeds"), without requiring a separate escrow contract
4. **Institutional counterparty** — Five North and other Canton Super Validators are institutional operators; CC-denominated settlement fits their compliance model

### Protocol compatibility

Canton 402 is **x402-compatible at the protocol level**:
- Same HTTP 402 response format (`x402Version`, `accepts` array)
- Same `X-Payment` header mechanism
- Callers that understand x402 can route to Canton 402 by inspecting the `network` field (`"canton-global-synchronizer"` instead of `"base"`)

### Architecture (planned)

```
Agent
  │
  │  POST /api/execute  →  HTTP 402 (Canton payment requirements)
  │                         network: "canton-global-synchronizer"
  │                         asset: Canton Coin (CC) contract ID
  │
  │  [Agent pays CC on Canton Global Synchronizer]
  │
  │  POST /api/execute  (with X-Payment: <canton-proof>)
  │
Arsenal
  │
  ├── Canton Facilitator (verify CC payment on Global Synchronizer)
  ├── Skill execution
  └── Canton Facilitator (settle)
```

### Milestone

Canton 402 is scoped to **Phase 3**. It is not implemented today. The dependency chain:
1. Canton wallet / SDK integration for Arsenal backend
2. Canton facilitator — either a Splice-native facilitator or a custom one in partnership with Five North / Digital Asset
3. Skill execution on Canton (currently read-only; execution requires DAML contract calls)

---

## Summary for External Reviewers

- **"Does Arsenal support x402?"** — Yes, EVM (USDC/Base) is implemented. Framework live, 1 paid skill today.
- **"Does Arsenal support Canton 402?"** — Not yet implemented; designed as Phase 3 settlement extension using Canton Coin, x402-protocol-compatible.
- **"Why not just use x402 for Canton?"** — x402 specifies the HTTP protocol; Canton 402 is the settlement layer — they are complementary. The protocol is the same; the settlement asset and chain differ.
