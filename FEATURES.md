# Arsenal - Complete Features Documentation

**Last Updated**: 2026-02-21

This document provides a comprehensive breakdown of all Arsenal features and their implementation status.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Key Features](#key-features)
3. [Implementation Status](#implementation-status)
4. [Access Methods](#access-methods)

---

## Architecture Overview

### What Arsenal IS

Arsenal is a **skills marketplace platform** providing:

- **Skill Definitions**: JSON schemas, documentation, examples
- **Semantic Search**: Qwen text-embedding-v4 + pgvector
- **Standardization Layer**: Unified input/output formats
- **Multiple Access Methods**: REST API, MCP Server, Anthropic Skills

### What Arsenal is NOT

- ❌ **Blockchain Execution Engine**: No Web3 libraries, RPC, or private keys
- ❌ **Payment Processor**: Payment verification not implemented
- ❌ **Wallet Service**: No custody or transaction broadcasting

### Architecture Model

```
Arsenal : Agent :: NPM Registry : Node.js Runtime
```

Arsenal provides the "package.json" (skill definitions), agents provide the runtime (execution infrastructure).

---

## Key Features

### ✅ Fully Implemented

1. **Skill Management** - CRUD operations, semantic search, approval workflow
2. **Authentication** - JWT + API keys for human users and AI agents
3. **Semantic Search** - pgvector with Qwen text-embedding-v4 (1536 dimensions)
4. **Rating System** - 1-5 star ratings with reviews
5. **Categories** - Extracted from approved skills, dynamically updated
6. **REST API** - Standard HTTP/JSON endpoints with pagination and filtering
7. **Anthropic Skills** - Compatible SKILL.md with progressive disclosure
8. **MCP Server** - Resources (skills) + Tools (search, execute, categories)
9. **Unified Architecture** - Shared SkillsService consumed by all interfaces
10. **Arsenal Guide** - Lightweight onboarding skill for new users
11. **Frontend** - Skills listing, detail pages, search, upload interface

### ⚠️ Partially Implemented

1. **Skill Execution** - Returns MOCK data only, not real blockchain execution
2. **x402 Payment** - Framework exists, verification not implemented
3. **MCP Server Testing** - Code complete, needs testing with Claude

### ❌ Not Implemented

1. **Real Blockchain Execution** - Deliberately not implemented (architectural decision)
2. **On-Chain Payment Verification** - Needs infrastructure investment
3. **Skill Dependency Resolution** - Not yet implemented
4. **Large Skills Library** - 6 skills currently (goal: 1000+)

---

## Implementation Status

### Unified Data Model ✅

**File**: `src/types/skill.ts`

- ArsenalSkill interface (unified across all access methods)
- SkillFilters, SkillSearchResult types
- SkillExecutionInput, SkillExecutionResult types
- Feature declarations (code-execution, network-access, mcp-tools, web3-wallet, payment-proof)

### Shared Service Layer ✅

**File**: `src/services/skills.service.ts`

**Methods**:
- `searchSkills()` - Semantic search with pgvector
- `getSkill()` - Get skill by ID
- `getSkillAsAnthropicFormat()` - SKILL.md generation
- `getSkillReference()` - Get reference files
- `createSkill()` - Create new skill with embedding
- `executeSkill()` - Execute skill (returns mock data)
- `rateSkill()` - Rate a skill
- `getCategories()` - List all categories

### REST API ✅

**Refactored**: All routes now use shared SkillsService

**Routes**:
- `/api/skills` - Uses SkillsService.searchSkills()
- `/api/skills/[id]` - Uses SkillsService.getSkill()
- `/api/skills/[id]/rate` - Uses SkillsService.rateSkill()
- `/api/execute` - Uses SkillsService.executeSkill()
- `/api/categories` - Uses SkillsService.getCategories()

### MCP Server ✅

**Files**:
- `src/mcp/server.ts` - MCP Server implementation
- `bin/mcp-server.js` - Executable for Claude Desktop

**Capabilities**:
- Resources: `arsenal://skills/{id}` (skill content)
- Tools: searchSkills, getSkill, executeSkill, getCategories
- Uses shared SkillsService

**Configuration**:
```json
{
  "mcpServers": {
    "arsenal": {
      "command": "node",
      "args": ["/path/to/arsenal/bin/mcp-server.js"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "...",
        "SUPABASE_SERVICE_ROLE_KEY": "...",
        "OPENAI_BASE_URL": "...",
        "OPENAI_API_KEY": "..."
      }
    }
  }
}
```

### Arsenal Guide Skill ✅

**File**: `skills/arsenal-guide/SKILL.md`

**Content**:
- What is Arsenal
- MCP vs REST decision guide
- Recommended workflows
- Common patterns
- FAQ
- "When to STOP" guidance

---

## Access Methods

### 1. REST API

**Base URL**: `https://arsenal.sumplus.xyz`

**Use When**:
- Building custom agents (non-Claude)
- Need programmatic access from any language
- Want HTTP-based integration

**Example**:
```bash
curl "https://arsenal.sumplus.xyz/api/skills?search=swap+tokens"
```

### 2. MCP Server

**Use When**:
- Have Claude Desktop or Claude Code
- Want native Claude integration
- Prefer resource-based access

**Example**:
```javascript
use_mcp_tool("arsenal", "searchSkills", { query: "swap tokens" })
read_resource("arsenal://skills/{id}")
```

### 3. Anthropic Skills

**Endpoint**: `GET /api/anthropic-skill`

**Features**:
- Main SKILL.md (196 lines, < 500 ✅)
- References: API_GUIDE.md, EXAMPLES.md, PAYMENT.md
- Progressive disclosure
- "When to STOP" guidance

**Example**:
```bash
curl https://arsenal.sumplus.xyz/api/anthropic-skill
curl "https://arsenal.sumplus.xyz/api/anthropic-skill?file=references/API_GUIDE.md"
```

---

## Testing

### REST API Tests ✅

```bash
# List skills
curl http://localhost:3000/api/skills?limit=2

# Search skills
curl "http://localhost:3000/api/skills?search=swap+tokens"

# Get categories
curl http://localhost:3000/api/categories

# Result: All endpoints working correctly
```

### MCP Server Tests ⏳

**Status**: Code complete, needs testing with Claude Desktop

**Next Steps**:
1. Configure Claude Desktop with MCP server
2. Test resource loading
3. Test tool execution
4. Verify progressive disclosure

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Embedding API
OPENAI_BASE_URL=https://your-embedding-api.com
OPENAI_API_KEY=your-embedding-key
EMBEDDING_MODEL=text-embedding-v4

# x402 Payment (optional)
X402_FACILITATOR_URL=https://facilitator.x402.com
X402_RECEIVER_ADDRESS=0x...
X402_NETWORK=base
```

---

## Summary

### What Works ✅

- Complete skill marketplace platform
- Unified architecture with shared service layer
- Dual interface support (REST API + MCP Server)
- Semantic search with pgvector
- Anthropic Skills compatibility
- Authentication and rating systems
- 6 production skills

### What's Mock ⚠️

- Skill execution (returns simulated data)
- Payment verification (framework only)

### What's Missing ❌

- Real blockchain execution (architectural decision - agents implement their own)
- On-chain payment verification
- Large skills library (6/1000+)

---

For detailed API documentation, see:
- [API.md](./API.md)
- [STATUS.md](./STATUS.md)
- [ANTHROPIC_COMPATIBILITY.md](./ANTHROPIC_COMPATIBILITY.md)
