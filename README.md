# Sumplus Arsenal

Arsenal is a **DeFi execution layer for AI agents**. It provides a unified API to search, discover, and execute on-chain operations across multiple blockchains — from swapping tokens on Uniswap to lending on AAVE to perpetuals on Hyperliquid.

Agents interact through REST, MCP (Model Context Protocol), or OpenAI Function Calling. Arsenal handles the blockchain complexity: ABI encoding, RPC calls, liquidity routing, and transaction construction. The agent receives ready-to-sign transactions.

**Production URL**: `https://arsenal.sumplus.xyz`

---

## What Arsenal Does

1. **Search** — semantic search across 20+ DeFi skills using natural language
2. **Quote** — get live on-chain quotes (real RPC calls, no mock data)
3. **Build** — receive signed-ready transaction objects for any supported operation
4. **Sign & Submit** — the agent or user signs and submits (Arsenal never holds keys)

Arsenal does **not** hold private keys or submit transactions. It returns transaction payloads that the caller signs.

---

## Casper Innovation Track: AgentGuard

Casper AgentGuard adds a Casper Testnet audit rail for Sumplus' agent stack:

```text
Maria proposes an action -> SafeRouter/Arsenal gates policy -> Casper records hashes
```

The MVP does not custody funds or execute swaps on Casper. It records verifiable
policy, proposal, decision, and receipt hashes so reviewers can inspect the
agent trail on Casper Testnet.

| Component | Role |
|-----------|------|
| Maria | Agent UX and intent source |
| Arsenal | Skill discovery, hash generation, Casper RPC reads, and `casper-client` command generation |
| SafeRouter | Policy boundary and safe execution framing |
| Casper AgentGuard | Casper smart contract registry for policy/proposal/decision/receipt hashes |

Reviewer entry points:

- Skill: `Casper AgentGuard`
- Skill ID: `88c60a3a-6608-4449-9e47-3b8d99120917`
- Contract: `contracts/casper-agentguard`
- Playbook: `docs/casper-agentguard-buildathon-playbook.md`
- Network: Casper Testnet (`casper-test`)
- Default node: `https://node.testnet.casper.network/rpc`

Casper Testnet deployment:

- Package hash: `contract-package-311322bc20957e39646d038e904b9da3928159f74d061791b193a6005adbd1e7`
- Contract hash: `contract-651e6d7e7438c2a66bd85729c3eae7d76825ad9168b72d91d3eff36f092266dc`
- Install deploy: `65db20cff1929aa18febf6b2e897c46c5f867c8636d653a458f9fb5bb8408291`
- `register_policy`: `7304d13f2d78bed2746cfcf64ad9f9558a8115fa1080987d7591c96772a59f6d`
- `submit_proposal`: `222d2ce57c504a936c9f8471a69acc327ba4be42d941ed268a213c5962a8bb23`
- `record_decision`: `7eecd3233248aee3e43e1dc6d1cdeddd59ffb6cdf9bc30b6a612db8b3d4302bf`
- `record_receipt`: `fe673ce1d91cdaa8d3790212b9ec8b1ba234cc005bb21b61730f6642d53346f4`

Local verification:

```bash
# Build the Casper AgentGuard Wasm contract
cd contracts/casper-agentguard
make build-contract

# Run the Arsenal skill smoke test
cd ../..
npx ts-node --transpile-only -P scripts/tsconfig.json -r tsconfig-paths/register \
  -e "import { executeCasperAgentGuardSkill } from './src/skills/casper-agentguard';
  executeCasperAgentGuardSkill({ action: 'build_agent_receipt', agent_id: 'maria-demo', action_name: 'grant_payout.review', policy: { requires_human_approval: true }, proposal: { amount_usd: 1200 }, decision: { allow: true }, receipt: { status: 'record_only' } }).then(console.log);"
```

For final BUIDL review, copy the package hash and sample Testnet deploy hashes
above to the BUIDL page.

---

## Supported Chains & Skills

### EVM Chains

| Skill | Chain | Actions |
|-------|-------|---------|
| Uniswap V3 | Ethereum, Optimism, Arbitrum, Base, Polygon | `get_quote`, `build_swap_tx` |
| Velodrome V2 | Optimism | `get_quote`, `build_swap_tx` |
| PancakeSwap V3 | BSC (BNB Smart Chain) | `get_quote`, `build_swap_tx` |
| AAVE V3 | Ethereum, Optimism, Arbitrum, Base, Polygon | `get_market_data`, `build_supply_tx`, `build_borrow_tx` |
| GMX V2 | Arbitrum, Avalanche | Perpetual positions |

### Solana

| Skill | Actions |
|-------|---------|
| Jupiter | `jupiter_get_quote`, `build_swap_tx` |
| Raydium | AMM swaps and liquidity |

### Sui

| Skill | Actions |
|-------|---------|
| Cetus CLMM | `get_swap_quote`, `build_swap_tx` |
| Aftermath Finance | DEX aggregator swaps |
| NAVI Protocol | Lending & borrowing |
| Scallop | Money market |
| Suilend | Lending protocol |
| Talus Nexus | Cross-chain operations |
| Ika dWallet | Programmable wallet |
| SUI Blockchain | Native SUI queries |

### Cross-Platform

| Skill | Description |
|-------|-------------|
| Casper AgentGuard | Casper Testnet policy and receipt anchoring for AI-agent audit trails |
| Hyperliquid | Perpetual futures (L1) |
| dYdX | Decentralized perpetuals |
| Polymarket | Prediction market |
| Crypto Wallet | Multi-chain wallet queries |
| Sumplus Yield | Sumplus yield products |
| Weex | CEX integration |

---

## Quick Start

### REST API

```bash
# 1. Search for a skill
curl "https://arsenal.sumplus.xyz/api/skills?search=swap+usdc+on+optimism"

# 2. Get a quote
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "<velodrome-uuid>",
    "input": {
      "action": "get_quote",
      "tokenIn": "ETH",
      "tokenOut": "USDC",
      "amountIn": "0.1"
    }
  }'

# 3. Build a transaction
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "<velodrome-uuid>",
    "input": {
      "action": "build_swap_tx",
      "tokenIn": "ETH",
      "tokenOut": "USDC",
      "amountIn": "0.1",
      "sender": "0xYourWalletAddress"
    }
  }'
```

### MCP (Claude / AI Agents)

Configure Arsenal as an MCP server in `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "arsenal": {
      "command": "npx",
      "args": ["-y", "arsenal-mcp"],
      "env": { "ARSENAL_API_URL": "https://arsenal.sumplus.xyz" }
    }
  }
}
```

MCP tools available: `searchSkills`, `getSkill`, `executeSkill`, `getCategories`

---

## Transaction Format

### EVM (Ethereum, Optimism, BSC, Arbitrum, Base, Polygon)

Arsenal returns an array of transactions to sign in order. Each transaction:

```json
{
  "to": "0xContractAddress",
  "data": "0xEncodedCalldata",
  "value": "0x0",
  "description": "Swap 0.1 ETH for at least 243.5 USDC via Velodrome V2"
}
```

- `value` is always a hex string (e.g. `"0x16345785d8a0000"` for native token swaps, `"0x0"` for ERC-20 only)
- When an ERC-20 approval is needed, an `approve` tx is prepended automatically
- No `gas` field — estimating gas is the caller's responsibility
- `description` is human-readable, safe to display to users

### Solana

```json
{
  "transaction": "<base64 serialized VersionedTransaction>"
}
```

Pass `transaction` directly to Privy `sendTransaction` or sign with your Solana keypair.

---

## Execute Response Format

```json
{
  "success": true,
  "result": { ... },
  "output": { ... },
  "skill_id": "uuid",
  "execution_time_ms": 180
}
```

`result` and `output` contain identical data. Both keys are present for compatibility.

### Quote responses include `_operation`

All swap quote actions include an `_operation` field for downstream routing:

```json
{
  "amount_in": "0.1",
  "amount_out": "243.52",
  "price_impact": "0.05%",
  "_operation": "velodrome_swap"
}
```

| Skill | `_operation` value |
|-------|-------------------|
| Uniswap V3 | `uniswap_swap` |
| Velodrome V2 | `velodrome_swap` |
| PancakeSwap V3 | `pancakeswap_swap` |
| Jupiter | `jupiter_swap` |
| Cetus | `cetus_swap` |

---

## Parameter Conventions

All skills use consistent parameter names:

| Parameter | Description |
|-----------|-------------|
| `sender` | Wallet address initiating the transaction (EVM: `0x...`, Solana: base58) |
| `token_in` / `tokenIn` | Input token (symbol or contract address) |
| `token_out` / `tokenOut` | Output token (symbol or contract address) |
| `amount_in` | Human-readable input amount (e.g. `"0.1"` for 0.1 ETH) |
| `slippage` | Max slippage as decimal (e.g. `0.01` = 1%) |
| `action` | Which action to invoke within a skill |

Note: Use `sender`, not `recipient`. Arsenal builds transactions from the sender's perspective.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js, App Router, TypeScript |
| Database | Supabase (PostgreSQL + pgvector) |
| Semantic search | Qwen `text-embedding-v4` + hybrid keyword rerank |
| RPC | Alchemy (EVM) + public fallbacks |
| Skill execution | In-process TypeScript (no sandbox) |
| Auth | Supabase Auth + API keys |
| Deployment | Vercel |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/skills` | GET | Search and list skills |
| `/api/skills/:id` | GET | Get skill details and schema |
| `/api/execute` | POST | Execute a skill action |
| `/api/categories` | GET | List skill categories |
| `/api/functions` | GET | OpenAI-compatible function definitions |
| `/api/functions/execute` | POST | Execute by function name |
| `/api/router` | POST | Unified agent interface (search/get/execute) |
| `/mcp` | POST | MCP protocol endpoint |

See [API.md](./API.md) for full reference.

---

## Development Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Fill in: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#          OPENAI_API_KEY (Aliyun DashScope), ALCHEMY_API_KEY

# Start dev server
npm run dev
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design and [SKILL_DEV_GUIDE.md](./SKILL_DEV_GUIDE.md) for adding new skills.

---

## License

MIT — Sumplus
