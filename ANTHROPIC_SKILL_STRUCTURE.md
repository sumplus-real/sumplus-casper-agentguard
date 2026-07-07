# Arsenal Anthropic SKILL.md 结构说明

**更新时间**: 2026-02-20
**原因**: 符合 Anthropic Skills 最佳实践（body < 500 行，使用 references/ 目录）

---

## 📁 目录结构

```
skills/arsenal-marketplace/
  SKILL.md                  # 主文件（196 行，< 500 ✅）
  references/
    API_GUIDE.md           # 完整 API 文档（399 行）
    EXAMPLES.md            # 代码示例（407 行）
    PAYMENT.md             # x402 支付说明（194 行）
```

---

## 🔗 访问方式

### 主 SKILL.md

```bash
curl https://arsenal.sumplus.xyz/api/anthropic-skill
```

**内容**（196 行）:
- YAML frontmatter（name, description）
- What Arsenal IS and IS NOT
- When to Use / When to STOP Using
- Quick Start（3 个基础示例）
- Common Use Cases
- Error Handling
- Architecture 说明
- 链接到 references/ 详细文档

### References 文件

```bash
# API 完整文档
curl https://arsenal.sumplus.xyz/api/anthropic-skill?file=references/API_GUIDE.md

# 代码示例
curl https://arsenal.sumplus.xyz/api/anthropic-skill?file=references/EXAMPLES.md

# 支付协议
curl https://arsenal.sumplus.xyz/api/anthropic-skill?file=references/PAYMENT.md
```

---

## ✅ 符合 Anthropic 最佳实践

### 1. Body < 500 行

**要求**: Skill body 应该简洁，详细内容放到 references/

**Arsenal 实现**:
- ✅ SKILL.md: 196 行（< 500）
- ✅ 详细 API 文档 → API_GUIDE.md
- ✅ 代码示例 → EXAMPLES.md
- ✅ 支付协议 → PAYMENT.md

### 2. Progressive Disclosure

**Level 1**: YAML frontmatter（~100 tokens）
```yaml
---
name: arsenal-marketplace
description: Search and discover Web3 skill definitions...
---
```

**Level 2**: SKILL.md body（~2k tokens）
- 核心概念（IS vs IS NOT）
- When to Use / When to STOP
- Quick Start 示例
- 链接到详细文档

**Level 3**: References（按需加载）
- API_GUIDE.md - 完整 API 参考
- EXAMPLES.md - 多语言示例代码
- PAYMENT.md - x402 详细说明

### 3. "When to Stop" 指引

**明确告知 Claude 何时停用该 skill**:

```markdown
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
```

---

## 📝 SKILL.md 内容摘要

### Section 1: Critical Warnings

```markdown
## ⚠️ CRITICAL: What Arsenal IS and IS NOT

**Arsenal IS:**
- ✅ Skill definition marketplace
- ✅ Semantic search engine
- ✅ Standardization layer

**Arsenal IS NOT:**
- ❌ Execution engine
- ❌ Web3 infrastructure
- ❌ Payment processor

**Current Status:**
- Skills: 3 Uniswap V3 skills (target: 1000+)
- Execution: SIMULATED data only
- Payment: NOT verified
```

### Section 2: Usage Guidelines

```markdown
## When to Use This Skill

Use arsenal-marketplace when:
- ✅ User asks about available Web3 capabilities
- ✅ User needs to understand schemas
- ✅ Planning workflows (research phase)

## When to STOP Using This Skill

Stop when:
- ❌ User wants REAL blockchain transactions
- ❌ Real money involved
- ❌ Production use case
```

### Section 3: Quick Start

3 个基础示例:
1. Search for Skills
2. Get Skill Details
3. Understand Execution Limitations

每个示例都包含 curl 命令和响应格式。

### Section 4: Common Use Cases

- Discovering Skills (DeFi, NFT, DAO)
- Understanding Schemas
- Browsing by Category

### Section 5: Detailed Documentation

链接到 references/ 文件:
- API_GUIDE.md - 完整 API 文档
- EXAMPLES.md - 集成示例（JS, Python, curl）
- PAYMENT.md - x402 协议详情

### Section 6: Architecture

```markdown
Arsenal : Agent :: NPM Registry : Node.js Runtime
```

Arsenal 提供 "package.json"（skill 定义），Agent 提供 runtime（执行基础设施）。

---

## 📚 References 文件内容

### API_GUIDE.md（399 行）

完整的 API 参考文档：

**章节**:
1. Authentication（Signup, Login, API Key）
2. Skills Endpoints（List, Search, Get, Create, Batch Upload）
3. Execution Endpoint（⚠️ SIMULATED）
4. Rating Endpoint
5. Categories Endpoint
6. Discovery Endpoints（Manifest, Anthropic SKILL.md）
7. Error Responses
8. Rate Limits

每个端点都包含：
- HTTP 方法和路径
- Query/Body 参数说明
- 请求示例
- 响应格式
- 注意事项

### EXAMPLES.md（407 行）

多语言集成示例：

**JavaScript/TypeScript**:
- Basic Search and Discovery
- Authentication
- Understanding Schemas (NOT Executing)
- Complete Agent Workflow（使用 ethers 实现真实执行）

**Python**:
- Basic Search
- Authentication
- Complete Agent with Web3.py

**curl**:
- 常用操作的 curl 示例

**Key Takeaways**:
1. Arsenal provides schemas - You implement execution
2. Search for skills - Use natural language
3. Validate inputs - Use Arsenal's schemas
4. Execute yourself - Use ethers/viem/web3.py
5. Don't rely on /api/execute - Mock data only

### PAYMENT.md（194 行）

x402 支付协议说明：

**章节**:
1. Current Status（⚠️ NOT implemented）
2. x402 Protocol Overview
3. Payment Flow（Theoretical）
4. Using x402-fetch
5. Payment Networks
6. Security Considerations
7. Testing（NOT Production）
8. Recommendation（Do NOT use for real money）
9. Future Implementation Checklist

---

## 🔒 安全特性

### 路径验证

```typescript
function serveReferenceFile(file: string, baseUrl: string): NextResponse {
  // Validate file path (prevent directory traversal)
  if (file.includes("..") || !file.startsWith("references/")) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }
  // ...
}
```

**保护**:
- ✅ 阻止 `../` 目录遍历攻击
- ✅ 只允许 `references/` 下的文件
- ✅ 白名单文件列表（API_GUIDE, EXAMPLES, PAYMENT）

### 错误处理

- 400: Invalid file path（路径包含 `..` 或不在 references/）
- 404: File not found（文件不在白名单）

---

## 🎯 使用示例

### 下载完整 Skill（Claude Agent）

```bash
# 1. 下载主 SKILL.md
curl https://arsenal.sumplus.xyz/api/anthropic-skill \
  > skills/arsenal-marketplace/SKILL.md

# 2. 下载 references/
mkdir -p skills/arsenal-marketplace/references

curl "https://arsenal.sumplus.xyz/api/anthropic-skill?file=references/API_GUIDE.md" \
  > skills/arsenal-marketplace/references/API_GUIDE.md

curl "https://arsenal.sumplus.xyz/api/anthropic-skill?file=references/EXAMPLES.md" \
  > skills/arsenal-marketplace/references/EXAMPLES.md

curl "https://arsenal.sumplus.xyz/api/anthropic-skill?file=references/PAYMENT.md" \
  > skills/arsenal-marketplace/references/PAYMENT.md
```

### Claude 的工作流程

```
1. [Level 1] Scan skills/ directory
   → Read YAML frontmatter: "arsenal-marketplace: Web3 skill definitions"

2. [User asks: "What skills exist for Uniswap?"]
   → Match: "Web3 skill definitions" → Trigger arsenal-marketplace

3. [Level 2] Read SKILL.md body
   → Learn: Arsenal IS definition marketplace, IS NOT execution
   → Learn: When to use, When to STOP
   → See Quick Start examples

4. [Execute Quick Start]
   → bash: curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap"
   → Receive: List of Uniswap skills with schemas

5. [If need detailed API info - Level 3]
   → Read references/API_GUIDE.md for complete endpoint docs

6. [If need code examples - Level 3]
   → Read references/EXAMPLES.md for integration code

7. [If user says "swap my tokens" - STOP]
   → "When to STOP" triggers
   → Switch to own execution infrastructure
   → Don't call /api/execute (mock data only)
```

---

## 📊 对比：重构前 vs 重构后

### 重构前（问题）

```
SKILL.md（~800 行）
  ├─ YAML frontmatter
  ├─ What Arsenal Provides/Does NOT
  ├─ Quick Start（内联大量示例）
  ├─ Complete API Guide（所有端点详情）
  ├─ JavaScript 示例（200+ 行代码）
  ├─ Python 示例（150+ 行代码）
  ├─ curl 示例
  └─ x402 支付详细说明
```

**问题**:
- ❌ Body 太长（~800 行 >> 500 行）
- ❌ 没有 references/ 目录
- ❌ 缺少 "When to STOP" 指引
- ❌ 所有内容一次性加载（违反 Progressive Disclosure）

### 重构后（解决）

```
SKILL.md（196 行）✅
  ├─ YAML frontmatter
  ├─ What Arsenal IS and IS NOT
  ├─ When to Use / When to STOP ✅
  ├─ Quick Start（3 个简洁示例）
  ├─ Common Use Cases
  ├─ Links to references/ ✅
  └─ Architecture 说明

references/API_GUIDE.md（399 行）
  └─ 完整 API 文档

references/EXAMPLES.md（407 行）
  └─ 多语言集成示例

references/PAYMENT.md（194 行）
  └─ x402 支付协议
```

**优势**:
- ✅ SKILL.md < 500 行
- ✅ Progressive Disclosure（Level 1 → 2 → 3）
- ✅ "When to STOP" 明确告知
- ✅ References 按需加载
- ✅ 符合 Anthropic 最佳实践

---

## 🚀 部署说明

### 本地测试

```bash
# 启动开发服务器
npm run dev

# 测试主 SKILL.md
curl http://localhost:3000/api/anthropic-skill | wc -l
# 预期：~196 行

# 测试 references
curl "http://localhost:3000/api/anthropic-skill?file=references/API_GUIDE.md" | head -20
curl "http://localhost:3000/api/anthropic-skill?file=references/EXAMPLES.md" | head -20
curl "http://localhost:3000/api/anthropic-skill?file=references/PAYMENT.md" | head -20

# 测试安全
curl "http://localhost:3000/api/anthropic-skill?file=references/../SKILL.md"
# 预期：{"error":"Invalid file path"}
```

### 生产环境

代码部署到 Vercel 后，Anthropic Agents 可以：

```bash
# 下载主 SKILL.md
curl https://arsenal.sumplus.xyz/api/anthropic-skill \
  > skills/arsenal-marketplace/SKILL.md

# 按需下载 references
curl "https://arsenal.sumplus.xyz/api/anthropic-skill?file=references/API_GUIDE.md" \
  > skills/arsenal-marketplace/references/API_GUIDE.md
```

---

## 📝 未来改进

### 可选增强

1. **支持完整目录下载**
   ```bash
   GET /api/anthropic-skill?format=zip
   # 返回包含所有文件的 zip 包
   ```

2. **添加更多 references**
   - `TROUBLESHOOTING.md` - 常见问题解答
   - `MIGRATION.md` - 从其他平台迁移指南
   - `BEST_PRACTICES.md` - 最佳实践

3. **版本管理**
   ```bash
   GET /api/anthropic-skill?version=1.0
   GET /api/anthropic-skill?version=latest
   ```

4. **CDN 缓存优化**
   - 添加更长的 Cache-Control
   - 使用 ETags

---

## 🎓 经验教训

### 1. 遵循平台规范很重要

**Anthropic 的标准**:
- Body < 500 行 → 保证加载速度和可读性
- References/ 目录 → Progressive Disclosure
- "When to stop" → 避免 agent 无限循环使用错误的 skill

**Arsenal 的实现**:
- 主文件精简到 196 行
- 详细内容拆分到 3 个 references
- 明确的使用/停止指引

### 2. Progressive Disclosure 的价值

**不是一次性加载所有内容**，而是：
- Level 1: Metadata（判断是否相关）
- Level 2: Instructions（学习如何使用）
- Level 3: Resources（深入细节）

节省 token，提升性能。

### 3. "When to Stop" 的重要性

**避免 Agent 陷入错误的工作流**:
- Arsenal 返回 mock 数据，不能用于真实交易
- 必须明确告诉 Agent："发现用户要真实交易时，STOP 使用 Arsenal，切换到自己的执行引擎"

### 4. 安全第一

**即使是只读 API，也要防止**:
- 目录遍历攻击（`../`）
- 访问未授权文件
- 白名单机制

---

## 📚 参考资料

- [Anthropic Skills 官方文档](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Anthropic Skills GitHub](https://github.com/anthropics/skills)
- [Arsenal API Manifest](https://arsenal.sumplus.xyz/api/manifest)
- [Arsenal Features Status](https://github.com/sumplus-real/arsenal/blob/main/FEATURES.md)

---

**创建时间**: 2026-02-20
**状态**: ✅ 已实现并测试
**符合标准**: Anthropic Skills 最佳实践
