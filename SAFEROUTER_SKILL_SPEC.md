# Spec: SafeRouter "Verified Inference" Skill (discovery/onboarding, NOT a proxy)

Handoff from the Sumplus main session. Goal: add one new Arsenal skill that lets an
agent discover SafeRouter and get a working credential to call it **directly**.

## Design intent — read this first, it's the whole point

SafeRouter is a confidential-verifiable LLM routing gateway. Its core value is a
**per-request hardware attestation** (TEE): the calling agent can verify, at the
hardware level, that SafeRouter never saw plaintext. That proof only reaches the agent
if the agent talks to SafeRouter **directly**.

Therefore this skill is a **discovery / onboarding stub**, NOT a proxy.

- ✅ The skill returns connection info and (optionally) mints a key, then the agent
  connects to SafeRouter on its own.
- ❌ The skill MUST NOT forward `/v1/chat/completions` traffic through Arsenal. If
  Arsenal proxies the LLM call, the attestation covers SafeRouter's enclave but the
  agent now trusts Arsenal as a middleman — the entire value proposition is destroyed.

If you find yourself writing code that pipes chat messages through Arsenal to
SafeRouter and streams the completion back, stop — that is the wrong skill.

## Skill shape

Create `src/skills/saferouter.ts` following the existing skill conventions in this repo
(metadata object: `name`, `description`, `category`, `tags`, `is_paid`, `schema` with a
required `action` enum, `usage_examples`; handler `async (input) => SkillExecutionResult`
i.e. `{ success, output?, error? }`). Then register the handler in
`src/lib/skill-executors.ts` and add the slug→UUID mapping in `src/lib/nexus-registry.ts`,
same as every other skill. It will be reachable via `POST /api/execute { skill_id, input }`.

Suggested category: whatever this repo uses for non-DeFi/infra capabilities (if only
DeFi/NFT/DAO exist, pick the closest or add an "Infra"/"AI" category consistent with the
existing enum — your call, match repo convention).

### Action 1 — `get_connection_info` (no side effects)

Returns everything an agent needs to connect and verify, without creating any state:

- `base_url` — SafeRouter base URL (from env, see config below)
- `chat_endpoint` — `"/v1/chat/completions"` (OpenAI-compatible)
- `models` — live model catalog. Fetch from SafeRouter's model-list endpoint at call
  time (confirm the exact path in the `saferouter` repo / `docs/API.md`; do not hardcode
  a stale list). Known model ids include `deepseek-v4-flash`, `glm-4.7`.
- `attestation` — the public verification endpoints so the agent can check the enclave
  itself before trusting it:
  - `GET /attestation` (TEE identity card)
  - `POST /attestation/quote` (fresh signed quote for a caller nonce)
  - `GET /attestation/transparency` (append-only hash-chained identity log)
- `how_to_verify` — one short string telling the agent to fetch `/attestation`, post a
  nonce to `/attestation/quote`, and confirm the quote before sending any prompt.

### (Removed) `provision_key`

> **Decision 2026-05-31:** Arsenal ships SafeRouter as **discovery/traffic-routing only**
> (导流), not real provisioning. There is NO `provision_key` action, NO key minting, NO
> `SAFEROUTER_ADMIN_KEY`. The skill is keyless, stateless, side-effect-free. Agents that
> want a key go to SafeRouter directly (`get_connection_info` tells them how). Do not add
> a provisioning action back without an explicit decision to do so.

## Config (env)

- `SAFEROUTER_BASE_URL` — dev default `http://127.0.0.1:8787`; prod `https://router.sumplus.xyz`
  (set as the deploy-time env var; do not hardcode in source).

## Reference (SafeRouter side, already verified)

- Repo: `~/Documents/GitHub/saferouter`, `docs/API.md`.
- OpenAI-compatible `POST /v1/chat/completions`, SSE streaming, auto-fallback across
  providers (OpenAI / DeepSeek / GLM / Anthropic).
- Key mgmt: `GET/POST/PATCH/DELETE /v1/keys` (Bearer auth; `POST` returns secret once).
- Credits: `GET /v1/credits`, `POST /v1/credits/topup`; `402` when balance hits zero.
- Attestation (public): `GET /attestation`, `POST /attestation/quote`,
  `GET /attestation/transparency`.

## Acceptance

1. `get_connection_info` returns base_url + chat_endpoint + a live model list + the three
   attestation endpoints + a how-to-verify line. No state created.
2. Skill is keyless and read-only: no `SAFEROUTER_ADMIN_KEY`, no `POST` of any kind, no
   key minting. The only outbound call is `GET /v1/models` (unauthenticated catalog).
3. No code path proxies chat/completions through Arsenal.
4. Skill registered in `skill-executors.ts` + `nexus-registry.ts`, callable via
   `POST /api/execute`.
