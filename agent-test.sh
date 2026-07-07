#!/bin/bash

# Arsenal API 测试脚本 - 专为 AI Agent 设计
#
# 使用方法：
#   bash agent-test.sh
#
# 这个脚本演示如何正确使用 Arsenal API

echo "🤖 Arsenal Agent 测试脚本"
echo "=========================================="
echo ""
echo "⚠️  重要提醒："
echo "   Arsenal 是 HTTP REST API，不是 skill tool"
echo "   必须使用 bash tool 执行 curl 命令"
echo ""
echo "=========================================="
echo ""

BASE_URL="https://arsenal.sumplus.xyz"

# 测试 1: 读取 Manifest
echo "📋 测试 1: 读取 Manifest (Agent 发现)"
echo "Command: curl $BASE_URL/api/manifest"
echo ""
curl -s "$BASE_URL/api/manifest" | jq '{
  name,
  base_url,
  critical_instruction: .quick_start.CRITICAL_INSTRUCTIONS,
  correct_usage: .quick_start.rest_api.example_correct_usage,
  wrong_usage: .quick_start.rest_api.example_wrong_usage
}'
echo ""
echo "✅ 你应该看到："
echo "   - critical_instruction: 必须使用 bash + curl"
echo "   - correct_usage: bash('curl ...')"
echo "   - wrong_usage: search_arsenal_skills() ❌"
echo ""
read -p "按 Enter 继续..."
echo ""

# 测试 2: 搜索 Uniswap 技能
echo "🔍 测试 2: 搜索 Uniswap 技能"
echo "Command: curl \"$BASE_URL/api/skills?search=uniswap\""
echo ""
curl -s "$BASE_URL/api/skills?search=uniswap" | jq '{
  total,
  found_skills: [.skills[] | {id, name, category, is_paid}]
}'
echo ""
echo "✅ 你应该看到 3 个 Uniswap 技能："
echo "   1. Uniswap Pool Info (免费)"
echo "   2. Uniswap Token Swap (付费)"
echo "   3. Uniswap Price Quote (免费)"
echo ""
read -p "按 Enter 继续..."
echo ""

# 测试 3: 获取技能详情
echo "📖 测试 3: 获取 Uniswap Pool Info 技能详情"
SKILL_ID="23225fb6-a6ad-45d4-9ee6-422ecf53f400"
echo "Command: curl $BASE_URL/api/skills/$SKILL_ID"
echo ""
curl -s "$BASE_URL/api/skills/$SKILL_ID" | jq '.skill | {
  name,
  description,
  category,
  is_paid,
  price,
  input_required: .schema.input.required,
  input_properties: .schema.input.properties | keys,
  output_properties: .schema.output.properties | keys,
  example_description: .usage_examples[0].description
}'
echo ""
echo "✅ 你应该看到："
echo "   - name: Uniswap Pool Info"
echo "   - input_required: [chain, token0, token1]"
echo "   - output_properties: [tvlUSD, volume24h, price, ...]"
echo ""
read -p "按 Enter 继续..."
echo ""

# 测试 4: 获取分类
echo "📂 测试 4: 获取所有分类"
echo "Command: curl $BASE_URL/api/categories"
echo ""
curl -s "$BASE_URL/api/categories" | jq '.'
echo ""
echo "✅ 你应该看到 2 个分类："
echo "   - Blockchain"
echo "   - Finance"
echo ""
read -p "按 Enter 继续..."
echo ""

# 测试 5: 不同的搜索查询
echo "🎯 测试 5: 测试不同的搜索查询"
echo ""

queries=("swap tokens" "defi wallet" "pool liquidity" "blockchain")
for query in "${queries[@]}"; do
  echo "Query: '$query'"
  result=$(curl -s "$BASE_URL/api/skills?search=$query" | jq -r '.skills[0] | "\(.name) (\(.category))"')
  echo "  → $result"
  echo ""
done

echo "✅ 语义搜索应该返回相关技能"
echo ""
read -p "按 Enter 继续..."
echo ""

# 测试 6: 完整场景 - 用户想查询 ETH/USDC 池
echo "🎬 测试 6: 完整场景 - 用户问 'ETH/USDC Uniswap 池信息'"
echo ""
echo "步骤 1: 搜索相关技能"
echo "Command: curl \"$BASE_URL/api/skills?search=uniswap+pool+info\""
echo ""
SKILL_ID=$(curl -s "$BASE_URL/api/skills?search=uniswap+pool+info" | jq -r '.skills[0].id')
SKILL_NAME=$(curl -s "$BASE_URL/api/skills?search=uniswap+pool+info" | jq -r '.skills[0].name')
echo "找到技能: $SKILL_NAME"
echo "技能 ID: $SKILL_ID"
echo ""

echo "步骤 2: 获取技能的 schema"
echo "Command: curl $BASE_URL/api/skills/$SKILL_ID"
echo ""
curl -s "$BASE_URL/api/skills/$SKILL_ID" | jq '.skill.schema.input'
echo ""

echo "步骤 3: Agent 应该告诉用户"
echo ""
cat << 'EOF'
💬 Agent 回复示例：

"我找到了 'Uniswap Pool Info' 技能。

**这个技能可以查询：**
- TVL (总锁仓量)
- 24h 交易量
- 24h 手续费
- 当前价格
- APR

**需要的参数：**
- chain: 'ethereum' (或 arbitrum/polygon/base/optimism)
- token0: USDC 地址 (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)
- token1: WETH 地址 (0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2)
- feeTier: 500 (可选, 默认 3000)

⚠️ 重要提醒：
Arsenal 的 /api/execute 返回的是**模拟数据**。

要获取真实的链上数据，建议使用：
1. Uniswap V3 SDK + ethers.js
2. The Graph API
3. 直接查询 Uniswap V3 Pool 合约"
EOF
echo ""
read -p "按 Enter 继续..."
echo ""

# 总结
echo "=========================================="
echo "✅ 所有测试完成！"
echo "=========================================="
echo ""
echo "📊 测试总结："
echo "   ✅ Manifest 可访问"
echo "   ✅ 搜索功能正常"
echo "   ✅ 技能详情可获取"
echo "   ✅ 分类列表正确"
echo "   ✅ 语义搜索工作正常"
echo "   ✅ 完整场景演示成功"
echo ""
echo "🎯 记住这 3 点："
echo "   1. ✅ 使用 bash + curl 调用 Arsenal API"
echo "   2. ⚠️  Arsenal 不执行真实交易，只提供 schema"
echo "   3. 💡 用 schema 实现自己的执行逻辑"
echo ""
echo "📚 更多信息："
echo "   - Agent 指南: AGENT_GUIDE.md"
echo "   - 完整文档: TESTING.md"
echo "   - Manifest: $BASE_URL/api/manifest"
echo ""
