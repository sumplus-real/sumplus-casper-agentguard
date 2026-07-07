# Arsenal Skill Development Guide

Every skill that ships to production must follow this process.
Breaking any step is how bugs end up in agent hands.

---

## 1. Before Writing a Single Line of Code

### Verify every contract address on Etherscan

Never trust a research summary for contract addresses. Go to Etherscan directly.

For each contract:
1. Open `https://optimistic.etherscan.io/address/<address>`
2. Check the Contract tab → verify it's verified source code, not a proxy pointing elsewhere
3. Read the ABI — confirm the functions you plan to call actually exist with those exact parameter types

For router/factory patterns specifically: call `defaultFactory()` or `factory()` on the router to confirm which factory it uses. **Do not hardcode a factory address you found in docs without verifying it matches what the router returns.**

```bash
# Quick check: call defaultFactory() on any router
ALCHEMY_KEY=your_key
node -e "
const {ethers}=require('./node_modules/ethers');
console.log(ethers.id('defaultFactory()').slice(0,10))
"
# Then curl:
curl -s -X POST https://opt-mainnet.g.alchemy.com/v2/$ALCHEMY_KEY \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"<ROUTER>","data":"<SELECTOR>"},"latest"]}'
```

### Compute function selectors and cross-check against Etherscan ABI

```bash
node -e "
const {ethers}=require('./node_modules/ethers');
const sigs = [
  'getAmountsOut(uint256,(address,address,bool,address)[])',
  // add all functions you plan to call
];
for (const s of sigs) console.log(ethers.id(s).slice(0,10), s);
"
```

Then open the contract on Etherscan → Read Contract → find the function → verify the selector matches.

---

## 2. Test eth_calls with curl Before Writing TypeScript

For every `eth_call` you plan to make, test it with raw curl first. If it reverts at curl stage, it will revert in production.

### Template: test a single view call

```bash
ALCHEMY_KEY=$(grep ALCHEMY_API_KEY .env.local | cut -d= -f2)
CHAIN=opt-mainnet   # or eth-mainnet, arb-mainnet, base-mainnet, polygon-mainnet

# Build calldata manually (selector + ABI-encoded params)
# Use p32() logic: addresses padded to 32 bytes, numbers in hex
DATA="0x5509a1ac\
0000000000000000000000000000000000000000000000000de0b6b3a7640000\
0000000000000000000000000000000000000000000000000000000000000040\
0000000000000000000000000000000000000000000000000000000000000001\
0000000000000000000000004200000000000000000000000000000000000006\
0000000000000000000000000b2c639c533813f4aa9d7837caf62653d097ff85\
0000000000000000000000000000000000000000000000000000000000000000\
0000000000000000000000000000000000000000000000000000000000000000"

curl -s -X POST "https://${CHAIN}.g.alchemy.com/v2/$ALCHEMY_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\
\"params\":[{\"to\":\"<CONTRACT>\",\"data\":\"$DATA\"},\"latest\"]}" | python3 -m json.tool
```

**If you get `"error": {"code": 3, "message": "execution reverted"}` — stop. Fix the input before writing TypeScript.**

Common revert causes:
- Wrong contract address (calling V1 when you mean V2)
- Wrong factory address in a Route struct (use `address(0)` to let the router use its default)
- Wrong ABI encoding (struct field order, missing fields)
- Pool doesn't exist at that fee tier / stable setting

---

## 3. Skill Code Template

```typescript
// src/skills/<name>.ts
//
// CONTRACTS section: verified addresses with Etherscan links in comments
// SEL section: verified selectors with canonical ABI signatures
// Each selector must be tested with a curl call before shipping

const CONTRACTS = {
  router: '0x...', // Etherscan: https://optimistic.etherscan.io/address/0x...
  // verified: defaultFactory() returns 0x... (matches factoryV2 below)
  factoryV2: '0x...',
};

// Verified selectors — test each one with curl before shipping
const SEL = {
  // keccak256("functionName(type1,type2)").slice(0,10)
  myFunction: 'xxxxxxxx',
};

// Token registry: addresses from official docs + verified on Etherscan
const TOKENS = { ... };

// ethCall: always throws on revert — callers decide whether to catch
async function ethCall(to: string, data: string, apiKey: string): Promise<string> { ... }

// Each action function:
// - validates inputs first (return {success:false, error} for bad inputs)
// - catches ethCall failures and returns {success:false, error} with a USEFUL message
// - never throws uncaught exceptions out of the action handler
async function actionXxx(input: any, apiKey: string): Promise<SkillExecutionResult> {
  // 1. validate
  const { foo, bar } = input;
  if (!foo) return { success: false, error: 'foo is required' };

  // 2. execute
  try {
    const result = await ethCall(...);
    // 3. decode + format
    return { success: true, output: { ... } };
  } catch (err: any) {
    // Include enough context to debug: what were we calling, with what params
    return {
      success: false,
      error: `${err.message}. Called ${CONTRACT_NAME} with tokenIn=${foo}, tokenOut=${bar}`,
    };
  }
}
```

---

## 4. Pre-Deploy Checklist

Before `git push`, run through this list:

```
[ ] TypeScript: npx tsc --noEmit (zero errors in src/)
[ ] Every contract address verified on Etherscan
[ ] Router defaultFactory() confirmed against hardcoded factory address
[ ] Every function selector tested with curl against live RPC (not just computed)
[ ] Every action tested end-to-end with curl against /api/execute on localhost or staging
[ ] DB upload done, skill UUID noted and wired in skill-executors.ts
[ ] skill-executors.ts PLACEHOLDER replaced with real UUID
[ ] Vercel deploy confirmed (check Vercel dashboard, not just git push success)
[ ] Each action tested against production /api/execute after deploy
```

### Quick production test template

```bash
# After deploy, test every action:
curl -s -X POST https://arsenal.sumplus.xyz/api/execute \
  -H 'Content-Type: application/json' \
  -d '{"skill_id":"<UUID>","input":{"action":"<action>", ...}}' | python3 -m json.tool

# Expected: {"success":true,"result":{...}}
# Failure signals: "not implemented", success:false, HTTP 422/500
```

---

## 5. HTTP Status Code Convention

| Situation | HTTP Status |
|-----------|-------------|
| Skill ran, returned data | 200 |
| Skill ran, logical failure (no pool, bad input) | 422 |
| Skill not found | 404 |
| Auth missing | 401 |
| Payment required | 402 |
| Unexpected server crash | 500 |

`success: false` from a skill executor → **422**, never 500.
500 is reserved for things like database connection failures or uncaught exceptions.

---

## 6. Lessons Learned (Running Log)

| Date | Skill | Bug | Root Cause | Fix |
|------|-------|-----|------------|-----|
| 2026-02 | Uniswap | `get_quote` returned "not implemented" | tsconfig target ES2017 broke BigInt literals → Vercel deployed old code | Changed target to ES2020 |
| 2026-02 | Uniswap Build TX | calldata had `0x0x04e45aaf...` prefix | SEL constants included `0x`, then output prepended another `0x` | Removed `0x` from SEL constants |
| 2026-02 | Velodrome | `get_quote` returned 500 | Factory address was V1 (`0x25cbddb...`); Router V2 rejected it with `InvalidFactory()` | Use Router's `defaultFactory()` to verify; use `address(0)` in Route struct |
| 2026-02 | All skills | 500 on `success:false` confused agents | execute route returned HTTP 500 for any `success:false` result | Changed to HTTP 422 |
