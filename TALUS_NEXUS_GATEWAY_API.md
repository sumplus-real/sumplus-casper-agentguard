# Arsenal — Talus Nexus Gateway API Reference

Standard HTTP reference for the Nexus-compatible tool endpoints hosted by Arsenal. Implements the off-chain tool contract defined in:

- [Tool definition](https://docs.talus.network/developer-docs/index/tool)
- [Tool communication](https://docs.talus.network/developer-docs/index/tool-communication)

**Base URL:** `https://arsenal.sumplus.xyz`

**Authentication:** None. Nexus Leader nodes authenticate at the application layer via signed HTTP (Ed25519), which is not yet enforced. All endpoints accept unauthenticated requests.

**Content type:** `application/json` on all request and response bodies.

**JSON Schema dialect:** `https://json-schema.org/draft/2020-12/schema`

---

## 1. Endpoint summary

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/tools`                          | Batch index — list all tool URLs for `nexus tool register --batch` |
| `GET`  | `/api/tools/{slug}/health`            | Health check |
| `GET`  | `/api/tools/{slug}/meta`              | Tool definition JSON |
| `POST` | `/api/tools/{slug}/invoke`            | Execute tool logic |

URL canonicalization: per the Nexus spec, if a tool is registered with `url = https://arsenal.sumplus.xyz/api/tools/{slug}`, the Leader computes the invoke URL as `base + "/invoke"`. Query strings and fragments are dropped.

---

## 2. `GET /api/tools`

Batch index. Returns Nexus tools hosted by Arsenal that are ready for registration on a given Nexus network. Consumed by the Nexus CLI `--batch` flag during registration.

### Query parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `network` | `string` | `testnet` | `testnet` or `mainnet`. Filters tools by their target network. Defaults to `testnet` because Nexus mainnet is not live as of this writing; mainnet-only tools would otherwise cause Sui mainnet transactions to flow through a testnet DAG, which is unsafe for DAG authors. |

### Response — `200 OK`

```json
{
  "network": "testnet",
  "tools": [
    {
      "fqn": "xyz.sumplus.cetus-testnet@1",
      "url": "https://arsenal.sumplus.xyz/api/tools/cetus-testnet"
    }
  ]
}
```

### Response body

| Field | Type | Description |
|---|---|---|
| `network`     | `string` | The network the listed tools are ready for. Echoes the query param. |
| `tools`       | `array`  | Tool entries matching the requested network |
| `tools[].fqn` | `string` | Fully-qualified tool name (`{domain}.{name}@{version}`) |
| `tools[].url` | `string` | Tool base URL. Append `/health`, `/meta`, or `/invoke` to reach sub-endpoints |

Tools not listed for the requested network are still reachable at their individual URLs for inspection — see §7 for the full catalog.

---

## 3. `GET /api/tools/{slug}/health`

Health check. Returns `200` iff the tool is ready to be invoked.

### Path parameters

| Name | Type | Description |
|---|---|---|
| `slug` | `string` | Tool slug (see §7 tool catalog) |

### Response — `200 OK`

```json
{
  "status": "ok",
  "fqn": "xyz.sumplus.navi@1"
}
```

### Response — `404 Not Found`

Returned when `slug` does not match any registered tool.

```json
{
  "status": "unknown_tool",
  "slug": "unknown-slug"
}
```

---

## 4. `GET /api/tools/{slug}/meta`

Returns the Nexus Tool Definition JSON for this tool.

### Path parameters

| Name | Type | Description |
|---|---|---|
| `slug` | `string` | Tool slug (see §7 tool catalog) |

### Response — `200 OK`

```json
{
  "fqn": "xyz.sumplus.navi@1",
  "type": "offchain",
  "url": "https://arsenal.sumplus.xyz/api/tools/navi",
  "description": "NAVI is the leading lending & borrowing protocol on Sui ($450M+ market size)...",
  "input_schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["action"],
    "properties": {
      "action": {
        "type": "string",
        "enum": ["get_markets", "get_market", "get_protocol_info"]
      },
      "asset": {
        "type": "string",
        "description": "Asset symbol (e.g. SUI, USDC, USDT, USDY)"
      }
    }
  },
  "output_schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "oneOf": [
      {
        "type": "object",
        "required": ["ok"],
        "properties": {
          "ok": { "type": "object", "additionalProperties": true }
        },
        "additionalProperties": false
      },
      {
        "type": "object",
        "required": ["err"],
        "properties": {
          "err": {
            "type": "object",
            "required": ["reason"],
            "properties": { "reason": { "type": "string" } },
            "additionalProperties": true
          }
        },
        "additionalProperties": false
      }
    ]
  }
}
```

### Response body

| Field | Type | Description |
|---|---|---|
| `fqn`           | `string` | Fully-qualified tool name, format `{domain}.{name}@{version}` |
| `type`          | `string` | Always `"offchain"` |
| `url`           | `string` | Tool base URL. Matches the URL used during registration |
| `description`   | `string` | UTF-8 human-readable description |
| `input_schema`  | `object` | JSON Schema draft-2020-12 describing the `/invoke` request body |
| `output_schema` | `object` | JSON Schema draft-2020-12 describing the `/invoke` response body. Top level is always `oneOf` over output variants |

### Response — `404 Not Found`

```json
{ "error": "Unknown tool: unknown-slug" }
```

---

## 5. `POST /api/tools/{slug}/invoke`

Execute the tool. Request body is validated against `input_schema`; response body is one variant from `output_schema`.

### Path parameters

| Name | Type | Description |
|---|---|---|
| `slug` | `string` | Tool slug (see §7 tool catalog) |

### Request body

Arbitrary JSON matching the tool's `input_schema`. Every tool requires an `action` field; additional fields depend on the action. See §8 for per-tool input reference.

**Example**

```http
POST /api/tools/navi/invoke
Content-Type: application/json

{
  "action": "get_market",
  "asset": "USDC"
}
```

### Response — `200 OK` (`ok` variant)

```json
{
  "ok": {
    "protocol": "NAVI Protocol",
    "asset": "USDC",
    "supply_apy": 4.12,
    "borrow_apy": 6.85,
    "utilization": 0.72,
    "total_supply": "128500000",
    "total_borrow": "92400000",
    "tvl_usd": 128500000,
    "liquidation_threshold": 0.85,
    "ltv": 0.80,
    "can_be_collateral": true,
    "chain": "sui"
  }
}
```

### Response — `200 OK` (`err` variant)

```json
{
  "err": {
    "reason": "No market found for asset \"FOO\""
  }
}
```

Both `ok` and `err` variants return HTTP `200`. Only infrastructure-level failures use non-`200` codes.

### Response — `400 Bad Request`

Malformed JSON in the request body.

```json
{ "err": { "reason": "Invalid JSON body" } }
```

### Response — `404 Not Found`

Unknown tool slug.

```json
{ "err": { "reason": "Unknown tool: unknown-slug" } }
```

---

## 6. Invoke response contract

The Nexus off-chain tool spec requires `output_schema` top-level to be `oneOf` over output variants — DAG edges subscribe to specific variants and route workflow execution accordingly. Arsenal uses two generic variants for all tools:

| Variant | Shape | Emitted when |
|---|---|---|
| `ok`  | `{ "ok":  { ... } }`              | The tool produced a successful result. The inner object shape depends on `action`. |
| `err` | `{ "err": { "reason": "..." } }` | The tool ran but encountered a logical failure (invalid input, upstream API error, unsupported action, etc.). The `reason` field is a human-readable string. |

Exactly one variant is returned on every `POST /invoke` call. Both are HTTP `200`.

**MVP scope note:** the `ok` variant is an open object (`additionalProperties: true`) rather than a per-action discriminated union. Tighter schemas per action are planned but not yet shipped.

---

## 7. Tool catalog

Tools are grouped by target Nexus network. Only tools advertised for the current network appear in `GET /api/tools` (see §2). Every tool — advertised or not — is reachable at its individual base URL for inspection and manual validation.

### 7.1 Testnet (advertised in `GET /api/tools?network=testnet`)

| Slug             | FQN                               | Base URL                                                    |
|------------------|-----------------------------------|-------------------------------------------------------------|
| `cetus-testnet`  | `xyz.sumplus.cetus-testnet@1`     | `https://arsenal.sumplus.xyz/api/tools/cetus-testnet`       |

The gateway pins every invocation to Sui testnet (`chain: "sui:testnet"`) regardless of input, and the Cetus Aggregator runs with the provider list restricted to `CETUS` and `DEEPBOOKV3` — the DEXes with live Sui testnet deployments. No mainnet RPC is reachable through this tool.

### 7.2 Mainnet-only (not advertised; reachable individually)

| Slug            | FQN                              | Base URL                                                   |
|-----------------|----------------------------------|------------------------------------------------------------|
| `cetus`         | `xyz.sumplus.cetus@1`            | `https://arsenal.sumplus.xyz/api/tools/cetus`              |
| `bluefin-ember` | `xyz.sumplus.bluefin-ember@1`    | `https://arsenal.sumplus.xyz/api/tools/bluefin-ember`      |
| `aftermath`     | `xyz.sumplus.aftermath@1`        | `https://arsenal.sumplus.xyz/api/tools/aftermath`          |
| `navi`          | `xyz.sumplus.navi@1`             | `https://arsenal.sumplus.xyz/api/tools/navi`               |
| `scallop`       | `xyz.sumplus.scallop@1`          | `https://arsenal.sumplus.xyz/api/tools/scallop`            |

These tools call Sui mainnet RPC and should not be registered on Nexus testnet — write actions (`build_swap_tx`, `deposit`, `withdraw`) would construct real mainnet PTBs that, if signed by a testnet DAG author, would spend real mainnet funds. They remain reachable at their individual URLs so engineers can inspect schemas and probe endpoints, but are withheld from the batch index until either (a) each skill gains a first-class Sui testnet path, or (b) Nexus mainnet is live and ready for registration.

All tools are hosted on the Sui chain. Non-Sui skills (EVM, Solana, XLayer, Tempo) are not exposed through this gateway.

---

## 8. Per-tool input reference

Each subsection documents the actions supported by one tool and the input fields each action accepts. The full JSON Schema for every tool is available at `GET /api/tools/{slug}/meta`.

The gateway enforces the `action` enum from each tool's `input_schema` at invoke time. Calling a tool with an action not listed in its schema returns an `err` variant with `reason = "Action \"X\" is not supported by <fqn>. Available actions: ..."` — no partial execution.

### 8.0 `xyz.sumplus.cetus-testnet@1` (testnet)

Cetus CLMM on Sui testnet. Live swap quotes routed through the Cetus Aggregator against Sui testnet pools (CETUS and DEEPBOOKV3 providers). Every invocation is pinned to Sui testnet — the `chain` field is never accepted from the caller and is always `"sui:testnet"` internally.

#### Actions

| Action | Purpose |
|---|---|
| `get_swap_quote` | Preview expected output amount and route for a swap against Sui testnet Cetus + DeepBook pools. Read-only, no wallet required. |

#### Input fields

| Field | Type | Required | Description |
|---|---|---|---|
| `action`    | `string` | yes | Must be `get_swap_quote` |
| `token_in`  | `string` | yes | Input token symbol (e.g. `SUI`) or full coin type |
| `token_out` | `string` | yes | Output token symbol or full coin type |
| `amount_in` | `string` | yes | Human-readable input amount, e.g. `"1.5"` |
| `slippage`  | `number` | no  | Max slippage as a percentage (e.g. `0.5` = 0.5%) |

#### Example

```bash
curl -X POST https://arsenal.sumplus.xyz/api/tools/cetus-testnet/invoke \
  -H "Content-Type: application/json" \
  -d '{"action":"get_swap_quote","token_in":"SUI","token_out":"USDC","amount_in":"0.5"}'
```

```json
{
  "ok": {
    "amount_out": "0.472558",
    "price_impact": 0,
    "fee": "0.25%",
    "route": ["SUI", "USDC"],
    "token_in": "SUI",
    "token_out": "USDC",
    "amount_in": "0.5",
    "hop_count": 1,
    "chain": "sui:testnet",
    "source": "cetus.zone aggregator (live)"
  }
}
```

#### Known limitations

- `build_swap_tx` is not currently available on the testnet variant. The Cetus Aggregator SDK's PTB construction path references a Sui package that does not exist on Sui testnet, causing `txb.build()` to fail at serialization time. Quote-only is the MVP scope; transaction construction will be re-enabled once the SDK fully supports Sui testnet PTB serialization.

---

### 8.1 `xyz.sumplus.cetus@1` (mainnet)

Cetus CLMM — concentrated liquidity DEX on Sui. Provides swap quotes, pool queries, liquidity positions, token prices, and real PTB (programmable transaction block) construction for swaps.

#### Actions

| Action | Purpose |
|---|---|
| `get_swap_quote`  | Compute an expected output amount for a swap. Read-only. |
| `get_pool`        | Query a single pool by address or by coin pair. |
| `list_pools`      | List top pools by TVL. |
| `get_position`    | Query a liquidity position by position NFT ID. |
| `get_token_price` | Fetch token price, 24h change, and 24h volume. |
| `get_dca_info`    | Preview a DCA (dollar-cost averaging) strategy breakdown. |
| `build_swap_tx`   | Construct a signable Sui PTB for a swap. Returns `tx_bytes` (base64). |

#### Input fields

| Field | Type | Required | Description |
|---|---|---|---|
| `action`         | `string` | yes | One of the actions above |
| `coin_a`         | `string` | conditional | Input token symbol or full coin type (e.g. `SUI`, `USDC`, `0x2::sui::SUI`) |
| `coin_b`         | `string` | conditional | Output token symbol or full coin type |
| `amount`         | `number` | conditional | Amount to swap or query, in human-readable units |
| `a_to_b`         | `boolean` | no | Swap direction: `true` = a → b |
| `by_amount_in`   | `boolean` | no | `true` = fix input amount (default), `false` = fix output amount |
| `slippage`       | `number` | no | Max slippage in percent (e.g. `0.5` = 0.5%) |
| `pool_address`   | `string` | conditional | Sui object address of a pool (for `get_pool`) |
| `fee_tier`       | `number` | no | One of `100`, `500`, `2500`, `10000` |
| `limit`          | `number` | no | Max results for `list_pools` |
| `position_id`    | `string` | conditional | Position NFT object ID (for `get_position`) |
| `sender`         | `string` | required for `build_swap_tx` | Sui wallet address (`0x` + 64 hex chars) of the transaction sender |
| `token_in`       | `string` | required for `build_swap_tx` | Input token symbol or coin type |
| `token_out`      | `string` | required for `build_swap_tx` | Output token symbol or coin type |
| `amount_in`      | `string` | required for `build_swap_tx` | Human-readable input amount, e.g. `"1.5"` |
| `chain`          | `string` | no | `"sui"` or `"sui:testnet"` |
| `target_token`   | `string` | for `get_dca_info` | Token to accumulate |
| `budget_token`   | `string` | for `get_dca_info` | Token to spend |
| `budget_amount`  | `number` | for `get_dca_info` | Total budget in `budget_token` units |
| `frequency`      | `string` | for `get_dca_info` | `hourly`, `daily`, `weekly` |
| `order_count`    | `number` | for `get_dca_info` | Number of DCA orders |

---

### 8.2 `xyz.sumplus.bluefin-ember@1`

Bluefin Ember — structured yield vaults on Sui. Lists active vaults with APY and TVL, queries user positions, and builds deposit/withdraw PTBs.

#### Actions

| Action | Purpose |
|---|---|
| `list_vaults`        | List all active vaults with live APY, TVL, and capacity. |
| `get_vault_info`     | Get full detail for one vault. |
| `get_user_position`  | Query a user's position in a vault. |
| `deposit`            | Build a deposit PTB (`tx_bytes`) ready to sign. |
| `withdraw`           | Build a withdraw/redeem PTB ready to sign. |

#### Input fields

| Field | Type | Required | Description |
|---|---|---|---|
| `action`         | `string` | yes | One of the actions above |
| `vault_id`       | `string` | conditional | Vault UUID, name substring, or Sui object address |
| `token`          | `string` | no | Filter `list_vaults` by deposit token symbol |
| `min_apy`        | `number` | no | Filter `list_vaults` to APY ≥ this value |
| `amount`         | `string` | required for `deposit` | Human-readable deposit amount, e.g. `"100"` |
| `shares_amount`  | `string` | required for `withdraw` | Number of receipt tokens (shares) to redeem, human-readable |
| `sender`         | `string` | required for `deposit`, `withdraw` | Sui wallet address (`0x` + exactly 64 hex chars). Validated by regex `/^0x[0-9a-fA-F]{64}$/` |
| `address`        | `string` | required for `get_user_position` | Sui wallet address to query. Same validation as `sender` |

---

### 8.3 `xyz.sumplus.aftermath@1`

Aftermath Finance — DEX aggregator and liquid staking protocol on Sui. Returns swap quotes, top pools by TVL, and afSUI liquid staking info.

#### Actions

| Action | Purpose |
|---|---|
| `get_quote`         | Get a swap quote across all Sui liquidity sources. |
| `get_pools`         | List top pools by TVL. |
| `get_afsui_info`    | afSUI liquid staking state (APY, exchange rate, total staked). |
| `get_protocol_info` | Static protocol overview. |

#### Input fields

| Field | Type | Required | Description |
|---|---|---|---|
| `action`    | `string` | yes | One of the actions above |
| `coinIn`    | `string` | required for `get_quote` | Input token symbol or full coin type |
| `coinOut`   | `string` | required for `get_quote` | Output token symbol or full coin type |
| `amountIn`  | `number` | required for `get_quote` | Input amount in human-readable units (numeric, not string) |
| `limit`     | `number` | no | Max pools for `get_pools` (default `10`) |

---

### 8.4 `xyz.sumplus.navi@1`

NAVI Protocol — largest native lending & borrowing protocol on Sui. Live market rates, supply/borrow APY, utilization, and TVL for all supported assets.

#### Actions

| Action | Purpose |
|---|---|
| `get_markets`       | List all lending markets with current APY and utilization. |
| `get_market`        | Detail for a single market (supply/borrow APY, utilization, LTV, liquidation threshold). |
| `get_protocol_info` | Static protocol overview. |

#### Input fields

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | `string` | yes | One of the actions above |
| `asset`  | `string` | required for `get_market` | Asset symbol (e.g. `SUI`, `USDC`, `USDT`, `USDY`) |

---

### 8.5 `xyz.sumplus.scallop@1`

Scallop — lending protocol on Sui with `sCoin` yield-bearing tokens. Live lending markets, supply/borrow APY, and protocol overview.

#### Actions

| Action | Purpose |
|---|---|
| `get_markets`       | List all lending markets. Includes `scoin` metadata where applicable. |
| `get_market`        | Detail for a single market. |
| `get_protocol_info` | Static protocol overview. |

#### Input fields

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | `string` | yes | One of the actions above |
| `asset`  | `string` | required for `get_market` | Asset symbol (e.g. `SUI`, `USDC`, `USDT`, `WETH`, `SCA`) |

---

## 9. Complete example — `xyz.sumplus.navi@1`

### Health check

```bash
curl https://arsenal.sumplus.xyz/api/tools/navi/health
```

```json
{ "status": "ok", "fqn": "xyz.sumplus.navi@1" }
```

### Fetch tool definition

```bash
curl https://arsenal.sumplus.xyz/api/tools/navi/meta
```

### Invoke — success

```bash
curl -X POST https://arsenal.sumplus.xyz/api/tools/navi/invoke \
  -H "Content-Type: application/json" \
  -d '{"action":"get_markets"}'
```

```json
{
  "ok": {
    "protocol": "NAVI Protocol",
    "chain": "sui",
    "market_count": 10,
    "markets": [
      {
        "asset": "SUI",
        "supply_apy": 2.34,
        "borrow_apy": 4.56,
        "utilization": 0.62,
        "total_supply": "45200000",
        "total_borrow": "28000000",
        "tvl_usd": 45200000,
        "can_be_collateral": true
      }
    ]
  }
}
```

### Invoke — failure

```bash
curl -X POST https://arsenal.sumplus.xyz/api/tools/navi/invoke \
  -H "Content-Type: application/json" \
  -d '{"action":"get_market","asset":"FOO"}'
```

```json
{
  "err": {
    "reason": "No market found for asset \"FOO\""
  }
}
```

---

## 10. Nexus CLI validation

Every tool in the catalog can be validated locally without any on-chain effect. For testnet registration, start with the testnet tool:

```bash
# testnet tool (advertised for Nexus testnet)
nexus tool validate off-chain --url https://arsenal.sumplus.xyz/api/tools/cetus-testnet
```

Mainnet-only tools can also be validated (schema conformance only — do not register these on testnet):

```bash
nexus tool validate off-chain --url https://arsenal.sumplus.xyz/api/tools/cetus
nexus tool validate off-chain --url https://arsenal.sumplus.xyz/api/tools/bluefin-ember
nexus tool validate off-chain --url https://arsenal.sumplus.xyz/api/tools/aftermath
nexus tool validate off-chain --url https://arsenal.sumplus.xyz/api/tools/navi
nexus tool validate off-chain --url https://arsenal.sumplus.xyz/api/tools/scallop
```

The CLI checks:

1. `GET /meta` returns a valid Tool Definition JSON with well-formed FQN, matching `url`, and `output_schema` top-level `oneOf`.
2. `GET /health` returns HTTP `200`.
3. `POST /invoke` endpoint exists.
4. URL is reachable from a Leader-equivalent network position.

For batch registration on Nexus testnet, point the registration command at the batch index (which advertises only testnet-ready tools):

```bash
nexus tool register offchain \
  --url https://arsenal.sumplus.xyz/api/tools \
  --batch \
  --collateral-coin <sui_testnet_coin_object_id>
```

---

## 11. HTTP status codes

| Code | Meaning | Applies to |
|---|---|---|
| `200` | Success. Both `ok` and `err` invoke response variants use this code. | all endpoints |
| `400` | Malformed request body (invalid JSON). | `POST /invoke` |
| `404` | Unknown tool slug. | `GET /health`, `GET /meta`, `POST /invoke` |

Non-`200` codes are reserved for infrastructure-level failures. Tool-level logical failures are returned as `err` variants at HTTP `200`.
