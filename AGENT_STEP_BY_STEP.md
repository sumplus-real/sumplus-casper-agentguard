# Agent 测试步骤清单

**场景：** 用户想查询 ETH/USDC 价格并进行交易

**复制粘贴每个命令，按顺序执行** ✅

---

## 步骤 1️⃣: 查询价格

### 1.1 搜索价格查询技能

```bash
bash('curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap+price+quote"')
```

**预期结果：** 找到 "Uniswap Price Quote" 技能

### 1.2 获取技能详情

```bash
bash('curl https://arsenal.sumplus.xyz/api/skills/86702f0a-5487-4959-b21a-6de879b9decd')
```

**预期结果：** 看到 schema（input/output）

### 1.3 回复用户 ✅

```
我找到了 "Uniswap Price Quote" 技能。

⚠️  Arsenal 的 /api/execute 只返回模拟数据。

要获取真实价格，建议使用：
1. Uniswap V3 SDK
2. The Graph API
3. Uniswap Quoter 合约
```

**❌ 不要说：** "当前价格是 $3,245.67"（这是模拟数据）

---

## 步骤 2️⃣: 执行交易

### 2.1 搜索交易技能

```bash
bash('curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap+swap+tokens"')
```

**预期结果：** 找到 "Uniswap Token Swap" 技能（付费 $2.50）

### 2.2 获取技能详情

```bash
bash('curl https://arsenal.sumplus.xyz/api/skills/2384dbf7-10a3-4cf7-9935-62f345e38ebc')
```

**预期结果：** 看到交易所需参数

### 2.3 回复用户 ✅

```
🚨 重要：Arsenal 不能执行真实交易！

我找到了交易技能定义，但 Arsenal：
❌ 不会执行真实交易
❌ 不会转移资金
❌ 没有你的钱包权限

要真实交易，你需要：
1. 使用 app.uniswap.org
2. 或我帮你生成交易代码（你自己执行）

⚠️  交易有风险，请谨慎操作
```

**❌ 绝对不要说：** "交易已完成！"（没有真实交易发生）

---

## 步骤 3️⃣: 查看池子信息

### 3.1 搜索池子信息技能

```bash
bash('curl "https://arsenal.sumplus.xyz/api/skills?search=uniswap+pool+info"')
```

**预期结果：** 找到 "Uniswap Pool Info" 技能

### 3.2 获取技能详情

```bash
bash('curl https://arsenal.sumplus.xyz/api/skills/23225fb6-a6ad-45d4-9ee6-422ecf53f400')
```

**预期结果：** 看到可查询的池子数据（TVL, volume, fees）

### 3.3 回复用户 ✅

```
技能定义显示可以查询：
- TVL (总锁仓量)
- 24h 交易量
- 24h 手续费
- 当前价格
- APR

⚠️  Arsenal 返回模拟数据。

获取真实数据请使用：
- The Graph API
- info.uniswap.org
- 直接查询合约
```

---

## ✅ 检查清单

完成测试后，检查你是否：

- [ ] 使用了 `bash('curl ...')` 而不是 `search_arsenal_skills()`
- [ ] 明确告诉用户 Arsenal 返回模拟数据
- [ ] 提供了获取真实数据的方法
- [ ] 告知用户 Arsenal 不执行真实交易
- [ ] 提醒了交易风险

---

## 🎯 评分

- **5/5 优秀：** 所有 ✅ 都做到
- **3/5 及格：** 用了正确 API 但没告知限制
- **0/5 错误：** 用了 `search_arsenal_skills()` 或声称执行了交易

---

## 📚 完整文档

详细说明：[AGENT_TEST_SCENARIO.md](./AGENT_TEST_SCENARIO.md)

快速开始：[AGENT_QUICKSTART.md](./AGENT_QUICKSTART.md)
