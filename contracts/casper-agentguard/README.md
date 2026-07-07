# Casper AgentGuard Contract

AgentGuard is a small Casper Testnet registry for AI-agent audit trails.

It stores four record families in Casper dictionaries:

- `policies`: policy hashes registered by an agent.
- `proposals`: action proposals bound to a policy hash.
- `decisions`: policy decisions for a proposal hash.
- `receipts`: execution receipts for a proposal and decision hash.

The contract stores hashes and external references only. It does not custody or
move funds.

## Entry Points

| Entry point | Required args |
|---|---|
| `register_policy` | `agent_id`, `policy_hash`, `metadata_hash`, `external_ref` |
| `submit_proposal` | `agent_id`, `action_name`, `policy_hash`, `proposal_hash`, `external_ref` |
| `record_decision` | `agent_id`, `proposal_hash`, `decision_hash`, `external_ref` |
| `record_receipt` | `agent_id`, `proposal_hash`, `decision_hash`, `receipt_hash`, `external_ref` |

## Build

```bash
rustup toolchain install nightly-2025-03-01 --profile minimal --target wasm32-unknown-unknown
rustup component add rust-src --toolchain nightly-2025-03-01
make prepare
make build-contract
```

The Wasm output is:

```text
contract/target/wasm32-unknown-unknown/release/casper_agentguard.wasm
```

## Install

Use the Arsenal `Casper AgentGuard` skill action `build_install_command`, or run
the generated `casper-client put-deploy` command manually.

The verified Casper Testnet install used `150000000000` motes payment.

## Review Notes

Casper 2.0 recommends the Transaction model for new integrations. This MVP keeps
the `put-deploy` flow because it remains accepted on Testnet and is the fastest
reproducible path for final-round reviewers.

The contract builds with:

- `casper-contract = "5.1.1"`
- `casper-types = "6.1.0"`
- `nightly-2025-03-01`
- `-Z build-std=core,alloc`

The `build-std` flag is required so Rust `core`/`alloc` are rebuilt without
Wasm bulk-memory operations. Casper Testnet rejects Wasm that advertises
`+bulk-memory`.
