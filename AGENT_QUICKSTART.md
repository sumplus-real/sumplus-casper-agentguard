> **DEPRECATED** — This file contains outdated information. Read [ARSENAL.md](./ARSENAL.md) instead.

# Arsenal Agent 快速开始

**5 分钟学会使用 Arsenal API**

---

## 🚨 最重要的事

**Arsenal 是 HTTP REST API，不是 skill tool！**

```bash
# ✅ 正确
bash('curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap"')

# ❌ 错误 - 这个工具不存在
search_arsenal_skills(query="uniswap")
```

---

## 📋 测试命令（复制粘贴即可）

### 1. 读取 Manifest（了解 Arsenal）

```bash
curl https://arsenal.sumplus.xyz/api/manifest | jq '.quick_start.CRITICAL_INSTRUCTIONS'
```

### 2. 搜索所有技能

```bash
curl "https://arsenal.sumplus.xyz/api/skills?limit=10" | jq '.skills[] | {name, category}'
```

### 3. 搜索 Uniswap 技能

```bash
curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap" | jq '.skills[] | {name, is_paid}'
```

### 4. 获取技能详情

```bash
curl https://arsenal.sumplus.xyz/api/skills/23225fb6-a6ad-45d4-9ee6-422ecf53f400 | jq '.skill | {name, schema}'
```

### 5. 获取分类

```bash
curl https://arsenal.sumplus.xyz/api/categories | jq '.categories'
```

---

## 🎯 完整场景示例

**场景：用户问 "有哪些 Uniswap 技能？"**

```bash
# Agent 执行
bash('curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap"')

# Agent 回复
"我找到了 3 个 Uniswap 技能：
1. Uniswap Pool Info (免费) - 查询池信息
2. Uniswap Token Swap (付费 $2.50) - 执行交换
3. Uniswap Price Quote (免费) - 获取价格"
```

---

## 📚 完整指南

详细文档：[AGENT_GUIDE.md](./AGENT_GUIDE.md)

测试脚本：`bash agent-test.sh`

---

## ⚠️ 常见错误

| 错误 | 正确 |
|------|------|
| `search_arsenal_skills(query="swap")` | `bash('curl "...?search=swap"')` |
| "Arsenal 已为你交换代币" | "Arsenal 只提供 schema，不执行真实交易" |
| 使用 `/api/execute` 的模拟数据 | 告诉用户这是模拟数据，建议用 Web3 库 |

---

## ✅ 成功标志

- [ ] 使用 `bash('curl ...')` 而不是 `search_arsenal_skills()`
- [ ] 理解 Arsenal 只提供定义，不执行交易
- [ ] 告诉用户 `/api/execute` 返回模拟数据

开始测试：**`bash('curl https://arsenal.sumplus.xyz/api/manifest')`** 🚀
