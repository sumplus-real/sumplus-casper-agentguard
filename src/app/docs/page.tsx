"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "skill-architecture", label: "Skill Architecture" },
  { id: "available-skills", label: "Available Skills" },
  { id: "authentication", label: "Authentication" },
  { id: "rest-api", label: "REST API" },
  { id: "publish", label: "Publish Skills" },
  { id: "mcp", label: "MCP Interface" },
  { id: "function-calling", label: "Function Calling" },
  { id: "router", label: "Router" },
  { id: "nexus", label: "Talus Nexus Gateway" },
  { id: "errors", label: "Error Codes" },
];

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700 my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <span className="text-xs font-mono text-slate-400">{language}</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-slate-900 p-4 text-sm font-mono text-slate-200 overflow-x-auto"><code>{code}</code></pre>
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");

  const curlAuth = `curl -H 'Authorization: Bearer YOUR_API_KEY' https://arsenal.sumplus.xyz/api/skills`;
  const tsClient = `const res = await fetch('/api/skills', {\n  headers: {\n    'Authorization': 'Bearer ' + apiKey,\n  }\n});`;
  const curlList = `curl 'https://arsenal.sumplus.xyz/api/skills?category=Blockchain&limit=10' \\\n  -H 'Authorization: Bearer YOUR_API_KEY'`;
  const curlGet = `curl 'https://arsenal.sumplus.xyz/api/skills/SKILL_ID' \\\n  -H 'Authorization: Bearer YOUR_API_KEY'`;
  const curlExecute = `curl -X POST 'https://arsenal.sumplus.xyz/api/execute' \\\n  -H 'Authorization: Bearer YOUR_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"skill_id": "SKILL_ID", "input": {"address": "0x..."}}'`;
  const tsExecute = `const result = await fetch('/api/execute', {\n  method: 'POST',\n  headers: {\n    'Authorization': 'Bearer ' + apiKey,\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify({\n    skill_id: 'SKILL_ID',\n    input: { address: '0x...' },\n  }),\n});\nconst data = await result.json();`;
  const mcpConfig = JSON.stringify(
    { mcpServers: { sumplus: { url: "https://arsenal.sumplus.xyz/mcp", apiKey: "YOUR_API_KEY" } } },
    null, 2
  );
  const mcpRequest = `POST /mcp\nContent-Type: application/json\nAuthorization: Bearer YOUR_API_KEY\n\n{\n  "method": "skills/list",\n  "params": { "category": "Blockchain", "limit": 10 }\n}`;
  const mcpExecute = `POST /mcp\nContent-Type: application/json\nAuthorization: Bearer YOUR_API_KEY\n\n{\n  "method": "skills/execute",\n  "params": {\n    "skill_id": "SKILL_ID",\n    "input": { "address": "0x..." }\n  }\n}`;
  const fnDef = JSON.stringify({
    name: "sui_blockchain_toolkit",
    description: "Interact with the SUI blockchain network",
    parameters: {
      type: "object",
      required: ["action", "address"],
      properties: {
        action: { type: "string", enum: ["get_balance", "get_tokens", "get_nfts"] },
        address: { type: "string", description: "SUI wallet address (0x...)" },
      },
    },
  }, null, 2);
  const fnFetch = `GET /api/functions?category=Blockchain\nAuthorization: Bearer YOUR_API_KEY\n\n# Returns OpenAI-compatible function definitions array`;
  const curlPublish = `curl -X POST 'https://arsenal.sumplus.xyz/api/skills' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "My Skill Name",
    "description": "What this skill does, in detail.",
    "category": "Blockchain",
    "tags": ["defi", "ethereum"],
    "version": "1.0.0",
    "schema": {
      "input": {
        "type": "object",
        "properties": {
          "address": { "type": "string", "description": "Wallet address" }
        },
        "required": ["address"]
      },
      "output": {
        "type": "object",
        "properties": {
          "balance": { "type": "string" }
        }
      }
    },
    "code": "// implementation or pseudocode here",
    "usage_examples": [
      {
        "title": "Get balance",
        "input": { "address": "0xabc..." },
        "expected_output": { "balance": "1.5 ETH" }
      }
    ],
    "is_paid": false
  }'`;

  const curlUpdateSkill = `curl -X PUT 'https://arsenal.sumplus.xyz/api/skills/SKILL_ID' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "description": "Updated description",
    "tags": ["defi", "ethereum", "v2"]
  }'`;

  const routerSearch =`POST /api/router\nContent-Type: application/json\nAuthorization: Bearer YOUR_API_KEY\n\n{\n  "action": "search",\n  "query": "SUI blockchain balance"\n}`;
  const routerExecute = `POST /api/router\nContent-Type: application/json\nAuthorization: Bearer YOUR_API_KEY\n\n{\n  "action": "execute",\n  "skill_id": "SKILL_ID",\n  "input": { "action": "get_balance", "address": "0x..." }\n}`;

  const nexusBatch = `GET /api/tools?network=testnet\n\n# Returns Nexus tools ready for testnet registration\n{\n  "network": "testnet",\n  "tools": [\n    { "fqn": "xyz.sumplus.cetus-testnet@1", "url": "https://arsenal.sumplus.xyz/api/tools/cetus-testnet" }\n  ]\n}`;

  const nexusMeta = `GET /api/tools/navi/meta\n\n{\n  "fqn": "xyz.sumplus.navi@1",\n  "type": "offchain",\n  "url": "https://arsenal.sumplus.xyz/api/tools/navi",\n  "description": "NAVI is the leading lending & borrowing protocol on Sui...",\n  "input_schema":  { "$schema": "...", "type": "object", "required": ["action"], "properties": { ... } },\n  "output_schema": { "$schema": "...", "oneOf": [ { "properties": { "ok":  { "type": "object" } } },\n                                                  { "properties": { "err": { "type": "object" } } } ] }\n}`;

  const nexusInvoke = `POST /api/tools/navi/invoke\nContent-Type: application/json\n\n{ "action": "get_markets" }\n\n# → { "ok":  { "protocol": "NAVI Protocol", "markets": [...] } }\n# or  { "err": { "reason": "..." } }`;

  const nexusRegister = `# 1. Local dry-run — no chain effect\nnexus tool validate off-chain --url https://arsenal.sumplus.xyz/api/tools/cetus\n\n# 2. Batch registration (requires Sumplus on Talus allowlist)\nnexus tool register offchain \\\n  --url https://arsenal.sumplus.xyz/api/tools \\\n  --batch \\\n  --collateral-coin <sui_coin_id>`;

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex gap-8">

          {/* TOC Sidebar */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-24">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Contents</h3>
              <nav className="flex flex-col gap-1">
                {TOC.map((item) => (
                  <a
                    key={item.id}
                    href={"#" + item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={"px-3 py-2 rounded-lg text-sm transition-colors " + (activeSection === item.id ? "bg-blue-600/20 text-blue-400 font-medium" : "text-slate-400 hover:text-white hover:bg-slate-800")}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0 max-w-3xl">
            <div className="mb-10">
              <h1 className="text-4xl font-bold text-white mb-3">API Documentation</h1>
              <p className="text-slate-400 text-lg">Complete reference for integrating Sumplus Arsenal skills into your AI agents.</p>
            </div>

            {/* Overview */}
            <section id="overview" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">Overview</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Arsenal skills are <strong className="text-white">server-side execution units</strong>, not text descriptions.
                Each skill is real TypeScript code running on Arsenal&apos;s servers — making live on-chain RPC calls,
                invoking protocol SDKs, and building ready-to-sign transactions. Your agent sends a request; Arsenal
                handles all the blockchain complexity and returns structured data.
              </p>
              <p className="text-slate-400 leading-relaxed mb-6">
                This is different from text-based skill formats (like Anthropic&apos;s SKILL.md) where the agent
                itself has to figure out the implementation. With Arsenal, execution is Arsenal&apos;s job — the agent
                only decides <em>what</em> to do, not <em>how</em>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">REST API</p>
                  <p className="text-slate-400 text-sm">HTTP endpoints for listing, searching, and executing skills from any agent or backend.</p>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-purple-300 uppercase tracking-wide mb-1">MCP Interface</p>
                  <p className="text-slate-400 text-sm">Model Context Protocol — plug Arsenal directly into Claude, Cursor, or any MCP-compatible agent.</p>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-300 uppercase tracking-wide mb-1">Function Calling</p>
                  <p className="text-slate-400 text-sm">OpenAI-compatible function definitions for use with GPT-4, Claude API, or any LLM with tool use.</p>
                </div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 mb-4">
                <p className="text-sm font-semibold text-slate-300 mb-1">Base URL</p>
                <CodeBlock code="https://arsenal.sumplus.xyz" language="text" />
              </div>
            </section>

            {/* Skill Architecture */}
            <section id="skill-architecture" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">Skill Architecture</h2>
              <p className="text-slate-300 leading-relaxed mb-6">
                Arsenal skills are <strong className="text-white">server-side code executors</strong>, not text prompts.
                Each skill is a TypeScript function that runs on Arsenal&apos;s servers — it makes real on-chain RPC calls,
                invokes protocol SDKs, builds unsigned transactions, and returns structured data back to the agent.
              </p>

              {/* Architecture diagram */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 mb-6 font-mono text-sm">
                <div className="flex flex-col gap-2 text-slate-300">
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-600/30 border border-blue-500/40 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-sans">AI Agent</span>
                    <span className="text-slate-500">reads schema →</span>
                    <span className="bg-slate-700/60 border border-slate-600/40 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-sans">Skill Schema (DB)</span>
                    <span className="text-slate-500 text-xs">knows param names &amp; types</span>
                  </div>
                  <div className="pl-4 text-slate-600 text-xs">↓ sends request with correct params</div>
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-600/30 border border-blue-500/40 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-sans">AI Agent</span>
                    <span className="text-slate-500">POST /api/execute →</span>
                    <span className="bg-green-600/30 border border-green-500/40 text-green-300 px-3 py-1.5 rounded-lg text-xs font-sans">Skill Executor (Code)</span>
                    <span className="text-slate-500 text-xs">runs on Arsenal servers</span>
                  </div>
                  <div className="pl-[17rem] text-slate-600 text-xs">↓ calls chain RPC / protocol SDK</div>
                  <div className="flex items-center gap-3 pl-[17rem]">
                    <span className="bg-purple-600/30 border border-purple-500/40 text-purple-300 px-3 py-1.5 rounded-lg text-xs font-sans">Blockchain / Protocol</span>
                  </div>
                  <div className="pl-4 text-slate-600 text-xs mt-1">← returns structured result (balances, tx_bytes, positions…)</div>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-white mb-3">Two layers, two jobs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                  <p className="text-sm font-semibold text-blue-300 mb-2">Schema (interface contract)</p>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Stored in Supabase. Tells agents what parameters to send and what shape the response will be.
                    This is the only thing an agent reads — it never sees the implementation code.
                  </p>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                  <p className="text-sm font-semibold text-green-300 mb-2">Executor (implementation)</p>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    TypeScript running on Arsenal&apos;s servers. Validates input, calls chain RPC nodes or protocol SDKs
                    (Cetus, Bluefin Ember, Jupiter, etc.), and returns ready-to-sign transactions or live on-chain data.
                  </p>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-white mb-3">Why code, not text prompts?</h3>
              <div className="space-y-3 mb-6">
                <div className="flex gap-3">
                  <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                  <div>
                    <span className="text-slate-200 text-sm font-medium">Real-time on-chain data</span>
                    <p className="text-slate-400 text-sm mt-0.5">Balances, positions, APYs, pool liquidity — these live on-chain and change every block. Only executable code can fetch them; a text prompt cannot.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                  <div>
                    <span className="text-slate-200 text-sm font-medium">Transaction construction</span>
                    <p className="text-slate-400 text-sm mt-0.5">Depositing into a vault requires fetching coin objects, calling a protocol SDK, building a PTB, and serialising it to base64. This is a computation, not a description.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                  <div>
                    <span className="text-slate-200 text-sm font-medium">Deterministic validation</span>
                    <p className="text-slate-400 text-sm mt-0.5">Address format, minimum amounts, vault capacity — these are enforced in code before anything touches the chain, so agents always get clean errors, not silent failures.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                  <div>
                    <span className="text-slate-200 text-sm font-medium">Credential isolation</span>
                    <p className="text-slate-400 text-sm mt-0.5">RPC keys, SDK credentials, and contract addresses stay server-side in environment variables. Agents receive only the result — never raw secrets.</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <p className="text-blue-300 text-sm">
                  <strong>Division of responsibility:</strong> The AI agent decides <em>what</em> to do and assembles the right parameters.
                  Arsenal decides <em>how</em> to do it — handling all blockchain complexity and returning a result the agent can act on immediately.
                </p>
              </div>
            </section>

            {/* Available Skills */}
            <section id="available-skills" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">Available Skills</h2>
              <p className="text-slate-300 leading-relaxed mb-6">
                Arsenal-hosted skills run in-process — no separate server, no API key needed beyond your Arsenal token.
                Ethereum mainnet skills require <code className="text-blue-300">ALCHEMY_API_KEY</code> on the server (already configured).
              </p>

              <h3 className="text-lg font-semibold text-white mb-3">Ethereum Mainnet (P0)</h3>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700"><th className="text-left px-4 py-2 text-slate-400 font-medium">Skill</th><th className="text-left px-4 py-2 text-slate-400 font-medium">Key Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    <tr><td className="px-4 py-2 font-medium text-white">Uniswap v3 Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">quote_exact_input, quote_exact_output, swap_exact_input, swap_exact_output, wrap_eth, unwrap_weth</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Uniswap V4 Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_protocol_info, get_pool_state, get_protocol_stats, get_hook_info, swap_exact_input (native ETH → ERC20 only, via UniversalRouter V4_SWAP)</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Aave v3 Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">supply, withdraw, borrow, repay, set_collateral, get_user_account_data, get_reserve_data, flashloan</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Compound V3 Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_market_info, get_user_position, supply, withdraw, claim_rewards</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Balancer V2 Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_pool_tokens, get_swap_quote, build_swap_tx</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Lido Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">submit_eth, wrap_steth_to_wsteth, unwrap_wsteth_to_steth, request_withdrawal_steth/wsteth, claim_withdrawals_to, get_withdrawal_status</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Morpho Blue Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">list_metavaults, get_vault, get_position, deposit_to_vault, withdraw_from_vault, supply_collateral, borrow, repay</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Ethena Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">stake_usde, cooldown_assets, cooldown_shares, unstake, preview_deposit, cooldown_status</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Curve Read Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">list_pools, get_pool, quote_exchange_multiple, get_virtual_price</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Pendle v4 Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">list_markets, get_market, get_asset_price, add_liquidity, remove_liquidity, swap_exact_pt/yt/sy</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">1inch Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">quote, get_spender, get_allowance, build_swap_tx</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Synthra</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_quote, get_price, build_swap_tx</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Fluid</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_vaults, get_vault, get_ftokens, supply_lend, withdraw_lend, supply_collateral, withdraw_collateral, borrow, payback</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Euler v2 Mainnet</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_vaults, get_vault, deposit, withdraw, borrow, repay, enable_collateral, enable_controller</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Sky Protocol (MakerDAO)</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_protocol_info, get_ssr_rate, get_usds_stats, get_spark_stats</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">EtherFi</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_protocol_info, get_eeth_stats, get_exchange_rate, get_token_balance</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Ondo Finance</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_protocol_info, get_ousg_stats, get_usdy_stats, get_token_balance</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">EigenLayer</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_protocol_info, get_protocol_stats, get_avs_list, get_operator_info</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">STRC DeFi Ecosystem</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_protocol_info, get_apyx_stats, get_saturn_stats, get_strc_market_data</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">CoW Protocol</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_protocol_info, get_quote, get_order_status, get_protocol_stats</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Maple Finance</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_protocol_info, get_protocol_stats, get_pools, get_pool_details</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">DefiLlama</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_protocol_tvl, list_yields, get_chain_tvl, get_stablecoin_circulation</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">ETH RPC</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">eth_call, simulate_call, get_storage_at, get_receipt, get_block</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Token Lists</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_token, resolve_by_symbol, is_canonical</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Transaction Simulation</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">simulate, simulate_bundle, decode_call</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
                <p className="text-blue-300 text-sm">
                  <strong>EVM transaction format:</strong> tx-building actions return <code className="text-blue-200">{"{ transactions: [{to, data, value, chain_id, description}], approvals?: [...] }"}</code>.
                  Execute <code className="text-blue-200">approvals</code> first (ERC-20 approve), then the main transaction — in order.
                </p>
              </div>

              <h3 className="text-lg font-semibold text-white mb-3">Bridge (Cross-chain, P0)</h3>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700"><th className="text-left px-4 py-2 text-slate-400 font-medium">Skill</th><th className="text-left px-4 py-2 text-slate-400 font-medium">Key Actions</th><th className="text-left px-4 py-2 text-slate-400 font-medium">Chains</th></tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    <tr><td className="px-4 py-2 font-medium text-white">CCTP Bridge</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">deposit_for_burn, get_attestation, receive_message</td><td className="px-4 py-2 text-slate-400">ETH ↔ Arb ↔ Opt ↔ Base ↔ Avax ↔ Polygon</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Across Protocol</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_quote, deposit, get_deposit_status</td><td className="px-4 py-2 text-slate-400">ETH ↔ Arb ↔ Opt ↔ Base ↔ Polygon ↔ Avax</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Stargate Bridge</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_supported_pools, quote_send, send_token</td><td className="px-4 py-2 text-slate-400">ETH → Arb / Opt / Base / Polygon / Avax / BSC</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Wormhole Token Bridge</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">transfer_tokens, transfer_eth, get_vaa, complete_transfer</td><td className="px-4 py-2 text-slate-400">ETH ↔ Arb ↔ Opt ↔ Base ↔ Polygon ↔ Avax ↔ BSC ↔ Solana ↔ Sui</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">deBridge DLN</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">create_order, get_order_status</td><td className="px-4 py-2 text-slate-400">ETH ↔ Arb ↔ Opt ↔ Base ↔ Polygon ↔ BSC ↔ Linea ↔ Solana</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">XLayer Official Bridge</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">bridge_to_xlayer, bridge_from_xlayer</td><td className="px-4 py-2 text-slate-400">ETH ↔ XLayer (chain 196)</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Mantle Official Bridge</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">bridge_to_mantle, bridge_from_mantle</td><td className="px-4 py-2 text-slate-400">ETH ↔ Mantle (chain 5000)</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">HashKey Official Bridge</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">bridge_to_hashkey, bridge_from_hashkey</td><td className="px-4 py-2 text-slate-400">ETH ↔ HashKey Chain (chain 177)</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
                <p className="text-blue-300 text-sm">
                  <strong>CCTP:</strong> <code className="text-blue-200">deposit_for_burn</code> → poll <code className="text-blue-200">get_attestation</code> → <code className="text-blue-200">receive_message</code>. USDC only.<br/>
                  <strong>Across:</strong> <code className="text-blue-200">get_quote</code> → <code className="text-blue-200">deposit</code>. Relayer auto-fills on destination.<br/>
                  <strong>Stargate:</strong> <code className="text-blue-200">quote_send</code> (on-chain fee) → <code className="text-blue-200">send_token</code> (value=nativeFee). ETH pool: <code className="text-blue-200">is_eth_pool: true</code>.<br/>
                  <strong>Wormhole:</strong> <code className="text-blue-200">transfer_tokens</code> → poll <code className="text-blue-200">get_vaa</code> (1-15 min) → <code className="text-blue-200">complete_transfer</code> (EVM) or platform SDK (Solana/Sui).<br/>
                  <strong>deBridge:</strong> <code className="text-blue-200">create_order</code> → poll <code className="text-blue-200">get_order_status</code>. No slippage, supports Solana.<br/>
                  <strong>XLayer Bridge:</strong> <code className="text-blue-200">bridge_to_xlayer</code> / <code className="text-blue-200">bridge_from_xlayer</code>. Auto-claimed by bridge service.<br/>
                  <strong>Mantle Bridge:</strong> <code className="text-blue-200">bridge_to_mantle</code> / <code className="text-blue-200">bridge_from_mantle</code>. Canonical OP-stack bridge; pass <code className="text-blue-200">token: eth|mnt|usdc|usdt</code>. Handles MNT/ETH cross-layer asymmetry. Withdrawals are the 7-day flow (builds the L2 initiation tx only).<br/>
                  <strong>HashKey Bridge:</strong> <code className="text-blue-200">bridge_to_hashkey</code> / <code className="text-blue-200">bridge_from_hashkey</code>. Official OP-stack bridge behind bridge.hsk.xyz; pass <code className="text-blue-200">token: hsk|usdt</code>. HSK is a custom native gas token, so HSK deposits route through the OptimismPortal (pass <code className="text-blue-200">recipient</code> or <code className="text-blue-200">sender</code>); ETH is not bridgeable here. Withdrawals build the L2 initiation tx only.
                </p>
              </div>

              <h3 className="text-lg font-semibold text-white mb-3">Multi-chain EVM</h3>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700"><th className="text-left px-4 py-2 text-slate-400 font-medium">Skill</th><th className="text-left px-4 py-2 text-slate-400 font-medium">Chains</th></tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    <tr><td className="px-4 py-2 font-medium text-white">Uniswap V3</td><td className="px-4 py-2 text-slate-400">ethereum, optimism, arbitrum, base, polygon</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Aave (multi-chain read)</td><td className="px-4 py-2 text-slate-400">ethereum, optimism, arbitrum, polygon, base, avalanche, xlayer</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">PancakeSwap V3</td><td className="px-4 py-2 text-slate-400">bsc, ethereum, arbitrum, base</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Uniswap V3 on BSC</td><td className="px-4 py-2 text-slate-400">bsc</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">THENA (ve(3,3): Fusion + V1 best-exec)</td><td className="px-4 py-2 text-slate-400">bsc</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Velodrome V2</td><td className="px-4 py-2 text-slate-400">optimism</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Aerodrome Finance</td><td className="px-4 py-2 text-slate-400">base</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Moonwell (lending)</td><td className="px-4 py-2 text-slate-400">base</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">HSKSwap (Solidly AMM)</td><td className="px-4 py-2 text-slate-400">hashkey chain (177)</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">XPower Finance (cooperative yield)</td><td className="px-4 py-2 text-slate-400">xlayer (196)</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">StableStock (tokenized equities)</td><td className="px-4 py-2 text-slate-400">bsc</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold text-white mb-3">Data &amp; Oracles</h3>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700"><th className="text-left px-4 py-2 text-slate-400 font-medium">Skill</th><th className="text-left px-4 py-2 text-slate-400 font-medium">Key Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    <tr><td className="px-4 py-2 font-medium text-white">CoinGecko</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_price, get_market_data, search_token, get_global_stats, get_trending</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Chainlink</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_price, get_feed_by_symbol, list_feeds (7 EVM chains)</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Pyth Network</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_price, get_multiple_prices, list_feeds</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">The Graph</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">query_subgraph, get_popular_subgraphs, get_subgraph_info</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Gas Tracker</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_gas_price, get_all_gas_prices, estimate_tx_cost</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">ENS / SuiNS</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">resolve_name, reverse_lookup, get_name_info</td></tr>
                    <tr><td className="px-4 py-2 font-medium text-white">Casper AgentGuard</td><td className="px-4 py-2 text-slate-400 font-mono text-xs">get_chain_info, build_agent_receipt, build_install_command, build_registry_call, get_deploy_status</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold text-white mb-3">Sui / Solana / Other</h3>
              <p className="text-slate-400 text-sm mb-2">
                Cetus CLMM, Bluefin Ember, Aftermath Finance, Turbos (CLMM), Kriya (AMM), FlowX (DEX aggregator — swap quote/build), NAVI, Scallop, Suilend, Bucket Protocol (USDB CDP stablecoin — borrow/repay/PSM), Haedal (haSUI liquid staking), Volo (vSUI liquid staking), AlphaFi (stSUI liquid staking — stake/unstake), Typus Finance (options vaults — covered call / put selling), IKA dWallet (Sui) ·
                Aptos: Aries Markets (leading lending — supply/borrow/APY), Thala (MOD stablecoin + thAPT liquid staking + ThalaSwap pools), Amnis (amAPT/stAPT liquid staking), Echelon Market (lending — 28 markets), Merkle Trade (perps — 72 pairs read on-chain) ·
                Berachain (PoL L1, chain 80094, native BERA): chain toolkit (balances/gas/transfers + BERA⇄WBERA wrap), Kodiak Finance (leading DEX, Uniswap V3 fork — swap quote/build), Infrared (iBERA/iBGT liquid staking), Honey (native overcollateralized stablecoin + BEX stats) ·
                BTCfi: Babylon (bridge-less native BTC staking), Lombard (LBTC liquid staking, Babylon-backed), Lorenzo (stBTC across ETH & BSC), Solv (SolvBTC yield across ETH/BSC/Arb), Bedrock (uniBTC / uniETH restaking), Core Chain (chain 1116 BTC staking + lstBTC) ·
                Monad (parallel-EVM L1, chain 143 — chain toolkit: balances/gas/transfers/MON⇄WMON wrap + Uniswap V3 & PancakeSwap V3 swap quotes/build + Magma & ShMonad liquid staking MON⇄gMON/shMON + Kintsu sMON staking (read) + Euler v2 & Morpho Blue lending: deposit/withdraw/borrow/repay + Kuru CLOB markets) · Agni Finance (leading Mantle DEX, chain 5000 — Uniswap V3 fork: swap quotes/build, native MNT) · Jupiter, Raydium (AMM/CLMM swap + build_swap_tx), Meteora (largest Solana liquidity layer — DLMM data + Meteora-routed swap), Orca Whirlpools, Kamino Finance (largest Solana lending + automated vaults — deposit/withdraw/borrow/repay), marginfi (mrgnlend lending), Save/Solend (lending — supply+borrow APY), Jito (jitoSOL liquid staking + MEV tip floor — stake/unstake), Marinade (mSOL liquid staking — stake/unstake), Sanctum (LST hub — 245 LSTs), Jupiter Perpetuals (SOL/ETH/BTC perps — open/close leveraged positions) (Solana) · dYdX, Hyperliquid (#1 perps — market data + build_order/build_cancel_order: sign-and-submit client-side), GMX, WEEX, Binance (CEX spot — public market data + signed trading with your own API key), Binance Stock Perpetuals (USDⓈ-M TradFi perps — stocks/ETFs/commodities price + funding rates), Binance bStocks (tokenized-equity product info) · Tempo MPP, Token Info ·
                Polymarket · Sumplus Yield Optimizer · DAOaaS Swap (Eniac Network, chain 173) · Arc Chain (Circle Arc Testnet, USDC-native L1, chain 5042002) · Exchange OS (OKX X Layer pre-launch toolkit, chain 196 — native OKB / WOKB primitives, venue + TradeZone actions land when contracts publish) · Casper AgentGuard (Casper Testnet policy/proposal/decision/receipt anchoring for AI agent audit trails) · SafeRouter Verified Inference (confidential-verifiable LLM gateway with per-request TEE attestation — read-only discovery, Arsenal never proxies the chat path)
              </p>
              <p className="text-slate-400 text-sm">
                Use <code className="text-blue-300">GET /api/skills?search=...</code> to discover all available skills and their full schemas.
              </p>
            </section>

            {/* Authentication */}
            <section id="authentication" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">Authentication</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Browsing skills is public. All write and execute endpoints require a Bearer token.
                Two token types are accepted:
              </p>
              <ul className="list-disc list-inside text-slate-400 mb-4 space-y-1 text-sm">
                <li><span className="text-slate-300">Supabase JWT</span> — from <code className="text-blue-300">/api/auth/login</code></li>
                <li><span className="text-slate-300">API Key</span> — from <code className="text-blue-300">/api/auth/signup</code> (returned on signup) or <code className="text-blue-300">/api/auth/apikey</code> — recommended for agents, does not expire</li>
              </ul>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4">
                <p className="text-amber-300 text-sm"><strong>Important:</strong> Keep your API keys secret. Never expose them in client-side code or version control.</p>
              </div>
              <CodeBlock code={curlAuth} language="bash" />
              <CodeBlock code={tsClient} language="typescript" />
            </section>

            {/* REST API */}
            <section id="rest-api" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-6">REST API</h2>
              <div className="space-y-8">

                {/* GET /api/skills */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-blue-600/20 text-blue-300 border border-blue-500/30 text-xs font-bold px-2.5 py-1 rounded font-mono">GET</span>
                    <code className="text-slate-300 font-mono text-sm">/api/skills</code>
                  </div>
                  <p className="text-slate-400 mb-3">List skills with optional filtering, search, and pagination.</p>
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-3">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-700"><th className="text-left px-4 py-2 text-slate-400 font-medium">Parameter</th><th className="text-left px-4 py-2 text-slate-400 font-medium">Type</th><th className="text-left px-4 py-2 text-slate-400 font-medium">Description</th></tr></thead>
                      <tbody className="divide-y divide-slate-700/50">
                        <tr><td className="px-4 py-2 font-mono text-blue-300">search</td><td className="px-4 py-2 text-slate-400">string</td><td className="px-4 py-2 text-slate-400">Full-text search query</td></tr>
                        <tr><td className="px-4 py-2 font-mono text-blue-300">category</td><td className="px-4 py-2 text-slate-400">string</td><td className="px-4 py-2 text-slate-400">Filter by category</td></tr>
                        <tr><td className="px-4 py-2 font-mono text-blue-300">sort</td><td className="px-4 py-2 text-slate-400">string</td><td className="px-4 py-2 text-slate-400">Sort field (e.g. rating_avg.desc)</td></tr>
                        <tr><td className="px-4 py-2 font-mono text-blue-300">limit</td><td className="px-4 py-2 text-slate-400">number</td><td className="px-4 py-2 text-slate-400">Items per page (default: 20)</td></tr>
                        <tr><td className="px-4 py-2 font-mono text-blue-300">offset</td><td className="px-4 py-2 text-slate-400">number</td><td className="px-4 py-2 text-slate-400">Pagination offset (default: 0)</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <CodeBlock code={curlList} language="bash" />
                </div>

                {/* GET /api/skills/:id */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-blue-600/20 text-blue-300 border border-blue-500/30 text-xs font-bold px-2.5 py-1 rounded font-mono">GET</span>
                    <code className="text-slate-300 font-mono text-sm">/api/skills/:id</code>
                  </div>
                  <p className="text-slate-400 mb-3">Get full skill details including schema and ratings.</p>
                  <CodeBlock code={curlGet} language="bash" />
                </div>

                {/* POST /api/execute */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-green-600/20 text-green-300 border border-green-500/30 text-xs font-bold px-2.5 py-1 rounded font-mono">POST</span>
                    <code className="text-slate-300 font-mono text-sm">/api/execute</code>
                  </div>
                  <p className="text-slate-400 mb-3">Execute a skill with the provided input.</p>
                  <CodeBlock code={curlExecute} language="bash" />
                  <CodeBlock code={tsExecute} language="typescript" />
                </div>
              </div>
            </section>

            {/* Publish Skills */}
            <section id="publish" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">Publish Skills</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Any authenticated user or agent can publish community skills.
                New skills start with <code className="text-amber-300">status: pending</code> and become visible after admin approval.
                Official skills (author_type: official) are approved immediately.
              </p>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-6">
                <p className="text-sm font-semibold text-slate-300 mb-2">Required fields</p>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-700"><th className="text-left px-4 py-2 text-slate-400 font-medium">Field</th><th className="text-left px-4 py-2 text-slate-400 font-medium">Type</th><th className="text-left px-4 py-2 text-slate-400 font-medium">Notes</th></tr></thead>
                    <tbody className="divide-y divide-slate-700/50">
                      <tr><td className="px-4 py-2 font-mono text-blue-300">name</td><td className="px-4 py-2 text-slate-400">string</td><td className="px-4 py-2 text-slate-400">1–100 characters</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-blue-300">description</td><td className="px-4 py-2 text-slate-400">string</td><td className="px-4 py-2 text-slate-400">10–2000 characters</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-blue-300">category</td><td className="px-4 py-2 text-slate-400">string</td><td className="px-4 py-2 text-slate-400">e.g. Blockchain, Finance, AI/ML</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-blue-300">schema</td><td className="px-4 py-2 text-slate-400">object</td><td className="px-4 py-2 text-slate-400">{"{ input: JSONSchema, output: JSONSchema }"}</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-slate-500">tags</td><td className="px-4 py-2 text-slate-400">string[]</td><td className="px-4 py-2 text-slate-400">optional</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-slate-500">code</td><td className="px-4 py-2 text-slate-400">string</td><td className="px-4 py-2 text-slate-400">optional — implementation or pseudocode</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-slate-500">usage_examples</td><td className="px-4 py-2 text-slate-400">array</td><td className="px-4 py-2 text-slate-400">optional — improves discoverability</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-slate-500">is_paid</td><td className="px-4 py-2 text-slate-400">boolean</td><td className="px-4 py-2 text-slate-400">default false</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-slate-500">price</td><td className="px-4 py-2 text-slate-400">number</td><td className="px-4 py-2 text-slate-400">USD per execution; required if is_paid=true</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-slate-400 mb-2 font-medium">Publish a new skill:</p>
              <CodeBlock code={curlPublish} language="bash" />

              <p className="text-slate-300 text-sm mb-4">
                On success, returns <code className="text-green-300">{"{ skill: { id, name, status } }"}</code>.
                Save the <code className="text-blue-300">id</code> — you&apos;ll need it to update or reference the skill.
              </p>

              <p className="text-slate-400 mb-2 font-medium">Update an existing skill (author or admin only):</p>
              <CodeBlock code={curlUpdateSkill} language="bash" />

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mt-2">
                <p className="text-blue-300 text-sm">
                  <strong>Agents:</strong> Use your API key (from <code className="text-blue-200">/api/auth/signup</code> or <code className="text-blue-200">/api/auth/apikey</code>).
                  The author name displayed on your skill comes from your account username — set it at <code className="text-blue-200">/settings</code> after signing up.
                </p>
              </div>
            </section>

            {/* MCP Interface */}
            <section id="mcp" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">MCP Interface</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Full Model Context Protocol support. Three methods: <code className="text-blue-300">skills/list</code>,{" "}
                <code className="text-blue-300">skills/get</code>, <code className="text-blue-300">skills/execute</code>.
              </p>
              <p className="text-slate-400 mb-2 font-medium">Claude Code configuration:</p>
              <CodeBlock code={mcpConfig} language="json" />
              <p className="text-slate-400 mb-2 font-medium">List skills:</p>
              <CodeBlock code={mcpRequest} language="http" />
              <p className="text-slate-400 mb-2 font-medium">Execute a skill:</p>
              <CodeBlock code={mcpExecute} language="http" />
            </section>

            {/* Function Calling */}
            <section id="function-calling" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">Function Calling</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Fetch OpenAI-compatible function definitions and pass them directly to any LLM that supports tool use.
              </p>
              <p className="text-slate-400 mb-2 font-medium">Fetch function definitions:</p>
              <CodeBlock code={fnFetch} language="http" />
              <p className="text-slate-400 mb-2 font-medium">Example function definition returned:</p>
              <CodeBlock code={fnDef} language="json" />
              <p className="text-slate-400 mt-4">
                Execute via <code className="text-blue-300">POST /api/functions/execute</code> with{" "}
                <code className="text-slate-300">{`{ "function_name": "sui_blockchain_toolkit", "arguments": { ... } }`}</code>
              </p>
            </section>

            {/* Router */}
            <section id="router" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">Router</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                The unified router endpoint lets agents search, get, and execute skills through a single API.
                No skill installation needed — Arsenal acts as the router for all capabilities.
              </p>
              <p className="text-slate-400 mb-2 font-medium">Search:</p>
              <CodeBlock code={routerSearch} language="http" />
              <p className="text-slate-400 mb-2 font-medium">Execute:</p>
              <CodeBlock code={routerExecute} language="http" />
            </section>

            {/* Talus Nexus Gateway */}
            <section id="nexus" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">Talus Nexus Gateway</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Arsenal wraps a subset of its Sui skills as <a href="https://docs.talus.network" className="text-blue-300 underline">Talus Nexus</a> off-chain tools so any Nexus DAG workflow can call Arsenal skills as native tool nodes. Each wrapped skill lives at <code className="text-blue-300">/api/tools/&lt;slug&gt;</code> and exposes the three standard Nexus endpoints: <code className="text-blue-300">GET /health</code>, <code className="text-blue-300">GET /meta</code>, <code className="text-blue-300">POST /invoke</code>.
              </p>
              <p className="text-slate-300 leading-relaxed mb-4">
                No API key needed — Nexus Leader nodes authenticate at the application layer via signed HTTP (Ed25519), which is post-MVP. Today the gateway runs un-signed over HTTPS.
              </p>

              <p className="text-slate-400 mb-2 font-medium">Tools advertised for Nexus testnet registration:</p>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left px-4 py-3 text-slate-300 font-semibold">FQN</th>
                      <th className="text-left px-4 py-3 text-slate-300 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    <tr><td className="px-4 py-3 font-mono text-blue-300">xyz.sumplus.cetus-testnet@1</td><td className="px-4 py-3 text-slate-300">get_swap_quote</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-400 text-sm mb-4">
                The testnet tool pins every invocation to Sui testnet and restricts Cetus Aggregator providers to CETUS and DEEPBOOKV3 (the DEXes with live Sui testnet deployments). No mainnet RPC is reachable through it.
              </p>

              <p className="text-slate-400 mb-2 font-medium">Mainnet-only tools (reachable individually, not in batch index):</p>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left px-4 py-3 text-slate-300 font-semibold">FQN</th>
                      <th className="text-left px-4 py-3 text-slate-300 font-semibold">Underlying skill</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    <tr><td className="px-4 py-3 font-mono text-blue-300">xyz.sumplus.cetus@1</td><td className="px-4 py-3 text-slate-300">Cetus CLMM</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-blue-300">xyz.sumplus.bluefin-ember@1</td><td className="px-4 py-3 text-slate-300">Bluefin Ember vaults</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-blue-300">xyz.sumplus.aftermath@1</td><td className="px-4 py-3 text-slate-300">Aftermath Finance</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-blue-300">xyz.sumplus.navi@1</td><td className="px-4 py-3 text-slate-300">NAVI Protocol</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-blue-300">xyz.sumplus.scallop@1</td><td className="px-4 py-3 text-slate-300">Scallop</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-400 text-sm mb-4">
                These tools call Sui mainnet RPC. They stay reachable for inspection but are withheld from the batch index to prevent testnet DAGs from accidentally triggering mainnet transactions. Non-Sui skills (EVM / Solana / XLayer / Tempo) are <strong>not</strong> exposed at all — Talus Nexus only supports Sui today.
              </p>

              <p className="text-slate-400 mb-2 font-medium">Batch index for Nexus CLI <code className="text-blue-300">--batch</code>:</p>
              <CodeBlock code={nexusBatch} language="http" />

              <p className="text-slate-400 mb-2 font-medium">Tool definition (<code className="text-blue-300">/meta</code>):</p>
              <CodeBlock code={nexusMeta} language="http" />
              <p className="text-slate-400 text-sm mb-4">
                Note: Nexus requires <code className="text-blue-300">output_schema</code> top-level to be <code className="text-blue-300">oneOf</code> — DAG edges route off variants.
              </p>

              <p className="text-slate-400 mb-2 font-medium">Invocation (<code className="text-blue-300">/invoke</code>):</p>
              <CodeBlock code={nexusInvoke} language="http" />
              <p className="text-slate-400 text-sm mb-4">
                Responses always take one of two shapes: <code className="text-blue-300">{`{ ok: {...} }`}</code> or <code className="text-blue-300">{`{ err: { reason: string } }`}</code>. Both are HTTP 200; only infrastructure errors (unknown slug, malformed JSON) return non-200.
              </p>

              <p className="text-slate-400 mb-2 font-medium">Registering with Talus (operator workflow):</p>
              <CodeBlock code={nexusRegister} language="bash" />
              <p className="text-slate-400 text-sm">
                Tool registration on Talus is currently allowlist-gated during the Nexus beta. Contact the Talus team to be added. Local <code className="text-blue-300">validate</code> dry-runs work without allowlist access.
              </p>
            </section>

            {/* Error Codes */}
            <section id="errors" className="mb-14">
              <h2 className="text-2xl font-bold text-white mb-4">Error Codes</h2>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left px-4 py-3 text-slate-300 font-semibold">Code</th>
                      <th className="text-left px-4 py-3 text-slate-300 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 text-slate-300 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    <tr><td className="px-4 py-3 font-mono text-green-400">200</td><td className="px-4 py-3 text-slate-300">OK</td><td className="px-4 py-3 text-slate-400">Request succeeded</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-red-400">400</td><td className="px-4 py-3 text-slate-300">Bad Request</td><td className="px-4 py-3 text-slate-400">Invalid input or schema validation failed</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-red-400">401</td><td className="px-4 py-3 text-slate-300">Unauthorized</td><td className="px-4 py-3 text-slate-400">Missing or invalid API key</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-red-400">402</td><td className="px-4 py-3 text-slate-300">Payment Required</td><td className="px-4 py-3 text-slate-400">Paid skill — payment not verified</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-red-400">403</td><td className="px-4 py-3 text-slate-300">Forbidden</td><td className="px-4 py-3 text-slate-400">Insufficient permissions</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-red-400">404</td><td className="px-4 py-3 text-slate-300">Not Found</td><td className="px-4 py-3 text-slate-400">Skill not found</td></tr>
                    <tr><td className="px-4 py-3 font-mono text-red-400">500</td><td className="px-4 py-3 text-slate-300">Server Error</td><td className="px-4 py-3 text-slate-400">Internal server error</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
