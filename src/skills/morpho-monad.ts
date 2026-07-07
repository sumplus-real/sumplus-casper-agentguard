/**
 * Official Skill: Morpho Blue on Monad (app.morpho.org)
 *
 * Morpho Blue is a permissionless, isolated-market lending protocol deployed on
 * Monad mainnet (chain ID 143), one of Monad's largest lending venues (~$89M TVL).
 * Every market is an isolated (loanToken, collateralToken, oracle, irm, lltv) pair
 * on a single Morpho Blue contract, so market actions take MarketParams.
 *
 * [ARSENAL-HOSTED ✓] Market discovery uses Morpho's region-safe public API;
 * on-chain reads + tx building use Monad's public RPC. No API key needed.
 *
 * Authoritative addresses (chain ID 143):
 *   Morpho Blue (singleton): 0xD5D960E8C380B724a48AC59E2DfF1b2CB4a1eAee
 *     (verified via Morpho's official API — every chain-143 market reports this
 *      as its morphoBlue.address)
 *
 * Data sources (region-safe):
 *   Morpho API  https://blue-api.morpho.org/graphql  — market discovery (chainId 143)
 *   Monad RPC   https://rpc.monad.xyz                — on-chain position/market reads + tx building
 *
 * Actions:
 *   get_markets       — list Monad Morpho Blue markets (marketId, params, supply/borrow APY, TVL)
 *   get_market        — one market's full MarketParams + live state (by market_id)
 *   get_position      — a user's supply/borrow/collateral in a market (market_id + account)
 *   supply / withdraw — lend / redeem loan-asset liquidity                [build_tx]
 *   supply_collateral / withdraw_collateral — manage collateral           [build_tx]
 *   borrow / repay    — borrow against collateral / repay debt            [build_tx]
 * All build actions require market_params: { loanToken, collateralToken, oracle, irm, lltv }
 * (fetch them with get_market first).
 */

import { createPublicClient, http, encodeFunctionData, parseAbi, defineChain, type Hex } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';

// ── Monad chain + Morpho Blue singleton ──────────────────────────────────────
const CHAIN_ID = 143;
const DEFAULT_RPC = 'https://rpc.monad.xyz';
const MORPHO_BLUE = '0xD5D960E8C380B724a48AC59E2DfF1b2CB4a1eAee' as `0x${string}`;
const MORPHO_API = 'https://blue-api.morpho.org/graphql';

function getRpcUrl(): string { return process.env.MONAD_RPC_URL || DEFAULT_RPC; }

const monad = defineChain({
  id: CHAIN_ID,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_RPC] } },
});

function getClient() {
  return createPublicClient({ chain: monad, transport: http(getRpcUrl()) });
}

// ── ABIs ──────────────────────────────────────────────────────────────────────
const BLUE_ABI = parseAbi([
  'function position(bytes32 id,address user) view returns (uint256 supplyShares,uint128 borrowShares,uint128 collateral)',
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)',
  'function idToMarketParams(bytes32 id) view returns ((address loanToken,address collateralToken,address oracle,address irm,uint256 lltv))',
  'function supplyCollateral((address,address,address,address,uint256) marketParams,uint256 assets,address onBehalf,bytes data)',
  'function withdrawCollateral((address,address,address,address,uint256) marketParams,uint256 assets,address onBehalf,address receiver)',
  'function supply((address,address,address,address,uint256) marketParams,uint256 assets,uint256 shares,address onBehalf,bytes data) returns (uint256,uint256)',
  'function withdraw((address,address,address,address,uint256) marketParams,uint256 assets,uint256 shares,address onBehalf,address receiver) returns (uint256,uint256)',
  'function borrow((address,address,address,address,uint256) marketParams,uint256 assets,uint256 shares,address onBehalf,address receiver) returns (uint256,uint256)',
  'function repay((address,address,address,address,uint256) marketParams,uint256 assets,uint256 shares,address onBehalf,bytes data) returns (uint256,uint256)',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

type MarketParamsTuple = readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint];

// ── Helpers ─────────────────────────────────────────────────────────────────
function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}
function isBytes32(v: unknown): v is Hex {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{64}$/.test(v);
}
function normalize(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) out[k] = normalize(vv);
    return out;
  }
  return v;
}
function parseMarketParams(mp: unknown): MarketParamsTuple | null {
  if (!mp || typeof mp !== 'object') return null;
  const x = mp as Record<string, unknown>;
  try {
    const lltv = BigInt(String(x.lltv ?? '0'));
    if (!isAddress(x.loanToken) || !isAddress(x.collateralToken) || !isAddress(x.oracle) || !isAddress(x.irm)) return null;
    return [x.loanToken, x.collateralToken, x.oracle, x.irm, lltv];
  } catch { return null; }
}

// Query the Morpho API for chain-143 markets.
async function fetchMarkets(first = 30): Promise<any[]> {
  const query = `{ markets(first:${first}, orderBy: SupplyAssetsUsd, orderDirection: Desc, where:{chainId_in:[143]}) { items { marketId lltv irmAddress oracle{address} loanAsset{symbol address decimals} collateralAsset{symbol address decimals} state{supplyAssetsUsd borrowAssetsUsd supplyApy borrowApy utilization} } } }`;
  const r = await fetch(MORPHO_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Morpho API error ${r.status}`);
  const data = await r.json();
  if (data.errors) throw new Error(`Morpho API: ${data.errors[0]?.message ?? 'query failed'}`);
  return data?.data?.markets?.items ?? [];
}

// Shape one API market item into a flat, agent-friendly record incl. build-ready params.
function shapeMarket(m: any) {
  return {
    market_id: m.marketId,
    loan_token: { symbol: m.loanAsset?.symbol, address: m.loanAsset?.address, decimals: m.loanAsset?.decimals },
    collateral_token: { symbol: m.collateralAsset?.symbol, address: m.collateralAsset?.address, decimals: m.collateralAsset?.decimals },
    lltv: m.lltv,
    supply_apy: m.state?.supplyApy != null ? `${(m.state.supplyApy * 100).toFixed(2)}%` : null,
    borrow_apy: m.state?.borrowApy != null ? `${(m.state.borrowApy * 100).toFixed(2)}%` : null,
    utilization: m.state?.utilization != null ? `${(m.state.utilization * 100).toFixed(2)}%` : null,
    supply_usd: m.state?.supplyAssetsUsd ?? null,
    borrow_usd: m.state?.borrowAssetsUsd ?? null,
    // build-ready MarketParams tuple for supply/withdraw/borrow/repay
    market_params: {
      loanToken: m.loanAsset?.address,
      collateralToken: m.collateralAsset?.address,
      oracle: m.oracle?.address,
      irm: m.irmAddress,
      lltv: m.lltv,
    },
  };
}

// ── Skill metadata ────────────────────────────────────────────────────────────

export const MORPHO_MONAD_SKILL_METADATA = {
  name: 'Morpho Blue on Monad',
  description:
    '[ARSENAL-HOSTED ✓] Morpho Blue on Monad mainnet (chain ID 143) — a permissionless, isolated-market lending ' +
    'protocol and one of Monad\'s largest lending venues (~$89M TVL). List Monad markets with live supply / borrow ' +
    'APY and TVL, read a market\'s MarketParams and state, read a user\'s position, then build supply (lend), ' +
    'withdraw, supply-collateral, withdraw-collateral, borrow and repay transactions as unsigned EVM calls (with ' +
    'the ERC-20 approval a supply / repay / collateral deposit needs). Each market is an isolated ' +
    '(loanToken, collateralToken, oracle, irm, lltv) pair on one Morpho Blue contract, so build actions take ' +
    'MarketParams — fetch them with get_market first. Lets agents use Monad LSTs and blue-chips as collateral.\n\n' +
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
  tags: ['morpho', 'morpho-blue', 'lending', 'borrowing', 'monad', 'defi', 'evm', 'isolated-markets', 'mon'],
  external_url: 'https://app.morpho.org',
  logo_url: 'https://icons.llamao.fi/icons/protocols/morpho?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_markets', 'get_market', 'get_position', 'supply', 'withdraw', 'supply_collateral', 'withdraw_collateral', 'borrow', 'repay'],
        description:
          'get_markets: list Monad Morpho Blue markets (marketId, params, APY, TVL). ' +
          'get_market: one market\'s MarketParams + live state (requires market_id). ' +
          'get_position: a user\'s supply/borrow/collateral in a market (requires market_id, account). ' +
          'supply/withdraw: lend / redeem loan-asset (require market_params, assets or shares, on_behalf). ' +
          'supply_collateral/withdraw_collateral: manage collateral (require market_params, assets, on_behalf). ' +
          'borrow/repay: borrow against collateral / repay (require market_params, assets or shares, on_behalf). ' +
          'All build actions need market_params: { loanToken, collateralToken, oracle, irm, lltv } (from get_market).',
      },
      market_id:  { type: 'string', description: 'Morpho market ID (bytes32 hex). From get_markets.' },
      account:    { type: 'string', description: 'User address (0x...). For get_position.' },
      assets:     { type: 'string', description: 'Asset amount in the token\'s base units (wei). Provide assets OR shares.' },
      shares:     { type: 'string', description: 'Share amount in wei (for full-position withdraw/repay). Provide assets OR shares.' },
      receiver:   { type: 'string', description: 'Receiver of assets for withdraw/withdraw_collateral/borrow (defaults to on_behalf).' },
      on_behalf:  { type: 'string', description: 'Account the position is managed for (normally the signer EOA).' },
      market_params: {
        type: 'object',
        description: 'Market params: { loanToken, collateralToken, oracle, irm, lltv }. Get them from get_market.',
        properties: {
          loanToken:       { type: 'string' },
          collateralToken: { type: 'string' },
          oracle:          { type: 'string' },
          irm:             { type: 'string' },
          lltv:            { type: 'string' },
        },
      },
    },
  },
  usage_examples: [
    { title: 'List markets', input: { action: 'get_markets' } },
    { title: 'Get market', input: { action: 'get_market', market_id: '0x9e8441e7af65860feac831ebc117473e3033321abf528ebc8fbde1eeaaa3a626' } },
    { title: 'Get position', input: { action: 'get_position', market_id: '0x...', account: '0xYourAddress' } },
    { title: 'Supply 1000 USDC', input: { action: 'supply', market_params: { loanToken: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', collateralToken: '0x...', oracle: '0x...', irm: '0x...', lltv: '770000000000000000' }, assets: '1000000000', on_behalf: '0xYourAddress' } },
    { title: 'Supply collateral', input: { action: 'supply_collateral', market_params: { loanToken: '0x...', collateralToken: '0x...', oracle: '0x...', irm: '0x...', lltv: '770000000000000000' }, assets: '1000000000000000000', on_behalf: '0xYourAddress' } },
  ],
};

// ── Executor ────────────────────────────────────────────────────────────────

export async function executeMorphoMonadSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {

      case 'get_markets': {
        const items = await fetchMarkets(30);
        return {
          success: true,
          output: {
            protocol: 'Morpho Blue on Monad', chain: 'monad', chain_id: CHAIN_ID,
            morpho_blue: MORPHO_BLUE,
            market_count: items.length,
            markets: items.map(shapeMarket),
            note: 'Each market is isolated. Use a market\'s market_params (included here) for supply/withdraw/borrow/repay. Amounts are in the token base units.',
          },
        };
      }

      case 'get_market': {
        const id = input.market_id ?? input.id;
        if (!isBytes32(id)) return { success: false, error: 'market_id must be a bytes32 hex (0x + 64 hex chars)' };
        // Prefer the API for full params + USD state; fall back to on-chain idToMarketParams + market().
        try {
          const items = await fetchMarkets(200);
          const m = items.find((x: any) => (x.marketId ?? '').toLowerCase() === id.toLowerCase());
          if (m) return { success: true, output: { ...shapeMarket(m), morpho_blue: MORPHO_BLUE, chain: 'monad', chain_id: CHAIN_ID } };
        } catch { /* fall through to on-chain */ }
        const c = getClient();
        const [params, state] = await Promise.all([
          c.readContract({ address: MORPHO_BLUE, abi: BLUE_ABI, functionName: 'idToMarketParams', args: [id] }),
          c.readContract({ address: MORPHO_BLUE, abi: BLUE_ABI, functionName: 'market', args: [id] }).catch(() => null),
        ]);
        return { success: true, output: { market_id: id, market_params: normalize(params), state: normalize(state), morpho_blue: MORPHO_BLUE, chain: 'monad', chain_id: CHAIN_ID } };
      }

      case 'get_position': {
        const id = input.market_id ?? input.id;
        const account = input.account ?? input.user;
        if (!isBytes32(id)) return { success: false, error: 'market_id must be a bytes32 hex (0x + 64 hex chars)' };
        if (!isAddress(account)) return { success: false, error: 'account is required (0x...)' };
        const c = getClient();
        const data = await c.readContract({ address: MORPHO_BLUE, abi: BLUE_ABI, functionName: 'position', args: [id, account] });
        return { success: true, output: { market_id: id, account, position: normalize(data), morpho_blue: MORPHO_BLUE, chain: 'monad', chain_id: CHAIN_ID } };
      }

      case 'supply':
      case 'withdraw':
      case 'supply_collateral':
      case 'withdraw_collateral':
      case 'borrow':
      case 'repay': {
        const mp = parseMarketParams(input.market_params);
        if (!mp) return { success: false, error: 'market_params is required: { loanToken, collateralToken, oracle, irm, lltv } (get it from get_market)' };
        const assets = BigInt(input.assets ?? input.amount ?? '0');
        const shares = BigInt(input.shares ?? '0');
        const onBehalf = input.on_behalf ?? input.onBehalf;
        const receiver = input.receiver ?? onBehalf;
        if (!isAddress(onBehalf)) return { success: false, error: 'on_behalf is required (0x...)' };

        let data: `0x${string}`;
        let description: string;
        let approvalToken: `0x${string}` | null = null;

        if (action === 'supply_collateral') {
          if (assets === 0n) return { success: false, error: 'assets must be > 0 for supply_collateral' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'supplyCollateral', args: [mp, assets, onBehalf, '0x'] });
          description = `Supply ${assets} collateral to Morpho Blue on Monad`;
          approvalToken = mp[1];
        } else if (action === 'withdraw_collateral') {
          if (!isAddress(receiver)) return { success: false, error: 'receiver is required' };
          if (assets === 0n) return { success: false, error: 'assets must be > 0' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'withdrawCollateral', args: [mp, assets, onBehalf, receiver] });
          description = `Withdraw ${assets} collateral from Morpho Blue on Monad`;
        } else if (action === 'supply') {
          if (assets === 0n && shares === 0n) return { success: false, error: 'provide assets or shares (> 0)' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'supply', args: [mp, assets, shares, onBehalf, '0x'] });
          description = `Supply (lend) to Morpho Blue market on Monad`;
          approvalToken = mp[0];
        } else if (action === 'withdraw') {
          if (!isAddress(receiver)) return { success: false, error: 'receiver is required' };
          if (assets === 0n && shares === 0n) return { success: false, error: 'provide assets or shares (> 0)' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'withdraw', args: [mp, assets, shares, onBehalf, receiver] });
          description = `Withdraw from Morpho Blue market on Monad`;
        } else if (action === 'borrow') {
          if (!isAddress(receiver)) return { success: false, error: 'receiver is required' };
          if (assets === 0n && shares === 0n) return { success: false, error: 'provide assets or shares (> 0)' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'borrow', args: [mp, assets, shares, onBehalf, receiver] });
          description = `Borrow from Morpho Blue market on Monad`;
        } else { // repay
          if (assets === 0n && shares === 0n) return { success: false, error: 'provide assets or shares (> 0)' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'repay', args: [mp, assets, shares, onBehalf, '0x'] });
          description = `Repay to Morpho Blue market on Monad`;
          approvalToken = mp[0];
        }

        const approvalNeeded = approvalToken && assets > 0n;
        const transactions = [
          ...(approvalNeeded ? [{
            to: approvalToken as string,
            data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [MORPHO_BLUE, assets] }),
            value: '0x0', chain_id: CHAIN_ID,
            description: `Approve ${assets} to Morpho Blue`,
          }] : []),
          { to: MORPHO_BLUE, data, value: '0x0', chain_id: CHAIN_ID, description },
        ];

        return {
          success: true,
          output: {
            transactions,
            ...(approvalNeeded ? { approvals: [{ token: approvalToken, spender: MORPHO_BLUE, amount: assets.toString() }] } : {}),
            market_params: { loanToken: mp[0], collateralToken: mp[1], oracle: mp[2], irm: mp[3], lltv: mp[4].toString() },
            assets: assets.toString(), shares: shares.toString(),
            on_behalf: onBehalf, receiver,
            chain: 'monad', chain_id: CHAIN_ID,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_markets, get_market, get_position, supply, withdraw, supply_collateral, withdraw_collateral, borrow, repay` };
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Morpho Blue on Monad skill error' };
  }
}
