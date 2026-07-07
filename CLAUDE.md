# Arsenal — Claude Code Instructions

## 最重要的规则：文档同步

**每次做产品变更，必须同步更新文档。** 不是可选项。

涉及以下任何改动时，必须检查并更新 `ARSENAL.md` 和 `src/app/docs/page.tsx`：
- Skill 的 action、参数名、参数类型、响应格式
- 新增或删除 skill
- API 端点行为变更
- 架构层面的变化（执行方式、数据来源等）

文档是 agent 理解 Arsenal 的唯一来源。文档过时 = agent 出错。

---

## 项目结构

```
src/skills/          # 每个 skill 的 TypeScript 执行器
src/app/api/         # Next.js API 路由（execute、skills、router 等）
src/app/docs/        # 文档页面（面向人类）
scripts/             # sync-schemas.ts — 同步 skill schema 到 Supabase DB
ARSENAL.md           # 权威文档（面向 agent 和开发者）
```

## Skill 架构

- **Schema**（存在 Supabase DB）：agent 读这个来知道传什么参数
- **Executor**（`src/skills/*.ts`）：服务端运行的真实代码，调链上 RPC 和协议 SDK
- 两者必须保持同步。Schema 的 source of truth 是代码里的 `*_SKILL_METADATA` 对象

## Schema 同步

```bash
npm run sync-schemas   # 手动同步
npm run build          # build 自动触发 sync-schemas
```

修改 skill schema 时：在对应的 `*_SKILL_METADATA` 里改，然后跑 sync-schemas 或直接 deploy。

## 关键约定

- `sender`：交易发起方地址。EVM 用 `0x...`（40 hex），Sui 用 `0x...`（64 hex）。永远不用 `recipient`
- EVM build_swap_tx：返回 `transactions` 数组，必须按顺序执行
- Sui build tx：返回 `tx_bytes`（base64 PTB），传给任意 Sui 钱包签名
- Solana build tx：返回 `transaction`（base64 VersionedTransaction）
