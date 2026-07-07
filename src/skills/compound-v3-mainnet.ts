import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

/**
 * Compound III (Comet) — Ethereum mainnet lending skill.
 *
 * Compound III is organized as isolated single-base-asset markets ("Comets").
 * Each Comet has one borrowable base asset (e.g. USDC) and a set of collateral
 * assets. You supply the base to earn, supply collateral to borrow the base,
 * and withdraw() the base to borrow against your collateral.
 *
 * Query: get_market_info (utilization + supply/borrow APR), get_user_position.
 * Build: supply (approve+supply), withdraw (withdraw or borrow base), claim_rewards.
 *
 * Skill UUID: a1d4f7c2-9b6e-4e3a-8d51-2c7f0e9a4b63
 */

const SECONDS_PER_YEAR = 31_536_000;

// Well-known mainnet Comet markets, keyed by base-asset symbol.
const MARKETS: Record<string, { comet: `0x${string}`; base: `0x${string}`; baseSymbol: string; baseDecimals: number }> = {
  USDC:  { comet: '0xc3d688B66703497DAA19211EEdff47f25384cdc3', base: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', baseSymbol: 'USDC',  baseDecimals: 6 },
  WETH:  { comet: '0xA17581A9E3356d9A858b789D68B4d866e593aE94', base: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', baseSymbol: 'WETH',  baseDecimals: 18 },
  USDT:  { comet: '0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840', base: '0xdAC17F958D2ee523a2206206994597C13D831ec7', baseSymbol: 'USDT',  baseDecimals: 6 },
};

// CometRewards (COMP accrual) — same address across all mainnet Comets.
const COMET_REWARDS = '0x1B0e765F6224C21223AeA2af16c1C46E38885a40' as `0x${string}`;

const COMET_ABI = parseAbi([
  'function supply(address asset, uint256 amount)',
  'function withdraw(address asset, uint256 amount)',
  'function balanceOf(address account) view returns (uint256)',
  'function borrowBalanceOf(address account) view returns (uint256)',
  'function collateralBalanceOf(address account, address asset) view returns (uint128)',
  'function baseToken() view returns (address)',
  'function getUtilization() view returns (uint256)',
  'function getSupplyRate(uint256 utilization) view returns (uint64)',
  'function getBorrowRate(uint256 utilization) view returns (uint64)',
  'function isBorrowCollateralized(address account) view returns (bool)',
  'function numAssets() view returns (uint8)',
]);
const COMET_REWARDS_ABI = parseAbi(['function claim(address comet, address src, bool shouldAccrue)']);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);

export const COMPOUND_V3_MAINNET_SKILL_METADATA = {
  name: 'Compound V3 Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Compound III (Comet) on Ethereum mainnet — direct on-chain lending skill. ' +
    'Query market utilization and supply/borrow APR, read a user position (supplied base, borrow balance, collateralization), ' +
    'and build supply / withdraw / borrow / claim-rewards transactions. Markets are isolated per base asset (USDC, WETH, USDT). ' +
    'In Compound III, withdrawing the base asset beyond your supplied balance borrows it against your collateral. ' +
    'Returns properly encoded unsigned EVM transactions with approval steps. No API key required.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['compound', 'compound-v3', 'comet', 'lending', 'borrowing', 'defi', 'ethereum', 'mainnet', 'supply', 'borrow', 'clarity-act'],
  external_url: 'https://app.compound.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/compound-finance?w=48&h=48',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_market_info', 'get_user_position', 'supply', 'withdraw', 'claim_rewards'],
        description:
          'get_market_info: utilization + supply/borrow APR for a market (requires market or market_name). ' +
          'get_user_position: supplied base, borrow balance, and isBorrowCollateralized for a user (requires user, market or market_name). ' +
          'supply: build approve+supply tx — supply the base asset to earn, or a collateral asset to back a borrow (requires asset, amount, market or market_name). ' +
          'withdraw: build withdraw tx — withdraw supplied base/collateral, or borrow the base by withdrawing beyond your supply (requires asset, amount, market or market_name). ' +
          'claim_rewards: build COMP claim tx via CometRewards (requires user, market or market_name).',
      },
      market_name: { type: 'string', enum: ['USDC', 'WETH', 'USDT'], description: 'Base-asset symbol of a well-known mainnet Comet market.' },
      market:      { type: 'string', description: 'Explicit Comet (market) address (0x...). Overrides market_name.' },
      asset:       { type: 'string', description: 'Token address (0x...) to supply or withdraw. The base token, or a collateral token of the market.' },
      amount:      { type: 'string', description: 'Amount in the token\'s smallest unit (wei).' },
      user:        { type: 'string', description: 'User address (0x...) for get_user_position / claim_rewards.' },
    },
  },
  usage_examples: [
    { title: 'USDC market APR', input: { action: 'get_market_info', market_name: 'USDC' } },
    { title: 'My position in USDC market', input: { action: 'get_user_position', market_name: 'USDC', user: '0xYourAddress' } },
    { title: 'Supply 1000 USDC to earn', input: { action: 'supply', market_name: 'USDC', asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000000' } },
  ],
};

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

/** Resolve the target Comet address from market (address) or market_name (symbol). */
function resolveComet(input: any): { comet: `0x${string}`; meta?: typeof MARKETS[string] } | { error: string } {
  if (isAddress(input.market)) return { comet: input.market };
  const name = typeof input.market_name === 'string' ? input.market_name.toUpperCase() : undefined;
  if (name && MARKETS[name]) return { comet: MARKETS[name].comet, meta: MARKETS[name] };
  return { error: 'A market is required: pass market_name (USDC|WETH|USDT) or an explicit market address.' };
}

/** Comet rates are per-second, scaled by 1e18. Convert to an annualized percentage. */
function rateToApr(perSecond: bigint): number {
  return (Number(perSecond) / 1e18) * SECONDS_PER_YEAR * 100;
}

export async function executeCompoundV3MainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_market_info': {
        const r = resolveComet(input);
        if ('error' in r) return { success: false, error: r.error };
        const c = getClient();
        const [baseToken, utilization, numAssets] = await Promise.all([
          c.readContract({ address: r.comet, abi: COMET_ABI, functionName: 'baseToken' }),
          c.readContract({ address: r.comet, abi: COMET_ABI, functionName: 'getUtilization' }),
          c.readContract({ address: r.comet, abi: COMET_ABI, functionName: 'numAssets' }),
        ]);
        const [supplyRate, borrowRate] = await Promise.all([
          c.readContract({ address: r.comet, abi: COMET_ABI, functionName: 'getSupplyRate', args: [utilization] }),
          c.readContract({ address: r.comet, abi: COMET_ABI, functionName: 'getBorrowRate', args: [utilization] }),
        ]);
        return {
          success: true,
          output: {
            market: r.comet,
            base_token: baseToken,
            base_symbol: r.meta?.baseSymbol,
            utilization: utilization.toString(),
            utilization_pct: (Number(utilization) / 1e18) * 100,
            supply_apr_pct: rateToApr(supplyRate),
            borrow_apr_pct: rateToApr(borrowRate),
            num_collateral_assets: Number(numAssets),
          },
        };
      }

      case 'get_user_position': {
        const r = resolveComet(input);
        if ('error' in r) return { success: false, error: r.error };
        const user = input.user ?? input.account;
        if (!isAddress(user)) return { success: false, error: 'user address is required (0x...)' };
        const c = getClient();
        const [baseToken, supplied, borrowed, collateralized] = await Promise.all([
          c.readContract({ address: r.comet, abi: COMET_ABI, functionName: 'baseToken' }),
          c.readContract({ address: r.comet, abi: COMET_ABI, functionName: 'balanceOf', args: [user] }),
          c.readContract({ address: r.comet, abi: COMET_ABI, functionName: 'borrowBalanceOf', args: [user] }),
          c.readContract({ address: r.comet, abi: COMET_ABI, functionName: 'isBorrowCollateralized', args: [user] }),
        ]);
        return {
          success: true,
          output: {
            market: r.comet,
            user,
            base_token: baseToken,
            base_symbol: r.meta?.baseSymbol,
            supplied_base: supplied.toString(),
            borrow_balance: borrowed.toString(),
            is_borrow_collateralized: collateralized,
          },
        };
      }

      case 'supply': {
        const r = resolveComet(input);
        if ('error' in r) return { success: false, error: r.error };
        const asset = input.asset; const value = BigInt(input.amount ?? '0');
        if (!isAddress(asset) || value === 0n) return { success: false, error: 'asset (0x...) and amount are required' };
        return {
          success: true,
          output: {
            transactions: [
              { to: asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [r.comet, value] }), value: '0x0', chain_id: 1, description: `Approve ${value} to Compound III market ${r.comet}` },
              { to: r.comet, data: encodeFunctionData({ abi: COMET_ABI, functionName: 'supply', args: [asset, value] }), value: '0x0', chain_id: 1, description: `Supply ${value} of ${asset} to Compound III` },
            ],
            approvals: [{ token: asset, spender: r.comet, amount: value.toString() }],
            market: r.comet, asset, amount: value.toString(),
          },
        };
      }

      case 'withdraw': {
        const r = resolveComet(input);
        if ('error' in r) return { success: false, error: r.error };
        const asset = input.asset; const value = BigInt(input.amount ?? '0');
        if (!isAddress(asset) || value === 0n) return { success: false, error: 'asset (0x...) and amount are required' };
        return {
          success: true,
          output: {
            transactions: [{ to: r.comet, data: encodeFunctionData({ abi: COMET_ABI, functionName: 'withdraw', args: [asset, value] }), value: '0x0', chain_id: 1, description: `Withdraw/borrow ${value} of ${asset} from Compound III` }],
            market: r.comet, asset, amount: value.toString(),
            note: 'In Compound III, withdrawing the base asset beyond your supplied balance opens a borrow against your collateral.',
          },
        };
      }

      case 'claim_rewards': {
        const r = resolveComet(input);
        if ('error' in r) return { success: false, error: r.error };
        const user = input.user ?? input.account;
        if (!isAddress(user)) return { success: false, error: 'user address is required (0x...)' };
        return {
          success: true,
          output: {
            transactions: [{ to: COMET_REWARDS, data: encodeFunctionData({ abi: COMET_REWARDS_ABI, functionName: 'claim', args: [r.comet, user, true] }), value: '0x0', chain_id: 1, description: `Claim accrued COMP rewards for ${user} on market ${r.comet}` }],
            market: r.comet, user, rewards_contract: COMET_REWARDS,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_market_info, get_user_position, supply, withdraw, claim_rewards` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Compound V3 Mainnet skill error' };
  }
}
