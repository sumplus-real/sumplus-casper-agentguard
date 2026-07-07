#!/bin/bash

# Arsenal 完整场景测试
# 场景：用户想查询 ETH/USDC 价格并交易

BASE_URL="https://arsenal.sumplus.xyz"

echo "╔════════════════════════════════════════════════════════╗"
echo "║   Arsenal 完整测试场景：ETH/USDC 查询价格并交易      ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "模拟场景："
echo "  用户: '我想查询 ETH/USDC 在 Uniswap 上的价格，然后用 1 ETH 换 USDC'"
echo ""
echo "════════════════════════════════════════════════════════"
echo ""

# 步骤 0: 读取 manifest
echo "📋 步骤 0: Agent 初始化 - 读取 Manifest"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "🤖 Agent 执行："
echo "   bash('curl $BASE_URL/api/manifest')"
echo ""
curl -s "$BASE_URL/api/manifest" | jq '{
  name,
  critical_instruction: .quick_start.CRITICAL_INSTRUCTIONS,
  correct_usage: .quick_start.rest_api.example_correct_usage
}'
echo ""
echo "✅ Agent 理解："
echo "   - Arsenal 是 HTTP REST API"
echo "   - 必须使用 bash + curl"
echo "   - Arsenal 提供技能定义，不执行真实交易"
echo ""
read -p "按 Enter 继续到步骤 1..."
echo ""
echo ""

# 步骤 1: 查询价格
echo "💰 步骤 1: 用户询问价格"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "👤 用户说: 'ETH/USDC 在 Uniswap 上现在什么价格？'"
echo ""
echo "🤖 Agent 步骤 1.1: 搜索价格查询技能"
echo "   bash('curl \"$BASE_URL/api/skills?search=uniswap+price+quote\"')"
echo ""
PRICE_SKILL_ID=$(curl -s "$BASE_URL/api/skills?search=uniswap+price+quote" | jq -r '.skills[0].id')
PRICE_SKILL_NAME=$(curl -s "$BASE_URL/api/skills?search=uniswap+price+quote" | jq -r '.skills[0].name')
echo "   找到技能: $PRICE_SKILL_NAME"
echo "   技能 ID: $PRICE_SKILL_ID"
echo ""
echo "🤖 Agent 步骤 1.2: 获取技能详情"
echo "   bash('curl $BASE_URL/api/skills/$PRICE_SKILL_ID')"
echo ""
curl -s "$BASE_URL/api/skills/$PRICE_SKILL_ID" | jq '.skill | {
  name,
  description,
  is_paid,
  input_required: .schema.input.required,
  output_fields: .schema.output.properties | keys
}'
echo ""
echo "🤖 Agent 应该回复用户："
echo ""
cat << 'EOF'
┌──────────────────────────────────────────────────────────┐
│ Agent 回复：                                              │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ 我找到了 "Uniswap Price Quote" 技能，可以查询价格。     │
│                                                           │
│ 根据技能定义，需要以下参数：                             │
│   - chain: "ethereum"                                     │
│   - tokenIn: WETH 地址                                    │
│   - tokenOut: USDC 地址                                   │
│   - amountIn: "1000000000000000000" (1 ETH)              │
│                                                           │
│ ⚠️  重要提醒：                                           │
│ Arsenal 的 /api/execute 只返回**模拟数据**，             │
│ 不会查询真实的链上价格。                                 │
│                                                           │
│ 要获取真实价格，我建议使用：                             │
│   1. Uniswap V3 SDK + ethers.js                          │
│   2. The Graph API                                       │
│   3. 直接查询 Uniswap Quoter 合约                        │
│                                                           │
│ 你希望我用哪种方式获取真实价格？                         │
└──────────────────────────────────────────────────────────┘
EOF
echo ""
echo "✅ 评分："
echo "   - 使用 bash + curl ✅"
echo "   - 获取技能定义 ✅"
echo "   - 告知 Arsenal 限制 ✅"
echo "   - 提供替代方案 ✅"
echo ""
echo "❌ 错误示例（不要这样）："
echo "   '我已经查询了价格，ETH/USDC = $3,245.67'"
echo "   （这是模拟数据，不是真实价格！）"
echo ""
read -p "按 Enter 继续到步骤 2..."
echo ""
echo ""

# 步骤 2: 交易
echo "💱 步骤 2: 用户要求交易"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "👤 用户说: '好的，帮我用 1 ETH 换 USDC'"
echo ""
echo "🤖 Agent 步骤 2.1: 搜索交易技能"
echo "   bash('curl \"$BASE_URL/api/skills?search=uniswap+swap+tokens\"')"
echo ""
SWAP_SKILL_ID=$(curl -s "$BASE_URL/api/skills?search=uniswap+swap" | jq -r '.skills[0].id')
SWAP_SKILL_NAME=$(curl -s "$BASE_URL/api/skills?search=uniswap+swap" | jq -r '.skills[0].name')
SWAP_IS_PAID=$(curl -s "$BASE_URL/api/skills?search=uniswap+swap" | jq -r '.skills[0].is_paid')
SWAP_PRICE=$(curl -s "$BASE_URL/api/skills?search=uniswap+swap" | jq -r '.skills[0].price')
echo "   找到技能: $SWAP_SKILL_NAME"
echo "   技能 ID: $SWAP_SKILL_ID"
echo "   是否付费: $SWAP_IS_PAID"
if [ "$SWAP_IS_PAID" = "true" ]; then
  echo "   价格: \$$(echo "scale=2; $SWAP_PRICE / 100" | bc)"
fi
echo ""
echo "🤖 Agent 步骤 2.2: 获取技能详情"
echo "   bash('curl $BASE_URL/api/skills/$SWAP_SKILL_ID')"
echo ""
curl -s "$BASE_URL/api/skills/$SWAP_SKILL_ID" | jq '.skill | {
  name,
  description,
  is_paid,
  price,
  input_required: .schema.input.required,
  output_fields: .schema.output.properties | keys
}'
echo ""
echo "🤖 Agent 应该回复用户："
echo ""
cat << 'EOF'
┌──────────────────────────────────────────────────────────┐
│ Agent 回复：                                              │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ 🚨 重要提醒：Arsenal 不能执行真实的区块链交易！         │
│                                                           │
│ 我找到了 "Uniswap Token Swap" 技能定义，但需要          │
│ 明确告诉你：                                             │
│                                                           │
│ Arsenal 的限制：                                         │
│   ❌ /api/execute 只返回**模拟数据**                    │
│   ❌ 不会执行真实的链上交易                             │
│   ❌ 不会转移你的资金                                   │
│   ❌ 没有访问你的钱包或私钥                             │
│                                                           │
│ 这个技能定义的用途：                                     │
│   ✅ 了解交易需要的参数格式                             │
│   ✅ 查看输入/输出 schema                               │
│   ✅ 作为实现的参考                                     │
│                                                           │
│ 要执行真实交易，你需要：                                 │
│                                                           │
│ 方式 1: 我帮你生成交易代码（需要你自己执行）            │
│                                                           │
│ 方式 2: 使用 Uniswap 官方前端                            │
│   - 访问 https://app.uniswap.org                         │
│   - 连接钱包，选择 ETH → USDC                            │
│                                                           │
│ 方式 3: 使用其他 DEX 聚合器                              │
│   - 1inch, Matcha 等                                     │
│                                                           │
│ ⚠️  交易涉及真实资金，请确保：                          │
│   - 理解交易风险                                         │
│   - 检查 gas 费用                                        │
│   - 设置合理的 slippage                                  │
│   - 使用安全的环境                                       │
│                                                           │
│ 你希望我帮你做什么？                                     │
│   A. 生成完整的交易代码                                  │
│   B. 提供更详细的技术指导                                │
│   C. 帮你了解其他交易方式                                │
└──────────────────────────────────────────────────────────┘
EOF
echo ""
echo "✅ 评分："
echo "   - 使用 bash + curl ✅"
echo "   - 获取技能定义 ✅"
echo "   - 明确告知 Arsenal 不执行交易 ✅"
echo "   - 提供真实执行方案 ✅"
echo "   - 提醒安全风险 ✅"
echo ""
echo "❌ 严重错误示例（绝对不要这样）："
echo "   '交易已完成！你获得了 3,245.67 USDC'"
echo "   （这些都是模拟数据，没有真实交易发生！）"
echo ""
read -p "按 Enter 继续到步骤 3..."
echo ""
echo ""

# 步骤 3: 查看池子信息
echo "📊 步骤 3: 用户想了解池子详情"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "👤 用户说: '在交易前，我想先看看 ETH/USDC 池子的流动性和 TVL'"
echo ""
echo "🤖 Agent 步骤 3.1: 搜索池子信息技能"
echo "   bash('curl \"$BASE_URL/api/skills?search=uniswap+pool+info\"')"
echo ""
POOL_SKILL_ID=$(curl -s "$BASE_URL/api/skills?search=uniswap+pool+info" | jq -r '.skills[0].id')
POOL_SKILL_NAME=$(curl -s "$BASE_URL/api/skills?search=uniswap+pool+info" | jq -r '.skills[0].name')
echo "   找到技能: $POOL_SKILL_NAME"
echo "   技能 ID: $POOL_SKILL_ID"
echo ""
echo "🤖 Agent 步骤 3.2: 获取技能详情"
echo "   bash('curl $BASE_URL/api/skills/$POOL_SKILL_ID')"
echo ""
curl -s "$BASE_URL/api/skills/$POOL_SKILL_ID" | jq '.skill | {
  name,
  description,
  is_paid,
  input_required: .schema.input.required,
  output_can_get: .schema.output.properties | keys
}'
echo ""
echo "🤖 Agent 应该回复用户："
echo ""
cat << 'EOF'
┌──────────────────────────────────────────────────────────┐
│ Agent 回复：                                              │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ 我找到了 "Uniswap Pool Info" 技能，可以查询池子信息。   │
│                                                           │
│ 技能定义显示可以获取：                                   │
│   - poolAddress: 池子合约地址                            │
│   - tvlUSD: 总锁仓价值（美元）                           │
│   - volume24h: 24小时交易量                              │
│   - fees24h: 24小时手续费收入                            │
│   - liquidity: 总流动性                                  │
│   - price: 当前价格                                      │
│   - apr: 年化收益率                                      │
│                                                           │
│ 需要的参数：                                             │
│   - chain: "ethereum"                                     │
│   - token0: USDC 地址                                     │
│   - token1: WETH 地址                                     │
│   - feeTier: 500 (0.05% 最常用的池)                     │
│                                                           │
│ ⚠️  Arsenal 的 /api/execute 返回模拟数据。              │
│                                                           │
│ 要获取真实池子数据，我推荐：                             │
│                                                           │
│ 方式 1: The Graph (Uniswap V3 Subgraph)                  │
│   查询实时链上数据                                       │
│                                                           │
│ 方式 2: Uniswap Info 官网                                │
│   https://info.uniswap.org/#/pools/0x88e6...             │
│   查看可视化数据                                         │
│                                                           │
│ 方式 3: 直接查询合约                                     │
│   使用 ethers.js 查询池子合约                            │
│                                                           │
│ 我可以帮你用哪种方式获取真实数据？                       │
└──────────────────────────────────────────────────────────┘
EOF
echo ""
echo "✅ 评分："
echo "   - 使用 bash + curl ✅"
echo "   - 获取技能定义 ✅"
echo "   - 解释可获取的数据 ✅"
echo "   - 告知 Arsenal 限制 ✅"
echo "   - 提供获取真实数据的方案 ✅"
echo ""
read -p "按 Enter 查看测试总结..."
echo ""
echo ""

# 总结
echo "╔════════════════════════════════════════════════════════╗"
echo "║                    测试总结                            ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Agent 成功完成的任务："
echo ""
echo "  1. ✅ 使用 bash('curl ...') 调用 Arsenal API"
echo "  2. ✅ 正确搜索价格查询、交易、池子信息技能"
echo "  3. ✅ 获取并理解技能的 schema"
echo "  4. ✅ 明确告知用户 Arsenal 的限制"
echo "  5. ✅ 提供获取真实数据的替代方案"
echo "  6. ✅ 提供真实执行的代码示例或指导"
echo "  7. ✅ 提醒用户交易风险和安全注意事项"
echo ""
echo "📊 评分标准："
echo ""
echo "  🌟 优秀 (5/5):"
echo "     - 所有 ✅ 项都做到"
echo "     - 清晰的用户沟通"
echo "     - 强烈的安全意识"
echo ""
echo "  👍 良好 (4/5):"
echo "     - 技术正确，但沟通可以更清晰"
echo ""
echo "  😐 及格 (3/5):"
echo "     - 使用了正确的 API，但没有充分告知限制"
echo ""
echo "  😞 不及格 (2/5):"
echo "     - 将模拟数据当作真实数据"
echo ""
echo "  💀 严重错误 (0/5):"
echo "     - 使用 search_arsenal_skills() 等不存在的工具"
echo "     - 声称执行了真实交易（实际没有）"
echo ""
echo "════════════════════════════════════════════════════════"
echo ""
echo "🎯 关键要点："
echo ""
echo "  1. ✅ 使用 bash + curl，不要使用 search_arsenal_skills()"
echo "  2. ⚠️  Arsenal 只提供技能定义，不执行真实交易"
echo "  3. 💡 帮助用户实现真实执行（提供代码/指导）"
echo ""
echo "════════════════════════════════════════════════════════"
echo ""
echo "📚 更多资源："
echo ""
echo "  - AGENT_QUICKSTART.md - 5分钟快速开始"
echo "  - AGENT_GUIDE.md - 完整使用指南"
echo "  - AGENT_TEST_SCENARIO.md - 详细测试场景"
echo ""
echo "════════════════════════════════════════════════════════"
echo ""
echo "✅ 测试完成！"
echo ""
