/**
 * Official Skill: Fluid (fluid.io / Instadapp) — Ethereum mainnet (+ Arbitrum, Base)
 *
 * Fluid is Instadapp's lending/borrowing protocol built on a shared Liquidity
 * Layer. It has two products:
 *   - LEND markets: fTokens (ERC-4626 vaults) you deposit into to earn yield.
 *   - BORROW vaults: each its own contract; positions are NFTs adjusted via a
 *     single `operate(nftId, newCol, newDebt, to)` call (collateral + debt deltas).
 *
 * Skill UUID: 6ea7a68b-7f17-4ce0-8061-352c59fcbc0d
 *
 * Data source: Fluid's public API (https://api.fluid.instadapp.io) — keyless,
 * datacenter-safe (verified). Transactions: direct fToken / Vault contract calls
 * encoded with viem, returned as an unsigned transactions[] array.
 *
 * Actions:
 *   get_vaults         — borrow vaults (APRs, collateral factor, liquidity)
 *   get_vault          — one borrow vault by id
 *   get_ftokens        — lend markets (fToken ERC-4626 registry)
 *   supply_lend        — approve + fToken.deposit                          [build_tx]
 *   withdraw_lend      — fToken.withdraw                                    [build_tx]
 *   supply_collateral  — Vault.operate(nftId, +col, 0, to)                  [build_tx]
 *   withdraw_collateral— Vault.operate(nftId, -col, 0, to)                  [build_tx]
 *   borrow             — Vault.operate(nftId, 0, +debt, to)                 [build_tx]
 *   payback            — approve + Vault.operate(nftId, 0, -debt, to)       [build_tx]
 */

import { encodeFunctionData, parseAbi } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

const API = 'https://api.fluid.instadapp.io';
const CHAINS: Record<string, number> = { ethereum: 1, arbitrum: 42161, base: 8453 };

// fToken lend-market registry (Ethereum mainnet). underlying asset for the approval step.
const FTOKENS: Record<string, { ftoken: string; asset: string; decimals: number }> = {
  FUSDC:   { ftoken: '0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33', asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6  },
  FUSDT:   { ftoken: '0x5C20B550819128074FD538Edf79791733ccEdd18', asset: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6  },
  FWETH:   { ftoken: '0x90551c1795392094FE6D29B758EcCD233cFAa260', asset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  FWSTETH: { ftoken: '0x2411802D8BEA09be0aF8fD8D08314a63e706b29C', asset: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', decimals: 18 },
  FGHO:    { ftoken: '0x6A29A46E21C730DcA1d8b23d637c101cec605C5B', asset: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f', decimals: 18 },
  FSUSDS:  { ftoken: '0x2BBE31d63E6813E3AC858C04dae43FB2a72B0D11', asset: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD', decimals: 18 },
};

// ── ABIs ──────────────────────────────────────────────────────────────────────
const FTOKEN_ABI = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
]);
const VAULT_ABI = parseAbi([
  'function operate(uint256 nftId, int256 newCol, int256 newDebt, address to) payable returns (uint256, int256, int256)',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

const INT256_MIN = (-(2n ** 255n)).toString();   // operate() max-withdraw / max-payback sentinel

// ── Helpers ─────────────────────────────────────────────────────────────────--
function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function nodeGet(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const proxyUrl  = process.env.https_proxy || process.env.http_proxy;
    let options: any;
    let client: typeof https | typeof http;
    const baseHeaders = { Accept: 'application/json', 'User-Agent': 'Arsenal/1.0' };
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client  = http;
      options = { hostname: proxy.hostname, port: proxy.port || 7890, path: urlStr, method: 'GET',
        headers: { Host: targetUrl.hostname, ...baseHeaders }, timeout: 30000 };
    } else {
      client  = https;
      options = { hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method: 'GET',
        headers: baseHeaders, timeout: 30000, family: 4 };
    }
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if ((res.statusCode ?? 200) >= 400) reject(new Error(`Fluid API ${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function tokenView(t: any) {
  const t0 = t?.token0 ?? t;
  return t0 ? { symbol: t0.symbol, address: t0.address, decimals: t0.decimals, price: t0.price } : null;
}
function bpsToPct(v: any): string | null {
  const n = Number(v?.vault?.rate ?? v);
  return isFinite(n) ? `${(n / 100).toFixed(2)}%` : null;
}
function fmtVault(v: any) {
  return {
    id:                 v.id,
    type:               v.type,
    address:            v.address,
    supply_token:       tokenView(v.supplyToken),
    borrow_token:       tokenView(v.borrowToken),
    supply_apr:         bpsToPct(v.supplyRate),
    borrow_apr:         bpsToPct(v.borrowRate),
    collateral_factor:  v.collateralFactor != null ? `${(Number(v.collateralFactor) / 100).toFixed(2)}%` : null,
    liquidation_threshold: v.liquidationThreshold != null ? `${(Number(v.liquidationThreshold) / 100).toFixed(2)}%` : null,
    total_supply:       v.totalSupply,
    total_borrow:       v.totalBorrow,
    borrowable:         v.borrowableUntilLimit ?? v.borrowable,
    withdrawable:       v.withdrawable,
    total_positions:    v.totalPositions,
  };
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const FLUID_SKILL_METADATA = {
  name: 'Fluid',
  description:
    '[ARSENAL-HOSTED ✓] Fluid (fluid.io, by Instadapp) lending/borrowing on Ethereum mainnet ' +
    '(plus Arbitrum and Base for market data). Browse borrow vaults (supply/borrow APR, collateral ' +
    'factor, available liquidity) and lend markets (fToken ERC-4626), then build lend/withdraw and ' +
    'collateral/borrow/payback transactions as properly encoded unsigned EVM calls. Fluid borrow ' +
    'positions are NFTs adjusted via a single operate() call; pass nftId 0 to open a new position. ' +
    'No API key required.\n\n' +
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
  tags: ['fluid', 'instadapp', 'lending', 'borrowing', 'defi', 'ethereum', 'mainnet', 'erc4626', 'vault'],
  external_url: 'https://fluid.io',
  logo_url: 'https://icons.llamao.fi/icons/protocols/fluid?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_vaults', 'get_vault', 'get_ftokens', 'supply_lend', 'withdraw_lend', 'supply_collateral', 'withdraw_collateral', 'borrow', 'payback'],
        description:
          'get_vaults: list borrow vaults (APRs, collateral factor, liquidity). ' +
          'get_vault: one borrow vault by id. ' +
          'get_ftokens: list lend markets (fToken ERC-4626 registry). ' +
          'supply_lend: approve + fToken.deposit (requires ftoken|symbol, amount, receiver). ' +
          'withdraw_lend: fToken.withdraw (requires ftoken|symbol, amount, receiver; owner defaults to receiver). ' +
          'supply_collateral / withdraw_collateral / borrow / payback: Vault.operate (requires vault, amount, to; nftId defaults to 0 = new position).',
      },
      chain:     { type: 'string', enum: ['ethereum', 'arbitrum', 'base'], description: 'Chain (default: ethereum). Applies to data + tx chain_id.' },
      vault_id:  { type: 'string', description: 'Borrow vault numeric id for get_vault (as listed by get_vaults).' },
      vault:     { type: 'string', description: 'Borrow vault contract address (0x...). Required for supply_collateral/withdraw_collateral/borrow/payback.' },
      ftoken:    { type: 'string', description: 'fToken contract address (0x...) for lend actions. Alternatively pass symbol (e.g. "fUSDC").' },
      symbol:    { type: 'string', description: 'fToken symbol shortcut for lend actions, e.g. fUSDC, fWETH, fUSDT, fwstETH, fGHO, fsUSDS.' },
      amount:    { type: 'string', description: 'Amount in the underlying asset\'s base units (wei). For withdraw_collateral / payback you may omit to use the max sentinel.' },
      receiver:  { type: 'string', description: 'Recipient of shares (supply_lend) / assets (withdraw_lend). Required for lend actions.' },
      owner:     { type: 'string', description: 'Share owner for withdraw_lend (defaults to receiver).' },
      to:        { type: 'string', description: 'Recipient of borrowed/withdrawn funds for operate actions (the user address).' },
      nft_id:    { type: 'string', description: 'Fluid position NFT id for operate actions. Pass 0 (default) to open a new position; pass an existing id to adjust it.' },
      asset:     { type: 'string', description: 'Underlying token address (0x...) for the approval step on supply_lend / payback if not inferable from the registry.' },
      max:       { type: 'boolean', description: 'For withdraw_collateral / payback: use the int256-min sentinel to withdraw all collateral / repay all debt.' },
    },
  },
  usage_examples: [
    { title: 'List borrow vaults', input: { action: 'get_vaults', chain: 'ethereum' } },
    { title: 'Lend markets', input: { action: 'get_ftokens' } },
    { title: 'Lend 1000 USDC', input: { action: 'supply_lend', symbol: 'fUSDC', amount: '1000000000', receiver: '0xYourAddress' } },
    { title: 'Open position: borrow against vault', input: { action: 'borrow', vault: '0xeAbBfca72F8a8bf14C4ac59e69ECB2eB69F0811C', amount: '500000000', to: '0xYourAddress', nft_id: '0' } },
  ],
};

// ── Executor ──────────────────────────────────────────────────────────────────

function resolveFToken(input: any): { ftoken: `0x${string}`; asset?: string } | null {
  if (isAddress(input.ftoken)) {
    const reg = Object.values(FTOKENS).find(f => f.ftoken.toLowerCase() === input.ftoken.toLowerCase());
    return { ftoken: input.ftoken, asset: input.asset ?? reg?.asset };
  }
  const sym = (input.symbol ?? input.ftoken ?? '').toUpperCase();
  const reg = FTOKENS[sym];
  if (reg) return { ftoken: reg.ftoken as `0x${string}`, asset: input.asset ?? reg.asset };
  return null;
}

export async function executeFluidSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  const chainId = CHAINS[input?.chain ?? 'ethereum'] ?? 1;
  try {
    switch (action) {

      case 'get_vaults': {
        const data = await nodeGet(`${API}/v2/${chainId}/vaults`);
        const arr: any[] = Array.isArray(data) ? data : (data.data ?? data.vaults ?? []);
        const limit = Math.min(input.limit ?? 30, 116);
        return { success: true, output: { protocol: 'Fluid', chain: input.chain ?? 'ethereum', count: Math.min(arr.length, limit), vaults: arr.slice(0, limit).map(fmtVault) } };
      }

      case 'get_vault': {
        if (!input.vault_id) return { success: false, error: 'vault_id is required (numeric id from get_vaults)' };
        const v = await nodeGet(`${API}/v2/${chainId}/vaults/${input.vault_id}`);
        const vault = v?.data ?? v;
        if (!vault || !vault.address) return { success: false, error: `Vault ${input.vault_id} not found on Fluid (chain ${chainId})` };
        return { success: true, output: fmtVault(vault) };
      }

      case 'get_ftokens': {
        return {
          success: true,
          output: {
            protocol: 'Fluid', chain: 'ethereum',
            note: 'fToken ERC-4626 lend markets. Deposit underlying to earn; supply_lend/withdraw_lend build the tx. Live APR is visible in the Fluid app or via get_vaults context.',
            ftokens: Object.entries(FTOKENS).map(([sym, f]) => ({ symbol: sym, ftoken: f.ftoken, underlying: f.asset, decimals: f.decimals })),
          },
        };
      }

      case 'supply_lend': {
        const r = resolveFToken(input);
        const value = BigInt(input.amount ?? '0'); const receiver = input.receiver;
        if (!r) return { success: false, error: 'ftoken (address) or symbol (e.g. fUSDC) is required' };
        if (value === 0n || !isAddress(receiver)) return { success: false, error: 'amount and receiver are required' };
        if (!isAddress(r.asset)) return { success: false, error: 'asset (underlying token address) is required for the approval step' };
        return {
          success: true,
          output: {
            transactions: [
              { to: r.asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [r.ftoken, value] }), value: '0x0', chain_id: chainId, description: `Approve ${value} to Fluid fToken ${r.ftoken}` },
              { to: r.ftoken, data: encodeFunctionData({ abi: FTOKEN_ABI, functionName: 'deposit', args: [value, receiver] }), value: '0x0', chain_id: chainId, description: `Lend ${value} into Fluid fToken` },
            ],
            approvals: [{ token: r.asset, spender: r.ftoken, amount: value.toString() }],
            ftoken: r.ftoken, amount: value.toString(), receiver,
          },
        };
      }

      case 'withdraw_lend': {
        const r = resolveFToken(input);
        const value = BigInt(input.amount ?? '0'); const receiver = input.receiver; const owner = input.owner ?? receiver;
        if (!r) return { success: false, error: 'ftoken (address) or symbol (e.g. fUSDC) is required' };
        if (value === 0n || !isAddress(receiver) || !isAddress(owner)) return { success: false, error: 'amount and receiver are required' };
        return {
          success: true,
          output: {
            transactions: [{ to: r.ftoken, data: encodeFunctionData({ abi: FTOKEN_ABI, functionName: 'withdraw', args: [value, receiver, owner] }), value: '0x0', chain_id: chainId, description: `Withdraw ${value} from Fluid fToken` }],
            ftoken: r.ftoken, amount: value.toString(), receiver, owner,
          },
        };
      }

      case 'supply_collateral':
      case 'withdraw_collateral':
      case 'borrow':
      case 'payback': {
        const vault = input.vault; const to = input.to;
        if (!isAddress(vault)) return { success: false, error: 'vault (borrow vault address, 0x...) is required' };
        if (!isAddress(to)) return { success: false, error: 'to (recipient / user address, 0x...) is required' };
        const nftId = BigInt(input.nft_id ?? '0');
        const useMax = input.max === true;

        let newCol = 0n, newDebt = 0n;
        const approvals: any[] = [];
        const txs: any[] = [];

        if (action === 'supply_collateral') {
          newCol = BigInt(input.amount ?? '0');
          if (newCol <= 0n) return { success: false, error: 'amount (collateral to add) is required' };
          if (isAddress(input.asset)) {
            txs.push({ to: input.asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [vault, newCol] }), value: '0x0', chain_id: chainId, description: `Approve ${newCol} collateral to Fluid vault` });
            approvals.push({ token: input.asset, spender: vault, amount: newCol.toString() });
          }
        } else if (action === 'withdraw_collateral') {
          newCol = useMax ? BigInt(INT256_MIN) : -BigInt(input.amount ?? '0');
          if (newCol === 0n) return { success: false, error: 'amount (collateral to withdraw) or max:true is required' };
        } else if (action === 'borrow') {
          newDebt = BigInt(input.amount ?? '0');
          if (newDebt <= 0n) return { success: false, error: 'amount (to borrow) is required' };
        } else { // payback
          newDebt = useMax ? BigInt(INT256_MIN) : -BigInt(input.amount ?? '0');
          if (newDebt === 0n) return { success: false, error: 'amount (to repay) or max:true is required' };
          if (isAddress(input.asset)) {
            const approveAmt = useMax ? BigInt((2n ** 256n - 1n).toString()) : -newDebt;
            txs.push({ to: input.asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [vault, approveAmt] }), value: '0x0', chain_id: chainId, description: `Approve repayment to Fluid vault` });
            approvals.push({ token: input.asset, spender: vault, amount: approveAmt.toString() });
          }
        }

        txs.push({ to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: 'operate', args: [nftId, newCol, newDebt, to] }), value: '0x0', chain_id: chainId, description: `Fluid operate(nftId=${nftId}, newCol=${newCol}, newDebt=${newDebt})` });

        return {
          success: true,
          output: {
            transactions: txs,
            ...(approvals.length ? { approvals } : {}),
            vault, nft_id: nftId.toString(), new_col: newCol.toString(), new_debt: newDebt.toString(), to,
            _note: 'nftId 0 opens a new position. If the collateral or borrow token is native ETH, set the operate tx value instead of approving (collateral add: value=newCol; native payback: value=abs(newDebt)).',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_vaults, get_vault, get_ftokens, supply_lend, withdraw_lend, supply_collateral, withdraw_collateral, borrow, payback` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Fluid skill error' };
  }
}
