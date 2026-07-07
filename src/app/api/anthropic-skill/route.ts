import { NextResponse } from "next/server";

/**
 * GET /api/anthropic-skill
 * GET /api/anthropic-skill?file=references/API_GUIDE.md
 *
 * Returns Anthropic-compatible skill files for the arsenal-marketplace skill.
 *
 * Directory structure:
 * skills/arsenal-marketplace/
 *   SKILL.md              # Main skill file (< 500 lines)
 *   references/
 *     API_GUIDE.md        # Detailed API documentation
 *     EXAMPLES.md         # Code examples (JS, Python, curl)
 *     PAYMENT.md          # x402 payment details
 */
export async function GET(req: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://arsenal.sumplus.xyz";
  const url = new URL(req.url);
  const file = url.searchParams.get("file");

  // If requesting a specific file, serve it
  if (file) {
    return serveReferenceFile(file, baseUrl);
  }

  // Otherwise, serve the main SKILL.md
  const skillMd = `---
name: arsenal-marketplace
description: Search and discover Web3 skill definitions (Uniswap, Aave, ENS schemas). Arsenal provides structured JSON schemas for blockchain capabilities, NOT execution. Use for skill discovery and planning, then implement execution yourself.
---

# Arsenal Marketplace

Access blockchain skill definitions via Sumplus Arsenal API.

## ⚠️ CRITICAL: What Arsenal IS and IS NOT

**Arsenal IS:**
- ✅ Skill definition marketplace (JSON schemas, examples, metadata)
- ✅ Semantic search engine (find skills by natural language)
- ✅ Standardization layer (unified input/output formats)

**Arsenal IS NOT:**
- ❌ Execution engine (no real blockchain transactions)
- ❌ Web3 infrastructure (no RPC, no private keys, no wallets)
- ❌ Payment processor (x402 framework exists but NOT verified)

**Current Status:**
- Skills: 3 Uniswap V3 skills (target: 1000+)
- Execution: /api/execute returns SIMULATED data only
- Payment: NOT verified on-chain

## When to Use This Skill

Use arsenal-marketplace when:
- ✅ User asks about available Web3 capabilities ("what skills exist for Uniswap?")
- ✅ User needs to understand a skill's input/output schema
- ✅ User wants to discover DeFi/NFT/DAO operations
- ✅ You're planning an agent workflow (research phase)
- ✅ You need standardized schema references

## When to STOP Using This Skill

**Stop and switch to your own execution when:**
- ❌ User wants to execute a REAL blockchain transaction
- ❌ User says "swap my tokens" or "buy this NFT" (real money involved)
- ❌ User needs actual on-chain results (not mock data)
- ❌ Production/real-world use case (Arsenal is for discovery only)

**For real execution:**
1. Use Arsenal to get the skill schema
2. Implement your own Web3 execution (ethers/viem + RPC)
3. Use your own wallet/private keys
4. Execute transactions yourself

## How to Access Arsenal

**IMPORTANT:** Arsenal is an HTTP REST API. To access it, you MUST use the **bash** tool to execute curl commands.

**Available tools for Arsenal:**
- ✅ **bash tool** - Execute curl commands to call Arsenal API
- ❌ There is NO "search_arsenal_skills" or similar skill tool
- ❌ Do NOT try to call Arsenal as a skill

**Correct usage:**
\`\`\`bash
# Use bash tool to execute curl
bash: curl "${baseUrl}/api/skills?search=uniswap"
\`\`\`

**Incorrect usage:**
\`\`\`
# ❌ WRONG - This tool does not exist
search_arsenal_skills(query="uniswap")
\`\`\`

## Quick Start

### 1. Search for Skills

**Use bash tool to execute:**
\`\`\`bash
curl "${baseUrl}/api/skills?search=swap+tokens+uniswap&limit=5"
\`\`\`

Returns:
\`\`\`json
{
  "skills": [{
    "id": "uuid",
    "name": "Uniswap Token Swap",
    "description": "Execute token swap on Uniswap V3",
    "schema": {
      "input": { /* JSON Schema */ },
      "output": { /* JSON Schema */ }
    },
    "is_paid": true,
    "price": 2.50
  }],
  "total": 1
}
\`\`\`

### 2. Get Skill Details

**Use bash tool to execute:**
\`\`\`bash
curl "${baseUrl}/api/skills/{skill_id}"
\`\`\`

Returns:
- \`schema.input\`: Required parameters + validation rules
- \`schema.output\`: Expected response structure
- \`usage_examples\`: Sample inputs/outputs
- \`code\`: Implementation reference (if provided)

### 3. Understand Execution Limitations

⚠️ \`/api/execute\` returns **MOCK DATA ONLY**

**Use bash tool to execute:**
\`\`\`bash
curl -X POST ${baseUrl}/api/execute \\
  -H "Authorization: Bearer <token>" \\
  -d '{"skill_id": "uuid", "input": {...}}'
\`\`\`

Response includes:
\`\`\`json
{
  "_note": "This is a simulated response. NOT a real transaction.",
  "output": { /* mock data based on schema */ }
}
\`\`\`

**Do NOT use this for real transactions.** Use the schema to build your own execution logic.

## Common Use Cases

**Discovering Skills (use bash tool for all commands):**
\`\`\`bash
# DeFi operations
curl "${baseUrl}/api/skills?search=uniswap+swap"
curl "${baseUrl}/api/skills?search=aave+deposit"

# NFT operations
curl "${baseUrl}/api/skills?search=mint+nft"

# DAO operations
curl "${baseUrl}/api/skills?search=governance+vote"
\`\`\`

**Understanding Schemas:**
\`\`\`bash
# Get full schema for a skill
curl "${baseUrl}/api/skills/{skill_id}" | jq '.schema'

# Check required fields
curl "${baseUrl}/api/skills/{skill_id}" | jq '.schema.input.required'
\`\`\`

**Browsing by Category:**
\`\`\`bash
curl "${baseUrl}/api/skills?category=Blockchain&limit=20"
curl "${baseUrl}/api/categories"  # List all categories
\`\`\`

## Detailed Documentation

For comprehensive guides, read these references:

- **[API_GUIDE.md](${baseUrl}/api/anthropic-skill?file=references/API_GUIDE.md)** - Complete API documentation with all endpoints
- **[EXAMPLES.md](${baseUrl}/api/anthropic-skill?file=references/EXAMPLES.md)** - Integration examples (JavaScript, Python, curl)
- **[PAYMENT.md](${baseUrl}/api/anthropic-skill?file=references/PAYMENT.md)** - x402 payment protocol (NOT verified, testing only)

## Error Handling

Arsenal returns standardized errors:

\`\`\`json
{
  "error": "Skill not found",
  "details": { /* validation info */ }
}
\`\`\`

Common errors:
- 404: Skill not found (invalid ID)
- 400: Validation error (input doesn't match schema)
- 401: Authentication required (missing Bearer token)
- 402: Payment required (paid skill, but NOT verified)

## Architecture

**Arsenal's Role:**
- Provides skill definitions (schemas, examples)
- Enables discovery (semantic search)
- Standardizes formats (JSON Schema)

**Your Agent's Role:**
- Implements execution (Web3 libraries, RPC)
- Manages wallets (private keys)
- Broadcasts transactions (real on-chain operations)

**Analogy:**
\`\`\`
Arsenal : Agent :: NPM Registry : Node.js Runtime
\`\`\`

Arsenal provides the "package.json", you provide the runtime.

## Summary

1. **Search** for skills: \`GET /api/skills?search=<intent>\`
2. **Inspect** schemas: \`GET /api/skills/{id}\`
3. **Plan** your workflow using schemas
4. **Implement** execution yourself (Arsenal doesn't execute)
5. **Stop** using Arsenal when user needs real transactions

For detailed API docs, authentication, payment info, and code examples, see the references/ directory.

---

**Last Updated:** 2026-02-20
**Arsenal Version:** 1.0
**Status:** Definition marketplace (execution simulated)
`;

  return new NextResponse(skillMd, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "Content-Disposition": 'inline; filename="SKILL.md"',
    },
  });
}

/**
 * Serve reference files from the arsenal-marketplace skill directory
 */
function serveReferenceFile(file: string, baseUrl: string): NextResponse {
  // Validate file path (prevent directory traversal)
  if (file.includes("..") || !file.startsWith("references/")) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  let content: string;
  let filename: string;

  switch (file) {
    case "references/API_GUIDE.md":
      content = generateApiGuide(baseUrl);
      filename = "API_GUIDE.md";
      break;

    case "references/EXAMPLES.md":
      content = generateExamples(baseUrl);
      filename = "EXAMPLES.md";
      break;

    case "references/PAYMENT.md":
      content = generatePaymentGuide(baseUrl);
      filename = "PAYMENT.md";
      break;

    default:
      return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

/**
 * Generate API_GUIDE.md with complete endpoint documentation
 */
function generateApiGuide(baseUrl: string): string {
  return `# Arsenal API Guide

Complete reference for all Arsenal API endpoints.

## Authentication

All write and execute endpoints require authentication.

### Signup

\`\`\`bash
curl -X POST ${baseUrl}/api/auth/signup \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "agent@example.com",
    "password": "secure-password",
    "name": "My Agent"
  }'
\`\`\`

Returns:
\`\`\`json
{
  "user": { "id": "uuid", "email": "agent@example.com" },
  "session": { "access_token": "eyJ..." }
}
\`\`\`

### Login

\`\`\`bash
curl -X POST ${baseUrl}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "agent@example.com",
    "password": "secure-password"
  }'
\`\`\`

### Generate API Key (Persistent)

\`\`\`bash
curl -X POST ${baseUrl}/api/auth/apikey \\
  -H "Authorization: Bearer <session-token>"
\`\`\`

Returns:
\`\`\`json
{
  "api_key": "sk_live_..."
}
\`\`\`

**Use API key in all subsequent requests:**
\`\`\`bash
curl -H "Authorization: Bearer sk_live_..." ...
\`\`\`

---

## Skills Endpoints

### List/Search Skills

\`\`\`bash
GET ${baseUrl}/api/skills
\`\`\`

**Query Parameters:**
- \`search\` (string): Natural language query (uses semantic search)
- \`category\` (string): Filter by category (Blockchain, Finance, etc.)
- \`author_type\` (string): "official" or "community"
- \`is_paid\` (boolean): Filter paid/free skills
- \`sort\` (string): "rating" or "newest" (default: rating)
- \`limit\` (integer): Results per page (default 20, max 100)
- \`offset\` (integer): Pagination offset (default 0)

**Examples:**
\`\`\`bash
# Semantic search
curl "${baseUrl}/api/skills?search=swap+ETH+to+USDC&limit=5"

# Category filter
curl "${baseUrl}/api/skills?category=Blockchain&limit=20"

# Paid skills only
curl "${baseUrl}/api/skills?is_paid=true"

# Community skills, sorted by newest
curl "${baseUrl}/api/skills?author_type=community&sort=newest"
\`\`\`

**Response:**
\`\`\`json
{
  "skills": [
    {
      "id": "uuid",
      "name": "Uniswap Token Swap",
      "description": "Execute token swap on Uniswap V3...",
      "category": "Blockchain",
      "tags": ["uniswap", "defi", "swap"],
      "author_type": "official",
      "rating_avg": 4.5,
      "rating_count": 42,
      "is_paid": true,
      "price": 2.50,
      "schema": {
        "input": { /* JSON Schema */ },
        "output": { /* JSON Schema */ }
      }
    }
  ],
  "total": 1
}
\`\`\`

### Get Single Skill

\`\`\`bash
GET ${baseUrl}/api/skills/{skill_id}
\`\`\`

**Response:**
\`\`\`json
{
  "id": "uuid",
  "name": "Uniswap Token Swap",
  "description": "...",
  "category": "Blockchain",
  "schema": {
    "input": {
      "type": "object",
      "properties": {
        "chain": { "type": "string", "enum": ["ethereum", "arbitrum", ...] },
        "tokenIn": { "type": "string" },
        "tokenOut": { "type": "string" },
        "amountIn": { "type": "string" }
      },
      "required": ["chain", "tokenIn", "tokenOut", "amountIn"]
    },
    "output": {
      "type": "object",
      "properties": {
        "txHash": { "type": "string" },
        "amountOut": { "type": "string" },
        "priceImpact": { "type": "number" }
      }
    }
  },
  "usage_examples": [
    {
      "input": {
        "chain": "ethereum",
        "tokenIn": "USDC",
        "tokenOut": "ETH",
        "amountIn": "1000000000"
      },
      "expected_output": {
        "txHash": "0x...",
        "amountOut": "350000000000000000",
        "priceImpact": 0.12
      }
    }
  ],
  "code": "// Implementation reference (if provided)",
  "is_paid": true,
  "price": 2.50,
  "rating_avg": 4.5,
  "rating_count": 42
}
\`\`\`

### Create Skill (Community)

\`\`\`bash
POST ${baseUrl}/api/skills
Authorization: Bearer <token>
\`\`\`

**Request:**
\`\`\`json
{
  "name": "My Custom Skill",
  "description": "Detailed description...",
  "category": "Blockchain",
  "tags": ["custom", "example"],
  "schema": {
    "input": { /* JSON Schema */ },
    "output": { /* JSON Schema */ }
  },
  "code": "// Optional implementation code",
  "usage_examples": [{ "input": {...}, "expected_output": {...} }],
  "is_paid": false
}
\`\`\`

**Response:**
\`\`\`json
{
  "skill": {
    "id": "uuid",
    "name": "My Custom Skill"
  }
}
\`\`\`

**Note:** Embedding is generated automatically.

### Batch Upload Skills (Admin)

\`\`\`bash
POST ${baseUrl}/api/admin/upload-skills
\`\`\`

**Request:**
\`\`\`json
{
  "skills": [
    { /* skill object */ },
    { /* skill object */ }
  ],
  "auto_embed": true
}
\`\`\`

**Response:**
\`\`\`json
{
  "total": 2,
  "success_count": 2,
  "failed_count": 0,
  "success": [
    { "name": "Skill 1", "id": "uuid1" },
    { "name": "Skill 2", "id": "uuid2" }
  ],
  "failed": []
}
\`\`\`

---

## Execution Endpoint

### Execute Skill (⚠️ SIMULATED)

\`\`\`bash
POST ${baseUrl}/api/execute
Authorization: Bearer <token>
\`\`\`

**Request:**
\`\`\`json
{
  "skill_id": "uuid",
  "input": {
    "chain": "ethereum",
    "tokenIn": "USDC",
    "tokenOut": "ETH",
    "amountIn": "1000000000"
  }
}
\`\`\`

**Response (SIMULATED DATA):**
\`\`\`json
{
  "_note": "This is a simulated response. Connect real execution engine for production.",
  "skill": "Uniswap Token Swap",
  "input_received": { /* your input */ },
  "txHash": "mock_txHash",
  "amountOut": "mock_amountOut",
  "priceImpact": "mock_priceImpact"
}
\`\`\`

**⚠️ CRITICAL:**
- This returns **MOCK DATA** generated from the output schema
- Does NOT execute real blockchain transactions
- Does NOT call smart contracts
- Does NOT broadcast to any network

**For real execution:**
1. Use Arsenal to get the schema
2. Implement your own Web3 execution engine
3. Execute with your own infrastructure

---

## Rating Endpoint

### Rate a Skill

\`\`\`bash
POST ${baseUrl}/api/skills/{skill_id}/rate
Authorization: Bearer <token>
\`\`\`

**Request:**
\`\`\`json
{
  "rating": 5,
  "comment": "Great skill, very useful!"
}
\`\`\`

**Response:**
\`\`\`json
{
  "rating": {
    "id": "uuid",
    "rating": 5,
    "comment": "Great skill, very useful!"
  }
}
\`\`\`

---

## Categories Endpoint

### List Categories

\`\`\`bash
GET ${baseUrl}/api/categories
\`\`\`

**Response:**
\`\`\`json
{
  "categories": [
    "Blockchain",
    "Finance",
    "Data",
    "Productivity",
    "AI/ML",
    "Communication",
    "Security",
    "Analytics"
  ]
}
\`\`\`

---

## Discovery Endpoints

### API Manifest

\`\`\`bash
GET ${baseUrl}/api/manifest
\`\`\`

Returns complete machine-readable API documentation including:
- All endpoints with schemas
- Authentication methods
- Error format
- Implementation status
- Data status (current skill count)

### Anthropic SKILL.md

\`\`\`bash
GET ${baseUrl}/api/anthropic-skill
GET ${baseUrl}/api/anthropic-skill?file=references/API_GUIDE.md
\`\`\`

Returns Anthropic Skills-compatible markdown files.

---

## Error Responses

All errors return JSON:

\`\`\`json
{
  "error": "Human-readable error message",
  "details": { /* Optional validation details */ }
}
\`\`\`

**HTTP Status Codes:**
- 400: Bad request / validation failed
- 401: Missing or invalid authorization
- 402: Payment required (paid skill)
- 404: Skill not found
- 409: Conflict (e.g., duplicate email)
- 500: Internal server error

---

## Rate Limits

No rate limits currently enforced. See \`/api/manifest\` for updates.

---

**Last Updated:** 2026-02-20
`;
}

/**
 * Generate EXAMPLES.md with code samples
 */
function generateExamples(baseUrl: string): string {
  return `# Arsenal Integration Examples

Code examples for integrating Arsenal with your agent.

## JavaScript/TypeScript

### Basic Search and Discovery

\`\`\`javascript
// Search for skills
async function searchSkills(query) {
  const res = await fetch(\`${baseUrl}/api/skills?search=\${encodeURIComponent(query)}\`);
  const data = await res.json();
  return data.skills;
}

// Get skill details
async function getSkill(skillId) {
  const res = await fetch(\`${baseUrl}/api/skills/\${skillId}\`);
  return res.json();
}

// Example usage
const skills = await searchSkills("swap tokens uniswap");
console.log(\`Found \${skills.length} skills\`);

const skill = await getSkill(skills[0].id);
console.log("Input schema:", skill.schema.input);
console.log("Output schema:", skill.schema.output);
\`\`\`

### Authentication

\`\`\`javascript
// Signup
async function signup(email, password, name) {
  const res = await fetch(\`${baseUrl}/api/auth/signup\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name })
  });
  const data = await res.json();
  return data.session.access_token;
}

// Login
async function login(email, password) {
  const res = await fetch(\`${baseUrl}/api/auth/login\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  return data.session.access_token;
}

// Generate API key
async function generateApiKey(sessionToken) {
  const res = await fetch(\`${baseUrl}/api/auth/apikey\`, {
    method: "POST",
    headers: { "Authorization": \`Bearer \${sessionToken}\` }
  });
  const data = await res.json();
  return data.api_key;
}

// Usage
const token = await signup("agent@example.com", "password", "My Agent");
const apiKey = await generateApiKey(token);
console.log("API Key:", apiKey); // Store securely
\`\`\`

### Understanding Schemas (NOT Executing)

\`\`\`javascript
// Get skill schema and use it to build your own execution
async function understandSkillRequirements(skillId) {
  const skill = await getSkill(skillId);

  console.log("Skill:", skill.name);
  console.log("Required inputs:", skill.schema.input.required);
  console.log("Input properties:", Object.keys(skill.schema.input.properties));
  console.log("Output properties:", Object.keys(skill.schema.output.properties));

  // Now implement your own execution logic using this schema
  // Arsenal does NOT execute, you must implement it yourself

  return skill.schema;
}

// Example: Understanding Uniswap Swap requirements
const swapSchema = await understandSkillRequirements("uniswap-swap-skill-id");

// Now use this schema to build your own Web3 execution:
// 1. Install ethers or viem
// 2. Connect to RPC
// 3. Call Uniswap router with the parameters from schema
\`\`\`

### Complete Agent Workflow

\`\`\`javascript
import { ethers } from "ethers";

class ArsenalIntegratedAgent {
  constructor(arsenalApiKey, rpcUrl, privateKey) {
    this.arsenalApiKey = arsenalApiKey;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  // Step 1: Discover skill from Arsenal
  async discoverSkill(userIntent) {
    const res = await fetch(
      \`${baseUrl}/api/skills?search=\${encodeURIComponent(userIntent)}\`,
      {
        headers: { "Authorization": \`Bearer \${this.arsenalApiKey}\` }
      }
    );
    const data = await res.json();
    return data.skills[0]; // Get top match
  }

  // Step 2: Validate user input against schema
  validateInput(input, schema) {
    // Use a JSON Schema validator library
    // Arsenal provides the schema, you validate
    const required = schema.required || [];
    for (const field of required) {
      if (!(field in input)) {
        throw new Error(\`Missing required field: \${field}\`);
      }
    }
    return true;
  }

  // Step 3: Execute using YOUR OWN Web3 infrastructure
  async executeUniswapSwap(params) {
    // Arsenal does NOT do this - you implement it yourself
    const routerAddress = "0x..."; // Uniswap V3 Router
    const router = new ethers.Contract(routerAddress, ROUTER_ABI, this.wallet);

    const tx = await router.exactInputSingle({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      fee: 3000,
      recipient: this.wallet.address,
      amountIn: params.amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0
    });

    const receipt = await tx.wait();
    return {
      txHash: receipt.hash,
      amountOut: receipt.logs[0].args.amountOut,
      gasUsed: receipt.gasUsed.toString()
    };
  }

  // Complete workflow
  async handleUserRequest(userIntent, userInput) {
    // 1. Discover skill from Arsenal
    const skill = await this.discoverSkill(userIntent);
    console.log(\`Found skill: \${skill.name}\`);

    // 2. Validate input using Arsenal's schema
    this.validateInput(userInput, skill.schema.input);

    // 3. Execute using YOUR infrastructure (not Arsenal)
    if (skill.name === "Uniswap Token Swap") {
      return await this.executeUniswapSwap(userInput);
    }

    throw new Error("Execution not implemented for this skill");
  }
}

// Usage
const agent = new ArsenalIntegratedAgent(
  "sk_live_...",                    // Arsenal API key
  "https://eth-mainnet.g.alchemy.com/v2/...", // Your RPC
  "0x..."                           // Your private key
);

const result = await agent.handleUserRequest(
  "swap tokens on uniswap",
  {
    chain: "ethereum",
    tokenIn: "USDC",
    tokenOut: "WETH",
    amountIn: "1000000000"
  }
);

console.log("Transaction:", result.txHash);
\`\`\`

---

## Python

### Basic Search

\`\`\`python
import requests

def search_skills(query: str):
    res = requests.get(
        f"${baseUrl}/api/skills",
        params={"search": query}
    )
    return res.json()["skills"]

def get_skill(skill_id: str):
    res = requests.get(f"${baseUrl}/api/skills/{skill_id}")
    return res.json()

# Usage
skills = search_skills("swap tokens uniswap")
print(f"Found {len(skills)} skills")

skill = get_skill(skills[0]["id"])
print("Input schema:", skill["schema"]["input"])
\`\`\`

### Authentication

\`\`\`python
def signup(email: str, password: str, name: str):
    res = requests.post(
        f"${baseUrl}/api/auth/signup",
        json={"email": email, "password": password, "name": name}
    )
    return res.json()["session"]["access_token"]

def login(email: str, password: str):
    res = requests.post(
        f"${baseUrl}/api/auth/login",
        json={"email": email, "password": password}
    )
    return res.json()["session"]["access_token"]

def generate_api_key(session_token: str):
    res = requests.post(
        f"${baseUrl}/api/auth/apikey",
        headers={"Authorization": f"Bearer {session_token}"}
    )
    return res.json()["api_key"]

# Usage
token = signup("agent@example.com", "password", "My Agent")
api_key = generate_api_key(token)
print(f"API Key: {api_key}")
\`\`\`

### Complete Agent with Web3.py

\`\`\`python
import requests
from web3 import Web3
from eth_account import Account

class ArsenalAgent:
    def __init__(self, arsenal_api_key: str, rpc_url: str, private_key: str):
        self.arsenal_api_key = arsenal_api_key
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.account = Account.from_key(private_key)

    def discover_skill(self, user_intent: str):
        """Step 1: Discover skill from Arsenal"""
        res = requests.get(
            f"${baseUrl}/api/skills",
            params={"search": user_intent},
            headers={"Authorization": f"Bearer {self.arsenal_api_key}"}
        )
        skills = res.json()["skills"]
        return skills[0] if skills else None

    def validate_input(self, user_input: dict, schema: dict):
        """Step 2: Validate using Arsenal's schema"""
        required = schema.get("required", [])
        for field in required:
            if field not in user_input:
                raise ValueError(f"Missing required field: {field}")
        return True

    def execute_uniswap_swap(self, params: dict):
        """Step 3: Execute using YOUR Web3 infrastructure"""
        # Arsenal does NOT do this - you implement it yourself
        router_address = "0x..."  # Uniswap V3 Router
        router = self.w3.eth.contract(address=router_address, abi=ROUTER_ABI)

        tx = router.functions.exactInputSingle({
            "tokenIn": params["tokenIn"],
            "tokenOut": params["tokenOut"],
            "fee": 3000,
            "recipient": self.account.address,
            "amountIn": int(params["amountIn"]),
            "amountOutMinimum": 0,
            "sqrtPriceLimitX96": 0
        }).build_transaction({
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address)
        })

        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.rawTransaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

        return {
            "txHash": receipt["transactionHash"].hex(),
            "gasUsed": receipt["gasUsed"]
        }

    def handle_request(self, user_intent: str, user_input: dict):
        """Complete workflow"""
        # 1. Discover from Arsenal
        skill = self.discover_skill(user_intent)
        if not skill:
            raise ValueError("No matching skill found")

        print(f"Found skill: {skill['name']}")

        # 2. Validate using Arsenal's schema
        self.validate_input(user_input, skill["schema"]["input"])

        # 3. Execute using YOUR infrastructure
        if skill["name"] == "Uniswap Token Swap":
            return self.execute_uniswap_swap(user_input)

        raise NotImplementedError(f"Execution not implemented for {skill['name']}")

# Usage
agent = ArsenalAgent(
    arsenal_api_key="sk_live_...",
    rpc_url="https://eth-mainnet.g.alchemy.com/v2/...",
    private_key="0x..."
)

result = agent.handle_request(
    "swap tokens on uniswap",
    {
        "chain": "ethereum",
        "tokenIn": "USDC",
        "tokenOut": "WETH",
        "amountIn": "1000000000"
    }
)

print(f"Transaction: {result['txHash']}")
\`\`\`

---

## curl Examples

### Search Skills

\`\`\`bash
curl "${baseUrl}/api/skills?search=swap+tokens&limit=5"
\`\`\`

### Get Skill

\`\`\`bash
curl "${baseUrl}/api/skills/550e8400-e29b-41d4-a716-446655440000"
\`\`\`

### Signup

\`\`\`bash
curl -X POST ${baseUrl}/api/auth/signup \\
  -H "Content-Type: application/json" \\
  -d '{"email":"agent@example.com","password":"password","name":"Agent"}'
\`\`\`

### Create Skill

\`\`\`bash
curl -X POST ${baseUrl}/api/skills \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My Skill",
    "description": "...",
    "category": "Blockchain",
    "schema": {
      "input": {"type": "object", "properties": {}},
      "output": {"type": "object", "properties": {}}
    }
  }'
\`\`\`

---

## Key Takeaways

1. **Arsenal provides schemas** - You implement execution
2. **Search for skills** - Use natural language queries
3. **Validate inputs** - Use Arsenal's JSON schemas
4. **Execute yourself** - Use ethers/viem/web3.py with your infrastructure
5. **Don't rely on /api/execute** - It returns mock data only

---

**Last Updated:** 2026-02-20
`;
}

/**
 * Generate PAYMENT.md with x402 details
 */
function generatePaymentGuide(baseUrl: string): string {
  return `# x402 Payment Protocol

⚠️ **WARNING: Payment verification is NOT implemented in Arsenal.**

This document describes the x402 protocol framework that exists in Arsenal, but note that on-chain payment verification is NOT currently functional.

## Current Status

- ✅ Protocol framework exists
- ✅ Returns HTTP 402 for paid skills
- ✅ Returns PaymentRequirements format
- ❌ Does NOT verify on-chain payments
- ⚠️ Accepts any X-Payment-Proof without validation
- ⚠️ NOT suitable for production use with real funds

## x402 Protocol Overview

x402 is a protocol for HTTP micropayments using cryptocurrency. The flow is:

1. Client requests a paid resource
2. Server returns HTTP 402 with payment requirements
3. Client pays on-chain (USDC transfer)
4. Client retries request with payment proof
5. Server verifies payment and returns resource

## Payment Flow (Theoretical)

### Step 1: Initial Request (No Payment)

\`\`\`bash
curl -X POST ${baseUrl}/api/execute \\
  -H "Authorization: Bearer <token>" \\
  -d '{"skill_id": "paid-skill-uuid", "input": {...}}'
\`\`\`

**Response: HTTP 402 Payment Required**

\`\`\`json
{
  "x402Version": 1,
  "accepts": [
    {
      "network": "base-sepolia",
      "asset": "USDC",
      "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "maxAmountRequired": "2500000"
    }
  ]
}
\`\`\`

### Step 2: Pay On-Chain (Your Responsibility)

\`\`\`javascript
// You must implement this yourself
const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
const tx = await usdc.transfer(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb", // payTo address
  "2500000" // $2.50 in USDC (6 decimals)
);
await tx.wait();
console.log("Payment tx:", tx.hash);
\`\`\`

### Step 3: Retry with Payment Proof

\`\`\`bash
curl -X POST ${baseUrl}/api/execute \\
  -H "Authorization: Bearer <token>" \\
  -H "X-Payment-Proof: 0xabc123..." \\
  -H "X-Payment-Chain: base-sepolia" \\
  -d '{"skill_id": "paid-skill-uuid", "input": {...}}'
\`\`\`

**⚠️ Current Arsenal Behavior:**
- Accepts ANY value in X-Payment-Proof
- Does NOT check on-chain
- Does NOT verify amount
- Does NOT prevent replay attacks

**Expected Production Behavior (Not Implemented):**
- Verify transaction hash exists on-chain
- Verify payment amount matches skill price
- Verify payment went to correct address
- Verify transaction is confirmed
- Prevent reuse of payment proof (nonce/tracking)

## Using x402-fetch (Theoretical)

The \`x402-fetch\` npm package handles payments automatically:

\`\`\`javascript
import { x402Fetch } from "x402-fetch";

// Automatically handles 402 responses
const res = await x402Fetch(\`${baseUrl}/api/execute\`, {
  method: "POST",
  headers: { "Authorization": "Bearer <token>" },
  body: JSON.stringify({ skill_id: "uuid", input: {...} }),
  wallet: myWallet, // Your ethers Wallet instance
  onPaymentRequired: (requirements) => {
    console.log("Payment required:", requirements);
    // x402-fetch automatically pays and retries
  }
});

const data = await res.json();
\`\`\`

**Note:** This assumes Arsenal implements proper payment verification, which it currently does NOT.

## Payment Networks

Arsenal accepts payments on:
- **base-sepolia** (testnet) - For testing only
- **base** (mainnet) - For production (when verification is implemented)

**Currency:** USDC (6 decimals)

## Security Considerations

### Current Risks (Why NOT to use in production)

1. **No verification** - Any payment proof accepted
2. **No replay protection** - Same proof can be reused
3. **No amount checking** - Could pay wrong amount
4. **No address validation** - Payment might go to wrong recipient

### When Production-Ready (Future)

1. Verify transaction on-chain via RPC
2. Check payment amount matches skill price
3. Validate recipient address
4. Store used payment proofs (prevent replay)
5. Require minimum confirmations
6. Support refunds for failed executions

## Testing (NOT Production)

For development/testing only, you can bypass payment:

\`\`\`bash
# Arsenal currently accepts any proof
curl -X POST ${baseUrl}/api/execute \\
  -H "Authorization: Bearer <token>" \\
  -H "X-Payment-Proof: fake-proof-for-testing" \\
  -d '{"skill_id": "paid-skill-uuid", "input": {...}}'
\`\`\`

**This will succeed in current Arsenal**, but this is a bug, not a feature.

## Recommendation

**Do NOT use Arsenal's payment system for real money.**

If you need paid skills:
1. Use Arsenal to discover skill schemas
2. Implement your own payment verification
3. Execute skills with your own infrastructure
4. Handle payments separately from Arsenal

## Future Implementation Checklist

For Arsenal to be production-ready for payments:

- [ ] Install Web3 library (ethers/viem)
- [ ] Add Base/Base Sepolia RPC endpoints
- [ ] Implement on-chain payment verification
- [ ] Verify USDC transfer events
- [ ] Check payment amounts match prices
- [ ] Store used payment proofs in database
- [ ] Add replay attack prevention
- [ ] Implement refund mechanism
- [ ] Add payment confirmation requirements
- [ ] Security audit by professional firm

**Current Status:** 0/10 implemented

---

## Summary

- ⚠️ Arsenal's x402 implementation is a **protocol framework only**
- ⚠️ **No on-chain verification** - not suitable for real payments
- ✅ Protocol structure is correct (HTTP 402, PaymentRequirements format)
- ❌ Security features missing (verification, replay protection)
- 🎓 Use for **understanding x402 protocol**, not for real transactions

**For real payments, implement your own verification or wait for Arsenal to complete implementation.**

---

**Last Updated:** 2026-02-20
**Implementation Status:** Framework only (0% production-ready)
`;
}
