You are building a new Arsenal skill for the protocol: **$ARGUMENTS**

Arsenal skills have a strict two-layer architecture and a history of silent bugs when contract addresses or ABI encodings are wrong. Follow each phase completely and **show your work at every verification step before moving on**.

---

## PHASE 1 — Research (DO NOT write code yet)

**Goal:** Understand the protocol and collect verified data sources.

1. Fetch the official documentation site and any GitHub contracts repo for **$ARGUMENTS**
2. Identify what actions agents would want to perform (quotes, swaps, pool info, positions, etc.)
3. Collect candidate contract addresses from docs/GitHub — but treat these as UNVERIFIED until Phase 2

**Output required before Phase 2:**
- List of planned actions with brief description of each
- List of candidate contract addresses with their claimed purpose

---

## PHASE 2 — Contract Address Verification (MANDATORY, no exceptions)

For every contract address you plan to call:

1. Open `https://optimistic.etherscan.io/address/<address>` (or the correct chain explorer)
2. Confirm it has verified source code (Contract tab shows source, not just bytecode)
3. Check if it's a proxy — if so, follow to the implementation
4. For any router contract: call `defaultFactory()` or `factory()` via Alchemy to confirm which factory it uses:

```bash
ALCHEMY_KEY=$(grep ALCHEMY_API_KEY .env.local | cut -d= -f2)
# Compute selector:
node -e "const {ethers}=require('./node_modules/ethers'); console.log(ethers.id('defaultFactory()').slice(0,10))"
# Then call:
curl -s -X POST "https://opt-mainnet.g.alchemy.com/v2/$ALCHEMY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"<ROUTER_ADDR>","data":"<SELECTOR>"},"latest"]}'
```

⚠️ **STOP if the router's factory doesn't match what docs say.** Use the on-chain truth.
⚠️ In Route structs, prefer passing `address(0)` as factory — lets the router use its own defaultFactory and is immune to address drift.

**Output required before Phase 3:**
- Each address: ✅ verified on explorer / ❌ mismatch found (and corrected address)
- For any router: on-chain defaultFactory() result shown

---

## PHASE 3 — Function Selector Verification (MANDATORY)

For every contract function you plan to call via `eth_call`:

1. Compute the selector:
```bash
node -e "
const {ethers}=require('./node_modules/ethers');
const sigs = [
  'functionName(type1,type2)',
  // add all functions
];
for (const s of sigs) console.log(ethers.id(s).slice(0,10), s);
"
```

2. Cross-check against the Etherscan ABI: Read Contract → find the function → confirm it exists with those exact parameter types

3. **Test every selector with a real eth_call via curl BEFORE writing TypeScript:**
```bash
# Build calldata: selector + ABI-encoded params
# Rule for address(0) in Route structs: all zeros
DATA="0x<SELECTOR><P32_PARAM1><P32_PARAM2>..."
curl -s -X POST "https://opt-mainnet.g.alchemy.com/v2/$ALCHEMY_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"<ADDR>\",\"data\":\"$DATA\"},\"latest\"]}" \
  | python3 -m json.tool
```

If you see `"error": {"message": "execution reverted"}` — **fix the calldata before proceeding**. Common causes:
- Wrong contract address (V1 vs V2)
- Wrong factory in Route struct (use address(0))
- Wrong ABI encoding (struct field order, missing fields)
- Function doesn't exist at that address

**Output required before Phase 4:**
- Each selector: computed value + Etherscan confirmation
- Each eth_call: curl result showing `"result": "0x..."` (not an error)

---

## PHASE 4 — Write the Skill Code

File: `src/skills/<protocol-lowercase>.ts`

Follow this structure exactly:

```typescript
/**
 * <Protocol> Skill — Server-side execution on <Chain>
 * [ARSENAL-HOSTED ✓] Arsenal provides Alchemy RPC. No API key needed.
 *
 * Contracts on <chain>:
 *   Router:  <address>  (verified: defaultFactory() = <factory_address>)
 *   Factory: <address>  (verified on Etherscan)
 */

// CONTRACTS: every address verified on Etherscan + on-chain calls in Phase 2
const CONTRACTS = {
  router:  '0x...',  // verified
  factory: '0x...',  // verified: matches router.defaultFactory()
};

// SEL: every selector tested with curl in Phase 3
const SEL = {
  myFunction: 'xxxxxxxx', // keccak256("myFunction(type1,type2)").slice(0,10)
};

// Each action:
// - validate inputs first (return {success:false, error} for missing/bad params)
// - catch ethCall failures with USEFUL error messages (include what was called and with what)
// - never let uncaught exceptions escape the action handler
async function actionXxx(input: any, apiKey: string): Promise<SkillExecutionResult> {
  const { foo, bar } = input;
  if (!foo) return { success: false, error: 'foo is required for action_xxx' };

  try {
    const result = await ethCall(CONTRACTS.router, '0x' + SEL.myFunction + p32(foo), apiKey);
    // decode and return
    return { success: true, output: { ... } };
  } catch (err: any) {
    return {
      success: false,
      error: `${err.message} — called ${CONTRACTS.router} myFunction(foo=${foo})`,
    };
  }
}
```

Wire it up in `src/lib/skill-executors.ts` with a PLACEHOLDER UUID:
```typescript
if (skillId === 'PLACEHOLDER_REPLACE_AFTER_DB_UPLOAD') {
  return await executeXxxSkill(input);
}
```

---

## PHASE 5 — TypeScript Check

```bash
npx tsc --noEmit 2>&1 | grep "^src/"
```

**Zero errors required before Phase 6.**

---

## PHASE 6 — Upload to DB and Wire UUID

1. Prepare the skill JSON (name, description with `[ARSENAL-HOSTED ✓]`, category, tags, schema with all actions documented, usage_examples)
2. Upload:
```bash
# Write to /tmp/<name>_skill.json first, then:
curl -s -X POST https://arsenal.sumplus.xyz/api/admin/upload-skills \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/<name>_skill.json
```
3. Note the UUID from the response
4. Replace `PLACEHOLDER_REPLACE_AFTER_DB_UPLOAD` in skill-executors.ts with the real UUID

---

## PHASE 7 — Deploy and Verify

1. Commit and push:
```bash
git add src/skills/<name>.ts src/lib/skill-executors.ts
git commit -m "Add <Protocol> skill — <brief description>"
GIT_SSH_COMMAND="ssh -i ~/.ssh/sumplus_contact -o IdentitiesOnly=yes" git push origin main
```

2. Wait ~60 seconds for Vercel to deploy

3. Test **every action** against production:
```bash
SKILL_ID="<uuid>"
# Test each action:
curl -s -X POST https://arsenal.sumplus.xyz/api/execute \
  -H 'Content-Type: application/json' \
  -d "{\"skill_id\":\"$SKILL_ID\",\"input\":{\"action\":\"<action>\", <params>}}" | python3 -m json.tool

# Expected: {"success":true,"result":{...}}
# Any 422/500 or "not implemented" = bug, fix before announcing to agents
```

4. Test all actions. Every single one. Not just the happy path.

---

## Pre-Deploy Checklist (sign off on each)

```
[ ] Phase 2: All contract addresses verified on Etherscan
[ ] Phase 2: Router defaultFactory() matches hardcoded factory address
[ ] Phase 3: All selectors computed and cross-checked vs Etherscan ABI
[ ] Phase 3: All eth_calls tested with curl — no reverts
[ ] Phase 5: npx tsc --noEmit shows zero src/ errors
[ ] Phase 6: UUID wired in skill-executors.ts (no PLACEHOLDER remaining)
[ ] Phase 7: Every action returns {"success":true} in production
[ ] DB description starts with [ARSENAL-HOSTED ✓] or [DEMO MODE]
```

---

## Common Mistakes to Avoid

| Mistake | Consequence | Prevention |
|---------|-------------|------------|
| Using V1 factory address for V2 router | `InvalidFactory()` revert, 422 error | Always call `defaultFactory()` on-chain |
| Hardcoding factory in Route struct | Breaks when factory changes | Use `address(0)` in route factory field |
| Testing selectors only mathematically | Wrong sig = silent revert | Test with curl before writing code |
| Assuming research summaries are accurate | Wrong addresses, wrong ABIs | Primary source = Etherscan only |
| Pushing without testing production | Maria sees bugs, Claude looks bad | Test every action post-deploy |
| Deploying before checking tsconfig target | BigInt errors → old code stays live | Always tsc --noEmit first |

---

## Reference

Full guide: `SKILL_DEV_GUIDE.md` in project root
Existing skill examples: `src/skills/uniswap.ts`, `src/skills/velodrome.ts`
Executor router: `src/lib/skill-executors.ts`
Memory: `~/.claude/projects/.../memory/MEMORY.md`
