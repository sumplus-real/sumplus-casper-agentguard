# Casper AgentGuard Buildathon Playbook

Casper AgentGuard is the Casper Innovation Track path for Sumplus' agent stack.
The demo claim is simple: Maria can propose an action, Arsenal can hash the
policy/proposal/decision/receipt trail, and Casper Testnet can store the
verifiable audit trail.

This playbook is for DoraHacks/BUIDL reviewers. It is intentionally procedural.

## Reviewer Scope

- Skill: `Casper AgentGuard`
- Skill ID: `88c60a3a-6608-4449-9e47-3b8d99120917`
- Network: Casper Testnet
- Chain name: `casper-test`
- Default node: `https://node.testnet.casper.network/rpc`
- Explorer: `https://testnet.cspr.live`
- Safety boundary: the skill does not move funds; it only reads chain state,
  builds receipt hashes, generates `casper-client` commands, and verifies deploys.

## Test Story

1. Maria proposes an automated grant-payout review.
2. Arsenal creates deterministic hashes for the policy, proposal, decision, and
   execution receipt.
3. The AgentGuard registry contract records those hashes on Casper Testnet.
4. A reviewer verifies the package hash and deploy hashes on the Casper explorer.

## Local Prerequisites

Install the Casper CLI tools on the machine that will deploy the contract:

```bash
rustup toolchain install nightly-2025-03-01 --profile minimal --target wasm32-unknown-unknown
rustup component add rust-src --toolchain nightly-2025-03-01
cargo install casper-client
```

The deploying Casper Testnet account needs test CSPR from the faucet:

```text
https://testnet.cspr.live/tools/faucet
```

Casper 2.0 introduces the Transaction model and deprecates Deploys, but the
current Testnet flow still accepts valid deploys. This MVP uses
`casper-client put-deploy` because it is the fastest reproducible review path.

## Arsenal Skill Calls

### 1. Inspect Casper Testnet

```json
{
  "action": "get_chain_info"
}
```

Expected result: Casper Testnet metadata, default node URL, explorer URL, and
tooling notes.

### 2. Confirm Live Node Access

```json
{
  "action": "get_node_status"
}
```

Expected result: JSON-RPC status from the configured Casper Testnet node.

### 3. Build an Agent Receipt

```json
{
  "action": "build_agent_receipt",
  "agent_id": "maria-casper-demo",
  "action_name": "grant_payout.review",
  "policy": {
    "allowed_actions": ["grant_payout.review"],
    "max_amount_usd": 5000,
    "requires_human_approval": true
  },
  "proposal": {
    "recipient": "demo_builder",
    "amount_usd": 1200,
    "reason": "milestone passed"
  },
  "decision": {
    "allow": true,
    "approved_by": "demo_reviewer"
  },
  "receipt": {
    "status": "record_only",
    "execution": "no_funds_moved"
  },
  "external_ref": "dorahacks-casper-innovation-track"
}
```

Expected result: `policy_hash`, `proposal_hash`, `decision_hash`,
`receipt_hash`, and `metadata_hash`.

### 4. Build the Contract Install Command

```json
{
  "action": "build_install_command",
  "secret_key_path": "/path/to/secret_key.pem",
  "session_path": "contracts/casper-agentguard/contract/target/wasm32-unknown-unknown/release/casper_agentguard.wasm"
}
```

Run the returned `casper-client put-deploy` command from a funded Casper Testnet
account. Record the returned deploy hash.

### 5. Add Contract Package Hash

After the install deploy executes, read the installing account's named keys and
copy the AgentGuard contract package hash. Add it to the BUIDL page.

Required BUIDL field:

```text
Casper AgentGuard package hash: contract-package-311322bc20957e39646d038e904b9da3928159f74d061791b193a6005adbd1e7
```

### 6. Build Registry Calls

Use the package hash from step 5. Repeat for each entry point:

```json
{
  "action": "build_registry_call",
  "package_hash": "contract-package-311322bc20957e39646d038e904b9da3928159f74d061791b193a6005adbd1e7",
  "entry_point": "register_policy",
  "secret_key_path": "/path/to/secret_key.pem",
  "agent_id": "maria-casper-demo",
  "policy_hash": "<POLICY_HASH>",
  "metadata_hash": "<METADATA_HASH>",
  "external_ref": "dorahacks-casper-innovation-track"
}
```

Then call:

- `submit_proposal`
- `record_decision`
- `record_receipt`

Run each returned command and record each deploy hash.

### 7. Verify Deploys

```json
{
  "action": "get_deploy_status",
  "deploy_hash": "<DEPLOY_HASH>"
}
```

Expected result: deploy status plus explorer URL.

## BUIDL Page Checklist

- Public GitHub repo with description, website, and topics:
  `casper-blockchain`, `casper-network`, `buildathon`, `agentic-ai`,
  `ai-agent`, `sumplus`
- README explains Maria + Arsenal + SafeRouter + Casper AgentGuard flow.
- Contract package hash is listed.
- Sample Casper Testnet deploy hashes are listed with descriptions:
  `install`, `register_policy`, `submit_proposal`, `record_decision`,
  `record_receipt`.
- Demo video or this playbook is linked.
- CodeQL, Dependabot alerts, and CI/security tooling are enabled.
- High-severity security alerts are fixed or documented as resolved.

## Current Implementation Status

- Arsenal skill implementation: complete.
- Arsenal executor routing: complete.
- Schema registry source: complete.
- Reviewer playbook: complete.
- Casper contract implementation: complete.
- Casper contract local build: complete.
- `casper-client` CLI validation: complete.
- High-or-greater npm audit findings: resolved locally.
- Casper Testnet deployment: complete.
- Casper Testnet registry sample calls: complete.
- Casper Testnet dictionary readback verification: complete.

## Current Local Verification

```bash
cd contracts/casper-agentguard
make build-contract
```

Expected Wasm:

```text
contract/target/wasm32-unknown-unknown/release/casper_agentguard.wasm
```

```bash
casper-client get-node-status --node-address https://node.testnet.casper.network/rpc
npm audit --audit-level=high
```

Both commands should succeed. The local environment used for this playbook
validated `casper-client 5.0.1` and Casper Testnet `api_version: 2.0.0`.

## Verified Casper Testnet Deployment

- Package hash: `contract-package-311322bc20957e39646d038e904b9da3928159f74d061791b193a6005adbd1e7`
- Raw package hash for `casper-client`: `311322bc20957e39646d038e904b9da3928159f74d061791b193a6005adbd1e7`
- Contract hash: `contract-651e6d7e7438c2a66bd85729c3eae7d76825ad9168b72d91d3eff36f092266dc`
- Account: `01fc48d11d75606d007c83820ae0b220056946662b0d7c44fc64801132a8de2725`

Sample receipt hashes:

- `policy_hash`: `b72fac159de3e74b798fd0e84613751ad448aae871aa3e04a28f28b6f74c78de`
- `proposal_hash`: `ca61f2b1d2173e5e3d9642676674b5ec679d7994944d84271b0131cc1fb9383e`
- `decision_hash`: `3ecc890bd785dcca48299db5d7c95deafe30fdf94e9f5e761a3d38b90d57f761`
- `receipt_hash`: `b74db64a197581f85f2b6e5e521642e5a43370b82e2742d4aaa5e2580e9f642c`
- `metadata_hash`: `859d5ca700ccd9cb81002e20368afe102d116a992518d8ff75757f49cd3355b4`

Sample deploy hashes:

- `install`: `65db20cff1929aa18febf6b2e897c46c5f867c8636d653a458f9fb5bb8408291`
- `register_policy`: `7304d13f2d78bed2746cfcf64ad9f9558a8115fa1080987d7591c96772a59f6d`
- `submit_proposal`: `222d2ce57c504a936c9f8471a69acc327ba4be42d941ed268a213c5962a8bb23`
- `record_decision`: `7eecd3233248aee3e43e1dc6d1cdeddd59ffb6cdf9bc30b6a612db8b3d4302bf`
- `record_receipt`: `fe673ce1d91cdaa8d3790212b9ec8b1ba234cc005bb21b61730f6642d53346f4`

State readback was verified from the deployed contract dictionaries:

- `policies`: keyed by `policy_hash`
- `proposals`: keyed by `proposal_hash`
- `decisions`: keyed by `proposal_hash`
- `receipts`: keyed by `proposal_hash`

## BUIDL Page Copy Block

```text
Casper AgentGuard package hash: contract-package-311322bc20957e39646d038e904b9da3928159f74d061791b193a6005adbd1e7
Casper AgentGuard contract hash: contract-651e6d7e7438c2a66bd85729c3eae7d76825ad9168b72d91d3eff36f092266dc

Sample Casper Testnet transactions:
- install: 65db20cff1929aa18febf6b2e897c46c5f867c8636d653a458f9fb5bb8408291 - installs the AgentGuard registry contract package.
- register_policy: 7304d13f2d78bed2746cfcf64ad9f9558a8115fa1080987d7591c96772a59f6d - records Maria/SafeRouter policy hash.
- submit_proposal: 222d2ce57c504a936c9f8471a69acc327ba4be42d941ed268a213c5962a8bb23 - records the agent proposal hash.
- record_decision: 7eecd3233248aee3e43e1dc6d1cdeddd59ffb6cdf9bc30b6a612db8b3d4302bf - records the policy decision hash.
- record_receipt: fe673ce1d91cdaa8d3790212b9ec8b1ba234cc005bb21b61730f6642d53346f4 - records the final execution receipt hash.

Testing playbook:
docs/casper-agentguard-buildathon-playbook.md
```
