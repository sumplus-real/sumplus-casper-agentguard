# Sumplus Arsenal

Arsenal is Sumplus's DeFi execution layer for AI agents. It exposes 20+ blockchain protocol skills through a unified API — agents discover skills, call them with structured parameters, and receive real on-chain data or ready-to-sign transactions in return.

**Base URL:** `https://arsenal.sumplus.xyz`

---

## How Skills Work

Arsenal skills are **server-side TypeScript executors**, not text prompts.

```
Agent                    Arsenal                        Blockchain / Protocol
  │                         │                                    │
  ├── reads schema ─────────►│                                    │
  │   (knows param names)   │                                    │
  │                         │                                    │
  ├── POST /api/execute ────►│── calls RPC / SDK ───────────────►│
  │                         │◄── on-chain data / tx ────────────┤
  │◄── result ──────────────┤                                    │
```

**Two layers, two jobs:**

| Layer | What it is | Who reads it |
|---|---|---|
| **Schema** (in Supabase DB) | Interface contract — param names, types, required fields | Agent reads this to know what to send |
| **Executor** (TypeScript on server) | Makes RPC calls, invokes protocol SDKs, builds transactions | Runs server-side; agent never sees the code |

**Why code, not text prompts:**
- Real-time on-chain data (balances, APYs, positions) can only be fetched by executable code
- Transaction construction (building PTBs, encoding calldata) is computation, not description
- Deterministic input validation before anything touches the chain
- Credentials and RPC keys stay server-side; agents receive only the result

**RPC resilience.** Every chain's RPC endpoints live in one registry (`src/lib/rpc.ts`) as an ordered list (env override → Alchemy → public providers). Skills build clients via `getPublicClient(chainKey)`, which uses viem's `fallback` transport to automatically try the next provider when one fails. A single public provider going dark is a non-event; replace or reorder endpoints in one place.

---

## Health & Status

`GET /api/health` returns live status of every external dependency: each chain's keyless public RPC endpoints (probed with `eth_blockNumber`, with latency + head block) and the region-safe data APIs. Results are cached ~45s.

- `?refresh=1` bypasses the cache and probes fresh.
- `?alert=1` (used by the scheduled health check) posts to `HEALTH_ALERT_WEBHOOK` when a chain has **all** providers down or a critical API is down.
- Per-chain status is `ok` (all providers up), `degraded` (at least one up), or `down` (all down). The Alchemy URL (which embeds the key) is never probed or returned.

Human-readable view: **`/status`** (linked in the navbar).

**Health is also surfaced in the catalog.** `GET /api/skills` annotates each skill with a `health` field so an agent can route around a degraded chain at selection time:

```json
{
  "id": "a3f8c201-...",
  "name": "HSKSwap",
  "tags": ["hashkeychain", "dex", "swap"],
  "health": {
    "status": "degraded",                              // ok | degraded | down (worst of its chains)
    "chains": [{ "key": "hashkey", "label": "HashKey Chain", "status": "degraded" }]
  }
}
```

`health` is `null` for skills on chains Arsenal does not RPC-probe (e.g. Sui, Solana). The value reuses the same cached probe as `/api/health`, so listing isn't slowed.

---

## Authentication

Browsing skills is public. Execution requires a Bearer token.

```bash
# Get API key (recommended for agents — does not expire)
POST /api/auth/signup
{ "email": "agent@example.com", "password": "...", "role": "agent" }

POST /api/auth/apikey   # requires JWT auth
→ { "api_key": "sk_live_..." }

# Use in all requests
Authorization: Bearer sk_live_...
```

---

## Skills

### Submit a skill

```
POST /api/skills
Authorization: Bearer <api_key>
Content-Type: application/json
```

**Required fields:**

| Field | Type | Constraints |
|---|---|---|
| `name` | string | 1–100 chars |
| `description` | string | 10–2000 chars |
| `category` | string | e.g. `Blockchain`, `Finance`, `AI/ML`, `SOP` |
| `schema` | object | Must have `input` and `output` keys (see below) |

**Optional fields:**

| Field | Type | Default | Notes |
|---|---|---|---|
| `tags` | string[] | `[]` | e.g. `["sui", "dex"]` |
| `version` | string | `"1.0.0"` | Semver |
| `usage_examples` | any[] | `[]` | |
| `is_paid` | boolean | `false` | |
| `price` | number | — | Required if `is_paid: true` |
| `skill_md` | string | — | Full skill doc in Markdown |
| `code` | string | — | Executor source (if submitting code) |
| `features` | string[] | — | `"code-execution"` \| `"network-access"` \| `"mcp-tools"` \| `"web3-wallet"` \| `"payment-proof"` |
| `references` | `{filename, content, description?}[]` | — | Supporting files |
| `scripts` | `{filename, content, language, description?}[]` | — | Runnable scripts |

**Minimal example (SOP skill):**

```json
{
  "name": "Tempo SOP",
  "description": "Standard operating procedure for Tempo protocol interactions on Sui",
  "category": "SOP",
  "tags": ["sui", "sop", "tempo"],
  "schema": {
    "input": {
      "action": { "type": "string", "required": true },
      "sender": { "type": "string", "description": "64-hex Sui address" }
    },
    "output": {
      "result": { "type": "object" }
    }
  },
  "skill_md": "# Tempo SOP\n\n## Actions\n..."
}
```

**Success (201):**
```json
{ "skill": { "id": "uuid", "name": "Tempo SOP", "status": "approved", ... } }
```

**Validation error (400):**
```json
{
  "error": "Validation failed",
  "details": {
    "fieldErrors": {
      "description": ["String must contain at least 10 character(s)"],
      "schema": ["Required"]
    }
  }
}
```

**Common mistakes:**
- `schema` must be `{ "input": {...}, "output": {...} }` — not a flat object, not a string
- `description` must be ≥ 10 chars — a one-liner is fine, but can't be empty
- Auth header must be `Authorization: Bearer <token>` — not `X-API-Key` or query param

---

### List skills

```
GET /api/skills
```

| Param | Type | Description |
|---|---|---|
| `search` | string | Semantic search (vector + keyword hybrid) |
| `category` | string | Filter: `Blockchain`, `Finance`, `AI/ML` |
| `tags` | string | Comma-separated tag filter, e.g. `clarity-act` or `btc,rwa` |
| `sort` | string | `created_at` \| `rating_avg` \| `usage_count` \| `name` |
| `limit` | int | Default 20, max 100 |
| `page` | int | Default 1 |

```json
{
  "skills": [
    {
      "id": "uuid",
      "name": "Cetus CLMM",
      "description": "...",
      "category": "Blockchain",
      "tags": ["sui", "dex", "clmm"],
      "schema": { ... },
      "is_paid": false,
      "rating_avg": 4.9,
      "usage_count": 3821,
      "similarity": 0.94
    }
  ],
  "total": 22,
  "page": 1,
  "limit": 20,
  "total_pages": 2
}
```

`similarity` only present when `search` is used.

### Get skill detail

```
GET /api/skills/:id
```

Returns full skill with `schema`, `ratings`, and `usage_count`.

### List categories

```
GET /api/categories
→ { "categories": ["Blockchain", "Finance", "AI/ML"], "count": 3 }
```

---

## Execute a Skill

```
POST /api/execute
Authorization: Bearer <api_key>
Content-Type: application/json

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

**Success (200)**
```json
{
  "success": true,
  "result": { ... },
  "skill_id": "uuid",
  "execution_time_ms": 180,
  "execution_id": "uuid"
}
```

**Execution failure (422)** — skill ran, but logical error (bad input, no pool, etc.)
```json
{
  "success": false,
  "error": "No pool found for WBTC→USDC on optimism at any fee tier",
  "skill_id": "uuid",
  "execution_time_ms": 95
}
```

500 is reserved for infrastructure errors only.

### Common input parameters

| Param | Description |
|---|---|
| `action` | Which action to invoke — always required |
| `sender` | Wallet address of the tx initiator. EVM: `0x...` (40 hex). Sui: `0x...` (64 hex). Never use `recipient`. |
| `tokenIn` / `token_in` | Input token — symbol (`ETH`, `USDC`) or contract address |
| `tokenOut` / `token_out` | Output token |
| `amountIn` / `amount_in` | Human-readable amount string (`"0.1"`, `"100"`) |
| `slippage` | Max slippage as decimal (`0.01` = 1%). Default: 0.01 |
| `chain` | Chain identifier — see per-skill docs |

---

## Response Formats

### Swap quote (all `get_quote` / `get_swap_quote` actions)

```json
{
  "amount_in": "0.1",
  "amount_out": "243.52",
  "price_impact": "0.04%",
  "fee": "0.3%",
  "_operation": "velodrome_swap"
}
```

`_operation` values: `uniswap_swap`, `velodrome_swap`, `pancakeswap_swap`, `jupiter_swap`, `cetus_swap`

### Build swap transaction — EVM

`build_swap_tx` on EVM skills returns an ordered array. Execute **in order** (approve must confirm before swap).

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
      "description": "Swap 0.1 WETH for at least 243.1 USDC via Velodrome V2"
    }
  ],
  "amount_out_estimated": "243.52",
  "amount_out_minimum": "241.1"
}
```

Field spec: `to` (checksummed hex), `data` (ABI-encoded calldata), `value` (hex string), `description` (human-readable). No `gas` field — caller estimates gas.

### Build swap transaction — Solana (Jupiter)

```json
{
  "transaction": "<base64 VersionedTransaction>",
  "amount_in": "0.1",
  "amount_out": "14.83",
  "slippage_bps": 50,
  "chain": "solana"
}
```

Pass `transaction` to Privy `sendTransaction` or sign with your Solana keypair.

### Build transaction — Sui

```json
{
  "tx_bytes": "<base64 PTB>",
  "instructions": ["Pass tx_bytes to Privy send_sui_transaction or any Sui wallet to sign and submit."]
}
```

---

## Available Skills

### Ethereum Mainnet (P0 — hosted executors, no API key required)

| Skill | ID | Actions |
|---|---|---|
| **Uniswap v3 Mainnet** | `0071eca9-…` | `quote_exact_input`, `quote_exact_output`, `swap_exact_input`, `swap_exact_output`, `wrap_eth`, `unwrap_weth` |
| **Uniswap V4 Mainnet** | `1df3d9de-…` | `get_protocol_info`, `get_pool_state`, `get_protocol_stats`, `get_hook_info`, `swap_exact_input` (native ETH → ERC20 only, via UniversalRouter's `V4_SWAP` command; no ERC20-input support yet) |
| **Aave v3 Mainnet** | `f60967ed-…` | `supply`, `withdraw`, `borrow`, `repay`, `set_collateral`, `get_user_account_data`, `get_reserve_data`, `flashloan` |
| **Compound V3 Mainnet** | `a1d4f7c2-…` | `get_market_info`, `get_user_position`, `supply`, `withdraw`, `claim_rewards` |
| **Balancer V2 Mainnet** | `c8b3e6a1-…` | `get_pool_tokens`, `get_swap_quote`, `build_swap_tx` |
| **Lido Mainnet** | `451f4e94-…` | `submit_eth`, `wrap_steth_to_wsteth`, `unwrap_wsteth_to_steth`, `preview_wrap`, `preview_unwrap`, `request_withdrawal_steth`, `request_withdrawal_wsteth`, `get_withdrawal_status`, `find_checkpoint_hints`, `claim_withdrawals_to`, `get_total_pooled_eth` |
| **Morpho Blue Mainnet** | `4ff80de4-…` | `list_metavaults`, `get_vault`, `get_position`, `get_market_params`, `deposit_to_vault`, `withdraw_from_vault`, `supply_collateral`, `withdraw_collateral`, `supply`, `withdraw`, `borrow`, `repay` |
| **Ethena Mainnet** | `193c7bb3-…` | `get_cooldown_duration`, `cooldown_status`, `preview_deposit`, `preview_redeem`, `stake_usde`, `cooldown_assets`, `cooldown_shares`, `unstake` |
| **Curve Read Mainnet** | `70ec462d-…` | `list_pools`, `get_pool`, `quote_exchange_multiple`, `get_virtual_price` |
| **Pendle v4 Mainnet** | `cc0d8e79-…` | `list_markets`, `get_market`, `get_asset_price`, `get_user_position`, `add_liquidity`, `remove_liquidity`, `swap_exact_pt`, `swap_exact_yt`, `swap_exact_sy`, `mint_sy`, `redeem_sy` |
| **1inch Mainnet** | `952bec77-…` | `quote`, `get_spender`, `get_allowance`, `build_swap_tx` |
| **Synthra** | `9e290aa4-…` | `get_quote`, `get_price`, `build_swap_tx` — SynRoute chain-abstracted DEX routing over Synthra V3 pools on Arc (5042002), Robinhood Chain (46630), Sepolia (11155111), all testnet. `build_swap_tx` returns ordered `transactions` (approve if needed + swap); Arc swaps get gas headroom (4M floor / 2x) because the native-USDC precompile under-estimates. Needs `SYNTHRA_API_KEY` server-side |
| **Fluid** | `6ea7a68b-…` | `get_vaults`, `get_vault`, `get_ftokens`, `supply_lend`, `withdraw_lend`, `supply_collateral`, `withdraw_collateral`, `borrow`, `payback` — Instadapp lending (fToken ERC-4626 lend + Vault `operate` NFT positions); data from `api.fluid.instadapp.io`, also reads Arbitrum/Base via `chain`. Pass `nft_id` 0 to open a new borrow position |
| **Euler v2 Mainnet** | `e6264a67-…` | `get_vaults`, `get_vault`, `deposit`, `withdraw`, `borrow`, `repay`, `enable_collateral`, `enable_controller` — modular lending (Euler Vault Kit); one EVault per market, so actions take a `vault` address. Data from the Euler v2 Goldsky subgraph; `borrow` emits EVC enableCollateral + enableController + EVault.borrow |
| **Sky Protocol** | `ee216675-…` | `get_protocol_info`, `get_ssr_rate`, `get_usds_stats`, `get_spark_stats` — MakerDAO rebrand (USDS/sUSDS, Sky Savings Rate, Spark); read-only stats |
| **EtherFi** | `e0f74451-…` | `get_protocol_info`, `get_eeth_stats`, `get_exchange_rate`, `get_token_balance` — liquid restaking (eETH/weETH); read-only stats |
| **Ondo Finance** | `b9ee4012-…` | `get_protocol_info`, `get_ousg_stats`, `get_usdy_stats`, `get_token_balance` — tokenized US Treasuries (OUSG/USDY); read-only stats |
| **EigenLayer** | `<see catalog>` | `get_protocol_info`, `get_protocol_stats`, `get_avs_list`, `get_operator_info` — restaking + AVS registry; read-only stats |
| **STRC DeFi Ecosystem** | `<see catalog>` | `get_protocol_info`, `get_apyx_stats`, `get_saturn_stats`, `get_strc_market_data` — MicroStrategy/Strategy-linked RWA digital credit (APYX/Saturn/STRC); read-only stats |
| **CoW Protocol** | `<see catalog>` | `get_protocol_info`, `get_quote`, `get_order_status`, `get_protocol_stats` — MEV-protected batch-auction DEX aggregator; `get_quote` hits api.cow.fi (sell_token/buy_token/sell_amount, symbols resolve); read + quote |
| **Maple Finance** | `<see catalog>` | `get_protocol_info`, `get_protocol_stats`, `get_pools`, `get_pool_details` — institutional/RWA lending; pool APY/TVL (Maple API with DefiLlama fallback); read-only stats |
| **DefiLlama** | `a4884c93-…` | `get_protocol_tvl`, `list_yields`, `get_chain_tvl`, `get_stablecoin_circulation` |
| **ETH RPC** | `50c2296f-…` | `eth_call`, `simulate_call`, `get_storage_at`, `get_receipt`, `get_block` |
| **Token Lists** | `0f2ba08a-…` | `get_token`, `resolve_by_symbol`, `is_canonical` |
| **Transaction Simulation** | `913313e6-…` | `simulate`, `simulate_bundle`, `decode_call` |

### Bridge (P0 — multi-chain, no API key required)

| Skill | ID | Actions | Chains |
|---|---|---|---|
| **CCTP Bridge** | `e4e2a56c-…` | `get_supported_chains`, `deposit_for_burn`, `get_attestation`, `receive_message` | ETH ↔ Arb ↔ Opt ↔ Base ↔ Avax ↔ Polygon |
| **Across Protocol Bridge** | `24a5a07b-…` | `get_supported_routes`, `get_quote`, `deposit`, `get_deposit_status` | ETH ↔ Arb ↔ Opt ↔ Base ↔ Polygon ↔ Avax |
| **Stargate Bridge** | `2dbd12ea-…` | `get_supported_pools`, `quote_send`, `send_token` | ETH → Arb / Opt / Base / Polygon / Avax / BSC |
| **Wormhole Token Bridge** | `db785bff-…` | `get_supported_chains`, `get_message_fee`, `transfer_tokens`, `transfer_eth`, `get_vaa`, `complete_transfer` | ETH ↔ Arb ↔ Opt ↔ Base ↔ Polygon ↔ Avax ↔ BSC ↔ Solana ↔ Sui |
| **deBridge DLN** | `f9297e4a-…` | `get_supported_chains`, `create_order`, `get_order_status` | ETH ↔ Arb ↔ Opt ↔ Base ↔ Polygon ↔ Avax ↔ BSC ↔ Linea ↔ Solana |
| **XLayer Official Bridge** | `c3f93155-…` | `get_chain_info`, `bridge_to_xlayer`, `bridge_from_xlayer` | ETH ↔ XLayer (chain 196) |
| **Mantle Official Bridge** | `49998c3a-…` | `get_chain_info`, `bridge_to_mantle`, `bridge_from_mantle` | ETH ↔ Mantle (chain 5000) |
| **HashKey Official Bridge** | `0029fab7-…` | `get_chain_info`, `bridge_to_hashkey`, `bridge_from_hashkey` | ETH ↔ HashKey Chain (chain 177) |

**Bridge protocol notes:**
- **CCTP**: Burns USDC on source → Circle attestation → mint on destination. Flow: `deposit_for_burn` → `get_attestation` (poll until status=complete) → `receive_message` on destination.
- **Across**: Relayer-based bridge. Flow: `get_quote` → `deposit` (approve + depositV3). Relayer auto-fills on destination. Check with `get_deposit_status`.
- **Stargate**: LayerZero V2 OFT standard. Flow: `get_supported_pools` → `quote_send` (on-chain, gets nativeFee) → `send_token` (approve + sendToken with value=nativeFee). ETH pool: set `is_eth_pool: true`, value=amount+fee.
- **Wormhole**: Portal Token Bridge lock/burn-and-mint. Flow: `transfer_tokens` (approve + transferTokens) → `get_vaa` (poll until signed, ~1-15 min) → `complete_transfer` (EVM dest) or platform SDK (Solana/Sui). Use `transfer_eth` for native ETH.
- **deBridge**: Order-book bridge with no slippage. Flow: `create_order` (returns ready tx + orderId) → poll `get_order_status`. Supports Solana (deBridge chain ID 7565164).
- **XLayer Bridge**: Official Polygon CDK bridge (PolygonZkEVMBridgeV2). Flow: `bridge_to_xlayer` / `bridge_from_xlayer` (approve + bridgeAsset). Auto-claimed by OKX bridge service. Bridge contract: `0x2a3DD3…` on both ETH and XLayer.
- **Mantle Bridge**: Official canonical OP-stack StandardBridge. L1StandardBridge `0x95fC37…` (Ethereum), L2StandardBridge `0x4200…0010` (Mantle predeploy). Pass `token` = `eth` / `mnt` / `usdc` / `usdt` (or `l1_token` + `l2_token` for custom ERC-20). Handles Mantle's cross-layer asymmetry automatically: **MNT is native gas on L2 but an ERC-20 on L1; ETH is native on L1 but ERC-20 (BVM_ETH `0xdEAd…1111`, symbol WETH) on L2**. So deposits use `depositETH` (msg.value) for ETH but `depositMNT`/`depositERC20` (approve + value 0) for MNT/stables; withdrawals use `withdraw(addr(0))` (msg.value) for native MNT but approve + `withdraw(l2Token)` for ETH/stables. USDC/USDT are 6 decimals on both layers (no 18-dec trap, unlike BSC). Deposits land in minutes; **withdrawals are the 7-day OP flow — this skill builds only the L2 initiation tx, prove + finalize on L1 happen later**. `*To` variants used automatically when `recipient` is set (also required for contract wallets, since base variants are EOA-only).
- **HashKey Bridge**: Official canonical OP-stack bridge behind `bridge.hsk.xyz` between Ethereum (chain 1) and HashKey Chain (chain 177). OptimismPortal `0xe7Aa79…8bD3`, L1StandardBridge `0x2171E6…70be` (Ethereum), L2StandardBridge `0x4200…0010` (HashKey predeploy). Pass `token` = `hsk` or `usdt`. **HashKey uses HSK as a custom native gas token**: HSK is an ERC-20 (`0xe7c6bf…c98a`) on L1 and the native gas asset on L2 (verified via `SystemConfig.gasPayingToken()`). So HSK deposits go through the **OptimismPortal** (approve HSK to the portal, then `depositERC20Transaction`), not the StandardBridge — this mints native HSK on L2. HSK withdrawals use the L2 bridge `withdraw(LEGACY_ERC20_ETH, …)` with the native amount as msg.value. **ETH is not bridgeable** through this standard bridge on a custom-gas-token chain (the skill rejects `token: eth`). USDT (6-dec both layers, canonical L2 token `0xF1B5…9029` with `l1Token()` → L1 USDT) uses the StandardBridge `bridgeERC20`/`bridgeERC20To` in both directions. HSK deposits need an explicit L2 recipient — pass `recipient` or `sender` (the portal has no implicit-sender variant). Deposits land in minutes; **withdrawals are the multi-day OP flow — this skill builds only the L2 initiation tx, prove + finalize on L1 happen later**.
- CCTP key contracts: TokenMessenger + MessageTransmitter per chain (embedded). Only USDC supported.
- Stargate ETH mainnet pools: ETH `0x77b2043…`, USDC `0xc026395…`, USDT `0x933597a…`.
- Across domain IDs: ETH=1, Arb=42161, Opt=10, Base=8453, Polygon=137, Avax=43114.
- Wormhole chain IDs: ETH=2, Solana=1, BSC=4, Polygon=5, Avax=6, Sui=21, Arb=23, Opt=24, Base=30.

**Ethereum Mainnet — key contracts embedded (no config needed):**
- Uniswap: UniversalRouter `0x66a9893cC…`, QuoterV2 `0x61fFE014b…`, WETH9 `0xC02aaA39b…`
- Aave: Pool `0x87870Bca3…`
- Lido: stETH `0xae7ab9652…`, wstETH `0x7f39C581F…`, WithdrawalQueue `0x889edC2eD…`
- Morpho: Blue `0xBBBBBbbBB…`
- Ethena: USDe `0x4c9EDD585…`, sUSDe `0x9D39A5DE3…`
- Pendle: RouterV4 `0x888888888…`
- 1inch: Router `0x111111125…`

All tx-building actions return `{ transactions: [{to, data, value, chain_id, description}], approvals?: [...] }`.
`approvals` = ERC-20 approvals required before the main transaction. Execute in order.

### EVM chains (Ethereum, Optimism, Arbitrum, Base, Polygon, BSC)

| Skill | Actions | Chains |
|---|---|---|
| **Uniswap V3** | `get_quote`, `build_swap_tx` | ethereum, optimism, arbitrum, base, polygon |
| **Velodrome V2** | `get_quote`, `build_swap_tx` | optimism |
| **Aerodrome Finance** | `get_quote`, `build_swap_tx` | base |
| **PancakeSwap V3** | `get_quote`, `build_swap_tx`, `get_pool_info` | bsc, ethereum, arbitrum, base |
| **Uniswap V3 on BSC** | `get_quote`, `build_swap_tx`, `get_pools` | bsc |
| **THENA** | `get_quote`, `build_swap_tx` | bsc |
| **Moonwell** | `get_markets`, `get_market_detail`, `get_user_positions` | base |
| **Aave** | `get_markets`, `get_reserves`, `get_user_account`, `get_user_supplies`, `get_user_borrows` | ethereum, optimism, arbitrum, polygon, base, avalanche, xlayer |
| **GMX** | `get_markets`, `get_position`, `get_funding_rates` | arbitrum, avalanche |
| **dYdX** | `get_markets`, `get_orderbook`, `get_positions`, `get_account` | dydx chain |
| **Hyperliquid** | Market/account: `get_markets`, `get_all_mids`, `get_orderbook`, `get_funding_rates`, `get_funding_history`, `get_recent_trades`, `get_spot_markets`, `get_account_state`, `get_spot_balances`, `get_open_orders`, `get_fills` · Trading: `build_order`, `build_cancel_order` (return the EIP-712 typed data the user's wallet signs, then the client POSTs to Hyperliquid — Arsenal never holds a key) | hyperliquid |
| **WEEX** | `get_markets`, `get_ticker`, `get_orderbook` | CEX |
| **Binance** | Public: `get_price`, `get_24h_stats`, `get_orderbook`, `get_klines`, `get_recent_trades`, `get_avg_price`, `get_exchange_info` · Private (user api_key+secret): `get_account`, `place_order`, `cancel_order`, `get_order`, `get_open_orders` | CEX (spot) |
| **Binance Stock Perpetuals** | `list_perps`, `get_price`, `get_24h_stats`, `get_funding_rate` | CEX (USDⓈ-M TradFi perps) |
| **Binance bStocks (Tokenized Stocks)** | `get_overview`, `list_tokenized_stocks`, `get_payment_assets` | CEX (tokenized equities) |
| **StableStock** | `list_supported_stocks`, `get_balance`, `get_token_info`, `build_transfer_tx`, `build_approve_tx` | bsc (tokenized equities — TSLA/NVDA/AAPL as ERC-20) |

**BSC DEX notes:** three DEXes now cover BNB Smart Chain (chain 56). **PancakeSwap V3** is the dominant venue; **Uniswap V3 on BSC** is the official Uniswap deployment (Factory `0xdB1d1001…`, QuoterV2 `0x78D78E42…`, SwapRouter02 `0xB971eF87…`, fee tiers 0.01/0.05/0.3/1%); **THENA** is the leading ve(3,3) DEX, quoting both its Fusion (Algebra CLMM) and V1 (Solidly stable+volatile) venues and routing the swap through whichever gives the better output (best execution). All three read BSC's public no-auth RPC (`https://bsc-dataseed.bnbchain.org`, override via `BSC_RPC_URL`) and swap wrapped WBNB (hold WBNB, not native BNB). **Decimals trap: on BSC, USDT and USDC are 18-decimal tokens, not 6.**

**Binance notes:** public market data is read from `data-api.binance.vision` (no key, region-safe). Private/trading hits `api.binance.com` and is HMAC-SHA256 signed server-side from the user's own `api_key`+`secret_key` (no passphrase). `api.binance.com` is geo-restricted (HTTP 451) in some regions; set `BINANCE_API_BASE` to override the private base if the deploy region is blocked.

**Binance Stock Perpetuals notes:** read-only discovery + market data over Binance USDⓈ-M "TradFi" perps — individual stocks (TSLA, AAPL, NVDA, MSTR …), ETFs (SPY, QQQ, SOXL …), commodities (gold, silver, crude) and select pre-IPO names. `list_perps` returns the TradFi universe with live price + funding; `get_price` / `get_24h_stats` / `get_funding_rate` read a single contract. No key, no trading; each contract carries a Binance Futures trade link. Market data is sourced region-safely via **CoinGecko** (`derivatives/exchanges/binance_futures`) because `fapi.binance.com` is geo-restricted from the deploy region and has no `.vision` mirror. The contract universe is pinned to a Binance `exchangeInfo` snapshot (`TRADIFI_PERPETUAL`); set `COINGECKO_API_KEY` if the free CoinGecko tier rate-limits the deploy region.

**Binance bStocks notes:** informational / routing only — no trading API exists for these products yet. Covers the 7,000-stock zero-commission brokerage (live), the upcoming bStocks self-tokenization layer on BNB Chain (buy with USDC/USDT/BNB), and the Ondo-partnered tokenized stocks (live). Every fact carries a live/upcoming status flag and the announcement date.

### XLayer (OKX L2, chain ID 196)

| Skill | Actions |
|---|---|
| **Uniswap V3 on XLayer** | `get_quote`, `build_swap_tx`, `get_pools` |
| **Curve Finance on XLayer** | `list_pools`, `get_pool`, `get_quote` |
| **QuickSwap (Algebra) on XLayer** | `get_quote`, `build_swap_tx`, `get_pool` |

### Eniac Network — ENI Mainnet (chain ID 173, native EGAS)

| Skill | Actions |
|---|---|
| **DAOaaS Swap** | `get_quote`, `build_swap_tx`, `get_pool`, `get_tokens`, `get_dex_info` |

DAOaaS Swap is a Uniswap V3-fork DEX on Eniac Network — concentrated-liquidity pools across the standard 100 / 500 / 3000 / 10000 bps fee tiers. `get_quote` scans every tier via QuoterV2 and returns the best output. `build_swap_tx` returns an ordered `transactions[]` with three shapes: native EGAS in (single tx with `value = amountIn`), native EGAS out (multicall: `exactInputSingle` to router + `unwrapWETH9` to sender), and token-to-token (approve, if needed, + `exactInputSingle`). Live UI at https://daoaas.io/swap.

**Eniac key contracts (embedded — no config needed):**
- SwapRouter01: `0xcc3dC42D1F7766E79bd14185ec09Cd2F94Ee2B25`
- V3 Factory: `0x7C728ae7E43f04E768ffCe9CBA20A09f958ed8aD`
- QuoterV2: `0x47118D1Fdd5332Fc88B10322b9344E1DbF87a482`
- WEGAS (wrapped EGAS): `0x6D1e851446F4D004AE2A72F9AfEd85e8829A205E`

### Arc Testnet — Circle's USDC-native L1 (chain ID 5042002, native gas = USDC)

| Skill | Actions |
|---|---|
| **Arc Chain** | `get_chain_info`, `get_balance`, `get_token_balance`, `get_block_number`, `get_gas_price`, `get_tx_status`, `build_transfer_tx`, `build_token_transfer_tx` |

Arc is Circle's EVM L1 where **USDC is the native gas token** — every transaction pays gas in USDC instead of ETH/BNB/SOL, with sub-second finality. The skill talks to the public Circle-operated RPC by default (no auth) and supports the Canteen-hosted authenticated endpoint via the `ARC_RPC_URL` env var.

**Decimals gotcha — read before building:** native USDC (gas-form, used for `eth_getBalance` and `value`) is **18 decimals**. ERC-20 USDC (at `0x3600...`, used by Circle products and CCTP) is **6 decimals**. Mixing them produces 10¹² × off-by-one errors. `get_balance` and `build_transfer_tx` use 18-dec native; `get_token_balance` and `build_token_transfer_tx` use 6-dec ERC-20.

**Arc Testnet key endpoints (embedded — no config needed):**
- Public RPC: `https://rpc.testnet.arc.network` · WebSocket: `wss://rpc.testnet.arc.network`
- Canteen RPC: `https://rpc.testnet.arc-node.thecanteenapp.com/v1/<token>` (auth — `uv tool install git+https://github.com/the-canteen-dev/ARC-cli` then `arc-canteen login` to mint)
- Explorer: https://testnet.arcscan.app · Faucet: https://faucet.circle.com
- USDC (ERC-20): `0x3600000000000000000000000000000000000000` (6 dec)
- EURC (ERC-20): `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` (6 dec)
- CCTP domain: `26`

### X Layer — OKX's L2 (chain ID 196, multi-zone after Exchange OS upgrade)

| Skill | Actions |
|---|---|
| **Exchange OS** | `get_chain_info`, `get_okb_balance`, `get_wokb_balance`, `build_wrap_okb_tx`, `build_unwrap_okb_tx` |
| **XPower Finance** | `get_protocol_info`, `get_ticket_info`, `get_trust_info` — OKB-denominated mutual/cooperative yield protocol; read-only |
| **Uniswap V3 on XLayer** | (see X Layer DEX section) |
| **Curve on XLayer** | (see X Layer DEX section) |
| **QuickSwap on XLayer** | (see X Layer DEX section) |
| **XLayer Bridge** | (see bridge section) |

**Exchange OS context (announced 2026-05-26):** OKX's open market-infrastructure upgrade. X Layer now splits into an **EVM zone** (asset custody, OKB venue-staking, governance, escape-hatch withdrawals — chain ID 196) and a **TradeZone** (purpose-built non-EVM matching engine, ms-level latency, 300k TPS, gas-free trading — not yet exposed publicly). Anyone staking OKB will be able to deploy spot / perps / RWA / outcome venues that share a unified margin account. First venue (World Cup Outcomes) targeted for June 2026.

The v1 Exchange OS skill ships only what is on-chain and callable today: native **OKB** queries, **WOKB** (Wrapped OKB) ERC-20 queries, and wrap/unwrap transaction builders. Venue factory, OKB-staking-for-venue, unified-margin, and TradeZone matching API actions are stubbed for future releases — they will be added once OKX publishes contract addresses.

**X Layer mainnet key endpoints (embedded — no config needed):**
- Primary RPC: `https://rpc.xlayer.tech` · Alt: `https://xlayerrpc.okx.com` · Override via `XLAYER_RPC_URL` env var
- Explorer: https://www.oklink.com/x-layer
- Native gas token: **OKB** (18 decimals) — also the venue-deploy staking asset
- WOKB (ERC-20 wrap): `0xe538905cf8410324e03a5a23c1c177a474d59b2b` (18 dec) — `deposit()` to wrap, `withdraw(uint256)` to unwrap
- Whitepaper: https://web3.okx.com/whitepaper/okx-exchange-os.pdf · Builder waitlist: https://form.typeform.com/to/gCWfCxuu

### Monad — high-performance parallel-EVM L1 (chain ID 143, native MON)

| Skill | Actions |
|---|---|
| **Monad Chain** | `get_chain_info`, `get_balance`, `get_token_balance`, `get_block_number`, `get_gas_price`, `get_tx_status`, `build_transfer_tx`, `build_token_transfer_tx`, `build_wrap_tx`, `build_unwrap_tx` |
| **Uniswap V3 on Monad** | `get_quote`, `build_swap_tx`, `get_pools` |
| **Magma (Monad liquid staking)** | `get_stake_info`, `build_stake_tx`, `build_unstake_tx`, `build_claim_tx`, `get_unstake_status` |
| **ShMonad (Monad liquid staking)** | `get_stake_info`, `build_stake_tx`, `build_unstake_tx`, `get_balance` |
| **Euler v2 on Monad** | `get_vaults`, `get_vault`, `deposit`, `withdraw`, `borrow`, `repay`, `enable_collateral`, `enable_controller` |
| **Kintsu (Monad liquid staking)** | `get_stake_info`, `get_balance` — sMON liquid staking (#2 LST); read-only (exchange rate/APY/TVL via DefiLlama). Build path deferred: sMON is a non-standard vault whose deposit ABI reverts under simulation and needs a verified-source ABI to ground |
| **Morpho Blue on Monad** | `get_markets`, `get_market`, `get_position`, `supply`, `withdraw`, `supply_collateral`, `withdraw_collateral`, `borrow`, `repay` — Morpho Blue lending (singleton `0xD5D960E8…`); markets via `blue-api.morpho.org` (chainId 143), on-chain reads/builds via viem |
| **PancakeSwap V3 on Monad** | `get_quote`, `build_swap_tx`, `get_pools` — CLMM DEX; QuoterV2 `0xB048Bbc1…` + V3 SwapRouter `0x1b81D678…` (verified on-chain), fee tiers [100,500,2500,10000] |
| **Kuru** | `get_protocol_info`, `get_markets`, `get_market` — Monad-native CLOB DEX; read-only (markets via `api.kuru.io`; order calldata deferred to SDK) |

Monad mainnet went live 2025-11-24 — a parallel-EVM L1 with full EVM tooling support. Native gas is **MON** (18 decimals). The chain toolkit uses the public no-auth RPC `https://rpc.monad.xyz` (fallbacks `rpc1/rpc2/rpc3.monad.xyz`; override via `MONAD_RPC_URL`); it covers native + ERC-20 queries, transfers, and MON ⇄ WMON wrap/unwrap. Uniswap V3 is officially deployed (Factory `0x204faca1…`, QuoterV2 `0x661e93cc…`, SwapRouter02 `0xfe31f71c…`) — `get_quote`/`build_swap_tx` use the same QuoterV2 + SwapRouter02 path as the XLayer skill, best-fee-tier auto-selected.

**Monad key tokens (embedded):** WMON `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` (18), USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6), USDT `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` (6), WETH `0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242` (18), WBTC `0x0555E30da8f98308EdB960aa94C0Db47230d2B9c` (8).

**Magma** is liquid staking on Monad. Stake native MON to receive **gMON** (`0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081`, 18 dec), a yield-bearing token whose MON exchange rate rises as rewards accrue (currently ~1 gMON = 1.07 MON, ~11% APY). `get_stake_info` reads the live exchange rate, total MON staked, gMON supply, and APY/TVL (from DefiLlama). gMON is an **ERC-7540 async-redeem vault**, so unstaking is two steps: `build_unstake_tx` calls `requestRedeem` (emits a `requestId`), then after the unbonding window `build_claim_tx` calls `redeemMON` with that id. `get_unstake_status` reads pending vs claimable amounts for a request. Staking calls `depositMON` payable on the gMON contract directly; no separate approval is needed to unstake your own shares.

**ShMonad** (by FastLane) is Monad's largest liquid-staking protocol. Stake native MON to receive **shMON** (`0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c`, 18 dec), a yield-bearing **standard ERC-4626** vault whose MON rate rises as rewards accrue (currently ~1 shMON = 1.58 MON, ~13% APY, ~$7.9M TVL). Unlike Magma's async vault, shMON redemption is **synchronous**: `build_unstake_tx` calls `redeem` and MON is returned in the same transaction (no unbonding window), subject to available liquidity. `build_stake_tx` calls `deposit(assets, receiver)` payable with `msg.value == assets` (the underlying asset is native MON, exposed via the `0xEeee…EEeE` sentinel). `get_balance` returns an owner's shMON balance and redeemable MON; `get_stake_info` reads the live rate, total MON staked, supply, and APY/TVL (DefiLlama).

**Euler v2 on Monad** is Monad's largest lending protocol (~$110M TVL), built on the Euler Vault Kit (EVK): every market is its own ERC-4626 EVault, and the Ethereum Vault Connector (EVC `0x7a9324E8f270413fa2E458f5831226d99C7477CD`) wires a collateral vault to a borrow (controller) vault. Reads are on-chain: `get_vaults` lists the main money markets (USDC `eUSDC-15`, AUSD `eAUSD-16`, WMON `eWMON-7`, WETH) plus the LST collateral vaults (sMON, shMON, gMON) with live supplied / borrowed / available liquidity, enumerated from the eVaultFactory `0xba4Dd672062dE8FeeDb665DD4410658864483f1E` (120+ vaults total; every sampled vault's `EVC()` was verified to equal the official EVC). `get_vault` reads any vault by address or registry symbol. Build actions (`deposit`, `withdraw`, `borrow`, `repay`, `enable_collateral`, `enable_controller`) are direct EVault / EVC calls encoded with viem (chain 143), the same interface as `Euler v2 Mainnet`. A borrow returns the three-step `enableCollateral` + `enableController` + `borrow` sequence. This lets agents post liquid-staked MON (gMON / shMON / sMON from the Magma and ShMonad skills) as collateral to borrow stablecoins. The `vault` / `borrow_vault` / `collateral_vault` params accept either a 0x address or a registry symbol (USDC, AUSD, WMON, WETH, sMON, shMON, gMON); `deposit` / `repay` infer the underlying asset for the approval step from the registry, or take an explicit `asset` for any other vault.

### Mantle — Ethereum L2 (chain ID 5000, native MNT)

| Skill | Actions |
|---|---|
| **Agni Finance** | `get_quote`, `build_swap_tx` |

Agni Finance is the leading concentrated-liquidity DEX on Mantle (Uniswap V3 fork). Native gas is **MNT** (18 decimals); MNT is sent as `value` and swapped via WMNT internally, so the native path needs no approve. `get_quote` tries fee tiers 0.01% / 0.05% / 0.25% / 1% (`[100, 500, 2500, 10000]` — note Agni has no 0.3% tier) and returns the best. `build_swap_tx` targets the Agni SwapRouter; **Agni deploys the original Uniswap V3 `SwapRouter` (with a `deadline` field), not SwapRouter02**, so the swap calldata carries a deadline (set to now + 30 min). Exact-input only. Public no-auth RPC `https://rpc.mantle.xyz` (override via `MANTLE_RPC_URL`).

**Mantle key contracts/tokens (embedded):** SwapRouter `0x319B69888b0d11cEC22caA5034e25FfFBDc88421`, QuoterV2 `0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb`, Factory `0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035`; WMNT `0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8` (18), USDC `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` (6), USDT `0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE` (6).

### HashKey Chain — compliance-first Ethereum L2 (chain ID 177, native HSK)

| Skill | Actions |
|---|---|
| **HSKSwap** | `get_quote`, `build_swap_tx`, `get_pool`, `get_tokens`, `get_dex_info` |

HSKSwap is the primary DEX on HashKey Chain (chain ID 177), a compliance-first Ethereum L2 backed by HashKey Group. It uses a Solidly V1-style AMM with both stable (`x³y + y³x = k`) and volatile (`xy = k`) pools; native HSK is wrapped to WHSK internally. Public no-auth RPC `https://hashkey.drpc.org` (override via `HASHKEY_RPC_URL`). WHSK `0xB210D2120d57b758EE163cFfb43e73728c471Cf1` (18 dec).

### Berachain — Proof-of-Liquidity L1 (chain ID 80094, native BERA)

| Skill | Actions |
|---|---|
| **Berachain Chain** | `get_chain_info`, `get_balance`, `get_gas_price`, `build_transfer_tx`, `wrap_bera`, `unwrap_wbera` — chain toolkit; native + ERC-20 balances/transfers, BERA ⇄ WBERA (`0x6969…6969`, standard WETH9) |
| **Kodiak Finance** | `get_protocol_info`, `get_top_pools`, `get_quote`, `build_swap_tx` — Berachain's leading DEX (Uniswap V3 fork); QuoterV2 `0x644C8D6E…` + SwapRouter02 `0xe301E48F…` (verified on-chain), fee tiers [100,500,3000,10000] |
| **Infrared Finance** | `get_protocol_info`, `get_stats`, `get_exchange_rate`, `get_ibgt_balance` — Berachain liquid staking (iBERA ERC-4626 + iBGT liquid BGT); read-only |
| **Honey** | `get_protocol_info`, `get_honey_stats`, `get_bex_stats` — Berachain's native overcollateralized stablecoin (HONEY) + BEX DEX stats; read-only |

Berachain mainnet (chain ID 80094, native **BERA**, 18 dec) uses Proof-of-Liquidity consensus. Public no-auth RPC `https://rpc.berachain.com`. On-chain reads/builds via raw JSON-RPC; TVL/APY/price from DefiLlama. Kodiak build_swap_tx addresses were verified on-chain (initial web-search addresses were discarded after on-chain checks showed no code / reverts).

### Solana

| Skill | Actions |
|---|---|
| **Jupiter** | `get_quote`, `build_swap_tx`, `get_token_price` |
| **Raydium** | `get_top_pairs`, `get_pool_info`, `get_protocol_stats`, `get_price`, `build_swap_tx` — Solana's largest AMM + CLMM; `build_swap_tx` returns a base64 VersionedTransaction (routed via Jupiter) |
| **Meteora** | `get_pools`, `get_pool`, `get_protocol_stats`, `get_price`, `build_swap_tx` — Solana's largest liquidity layer (DLMM concentrated-liquidity bins). Data from Meteora's datapi; `build_swap_tx` routes through Meteora (pin `dex`: DLMM / DAMM V2 / DAMM) and returns a base64 VersionedTransaction. LP/position actions are SDK-only, out of scope |
| **Orca Whirlpools** | `get_swap_quote`, `build_swap_tx`, `get_token_price` — routing pinned to Orca (`dexes=Whirlpool`); `build_swap_tx` returns a base64 VersionedTransaction |
| **Kamino Finance** | `get_markets`, `get_reserves`, `get_reserve`, `get_vaults`, `get_prices`, `build_deposit_tx`, `build_withdraw_tx`, `build_borrow_tx`, `build_repay_tx` — Solana's largest lending protocol + automated vaults; build actions hit Kamino's native `/ktx/klend` REST and return a base64 tx (borrow/withdraw/repay require an existing obligation, created by a first deposit) |
| **Jito** | `get_stake_stats`, `get_mev_tips`, `get_price`, `build_stake_tx`, `build_unstake_tx` — jitoSOL liquid staking (APY/TVL/exchange-rate via Kobe) + bundle tip floor (bundles.jito.wtf); stake/unstake routed SOL ⇄ jitoSOL through Jupiter, returns a base64 tx |
| **Jupiter Perpetuals** | `get_markets`, `get_market`, `get_jlp_info`, `get_positions`, `build_open_position`, `build_close_position` — Solana's highest-volume perp venue (SOL/ETH/BTC); per-side borrow rate + utilization; build actions return a base64 position-request tx executed by Jupiter keepers |
| **Polymarket** | `get_markets`, `get_market_detail`, `get_user_positions` |
| **marginfi** | `get_protocol_info`, `get_banks`, `get_bank` — mrgnlend lending; bank inventory + per-asset supplied USD (mrgn public bank cache + DefiLlama TVL). Live supply/borrow APY is SDK-only; skill flags this. Read-only |
| **Marinade** | `get_protocol_info`, `get_stats`, `get_exchange_rate`, `build_stake_tx`, `build_unstake_tx` — Solana's largest liquid staking (mSOL); stats/APY via api.marinade.finance; stake/unstake routed SOL⇄mSOL through Jupiter, returns base64 tx |
| **Sanctum** | `get_protocol_info`, `get_lst_list`, `get_lst_apy`, `get_price` — LST hub (245 LSTs, INF pool); registry/price via extra-api.sanctum.so, APY via DefiLlama (native APY endpoint returns 0). Read-only |
| **Save (Solend)** | `get_protocol_info`, `get_markets`, `get_reserves`, `get_reserve` — Solana lending (ex-Solend); live supply AND borrow APY + TVL via api.solend.fi. Read-only |

### Sui

| Skill | Actions |
|---|---|
| **Cetus CLMM** | `get_quote`, `build_swap_tx`, `get_pool_info`, `get_pools`, `get_position` |
| **Bluefin Ember** | `list_vaults`, `get_vault_info`, `get_user_position`, `deposit`, `withdraw` |
| **Aftermath Finance** | `get_pools`, `get_pool_info`, `get_quote`, `build_swap_tx` |
| **Navi Protocol** | `get_markets`, `get_user_position`, `get_reserve_data` |
| **Scallop** | `get_markets`, `get_user_position` |
| **Suilend** | `get_markets`, `get_user_position` |
| **SUI Blockchain Toolkit** | `get_balance`, `get_tokens`, `get_nfts`, `get_transactions`, `get_object` |
| **IKA dWallet** | `create_dwallet`, `presign`, `sign`, `get_dwallet_info` |
| **Turbos Finance** | `get_protocol_info`, `get_pools`, `get_pool`, `get_quote`, `build_swap_tx` — CLMM DEX (concentrated liquidity); `build_swap_tx` returns a base64 PTB |
| **Kriya DEX** | `get_protocol_info`, `get_pool`, `get_quote`, `build_swap_tx` — AMM DEX; `build_swap_tx` returns a base64 PTB |
| **Haedal Protocol** | `get_protocol_info`, `get_exchange_rate`, `get_hasui_balance`, `build_stake_tx`, `build_unstake_tx`, `build_instant_unstake_tx` — liquid staking (haSUI) |
| **Volo** | `get_protocol_info`, `get_exchange_rate`, `get_vsui_balance`, `build_stake_tx`, `build_unstake_tx` — liquid staking (vSUI) |
| **FlowX Finance** | `get_protocol_info`, `get_top_pools`, `get_quote`, `build_swap_tx` — Sui DEX aggregator (V2 AMM + V3 CLMM); `build_swap_tx` returns a base64 PTB (pin `pool_version`: v2_amm / v3_clmm) |
| **Bucket Protocol** | `get_protocol_info`, `get_stats`, `build_borrow_tx`, `build_repay_tx`, `build_psm_swap_tx` — Sui CDP stablecoin (USDB); deposit collateral to borrow, or PSM-swap stables near-zero fee; build actions return a base64 PTB |
| **AlphaFi** | `get_protocol_info`, `get_exchange_rate`, `get_stsui_balance`, `build_stake_tx`, `build_unstake_tx` — Sui liquid staking (stSUI); instant unstake; build actions return a base64 PTB |
| **Typus Finance** | `get_protocol_info`, `get_vaults`, `get_vault_info`, `build_deposit_tx` — Sui options vaults (covered call / put selling); `build_deposit_tx` returns a base64 PTB |

### Aptos

| Skill | Actions |
|---|---|
| **Aries Markets** | `get_protocol_info`, `get_market_stats`, `get_user_position`, `get_asset_info` — Aptos's leading lending market; per-asset supply/borrow/APY read from the Aptos fullnode + DefiLlama |
| **Thala** | `get_protocol_info`, `get_mod_stats`, `get_thapt_stats`, `get_pool_stats` — Aptos DeFi hub (MOD stablecoin + thAPT liquid staking + ThalaSwap pools); read-only stats |
| **Amnis Finance** | `get_protocol_info`, `get_stats`, `get_exchange_rate`, `get_stapt_balance` — Aptos's leading liquid staking (amAPT/stAPT); exchange rate via fullnode view calls, TVL via DefiLlama; read-only |
| **Echelon Market** | `get_protocol_info`, `get_markets`, `get_market` — Aptos lending; 28 markets with supply/borrow APR + LTV (app.echelon.market API, DefiLlama fallback); read-only |
| **Merkle Trade** | `get_protocol_info`, `get_pairs`, `get_stats` — Aptos perps DEX; 72 tradable pairs read on-chain from the `pair_types` module (their API is region-blocked); read-only |

### Tempo (Stripe/Paradigm payments chain, ID 4217)

| Skill | Actions |
|---|---|
| **Uniswap V3 on Tempo** | `get_quote`, `build_swap_tx`, `get_pools` |
| **Tempo MPP** | `probe`, `pay`, `get_account` |
| **Tempo Sessions** | `open_channel`, `close_channel`, `get_session`, `list_sessions` |
| **Tempo Token Info** | `get_token`, `list_tokens`, `get_token_price` |

### BTC Staking / Liquid Staking (BTCfi)

| Skill | Actions |
|---|---|
| **Babylon Protocol** | `get_protocol_info`, `get_global_stats`, `get_finality_providers`, `get_staking_params` — bridge-less native BTC staking (economic security for PoS chains); read-only stats from Babylon's staking API |
| **Lombard Finance** | `get_protocol_info`, `get_exchange_rate`, `get_lbtc_stats`, `get_lbtc_balance` — LBTC liquid staking on Ethereum (Babylon-backed); Chainlink LBTC/BTC oracle + supply/TVL/APY. Needs `ALCHEMY_API_KEY` server-side |
| **Lorenzo Protocol** | `get_protocol_info`, `get_exchange_rate`, `get_protocol_stats`, `get_stbtc_balance` — stBTC/enzoBTC liquid staking across Ethereum & BSC; TVL via DefiLlama |
| **Solv Protocol** | `get_protocol_info`, `get_solvbtc_stats`, `get_solvbtc_balance`, `get_strategies` — SolvBTC Bitcoin yield across Ethereum/BSC/Arbitrum; read-only stats + strategies |
| **Bedrock** | `get_protocol_info`, `get_unibtc_stats`, `get_unieth_stats`, `get_token_balance` — uniBTC / uniETH liquid restaking; supply/TVL stats |
| **Core Chain** | `get_protocol_info`, `get_network_stats`, `get_lstbtc_info`, `get_staking_params` — Core (chain 1116) BTC staking + lstBTC; live chain/TVL/CORE-token stats |

### Data & Oracles (read-only, no API key required)

| Skill | Actions |
|---|---|
| **CoinGecko** | `get_protocol_info`, `get_price`, `get_market_data`, `search_token`, `get_global_stats`, `get_trending` — prices/market data for 10000+ coins |
| **Chainlink** | `get_protocol_info`, `get_price`, `get_feed_by_symbol`, `list_feeds` — on-chain AggregatorV3 price feeds on ethereum/polygon/bsc/avalanche/arbitrum/optimism/base |
| **Pyth Network** | `get_protocol_info`, `get_price`, `get_multiple_prices`, `list_feeds` — pull-oracle price feeds (Hermes) |
| **The Graph** | `get_protocol_info`, `query_subgraph`, `get_popular_subgraphs`, `get_subgraph_info` — query DeFi subgraphs |
| **Gas Tracker** | `get_protocol_info`, `get_gas_price`, `get_all_gas_prices`, `estimate_tx_cost` — live gas across ethereum/polygon/bsc/arbitrum/optimism/base/avalanche |
| **ENS** | `get_protocol_info`, `resolve_name`, `reverse_lookup`, `get_name_info` — Ethereum Name Service (forward/reverse) |
| **SuiNS** | `get_protocol_info`, `resolve_name`, `reverse_lookup`, `get_name_info` — Sui Name Service (forward/reverse) |
| **Canton Network** | `get_protocol_info`, `get_cnt_price`, `get_cnt_market_data`, `get_splice_info`, `get_network_tvl`, `get_ecosystem` — Canton/Splice read-only toolkit; CC price/market data + on-chain TVL & ecosystem |
| **Casper AgentGuard** | `get_chain_info`, `get_node_status`, `get_latest_block`, `get_state_root_hash`, `get_deploy_status`, `build_agent_receipt`, `build_install_command`, `build_registry_call`, `get_demo_playbook` — Casper Testnet policy/receipt registry toolkit for AI agent audit trails |

**Canton Network notes:** Canton is Digital Asset's privacy-enabled institutional chain — a hybrid that is open to participate in (anyone can run a validator, public Canton Coin) but permissioned at the data layer (each party sees only contracts it is party to). It has no anonymous public RPC by design, and on-chain reads/transactions require a participant (validator) node + Daml Ledger API, which Arsenal does not host. So this skill is read-only over **region-safe public sources**: CC price/market data via CoinGecko (`canton-network` / `wrapped-canton-coin`), and chain-level TVL + on-chain app ecosystem via DefiLlama (`Canton` chain — `get_network_tvl` returns TVL with 7d/30d trend & peak; `get_ecosystem` lists tracked apps such as the Pool Party DEX and the wCC bridge with per-protocol TVL). The official Splice **Scan API** (real on-chain CC supply, mining rounds, DSO governance, Super Validator set) sits behind an AWS-ELB IP allowlist and is **not reachable from cloud egress IPs** — wiring it (and any build_transfer/Daml command path) requires a participant-node endpoint + credentials, a future upgrade gated on node access.

**Casper AgentGuard notes:** AgentGuard is the Casper Innovation Track skill for Sumplus' agent stack: Maria proposes an action, SafeRouter/Arsenal policy checks it, and Casper Testnet records the policy/proposal/decision/receipt hashes. The skill never moves funds. It exposes live Casper Testnet JSON-RPC reads, deterministic receipt hashing, `casper-client` install/call command generation, and deploy verification links. Skill ID: `88c60a3a-6608-4449-9e47-3b8d99120917`. Reviewers should see the deployed contract package hash and sample Testnet deploy hashes on the BUIDL page.

### Cross-chain / Other

| Skill | Actions |
|---|---|
| **Crypto Wallet Manager** | `get_balance`, `get_tokens`, `get_transactions`, `get_nft` |
| **Sumplus Yield Optimizer** | `get_recommendations`, `compare_protocols`, `get_protocol_detail` |
| **Talus Nexus** | Primate chain operations |
| **Sumplus Arsenal** | `search`, `get`, `list` — meta-skill for skill discovery |
| **SafeRouter Verified Inference** | `get_connection_info` |

**SafeRouter** is a confidential-verifiable LLM routing gateway (OpenAI-compatible, multi-provider fallback) that emits a per-request hardware attestation (TEE) — a caller can cryptographically verify the gateway never saw plaintext. This skill is **read-only discovery**: `get_connection_info` returns the base URL (`SAFEROUTER_BASE_URL`, prod `https://router.sumplus.xyz`), the live model catalog, and the three attestation endpoints (`/attestation`, `/attestation/quote`, `/attestation/transparency`) plus a verify recipe. Arsenal deliberately does **not** proxy `/v1/chat/completions` and does **not** mint keys — agents obtain a key from SafeRouter directly and call it directly, because proxying through Arsenal would break the end-to-end attestation guarantee.

---

## MCP Interface

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "arsenal": {
      "url": "https://arsenal.sumplus.xyz/mcp",
      "apiKey": "sk_live_..."
    }
  }
}
```

**Tools:** `searchSkills`, `getSkill`, `executeSkill`, `getCategories`

**Resources:** `arsenal://skills/<uuid>` — returns skill doc in Markdown

---

## Talus Nexus Gateway

Arsenal exposes a subset of its Sui skills as [Talus Nexus](https://docs.talus.network) off-chain tools, so that any Nexus DAG workflow can call Arsenal skills as native tool nodes. No API key needed — Nexus Leader nodes authenticate at the app layer via signed HTTP (Ed25519), which is post-MVP; MVP runs un-signed over HTTPS.

**Base URL per tool:** `https://arsenal.sumplus.xyz/api/tools/<slug>`

Each tool exposes the three standard Nexus off-chain endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/tools/<slug>/health` | Returns 200 iff ready |
| `GET /api/tools/<slug>/meta` | Nexus Tool Definition JSON (FQN, description, input/output schema) |
| `POST /api/tools/<slug>/invoke` | Executes the underlying Arsenal skill |

Plus a batch index for the Nexus CLI `--batch` flag:

```
GET /api/tools
→ { "tools": [{ "fqn": "xyz.sumplus.cetus@1", "url": "https://arsenal.sumplus.xyz/api/tools/cetus" }, ...] }
```

### Invoke response format — Nexus variants, not Arsenal's `{success}` wrapper

Nexus requires output schemas with a top-level `oneOf` over variants. The gateway maps Arsenal's internal `{success, output|error}` envelope to:

```json
// success
{ "ok":  { /* skill output, any shape */ } }

// failure
{ "err": { "reason": "human-readable message" } }
```

Both are returned with HTTP 200; only infrastructure errors (unknown slug, malformed JSON) use non-200 status.

### Tool registry

Tools are split into **testnet-ready** (advertised in the batch index for Nexus testnet registration) and **mainnet-only** (reachable at their individual URLs for inspection, but withheld from the batch index until Nexus mainnet is live and we're ready to register them there).

The `GET /api/tools` batch index accepts an optional `?network=testnet|mainnet` query. It defaults to `testnet` because Nexus mainnet is not live yet.

#### Testnet (advertised in `GET /api/tools`)

| FQN | Underlying skill | Actions |
|---|---|---|
| `xyz.sumplus.cetus-testnet@1` | Cetus CLMM on Sui testnet | `get_swap_quote` |

The testnet Cetus tool is a thin wrapper over the same `executeCetusSkill` executor that powers the mainnet variant, with one difference: the gateway force-injects `chain: "sui:testnet"` into every invoke input, so all underlying RPC calls go to Sui testnet fullnode (`getFullnodeUrl('testnet')`) and the Cetus Aggregator runs in `Env.Testnet` mode. On testnet, the provider list is restricted to `CETUS` and `DEEPBOOKV3` — the only DEXes with live Sui testnet deployments — to avoid "Turbos only supported on mainnet" errors from the SDK during routing.

`build_swap_tx` is intentionally omitted from the testnet tool: the Cetus Aggregator SDK's PTB construction path references a Sui package that does not exist on Sui testnet, causing `txb.build()` to fail at serialization time. Quote-only is the MVP scope; transaction construction will be re-enabled once the SDK fully supports Sui testnet PTB serialization.

#### Mainnet-only (reachable individually, not in batch index)

| FQN | Underlying skill |
|---|---|
| `xyz.sumplus.cetus@1`         | Cetus CLMM |
| `xyz.sumplus.bluefin-ember@1` | Bluefin Ember vaults |
| `xyz.sumplus.aftermath@1`     | Aftermath Finance |
| `xyz.sumplus.navi@1`          | NAVI Protocol |
| `xyz.sumplus.scallop@1`       | Scallop |

These tools call Sui mainnet RPC. Registering them on Nexus testnet would cause testnet DAGs to return real mainnet data (fine for reads) and build real mainnet PTBs (dangerous for the write actions `build_swap_tx`, `deposit`, `withdraw`). Until each skill has a first-class Sui testnet path, they are not advertised for testnet registration.

Non-Sui skills (EVM / Solana / XLayer / Tempo) are **not** exposed as Nexus tools at all because Talus Nexus only supports Sui.

### Example — call via Nexus Leader

```bash
# 1. Leader fetches the tool definition
curl https://arsenal.sumplus.xyz/api/tools/navi/meta

# 2. Leader invokes the tool with input matching input_schema
curl -X POST https://arsenal.sumplus.xyz/api/tools/navi/invoke \
  -H "Content-Type: application/json" \
  -d '{"action":"get_markets"}'
# → { "ok": { "protocol": "NAVI Protocol", "market_count": 10, "markets": [...] } }
```

### Registering with Talus (operator workflow)

1. Local dry-run — no on-chain effect, safe to run anytime:
   ```
   nexus tool validate off-chain --url https://arsenal.sumplus.xyz/api/tools/cetus
   ```
2. Batch registration — one shot for all MVP tools (requires Sumplus on Talus's registration allowlist):
   ```
   nexus tool register offchain --url https://arsenal.sumplus.xyz/api/tools --batch --collateral-coin <sui_coin_id>
   ```

**Env override**: set `NEXUS_TOOL_PUBLIC_BASE_URL=https://arsenal.sumplus.xyz` if Arsenal runs behind a proxy that rewrites the host header — otherwise the `url` field in `/meta` is derived from the request origin.

---

## OpenAI Function Calling

```
GET /api/functions?category=Blockchain&limit=50
Authorization: Bearer <api_key>
```

Returns an array of OpenAI-compatible function definitions. Pass directly to any LLM `tools` parameter.

```
POST /api/functions/execute
{ "name": "velodrome_v2", "arguments": { "action": "get_quote", ... } }
```

---

## Unified Router

Single endpoint for agents that want a simple interface:

```
POST /api/router
```

```json
// Search
{ "action": "search", "query": "swap on BSC" }

// Get
{ "action": "get", "skill_id": "uuid" }

// Execute
{ "action": "execute", "skill_id": "uuid", "input": { "action": "get_quote", ... } }
```

---

## Error Format

```json
{ "error": "Human-readable message" }
```

Validation errors:
```json
{ "error": "Validation failed", "details": { "fieldErrors": { "sender": ["Required"] } } }
```

| Status | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Auth required |
| 402 | Payment required (paid skill) |
| 403 | Forbidden |
| 404 | Not found |
| 422 | Skill ran but returned a logical failure |
| 500 | Infrastructure error |

---

## Curated Collections

Skills can be tagged with curated labels that agents can use to filter thematically.

### CLARITY Act (`clarity-act`)

The US CLARITY Act (Digital Asset Market Structure bill) proposes a regulatory framework for stablecoins, DeFi protocols, and tokenized RWAs. These protocols are most directly affected or most strategically positioned under CLARITY:

| Category | Protocols | Tag |
|---|---|---|
| Yield stablecoins | Ethena (sUSDe), Sky (USDS/sUSDS), Ondo (USDY) | `clarity-act` |
| Fixed income / rate tools | Pendle (PT/YT) | `clarity-act` |
| Lending / leverage | Morpho, Aave V3 | `clarity-act` |
| ETH staking / restaking | Lido (stETH), EtherFi (eETH), EigenLayer | `clarity-act` |
| Derivatives | Hyperliquid | `clarity-act` |
| DEX / routing | Uniswap V3, Uniswap V4, CoW Protocol | `clarity-act` |
| Institutional credit / RWA | Maple, Centrifuge, Ondo (OUSG) | `clarity-act` |

**To filter by this collection:**
```
GET /api/skills?tags=clarity-act&limit=50
```

**Convention:** when adding new skills relevant to regulatory/institutional DeFi narratives, include `clarity-act` in their `tags` array.

---

## Schema Sync

Each skill's interface contract lives in its `*_SKILL_METADATA` export in `src/skills/*.ts`. This is the source of truth.

On every deploy (`npm run build`), `sync-schemas` compares code schemas against the DB and updates any that have drifted. Embeddings are regenerated for changed skills.

**To update a skill's schema:** edit the `schema` field inside its `*_SKILL_METADATA` object, then run `npm run sync-schemas` or deploy.
