#!/bin/bash

# Arsenal API 测试脚本
# 使用方法: ./test-arsenal.sh [local|production]

ENV=${1:-local}

if [ "$ENV" = "local" ]; then
  BASE_URL="http://localhost:3000"
  echo "🧪 Testing LOCAL Arsenal API: $BASE_URL"
else
  BASE_URL="https://arsenal.sumplus.xyz"
  echo "🧪 Testing PRODUCTION Arsenal API: $BASE_URL"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "Test 1: Manifest (Agent Discovery)"
echo "═══════════════════════════════════════════════════════"
curl -s "$BASE_URL/api/manifest" | jq '{
  name,
  base_url,
  critical_instructions: .quick_start.CRITICAL_INSTRUCTIONS,
  rest_api_example: .quick_start.rest_api.example_correct_usage
}'

echo ""
echo "═══════════════════════════════════════════════════════"
echo "Test 2: Search Skills (Semantic Search)"
echo "═══════════════════════════════════════════════════════"
echo "Query: 'uniswap pool information'"
curl -s "$BASE_URL/api/skills?search=uniswap+pool" | jq '{
  total: .total,
  skills: [.skills[] | {id, name, category, tags}]
}' | head -40

echo ""
echo "═══════════════════════════════════════════════════════"
echo "Test 3: Get Categories"
echo "═══════════════════════════════════════════════════════"
curl -s "$BASE_URL/api/categories" | jq '.'

echo ""
echo "═══════════════════════════════════════════════════════"
echo "Test 4: Get Specific Skill Details"
echo "═══════════════════════════════════════════════════════"
SKILL_ID=$(curl -s "$BASE_URL/api/skills?search=uniswap+pool" | jq -r '.skills[0].id')
if [ "$SKILL_ID" != "null" ] && [ -n "$SKILL_ID" ]; then
  echo "Skill ID: $SKILL_ID"
  curl -s "$BASE_URL/api/skills/$SKILL_ID" | jq '.skill | {
    name,
    description,
    category,
    is_paid,
    input_schema: .schema.input.properties | keys,
    output_schema: .schema.output.properties | keys,
    usage_examples: [.usage_examples[] | .description]
  }'
else
  echo "❌ No skill found"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "Test 5: Anthropic Skill Format"
echo "═══════════════════════════════════════════════════════"
curl -s "$BASE_URL/api/anthropic-skill" | head -50

echo ""
echo "═══════════════════════════════════════════════════════"
echo "Test 6: Search Different Queries"
echo "═══════════════════════════════════════════════════════"

queries=("swap tokens" "defi" "wallet" "blockchain")
for query in "${queries[@]}"; do
  echo "Query: '$query'"
  result=$(curl -s "$BASE_URL/api/skills?search=$query" | jq -r '.skills[0].name // "No results"')
  echo "  → $result"
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Test Complete"
echo "═══════════════════════════════════════════════════════"
