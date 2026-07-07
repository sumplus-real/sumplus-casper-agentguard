/**
 * Official Skill: Euler v2 on Monad (app.euler.finance)
 *
 * Euler v2 is the largest lending protocol on Monad (~$110M TVL), built on the
 * Euler Vault Kit (EVK): every market is its own ERC-4626-compatible EVault, and
 * the Ethereum Vault Connector (EVC) wires collateral vaults to a borrow
 * ("controller") vault so a position can span multiple vaults. There is one
 * EVault contract PER market (120+ on Monad), so actions take a `vault` address.
 *
 * [ARSENAL-HOSTED ✓] Arsenal calls Monad's public RPC directly. No API key needed.
 *
 * Skill UUID: 439ecb2a-46cc-4f32-b99f-48fd7bc3301a
 *
 * Authoritative addresses (Euler official deployment, chain ID 143):
 *   EVC:           0x7a9324E8f270413fa2E458f5831226d99C7477CD
 *   eVaultFactory: 0xba4Dd672062dE8FeeDb665DD4410658864483f1E  (enumerates all vaults)
 * Reads are on-chain (factory enumeration + EVault views); every sampled vault's
 * EVC() was verified to equal the official EVC above. Build actions are direct
 * EVault / EVC calls encoded with viem (same shape as euler-v2-mainnet), chain 143.
 *
 * Actions:
 *   get_vaults        — main liquid markets (USDC/AUSD/WMON/WETH + LST collateral) with live liquidity
 *   get_vault         — one EVault by address (asset, symbol, totalAssets, borrows, cash)
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

// ── Monad contracts (chain ID 143) ──────────────────────────────────────────
const EVC      = '0x7a9324E8f270413fa2E458f5831226d99C7477CD' as `0x${string}`;
const FACTORY  = '0xba4Dd672062dE8FeeDb665DD4410658864483f1E';
const CHAIN_ID = 143;
const DEFAULT_RPC = 'https://rpc.monad.xyz';
function getRpcUrl(): string { return process.env.MONAD_RPC_URL || DEFAULT_RPC; }

// Curated registry: highest-liquidity EVault per asset on Monad (verified on-chain).
// Users may pass ANY of the 120+ vault addresses; these are conveniences + LST collateral.
const VAULTS: Record<string, { vault: string; asset: string; symbol: string; decimals: number; role: string }> = {
  USDC:  { vault: '0xa3b64e2674463c98cbd21807055d8c1e008b6e79', asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', symbol: 'USDC',  decimals: 6,  role: 'borrowable' },
  AUSD:  { vault: '0x9e3500649e16ebe295277ec030e42fabacfa870e', asset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', symbol: 'AUSD',  decimals: 6,  role: 'borrowable' },
  WMON:  { vault: '0x9ea1b948186f9a8cfe375278d96363103f4fa42b', asset: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', symbol: 'WMON',  decimals: 18, role: 'borrowable' },
  WETH:  { vault: '0x502e4a0b61deba3015eb9e51116b832003b22c2c', asset: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', symbol: 'WETH',  decimals: 18, role: 'borrowable' },
  USDT:  { vault: '0xc5251bc7f19d9579cafe6ad619ec568e947dc0c5', asset: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', symbol: 'USDT0', decimals: 6,  role: 'borrowable' },
  SMON:  { vault: '0xa8f093cfb04a536dbc6aa9bb94a2d617305a48f3', asset: '0xA3227C5969757783154C60bF0bC1944180ed81B9', symbol: 'sMON',  decimals: 18, role: 'collateral' },
  SHMON: { vault: '0xb6a4db1fef7831f65827d9af2cb1e69f764ec123', asset: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', symbol: 'shMON', decimals: 18, role: 'collateral' },
  GMON:  { vault: '0xb181030ff0767c24d83c65527bd42146486f415e', asset: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', symbol: 'gMON',  decimals: 18, role: 'collateral' },
};
const BY_VAULT: Record<string, { asset: string; symbol: string; decimals: number }> = Object.fromEntries(
  Object.values(VAULTS).map(v => [v.vault.toLowerCase(), { asset: v.asset, symbol: v.symbol, decimals: v.decimals }]),
);

// ── ABIs (build actions — identical interface to euler-v2-mainnet) ───────────
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

// ── Read selectors ──────────────────────────────────────────────────────────
const SEL = {
  asset:            '38d52e0f',
  symbol:           '95d89b41',
  totalAssets:      '01e1d114',
  totalBorrows:     '47bd3718',
  cash:             '961be391',
  decimals:         '313ce567',
  debtOf:           'd283e75f', // debtOf(address)
  getProxyListLen:  '0a68b7ba', // getProxyListLength()
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────
function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}
function nodeReq(method: 'GET' | 'POST', urlStr: string, body?: unknown, timeoutMs = 20000): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    const bodyStr   = body !== undefined ? JSON.stringify(body) : undefined;
    const baseHeaders: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' };
    if (bodyStr) { baseHeaders['Content-Type'] = 'application/json'; baseHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr)); }
    let options: any; let client: typeof https | typeof http;
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method, headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: timeoutMs };
    } else {
      client = targetUrl.protocol === 'http:' ? http : https;
      options = { hostname: targetUrl.hostname, port: targetUrl.port || 443, path: targetUrl.pathname + targetUrl.search, method, headers: baseHeaders, timeout: timeoutMs, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => { try { const p = data ? JSON.parse(data) : {}; (res.statusCode ?? 200) >= 400 ? reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 160)}`)) : resolve(p); } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
async function ethCall(to: string, data: string): Promise<string> {
  const r = await nodeReq('POST', getRpcUrl(), { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] });
  if (r?.error) throw new Error(`Monad RPC error: ${r.error.message ?? JSON.stringify(r.error)}`);
  return (r?.result as string) ?? '0x';
}
function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}
function readU256(hex: string): bigint { const h = (hex || '').replace('0x', ''); return BigInt('0x' + (h.slice(0, 64) || '0')); }
function readAddr(hex: string): string { return '0x' + (hex || '').replace('0x', '').slice(24, 64); }
function decStr(hex: string): string { try { const h = (hex || '').replace('0x', ''); const len = parseInt(h.slice(64, 128), 16); return Buffer.from(h.slice(128, 128 + len * 2), 'hex').toString().replace(/\0+$/, ''); } catch { return ''; } }
function fmt(value: bigint, decimals: number): string {
  const d = 10n ** BigInt(decimals); const whole = value / d, frac = value % d;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

// On-chain read of a single vault's market state.
async function readVault(vault: string) {
  const [assetHex, symHex, taHex, tbHex, cashHex] = await Promise.all([
    ethCall(vault, '0x' + SEL.asset),
    ethCall(vault, '0x' + SEL.symbol),
    ethCall(vault, '0x' + SEL.totalAssets),
    ethCall(vault, '0x' + SEL.totalBorrows),
    ethCall(vault, '0x' + SEL.cash).catch(() => '0x0'),
  ]);
  const asset = readAddr(assetHex);
  const known = BY_VAULT[vault.toLowerCase()];
  let decimals = known?.decimals;
  if (decimals == null) { try { decimals = Number(readU256(await ethCall(asset, '0x' + SEL.decimals))); } catch { decimals = 18; } }
  const totalAssets = readU256(taHex), totalBorrows = readU256(tbHex);
  const cash = cashHex && cashHex !== '0x' ? readU256(cashHex) : (totalAssets - totalBorrows);
  return {
    vault, name: decStr(symHex) || known?.symbol || null, asset,
    asset_symbol: known?.symbol ?? null, decimals,
    total_supplied: fmt(totalAssets, decimals),
    total_borrowed: fmt(totalBorrows, decimals),
    available_liquidity: fmt(cash < 0n ? 0n : cash, decimals),
  };
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const EULER_V2_MONAD_SKILL_METADATA = {
  name: 'Euler v2 on Monad',
  description:
    "[ARSENAL-HOSTED ✓] Euler v2 on Monad mainnet (chain ID 143) — Monad's largest lending protocol (~$110M TVL), " +
    'built on the Euler Vault Kit. List the main money markets (USDC, AUSD, WMON, WETH) and LST collateral vaults ' +
    '(sMON, shMON, gMON), read a vault\'s live supplied / borrowed / available liquidity, then build lend (deposit), ' +
    'withdraw, borrow and repay transactions as encoded unsigned EVM calls (with the ERC-20 approval and the EVC ' +
    'enable-collateral / enable-controller steps a borrow requires). Each market is its own EVault, so actions take ' +
    'a vault address. Lets agents use liquid-staked MON (gMON/shMON/sMON) as collateral to borrow stablecoins.\n\n' +
    'execution_mode: server-side\n' +
    'chain: monad (id: 143)\n' +
    'rpc: https://rpc.monad.xyz\n' +
    'gas_token: MON\n' +
    'sop_compliance:\n' +
    '  uses_authoritative_contracts: true\n' +
    '  read_only: false',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['euler', 'euler-v2', 'lending', 'borrowing', 'monad', 'defi', 'evm', 'evk', 'erc4626', 'mon'],
  external_url: 'https://app.euler.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/euler?w=48&h=48',
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_vaults', 'get_vault', 'deposit', 'withdraw', 'borrow', 'repay', 'enable_collateral', 'enable_controller'],
        description:
          'get_vaults: main liquid markets + LST collateral vaults with live supplied/borrowed/available. ' +
          'get_vault: one EVault by address (any of the 120+ vaults). ' +
          'deposit: build approve+deposit (lend) tx (requires vault, amount, receiver). ' +
          'withdraw: build withdraw tx (requires vault, amount, receiver; owner defaults to receiver). ' +
          'borrow: build enableCollateral+enableController+borrow tx (requires borrow_vault, collateral_vault, amount, account; receiver defaults to account). ' +
          'repay: build approve+repay tx (requires vault, amount, account). ' +
          'enable_collateral / enable_controller: standalone EVC helper tx (requires account, vault).',
      },
      vault:            { type: 'string', description: 'EVault address (0x...). The market for deposit/withdraw/repay/get_vault. Or a symbol from the registry (USDC, AUSD, WMON, WETH, sMON, shMON, gMON).' },
      borrow_vault:     { type: 'string', description: 'The EVault you are borrowing FROM (becomes your controller). Required for borrow. Address or registry symbol.' },
      collateral_vault: { type: 'string', description: 'The EVault holding your collateral. Required for borrow. Address or registry symbol.' },
      amount:           { type: 'string', description: "Amount in the underlying asset's base units (wei). Use the max-uint sentinel for full withdraw/repay." },
      receiver:         { type: 'string', description: 'Recipient of shares (deposit) / assets (withdraw, borrow). Defaults to account where applicable.' },
      owner:            { type: 'string', description: 'Share owner for withdraw (defaults to receiver).' },
      account:          { type: 'string', description: 'The user EVC account (normally the EOA address). Required for borrow/repay/enable_*.' },
      asset:            { type: 'string', description: 'Underlying asset token address (0x...), needed for the approval step on deposit/repay if the vault is not in the built-in registry.' },
    },
  },
  usage_examples: [
    { title: 'List main markets', input: { action: 'get_vaults' } },
    { title: 'USDC vault detail', input: { action: 'get_vault', vault: 'USDC' } },
    { title: 'Lend 1000 USDC', input: { action: 'deposit', vault: 'USDC', amount: '1000000000', receiver: '0xYourAddress' } },
    { title: 'Borrow 500 USDC against shMON', input: { action: 'borrow', borrow_vault: 'USDC', collateral_vault: 'shMON', amount: '500000000', account: '0xYourAddress' } },
  ],
};

// Resolve a vault arg that may be a registry symbol or a raw address.
function resolveVault(v: unknown): { vault?: string; asset?: string } {
  if (typeof v === 'string') {
    const key = v.trim().toUpperCase();
    if (VAULTS[key]) return { vault: VAULTS[key].vault, asset: VAULTS[key].asset };
    if (isAddress(v)) return { vault: v, asset: BY_VAULT[v.toLowerCase()]?.asset };
  }
  return {};
}

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeEulerV2MonadSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {

      case 'get_vaults': {
        let totalCount: number | null = null;
        try { totalCount = Number(readU256(await ethCall(FACTORY, '0x' + SEL.getProxyListLen))); } catch { /* non-fatal */ }
        const entries = Object.entries(VAULTS);
        const vaults = await Promise.all(entries.map(async ([, v]) => {
          try { return { ...(await readVault(v.vault)), role: v.role }; }
          catch { return { vault: v.vault, asset_symbol: v.symbol, role: v.role, error: 'read failed' }; }
        }));
        return { success: true, output: {
          protocol: 'Euler v2 on Monad', chain: 'monad', chain_id: CHAIN_ID,
          evc: EVC, factory: FACTORY, total_vaults_on_chain: totalCount,
          note: 'Showing the main liquid markets + LST collateral vaults. There are 120+ EVaults total; pass any vault address to get_vault / deposit / borrow.',
          vaults,
        } };
      }

      case 'get_vault': {
        const { vault } = resolveVault(input.vault);
        if (!isAddress(vault)) return { success: false, error: 'vault address or registry symbol is required (0x... / USDC / shMON / ...)' };
        const info = await readVault(vault);
        return { success: true, output: { ...info, evc: EVC, chain: 'monad', chain_id: CHAIN_ID } };
      }

      case 'deposit': {
        const { vault, asset: regAsset } = resolveVault(input.vault);
        const value = BigInt(input.amount ?? '0'); const receiver = input.receiver;
        if (!isAddress(vault) || value === 0n || !isAddress(receiver)) return { success: false, error: 'vault, amount, and receiver are required' };
        const asset = input.asset ?? regAsset;
        if (!isAddress(asset)) return { success: false, error: 'asset (underlying token address) is required for the approval step — pass asset, or use a vault in the built-in registry' };
        return { success: true, output: {
          transactions: [
            { to: asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [vault, value] }), value: '0x0', chain_id: CHAIN_ID, description: `Approve ${value} to Euler vault ${vault}` },
            { to: vault, data: encodeFunctionData({ abi: EVAULT_ABI, functionName: 'deposit', args: [value, receiver] }), value: '0x0', chain_id: CHAIN_ID, description: `Deposit (lend) ${value} into Euler v2 vault on Monad` },
          ],
          approvals: [{ token: asset, spender: vault, amount: value.toString() }],
          vault, amount: value.toString(), receiver, chain: 'monad', chain_id: CHAIN_ID,
        } };
      }

      case 'withdraw': {
        const { vault } = resolveVault(input.vault);
        const value = BigInt(input.amount ?? '0'); const receiver = input.receiver; const owner = input.owner ?? receiver;
        if (!isAddress(vault) || value === 0n || !isAddress(receiver) || !isAddress(owner)) return { success: false, error: 'vault, amount, and receiver are required' };
        return { success: true, output: {
          transactions: [{ to: vault, data: encodeFunctionData({ abi: EVAULT_ABI, functionName: 'withdraw', args: [value, receiver, owner] }), value: '0x0', chain_id: CHAIN_ID, description: `Withdraw ${value} from Euler v2 vault on Monad` }],
          vault, amount: value.toString(), receiver, owner, chain: 'monad', chain_id: CHAIN_ID,
          _note: value.toString() === MAX_UINT ? 'max-uint amount = withdraw full balance' : undefined,
        } };
      }

      case 'borrow': {
        const bv = resolveVault(input.borrow_vault); const cv = resolveVault(input.collateral_vault);
        const borrowVault = bv.vault; const collateralVault = cv.vault;
        const value = BigInt(input.amount ?? '0'); const account = input.account; const receiver = input.receiver ?? account;
        if (!isAddress(borrowVault) || !isAddress(collateralVault) || value === 0n || !isAddress(account) || !isAddress(receiver)) {
          return { success: false, error: 'borrow_vault, collateral_vault, amount, and account are required' };
        }
        return { success: true, output: {
          transactions: [
            { to: EVC, data: encodeFunctionData({ abi: EVC_ABI, functionName: 'enableCollateral', args: [account, collateralVault] }), value: '0x0', chain_id: CHAIN_ID, description: `Enable ${collateralVault} as collateral on the EVC` },
            { to: EVC, data: encodeFunctionData({ abi: EVC_ABI, functionName: 'enableController', args: [account, borrowVault] }), value: '0x0', chain_id: CHAIN_ID, description: `Enable ${borrowVault} as controller (borrow vault) on the EVC` },
            { to: borrowVault, data: encodeFunctionData({ abi: EVAULT_ABI, functionName: 'borrow', args: [value, receiver] }), value: '0x0', chain_id: CHAIN_ID, description: `Borrow ${value} from Euler v2 vault on Monad` },
          ],
          borrow_vault: borrowVault, collateral_vault: collateralVault, amount: value.toString(), account, receiver, chain: 'monad', chain_id: CHAIN_ID,
          _note: 'enableCollateral / enableController are idempotent. A client can skip them if the EVC already has them enabled for this account.',
        } };
      }

      case 'repay': {
        const { vault, asset: regAsset } = resolveVault(input.vault);
        const value = BigInt(input.amount ?? '0'); const account = input.account;
        if (!isAddress(vault) || value === 0n || !isAddress(account)) return { success: false, error: 'vault, amount, and account are required' };
        const asset = input.asset ?? regAsset;
        if (!isAddress(asset)) return { success: false, error: 'asset (underlying token address) is required for the approval step — pass asset, or use a vault in the built-in registry' };
        return { success: true, output: {
          transactions: [
            { to: asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [vault, value] }), value: '0x0', chain_id: CHAIN_ID, description: `Approve ${value} to Euler vault ${vault} for repayment` },
            { to: vault, data: encodeFunctionData({ abi: EVAULT_ABI, functionName: 'repay', args: [value, account] }), value: '0x0', chain_id: CHAIN_ID, description: `Repay ${value} to Euler v2 vault on Monad` },
          ],
          approvals: [{ token: asset, spender: vault, amount: value.toString() }],
          vault, amount: value.toString(), account, chain: 'monad', chain_id: CHAIN_ID,
          _note: value.toString() === MAX_UINT ? 'max-uint amount = repay full debt' : undefined,
        } };
      }

      case 'enable_collateral':
      case 'enable_controller': {
        const account = input.account; const { vault } = resolveVault(input.vault);
        if (!isAddress(account) || !isAddress(vault)) return { success: false, error: 'account and vault are required' };
        const fn = action === 'enable_collateral' ? 'enableCollateral' : 'enableController';
        return { success: true, output: {
          transactions: [{ to: EVC, data: encodeFunctionData({ abi: EVC_ABI, functionName: fn, args: [account, vault] }), value: '0x0', chain_id: CHAIN_ID, description: `${fn}(${account}, ${vault}) on the EVC` }],
          account, vault, chain: 'monad', chain_id: CHAIN_ID,
        } };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_vaults, get_vault, deposit, withdraw, borrow, repay, enable_collateral, enable_controller` };
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Euler v2 on Monad skill error' };
  }
}
