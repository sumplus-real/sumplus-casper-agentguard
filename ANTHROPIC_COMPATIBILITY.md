# Anthropic Skills Compatibility

## TL;DR

**Arsenal 和 Anthropic Skills 是互补关系，不是竞争关系。**

- **Anthropic Skills**: 教 Claude 如何执行任务的文件系统指南
- **Arsenal**: 提供可执行 Web3 能力的 API 市场

**兼容方案**: Arsenal 提供 Anthropic SKILL.md 文件，教 Agent 如何使用 Arsenal API。

---

## 架构对比

| 维度 | Anthropic Skills | Arsenal |
|------|------------------|---------|
| **存储** | 文件系统（SKILL.md） | PostgreSQL + pgvector |
| **格式** | YAML frontmatter + Markdown | JSON API |
| **内容** | 使用指南（Instructions） | 可执行能力（Schemas + Code） |
| **发现** | 文件系统扫描 | 语义搜索（Qwen embeddings） |
| **执行** | Claude 按指令操作 | API 调用返回结果 |
| **适用场景** | 教 Claude 做某事 | 提供标准化 Web3 能力 |

## Anthropic Skills 架构详解

### 文件结构

```
skills/
  pdf-processing/
    SKILL.md          # 核心文件：metadata + instructions
    FORMS.md          # 可选：额外文档
    extract.py        # 可选：可执行脚本
    templates/        # 可选：资源文件
```

### SKILL.md 格式

```yaml
---
name: pdf-processing
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files.
---

# PDF Processing

## Quick start

Use pdfplumber to extract text:

```python
import pdfplumber
with pdfplumber.open("document.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

For form filling, see [FORMS.md](FORMS.md).
```

### 渐进式披露（Progressive Disclosure）

**Level 1: Metadata（始终加载）**
- YAML frontmatter: `name`, `description`
- ~100 tokens/skill
- 用于触发判断

**Level 2: Instructions（触发时加载）**
- Markdown 正文
- <5k tokens
- 包含使用指南、代码示例

**Level 3: Resources（按需加载）**
- 额外的 markdown 文件
- 可执行脚本
- 数据文件
- 无限制大小

### 工作流程

1. **扫描**: Claude 扫描文件系统，读取所有 SKILL.md 的 Level 1 (metadata)
2. **匹配**: 根据用户请求，判断哪些 skills 相关
3. **加载**: 通过 `bash: read pdf-skill/SKILL.md` 加载完整指令（Level 2）
4. **执行**: Claude 按照指令操作（调用 Python 脚本、使用工具等）
5. **按需加载**: 如需额外资源，读取 FORMS.md 等文件（Level 3）

---

## Arsenal 的定位

Arsenal **不是** Anthropic Skills 的替代品，而是提供不同的价值：

### Arsenal 的核心价值

1. **标准化 Web3 能力**
   - 每个 skill 有明确的 JSON Schema（输入/输出）
   - 跨 Agent 平台通用（Claude、OpenAI、MCP、OpenClaw）
   - 避免每个 Agent 重复实现相同功能

2. **语义搜索**
   - 自然语言查询："swap ETH to USDC on Arbitrum"
   - Qwen text-embedding-v4 向量搜索
   - 返回最相关的 skills

3. **支付协议**
   - x402 微支付（USDC on Base）
   - Skill 创作者可收费
   - 激励高质量 skill 开发

4. **可执行性**
   - API 调用返回结果
   - 不需要 Agent 自己实现复杂逻辑
   - 例如：Uniswap 路由计算、gas 估算

### 与 Anthropic Skills 的互补

| 场景 | 使用 Anthropic Skills | 使用 Arsenal |
|------|----------------------|--------------|
| **教 Claude 基础工作流** | ✅ 文件系统 SKILL.md | ❌ 不适合 |
| **标准化 Web3 操作** | ❌ 每个 Agent 重复实现 | ✅ API 调用 |
| **跨平台能力发现** | ❌ 仅限文件系统 | ✅ HTTP API |
| **付费能力市场** | ❌ 无支付协议 | ✅ x402 支持 |

---

## 兼容方案：Arsenal 作为 Anthropic Skill

### 核心思路

**创建一个 "arsenal-marketplace" Anthropic Skill，教 Claude 如何使用 Arsenal API。**

### 实现方式

#### 1. 提供 Anthropic 格式的 SKILL.md

**端点**: `GET /api/anthropic-skill`

返回完整的 SKILL.md，包含：
- YAML frontmatter: `name: arsenal-marketplace`, `description: Access 1000+ blockchain skills...`
- Markdown 正文:
  - Quick Start（搜索、查看、执行 skills）
  - 常见用例（DeFi、NFT、Token 操作）
  - 错误处理
  - x402 支付流程
  - 代码示例（JavaScript、Python）

#### 2. 使用方式

**开发者下载 SKILL.md**:
```bash
curl https://arsenal.sumplus.xyz/api/anthropic-skill > arsenal-marketplace/SKILL.md
```

**Claude 加载**:
```bash
# Claude 的 Anthropic SDK 会自动扫描 skills/ 目录
skills/
  arsenal-marketplace/
    SKILL.md  # 从 /api/anthropic-skill 下载
```

**用户请求**:
```
User: I want to swap 100 USDC to ETH on Arbitrum

Claude (内部):
1. 扫描 skills → 发现 "arsenal-marketplace" (description 包含 "Uniswap")
2. 读取 arsenal-marketplace/SKILL.md
3. 按照指令操作:
   - curl "https://arsenal.sumplus.xyz/api/skills?search=swap+tokens+uniswap"
   - 获取 skill_id
   - curl -X POST https://arsenal.sumplus.xyz/api/execute \
       -d '{"skill_id": "...", "input": {...}}'
4. 返回结果给用户
```

### 工作流程图

```
User Request
    ↓
Claude 判断需要 Arsenal
    ↓
读取 arsenal-marketplace/SKILL.md
    ↓
按指令搜索 Arsenal API
    ↓
执行 Arsenal Skill
    ↓
返回结果给用户
```

---

## 实现细节

### `/api/anthropic-skill` 端点

**文件**: `src/app/api/anthropic-skill/route.ts`

**返回内容**:
```yaml
---
name: arsenal-marketplace
description: Access 1000+ blockchain and DeFi skills via Sumplus Arsenal API. Use when user needs Uniswap, Aave, ENS, token operations, or any Web3 capability.
---

# Arsenal Marketplace

[完整的使用指南...]
```

**Headers**:
```
Content-Type: text/markdown; charset=utf-8
Content-Disposition: inline; filename="SKILL.md"
Access-Control-Allow-Origin: *
```

### 在 `/api/manifest` 中声明

更新 `src/app/api/manifest/route.ts`，添加 Anthropic 兼容性信息：

```json
{
  "anthropic_compatibility": {
    "skill_format": "Available as Anthropic SKILL.md",
    "download_url": "https://arsenal.sumplus.xyz/api/anthropic-skill",
    "usage": "Download to skills/arsenal-marketplace/SKILL.md",
    "description": "Teaches Claude how to search and execute Arsenal skills via API"
  }
}
```

---

## 使用示例

### 开发者集成

```bash
# 1. 创建 skills 目录
mkdir -p skills/arsenal-marketplace

# 2. 下载 Arsenal SKILL.md
curl https://arsenal.sumplus.xyz/api/anthropic-skill \
  > skills/arsenal-marketplace/SKILL.md

# 3. 运行 Claude Agent（会自动扫描 skills/）
claude-agent run
```

### Claude 的视角

当用户说："I want to swap ETH to USDC"

Claude 看到的 context:
```
Available skills:
- arsenal-marketplace: Access 1000+ blockchain and DeFi skills via Sumplus Arsenal API. Use when user needs Uniswap...

[触发 arsenal-marketplace]

Reading: skills/arsenal-marketplace/SKILL.md

Content:
---
name: arsenal-marketplace
...
---

# Arsenal Marketplace

## Quick Start

### 1. Search for a Skill

curl "https://arsenal.sumplus.xyz/api/skills?search=swap+tokens+uniswap"
...
```

Claude 然后按照 SKILL.md 中的指令，调用 Arsenal API 完成任务。

---

## 优势

### 1. 保持 Arsenal 原有架构
- 无需改变数据库结构
- 无需实现文件系统存储
- API-first 设计不变

### 2. 完全兼容 Anthropic
- 提供标准 SKILL.md 格式
- Claude 可以像使用其他 skills 一样使用 Arsenal
- 符合 Progressive Disclosure 原则

### 3. 跨平台支持
- Anthropic Agents: 通过 SKILL.md
- OpenAI Agents: 通过 `/api/manifest`
- MCP Clients: 通过 MCP 协议
- Custom Agents: 直接调用 REST API

### 4. 元能力（Meta-Capability）
- Arsenal 本身成为一个 "meta-skill"
- 教 Agent 如何访问 1000+ 其他 skills
- 一次集成，获得整个 skills marketplace

---

## 与纯 Anthropic Skills 的区别

### Anthropic Skills（原生）

**示例：PDF Processing Skill**
```yaml
---
name: pdf-processing
description: Extract text and tables from PDF files
---

# PDF Processing

Use pdfplumber to extract text:

```python
import pdfplumber
with pdfplumber.open("document.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
```

**特点**:
- 教 Claude 如何使用 pdfplumber 库
- Claude 自己执行 Python 代码
- 适合通用工作流

### Arsenal Skill（API-based）

**示例：Uniswap Swap Skill**

**在 Arsenal 数据库中**:
```json
{
  "name": "Uniswap Token Swap",
  "description": "Execute a token swap on Uniswap V3",
  "schema": {
    "input": {
      "type": "object",
      "properties": {
        "chain": { "enum": ["ethereum", "arbitrum", ...] },
        "tokenIn": { "type": "string" },
        "tokenOut": { "type": "string" },
        "amountIn": { "type": "string" }
      }
    },
    "output": {
      "properties": {
        "txHash": { "type": "string" },
        "amountOut": { "type": "string" }
      }
    }
  },
  "code": "// 实际的 Uniswap SDK 调用代码"
}
```

**Claude 通过 arsenal-marketplace SKILL.md 学习**:
```markdown
To swap tokens, search Arsenal:
curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap+swap"

Then execute:
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -d '{"skill_id": "...", "input": {"chain": "arbitrum", ...}}'
```

**特点**:
- Claude 调用 API，不需要自己实现 Uniswap 逻辑
- 标准化输入/输出
- 适合复杂的 Web3 操作

---

## 未来扩展

### 1. 动态 Skill 生成

为每个 Arsenal Skill 生成独立的 SKILL.md:

```bash
# 生成所有 skills 的 Anthropic 格式
GET /api/anthropic-skill?skill_id=uuid-for-uniswap-swap

# 返回单个 skill 的 SKILL.md
---
name: uniswap-token-swap
description: Execute a token swap on Uniswap V3 across Ethereum, Arbitrum, Polygon...
---

# Uniswap Token Swap

Call Arsenal API:
curl -X POST https://arsenal.sumplus.xyz/api/execute \
  -d '{
    "skill_id": "uuid-for-uniswap-swap",
    "input": {
      "chain": "arbitrum",
      "tokenIn": "USDC",
      "tokenOut": "ETH",
      "amountIn": "100000000"
    }
  }'
```

开发者可以选择：
- 下载整个 marketplace（一个 SKILL.md，教如何搜索）
- 下载单个 skill（多个 SKILL.md，每个对应一个能力）

### 2. MCP 协议集成

提供 MCP server，让 Claude Desktop 直接连接：

```json
{
  "mcpServers": {
    "arsenal": {
      "command": "npx",
      "args": ["-y", "@sumplus/arsenal-mcp-server"]
    }
  }
}
```

Claude Desktop 会自动获取所有 Arsenal skills 作为可用工具。

### 3. Skill 依赖关系

Arsenal skills 可以依赖其他 skills:

```json
{
  "name": "Multi-Hop Swap",
  "dependencies": [
    "uniswap-price-quote",
    "uniswap-token-swap"
  ]
}
```

Claude 会自动加载依赖的 skills，组合完成复杂任务。

---

## 总结

### 核心洞察

**Anthropic Skills 和 Arsenal 解决不同问题**:

- **Anthropic Skills**: 教 Claude 基础工作流（文件处理、数据分析、API 调用）
- **Arsenal**: 提供标准化 Web3 能力（Uniswap、Aave、ENS），避免重复实现

### 兼容策略

**Arsenal 提供 Anthropic SKILL.md**，教 Agent 如何使用 Arsenal API：

1. 开发者下载 `https://arsenal.sumplus.xyz/api/anthropic-skill`
2. 保存为 `skills/arsenal-marketplace/SKILL.md`
3. Claude 自动扫描并学习如何使用 Arsenal
4. 用户请求 Web3 操作时，Claude 调用 Arsenal API

### 价值主张

- ✅ 保持 Arsenal 的 API-first 架构
- ✅ 完全兼容 Anthropic Skills 生态
- ✅ 跨平台支持（Claude、OpenAI、MCP、自定义 Agents）
- ✅ 一次集成，获得 1000+ Web3 能力

---

## 下一步

1. ✅ 实现 `/api/anthropic-skill` 端点
2. ⬜ 更新 `/api/manifest` 声明 Anthropic 兼容性
3. ⬜ 创建示例项目：Claude Agent + Arsenal
4. ⬜ 文档：如何在 Anthropic SDK 中使用 Arsenal
5. ⬜ （可选）为每个 skill 生成独立 SKILL.md
6. ⬜ （可选）实现 MCP server

需要我继续实现哪一步？
