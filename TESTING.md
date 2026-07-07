# Arsenal 测试指南

最后更新：2026-02-21

## 快速测试

```bash
# 本地环境测试
./test-arsenal.sh local

# 生产环境测试（需要先配置环境变量）
./test-arsenal.sh production
```

---

## 1. 本地环境测试 ✅

### 前提条件

```bash
cd /Users/xufei/Documents/GitHub/automative_coding/sumplus-arsenal
npm install
npm run dev
```

### 测试 1: Manifest（Agent 发现）

```bash
curl http://localhost:3000/api/manifest | jq '.quick_start.CRITICAL_INSTRUCTIONS'
```

**预期结果**：
```
"🚨 Arsenal is an HTTP REST API, NOT a skill tool. To access Arsenal,
you MUST use the bash tool to execute curl commands. There is NO
'search_arsenal_skills' or 'execute_arsenal_skill' tool."
```

### 测试 2: 搜索技能（语义搜索）

```bash
curl "http://localhost:3000/api/skills?search=uniswap+pool" | jq '.total, .skills[0].name'
```

**预期结果**：
```json
6
"Uniswap Pool Info"
```

### 测试 3: 获取技能详情

```bash
SKILL_ID="23225fb6-a6ad-45d4-9ee6-422ecf53f400"
curl "http://localhost:3000/api/skills/$SKILL_ID" | jq '.skill.name'
```

**预期结果**：
```
"Uniswap Pool Info"
```

### 测试 4: 分类列表

```bash
curl http://localhost:3000/api/categories | jq '.'
```

**预期结果**：
```json
{
  "categories": ["Blockchain", "Finance"],
  "count": 2
}
```

### 测试 5: Anthropic Skills 格式

```bash
curl http://localhost:3000/api/anthropic-skill | head -20
```

**预期结果**：应该看到 YAML frontmatter 和 markdown 内容，包含 "How to Access Arsenal" 部分。

### 测试 6: 不同查询的语义搜索

```bash
# 测试各种查询
curl -s "http://localhost:3000/api/skills?search=swap+tokens" | jq '.skills[0].name'
curl -s "http://localhost:3000/api/skills?search=defi" | jq '.skills[0].name'
curl -s "http://localhost:3000/api/skills?search=wallet" | jq '.skills[0].name'
curl -s "http://localhost:3000/api/skills?search=blockchain" | jq '.skills[0].name'
```

**预期结果**：每个查询都应该返回相关的技能名称。

---

## 2. 生产环境测试 ⚠️

### 前提条件：配置环境变量

**如果使用 Vercel：**

1. 登录 Vercel Dashboard
2. 进入项目 Settings → Environment Variables
3. 添加以下变量（所有环境：Production, Preview, Development）：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://cyktcgasayxbccalbmxz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
OPENAI_API_KEY=<openai-api-key>
OPENAI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMENSIONS=1536
NEXT_PUBLIC_APP_URL=https://arsenal.sumplus.xyz
```

4. 重新部署：
```bash
vercel --prod
```

**如果使用命令行：**

```bash
cd /Users/xufei/Documents/GitHub/automative_coding/sumplus-arsenal

# 添加环境变量
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add OPENAI_API_KEY production
vercel env add OPENAI_BASE_URL production
vercel env add EMBEDDING_MODEL production
vercel env add EMBEDDING_DIMENSIONS production
vercel env add NEXT_PUBLIC_APP_URL production

# 部署
vercel --prod
```

### 测试生产环境

配置完成后，运行：

```bash
./test-arsenal.sh production
```

或手动测试：

```bash
# 测试 manifest
curl https://arsenal.sumplus.xyz/api/manifest | jq '.name'

# 测试搜索
curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap" | jq '.total'

# 测试分类
curl https://arsenal.sumplus.xyz/api/categories | jq '.categories'
```

---

## 3. Agent 使用测试

### 测试场景 1: Agent 发现 Arsenal

**Agent 应该做的：**

1. **读取 manifest**：
```bash
curl https://arsenal.sumplus.xyz/api/manifest
```

2. **看到 CRITICAL_INSTRUCTIONS**：
```
🚨 Arsenal is an HTTP REST API, NOT a skill tool.
```

3. **使用 bash + curl 调用 API**：
```bash
bash('curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap"')
```

**Agent 不应该做的：**

❌ 调用 `search_arsenal_skills(query="uniswap")` - **这个工具不存在**

### 测试场景 2: Agent 搜索 Uniswap 池信息

**正确的 Agent 行为：**

```
Step 1: 读取 manifest
Step 2: 使用 bash tool 搜索技能
  bash('curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap+pool"')
Step 3: 获取技能 ID
Step 4: 使用 bash tool 获取详情
  bash('curl "https://arsenal.sumplus.xyz/api/skills/23225fb6-..."')
Step 5: 查看 schema，了解输入/输出格式
Step 6: 告诉用户技能的功能和参数
```

**错误的 Agent 行为：**

```
❌ Step 1: search_arsenal_skills(query="uniswap pool")
❌ Result: Tool not found / 0 results
```

### 测试场景 3: 验证 Manifest 指导

```bash
# 检查 manifest 的关键指导是否清晰
curl https://arsenal.sumplus.xyz/api/manifest | jq '{
  critical: .quick_start.CRITICAL_INSTRUCTIONS,
  correct_usage: .quick_start.rest_api.example_correct_usage,
  wrong_usage: .quick_start.rest_api.example_wrong_usage
}'
```

**预期结果**：应该明确告诉 agent：
- ✅ 使用 bash + curl
- ❌ 不要使用 search_arsenal_skills

---

## 4. MCP Server 测试 ⏳

### 前提条件

1. 安装 MCP Server：
```bash
cd /Users/xufei/Documents/GitHub/automative_coding/sumplus-arsenal
npm run build
```

2. 配置 Claude Desktop（`~/Library/Application Support/Claude/claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "arsenal": {
      "command": "node",
      "args": ["/Users/xufei/Documents/GitHub/automative_coding/sumplus-arsenal/bin/mcp-server.js"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://cyktcgasayxbccalbmxz.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<supabase-service-role-key>",
        "OPENAI_BASE_URL": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "OPENAI_API_KEY": "<openai-api-key>",
        "EMBEDDING_MODEL": "text-embedding-v4"
      }
    }
  }
}
```

### 测试 MCP Tools

在 Claude Desktop 中测试：

```
User: Use the arsenal MCP server to search for Uniswap skills

Expected: Claude should use searchSkills tool
Result: Should return list of Uniswap skills
```

```
User: Read the Uniswap Pool Info skill content

Expected: Claude should use read_resource("arsenal://skills/23225fb6-...")
Result: Should return SKILL.md content
```

### 验证 MCP Server 运行

```bash
# 手动运行 MCP Server（调试模式）
npm run mcp
```

应该看到：
```
Arsenal MCP Server started
```

---

## 5. 端到端测试场景

### 场景 A: 用户想查询 ETH/USDC Uniswap 池信息

**期望的 Agent 行为：**

1. ✅ 使用 bash + curl 搜索 Arsenal：
   ```bash
   curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap+pool"
   ```

2. ✅ 找到 "Uniswap Pool Info" 技能

3. ✅ 使用 bash + curl 获取详情：
   ```bash
   curl "https://arsenal.sumplus.xyz/api/skills/23225fb6-..."
   ```

4. ✅ 告诉用户：
   - 这个技能可以查询池信息
   - 需要的参数：chain, token0, token1, feeTier
   - 返回的数据：TVL, volume, fees, price, APR
   - ⚠️ 注意：Arsenal 的 /api/execute 返回模拟数据
   - 💡 建议：如需真实数据，使用 ethers.js + Uniswap SDK

### 场景 B: 开发者想集成 Arsenal

**测试步骤：**

```bash
# 1. 发现 API
curl https://arsenal.sumplus.xyz/api/manifest

# 2. 搜索技能
curl "https://arsenal.sumplus.xyz/api/skills?search=token+swap"

# 3. 获取技能 schema
curl "https://arsenal.sumplus.xyz/api/skills/{skill_id}"

# 4. 使用 schema 实现自己的执行逻辑
# （不调用 Arsenal 的 /api/execute，因为那是模拟数据）
```

---

## 6. 常见问题排查

### 问题 1: "Supabase environment variables not configured"

**原因**：生产环境缺少环境变量

**解决**：
1. 在 Vercel Dashboard 配置环境变量
2. 重新部署

### 问题 2: Agent 调用 `search_arsenal_skills` 失败

**原因**：Agent 错误地认为 Arsenal 是一个 skill tool

**解决**：
1. 确保 manifest 已更新（包含 CRITICAL_INSTRUCTIONS）
2. 告诉 agent 重新读取 manifest
3. 明确指示：使用 bash + curl，不要使用 search_arsenal_skills

### 问题 3: 语义搜索返回不相关结果

**原因**：embedding 生成失败或相似度阈值过低

**检查**：
```bash
# 查看技能是否有 embedding
curl "http://localhost:3000/api/skills/{skill_id}" | jq '.skill.embedding != null'
```

**解决**：运行 embedding backfill
```bash
curl -X POST http://localhost:3000/api/admin/backfill-embeddings
```

### 问题 4: MCP Server 无法启动

**检查**：
1. 确保 bin/mcp-server.js 存在
2. 确保环境变量在 claude_desktop_config.json 中正确配置
3. 查看 Claude Desktop 日志：`~/Library/Logs/Claude/mcp*.log`

---

## 7. 测试检查清单

### 本地环境 ✅
- [ ] Manifest 可访问
- [ ] 搜索技能返回结果
- [ ] 获取技能详情成功
- [ ] 分类列表正确
- [ ] Anthropic Skills 格式正确
- [ ] 语义搜索工作正常

### 生产环境 ⏳
- [ ] 环境变量已配置
- [ ] Manifest 可访问
- [ ] 搜索技能返回结果
- [ ] API 响应速度 < 2s

### Agent 集成 ⏳
- [ ] Agent 能读取 manifest
- [ ] Agent 理解要使用 bash + curl
- [ ] Agent 不尝试调用 search_arsenal_skills
- [ ] Agent 能成功搜索和获取技能

### MCP Server ⏳
- [ ] MCP Server 可启动
- [ ] Claude Desktop 能连接
- [ ] Tools 工作正常（searchSkills, getSkill）
- [ ] Resources 可读取（arsenal://skills/{id}）

---

## 8. 性能基准

### 本地环境
- Manifest: < 50ms
- Search (无 embedding): < 100ms
- Search (有 embedding): < 500ms
- Get skill: < 100ms

### 生产环境（预期）
- Manifest: < 200ms
- Search: < 1s
- Get skill: < 300ms

---

## 总结

✅ **本地测试全部通过**
⏳ **生产环境需要配置环境变量**
⏳ **等待 Agent 集成测试反馈**
⏳ **MCP Server 需要 Claude Desktop 测试**

**下一步**：
1. 配置生产环境环境变量
2. 部署并测试生产 API
3. 与 agent 开发者协调，确保正确使用 bash + curl
4. 测试 MCP Server（如需要）
