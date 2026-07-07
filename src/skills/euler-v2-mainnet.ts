/**
 * Official Skill: Euler v2 (app.euler.finance) — Ethereum mainnet
 *
 * Euler v2 is a modular lending protocol built on the Euler Vault Kit (EVK):
 * every market is its own ERC-4626-compatible EVault, and the Ethereum Vault
 * Connector (EVC) wires collateral vaults to a borrow ("controller") vault so a
 * position can span multiple vaults. There is one EVault contract PER market
 * (250+ on mainnet), so actions take a `vault` address rather than a single Pool.
 *
 * Skill UUID: e6264a67-8b18-4265-a746-918c1a7cb57f
 *
 * Data source: Goldsky public subgraph (keyless, datacenter-safe — verified).
 * Transactions: direct EVault / EVC contract calls encoded with viem and
 * returned as an unsigned transactions[] array (same shape as aave-v3-mainnet).
 *
 * Actions:
 *   get_vaults        — list EVaults (id, name, asset, supply/borrow APY, cash, borrows)
 *   get_vault         — one EVault by address
 *   deposit           — approve + EVault.deposit (lend)            [build_tx]
 *   withdraw          — EVault.withdraw                            [build_tx]
 *   borrow            — EVC.enableCollateral + enableController + EVault.borrow [build_tx]
 *   repay             — approve + EVault.repay                     [build_tx]
 *   enable_collateral — EVC.enableCollateral helper               [build_tx]
 *   enable_controller — EVC.enableController helper                [build_tx]
 */

import { encodeFunctionData, parseAbi } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Mainnet contracts ─────────────────────────────────────────────────────────
const EVC = '0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383' as `0x${string}`;
const SUBGRAPH = 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn';

// Starter EVault registry (highest-liquidity vault per asset; users may pass any vault).
const VAULTS: Record<string, { vault: string; asset: string; symbol: string; decimals: number }> = {
  WETH:   { vault: '0x69c40a12c9f9fae910601a81c19776e8b54593b2', asset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH',   decimals: 18 },
  USDC:   { vault: '0xab2726daf820aa9270d14db9b18c8d187cbf2f30', asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC',   decimals: 6  },
  WSTETH: { vault: '0x03eed1586a9fdcc328b4fc4fbd222fbdd6506a64', asset: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', symbol: 'wstETH', decimals: 18 },
  USDT:   { vault: '0x313603fa690301b0caeef8069c065862f9162162', asset: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT',   decimals: 6  },
  CBBTC:  { vault: '0x056f3a2e41d2778d3a0c0714439c53af2987718e', asset: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC',  decimals: 8  },
};
// underlying asset address → {symbol, decimals} for nicer data output
const ASSET_INFO: Record<string, { symbol: string; decimals: number }> = Object.fromEntries(
  Object.values(VAULTS).map(v => [v.asset.toLowerCase(), { symbol: v.symbol, decimals: v.decimals }]),
);

// ── ABIs ──────────────────────────────────────────────────────────────────────
const EVAULT_ABI = parseAbi([
  'function deposit(uint256 amount, address receiver) returns (uint256)',
  'function withdraw(uint256 amount, address receiver, address owner) returns (uint256)',
  'function mint(uint256 amount, address receiver) returns (uint256)',
  'function redeem(uint256 amount, address receiver, address owner) returns (uint256)',
  'function borrow(uint256 amount, address receiver) returns (uint256)',
  'function repay(uint256 amount, address receiver) returns (uint256)',
]);
const EVC_ABI = parseAbi([
  'function enableCollateral(address account, address vault) payable',
  'function enableController(address account, address vault) payable',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

const MAX_UINT = (2n ** 256n - 1n).toString();

// ── Helpers ─────────────────────────────────────────────────────────────────--
function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function subgraphQuery(query: string): Promise<any> {
  const body = JSON.stringify({ query });
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(SUBGRAPH);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    let options: any;
    let client: typeof https | typeof http;
    const baseHeaders = { Accept: 'application/json', 'Content-Type': 'application/json',
      'User-Agent': 'Arsenal/1.0', 'Content-Length': Buffer.byteLength(body) };
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: SUBGRAPH, method: 'POST',
        headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: 30000 };
    } else {
      client  = https;
      options = { hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method: 'POST',
        headers: baseHeaders, timeout: 30000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.errors) reject(new Error(`Subgraph error: ${JSON.stringify(parsed.errors).slice(0, 200)}`));
          else resolve(parsed.data);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}

function fmtVault(v: any) {
  const ai = ASSET_INFO[(v.asset ?? '').toLowerCase()];
  const st = v.state ?? {};
  return {
    vault:        v.id,
    name:         v.name,
    asset:        v.asset,
    asset_symbol: ai?.symbol ?? null,
    asset_decimals: ai?.decimals ?? null,
    supply_apy:   st.supplyApy != null ? `${(Number(st.supplyApy) / 1e25).toFixed(4)}%` : null,
    borrow_apy:   st.borrowApy != null ? `${(Number(st.borrowApy) / 1e25).toFixed(4)}%` : null,
    cash:         st.cash,
    total_borrows: st.totalBorrows,
    total_shares: st.totalShares,
  };
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const EULER_V2_MAINNET_SKILL_METADATA = {
  name: 'Euler v2 Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Euler v2 on Ethereum mainnet — modular lending built on the Euler Vault Kit. ' +
    'List EVault markets with live supply/borrow APY, then build lend (deposit), withdraw, borrow and ' +
    'repay transactions as properly encoded unsigned EVM calls (with the ERC-20 approval and the EVC ' +
    'enable-collateral / enable-controller steps a borrow requires). Each market is its own EVault, so ' +
    'actions take a vault address. No API key required.\n\n' +
    'execution_mode: server-side\n' +
    'sop_compliance:\n' +
    '  provides_quote: false\n' +
    '  returns_price_impact: false\n' +
    '  uses_authoritative_contracts: true\n' +
    '  read_only: false',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['euler', 'euler-v2', 'lending', 'borrowing', 'defi', 'ethereum', 'mainnet', 'evk', 'erc4626'],
  external_url: 'https://app.euler.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/euler?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_vaults', 'get_vault', 'deposit', 'withdraw', 'borrow', 'repay', 'enable_collateral', 'enable_controller'],
        description:
          'get_vaults: list EVault markets (supply/borrow APY, cash, borrows). ' +
          'get_vault: one EVault by address. ' +
          'deposit: build approve+deposit (lend) tx (requires vault, amount, receiver). ' +
          'withdraw: build withdraw tx (requires vault, amount, receiver; owner defaults to receiver). ' +
          'borrow: build enableCollateral+enableController+borrow tx (requires borrow_vault, collateral_vault, amount, account; receiver defaults to account). ' +
          'repay: build approve+repay tx (requires vault, amount, account). ' +
          'enable_collateral / enable_controller: standalone EVC helper tx (requires account, vault).',
      },
      vault:            { type: 'string', description: 'EVault address (0x...). The market to act on for deposit/withdraw/repay/get_vault.' },
      borrow_vault:     { type: 'string', description: 'The EVault you are borrowing FROM (becomes your controller). Required for borrow.' },
      collateral_vault: { type: 'string', description: 'The EVault holding your collateral. Required for borrow (enabled on the EVC).' },
      amount:           { type: 'string', description: 'Amount in the underlying asset\'s base units (wei). Use the max-uint sentinel for full withdraw/repay.' },
      receiver:         { type: 'string', description: 'Recipient of shares (deposit) / assets (withdraw, borrow). Defaults to account where applicable.' },
      owner:            { type: 'string', description: 'Share owner for withdraw (defaults to receiver).' },
      account:          { type: 'string', description: 'The user EVC account (normally the EOA address). Required for borrow/repay/enable_*.' },
      asset:            { type: 'string', description: 'Underlying asset token address (0x...), needed for the approval step on deposit/repay if it cannot be inferred from the vault registry.' },
    },
  },
  usage_examples: [
    { title: 'List vaults', input: { action: 'get_vaults', limit: 10 } },
    { title: 'USDC vault detail', input: { action: 'get_vault', vault: '0xab2726daf820aa9270d14db9b18c8d187cbf2f30' } },
    { title: 'Lend 1000 USDC', input: { action: 'deposit', vault: '0xab2726daf820aa9270d14db9b18c8d187cbf2f30', amount: '1000000000', receiver: '0xYourAddress', asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' } },
    { title: 'Borrow 500 USDC against WETH', input: { action: 'borrow', borrow_vault: '0xab2726daf820aa9270d14db9b18c8d187cbf2f30', collateral_vault: '0x69c40a12c9f9fae910601a81c19776e8b54593b2', amount: '500000000', account: '0xYourAddress' } },
  ],
};

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeEulerV2MainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {

      case 'get_vaults': {
        const limit = Math.min(input.limit ?? 20, 100);
        const where = isAddress(input.asset) ? `, where: {asset: "${input.asset.toLowerCase()}"}` : ', where: {supplyCap_gt: "0"}';
        const data = await subgraphQuery(
          `{ eulerVaults(first: ${limit}${where}) { id name asset state { totalShares totalBorrows cash supplyApy borrowApy } } }`,
        );
        const vaults: any[] = (data?.eulerVaults ?? []).filter((v: any) => v.state && Number(v.state.cash) + Number(v.state.totalBorrows) > 0);
        return { success: true, output: { protocol: 'Euler v2', count: vaults.length, vaults: vaults.map(fmtVault) } };
      }

      case 'get_vault': {
        const vault = input.vault;
        if (!isAddress(vault)) return { success: false, error: 'vault address is required (0x...)' };
        const data = await subgraphQuery(
          `{ eulerVaults(where: {id: "${vault.toLowerCase()}"}) { id name asset dToken unitOfAccount supplyCap borrowCap state { totalShares totalBorrows cash interestRate supplyApy borrowApy } } }`,
        );
        const v = (data?.eulerVaults ?? [])[0];
        if (!v) return { success: false, error: `EVault ${vault} not found in the Euler v2 subgraph` };
        return { success: true, output: { ...fmtVault(v), dToken: v.dToken, unit_of_account: v.unitOfAccount, supply_cap: v.supplyCap, borrow_cap: v.borrowCap } };
      }

      case 'deposit': {
        const vault = input.vault; const value = BigInt(input.amount ?? '0'); const receiver = input.receiver;
        if (!isAddress(vault) || value === 0n || !isAddress(receiver)) return { success: false, error: 'vault, amount, and receiver are required' };
        const asset = input.asset ?? Object.values(VAULTS).find(v => v.vault.toLowerCase() === vault.toLowerCase())?.asset;
        if (!isAddress(asset)) return { success: false, error: 'asset (underlying token address) is required for the approval step — pass asset, or use a vault in the built-in registry' };
        return {
          success: true,
          output: {
            transactions: [
              { to: asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [vault, value] }), value: '0x0', chain_id: 1, description: `Approve ${value} to Euler vault ${vault}` },
              { to: vault, data: encodeFunctionData({ abi: EVAULT_ABI, functionName: 'deposit', args: [value, receiver] }), value: '0x0', chain_id: 1, description: `Deposit (lend) ${value} into Euler v2 vault` },
            ],
            approvals: [{ token: asset, spender: vault, amount: value.toString() }],
            vault, amount: value.toString(), receiver,
          },
        };
      }

      case 'withdraw': {
        const vault = input.vault; const value = BigInt(input.amount ?? '0'); const receiver = input.receiver; const owner = input.owner ?? receiver;
        if (!isAddress(vault) || value === 0n || !isAddress(receiver) || !isAddress(owner)) return { success: false, error: 'vault, amount, and receiver are required' };
        return {
          success: true,
          output: {
            transactions: [{ to: vault, data: encodeFunctionData({ abi: EVAULT_ABI, functionName: 'withdraw', args: [value, receiver, owner] }), value: '0x0', chain_id: 1, description: `Withdraw ${value} from Euler v2 vault` }],
            vault, amount: value.toString(), receiver, owner,
            _note: value.toString() === MAX_UINT ? 'max-uint amount = withdraw full balance' : undefined,
          },
        };
      }

      case 'borrow': {
        const borrowVault = input.borrow_vault; const collateralVault = input.collateral_vault;
        const value = BigInt(input.amount ?? '0'); const account = input.account; const receiver = input.receiver ?? account;
        if (!isAddress(borrowVault) || !isAddress(collateralVault) || value === 0n || !isAddress(account) || !isAddress(receiver)) {
          return { success: false, error: 'borrow_vault, collateral_vault, amount, and account are required' };
        }
        return {
          success: true,
          output: {
            transactions: [
              { to: EVC, data: encodeFunctionData({ abi: EVC_ABI, functionName: 'enableCollateral', args: [account, collateralVault] }), value: '0x0', chain_id: 1, description: `Enable ${collateralVault} as collateral on the EVC` },
              { to: EVC, data: encodeFunctionData({ abi: EVC_ABI, functionName: 'enableController', args: [account, borrowVault] }), value: '0x0', chain_id: 1, description: `Enable ${borrowVault} as controller (borrow vault) on the EVC` },
              { to: borrowVault, data: encodeFunctionData({ abi: EVAULT_ABI, functionName: 'borrow', args: [value, receiver] }), value: '0x0', chain_id: 1, description: `Borrow ${value} from Euler v2 vault` },
            ],
            borrow_vault: borrowVault, collateral_vault: collateralVault, amount: value.toString(), account, receiver,
            _note: 'enableCollateral / enableController are idempotent. A client can skip them if the EVC already has them enabled for this account.',
          },
        };
      }

      case 'repay': {
        const vault = input.vault; const value = BigInt(input.amount ?? '0'); const account = input.account;
        if (!isAddress(vault) || value === 0n || !isAddress(account)) return { success: false, error: 'vault, amount, and account are required' };
        const asset = input.asset ?? Object.values(VAULTS).find(v => v.vault.toLowerCase() === vault.toLowerCase())?.asset;
        if (!isAddress(asset)) return { success: false, error: 'asset (underlying token address) is required for the approval step — pass asset, or use a vault in the built-in registry' };
        return {
          success: true,
          output: {
            transactions: [
              { to: asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [vault, value] }), value: '0x0', chain_id: 1, description: `Approve ${value} to Euler vault ${vault} for repayment` },
              { to: vault, data: encodeFunctionData({ abi: EVAULT_ABI, functionName: 'repay', args: [value, account] }), value: '0x0', chain_id: 1, description: `Repay ${value} to Euler v2 vault` },
            ],
            approvals: [{ token: asset, spender: vault, amount: value.toString() }],
            vault, amount: value.toString(), account,
            _note: value.toString() === MAX_UINT ? 'max-uint amount = repay full debt' : undefined,
          },
        };
      }

      case 'enable_collateral':
      case 'enable_controller': {
        const account = input.account; const vault = input.vault;
        if (!isAddress(account) || !isAddress(vault)) return { success: false, error: 'account and vault are required' };
        const fn = action === 'enable_collateral' ? 'enableCollateral' : 'enableController';
        return {
          success: true,
          output: {
            transactions: [{ to: EVC, data: encodeFunctionData({ abi: EVC_ABI, functionName: fn, args: [account, vault] }), value: '0x0', chain_id: 1, description: `${fn}(${account}, ${vault}) on the EVC` }],
            account, vault,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_vaults, get_vault, deposit, withdraw, borrow, repay, enable_collateral, enable_controller` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Euler v2 Mainnet skill error' };
  }
}
