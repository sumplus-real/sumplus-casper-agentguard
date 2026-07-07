import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const AAVE_V3_MAINNET_SKILL_METADATA = {
  name: 'Aave v3 Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Aave v3 on Ethereum mainnet — direct on-chain lending skill. ' +
    'Query user account health, reserve data, and build supply/withdraw/borrow/repay/flashloan transactions. ' +
    'Returns properly encoded unsigned EVM transactions with approval steps. ' +
    'No API key required.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['aave', 'lending', 'borrowing', 'defi', 'ethereum', 'mainnet', 'v3', 'supply', 'borrow', 'clarity-act'],
  external_url: 'https://app.aave.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/aave?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['supply', 'withdraw', 'borrow', 'repay', 'set_collateral', 'get_user_account_data', 'get_reserve_data', 'flashloan'],
        description:
          'get_user_account_data: health factor, collateral, debt for a user address. ' +
          'get_reserve_data: reserve APY and config for an asset. ' +
          'supply: build approve+supply tx (requires asset, amount, on_behalf_of). ' +
          'withdraw: build withdraw tx (requires asset, amount, recipient). ' +
          'borrow: build borrow tx (requires asset, amount, interest_rate_mode, on_behalf_of). ' +
          'repay: build approve+repay tx (requires asset, amount, interest_rate_mode, on_behalf_of). ' +
          'set_collateral: enable/disable an asset as collateral. ' +
          'flashloan: build flashloan tx.',
      },
      asset:            { type: 'string', description: 'Asset token address (0x...).' },
      amount:           { type: 'string', description: 'Amount in wei.' },
      on_behalf_of:     { type: 'string', description: 'Address to act on behalf of (0x...).' },
      recipient:        { type: 'string', description: 'Recipient for withdraw (0x...).' },
      interest_rate_mode: { type: 'number', enum: [1, 2], description: '1=stable (deprecated), 2=variable.' },
      use_as_collateral: { type: 'boolean', description: 'For set_collateral.' },
      user:             { type: 'string', description: 'User address for get_user_account_data.' },
      receiver:         { type: 'string', description: 'Flash loan receiver address.' },
      assets:           { type: 'array', items: { type: 'string' }, description: 'Asset addresses for flashloan.' },
      amounts:          { type: 'array', items: { type: 'string' }, description: 'Amounts in wei for flashloan.' },
      modes:            { type: 'array', items: { type: 'number' }, description: 'Interest rate modes for flashloan (0=no debt).' },
    },
  },
  usage_examples: [
    { title: 'Check account health', input: { action: 'get_user_account_data', user: '0xYourAddress' } },
    { title: 'Supply USDC', input: { action: 'supply', asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000000', on_behalf_of: '0xYourAddress' } },
  ],
};

const POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' as `0x${string}`;

const POOL_ABI = parseAbi([
  'function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)',
  'function withdraw(address asset,uint256 amount,address to) returns (uint256)',
  'function borrow(address asset,uint256 amount,uint256 interestRateMode,uint16 referralCode,address onBehalfOf)',
  'function repay(address asset,uint256 amount,uint256 interestRateMode,address onBehalfOf) returns (uint256)',
  'function setUserUseReserveAsCollateral(address asset,bool useAsCollateral)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)',
  'function getReserveData(address asset) view returns ((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))',
  'function flashLoan(address receiverAddress,address[] assets,uint256[] amounts,uint256[] modes,address onBehalfOf,bytes params,uint16 referralCode)',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
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

export async function executeAaveV3MainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_user_account_data': {
        const user = input.user ?? input.account;
        if (!isAddress(user)) return { success: false, error: 'user address is required (0x...)' };
        const c = getClient();
        const [totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor] =
          await c.readContract({ address: POOL, abi: POOL_ABI, functionName: 'getUserAccountData', args: [user] });
        return { success: true, output: normalize({ totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor }) as Record<string, any> };
      }

      case 'get_reserve_data': {
        const asset = input.asset;
        if (!isAddress(asset)) return { success: false, error: 'asset address is required (0x...)' };
        const c = getClient();
        const data = await c.readContract({ address: POOL, abi: POOL_ABI, functionName: 'getReserveData', args: [asset] });
        return { success: true, output: normalize(data) as Record<string, any> };
      }

      case 'supply': {
        const asset = input.asset; const value = BigInt(input.amount ?? '0'); const onBehalfOf = input.on_behalf_of ?? input.onBehalfOf; const referralCode = input.referral_code ?? input.referralCode ?? 0;
        if (!isAddress(asset) || value === 0n || !isAddress(onBehalfOf)) return { success: false, error: 'asset, amount, and on_behalf_of are required' };
        return {
          success: true,
          output: {
            transactions: [
              { to: asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [POOL, value] }), value: '0x0', chain_id: 1, description: `Approve ${value} to Aave v3 Pool` },
              { to: POOL, data: encodeFunctionData({ abi: POOL_ABI, functionName: 'supply', args: [asset, value, onBehalfOf, referralCode] }), value: '0x0', chain_id: 1, description: `Supply ${value} to Aave v3` },
            ],
            approvals: [{ token: asset, spender: POOL, amount: value.toString() }],
            asset, amount: value.toString(), on_behalf_of: onBehalfOf,
          },
        };
      }

      case 'withdraw': {
        const asset = input.asset; const value = BigInt(input.amount ?? '0'); const to = input.recipient ?? input.to;
        if (!isAddress(asset) || value === 0n || !isAddress(to)) return { success: false, error: 'asset, amount, and recipient are required' };
        return {
          success: true,
          output: {
            transactions: [{ to: POOL, data: encodeFunctionData({ abi: POOL_ABI, functionName: 'withdraw', args: [asset, value, to] }), value: '0x0', chain_id: 1, description: `Withdraw ${value} from Aave v3` }],
            asset, amount: value.toString(), recipient: to,
          },
        };
      }

      case 'borrow': {
        const asset = input.asset; const value = BigInt(input.amount ?? '0'); const mode = BigInt(input.interest_rate_mode ?? input.interestRateMode ?? 2); const onBehalfOf = input.on_behalf_of ?? input.onBehalfOf; const referralCode = input.referral_code ?? 0;
        if (!isAddress(asset) || value === 0n || !isAddress(onBehalfOf)) return { success: false, error: 'asset, amount, and on_behalf_of are required' };
        return {
          success: true,
          output: {
            transactions: [{ to: POOL, data: encodeFunctionData({ abi: POOL_ABI, functionName: 'borrow', args: [asset, value, mode, referralCode, onBehalfOf] }), value: '0x0', chain_id: 1, description: `Borrow ${value} from Aave v3` }],
            asset, amount: value.toString(), interest_rate_mode: Number(mode), on_behalf_of: onBehalfOf,
          },
        };
      }

      case 'repay': {
        const asset = input.asset; const value = BigInt(input.amount ?? '0'); const mode = BigInt(input.interest_rate_mode ?? input.interestRateMode ?? 2); const onBehalfOf = input.on_behalf_of ?? input.onBehalfOf;
        if (!isAddress(asset) || value === 0n || !isAddress(onBehalfOf)) return { success: false, error: 'asset, amount, and on_behalf_of are required' };
        return {
          success: true,
          output: {
            transactions: [
              { to: asset, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [POOL, value] }), value: '0x0', chain_id: 1, description: `Approve ${value} to Aave v3 Pool for repayment` },
              { to: POOL, data: encodeFunctionData({ abi: POOL_ABI, functionName: 'repay', args: [asset, value, mode, onBehalfOf] }), value: '0x0', chain_id: 1, description: `Repay ${value} to Aave v3` },
            ],
            approvals: [{ token: asset, spender: POOL, amount: value.toString() }],
            asset, amount: value.toString(), interest_rate_mode: Number(mode), on_behalf_of: onBehalfOf,
          },
        };
      }

      case 'set_collateral': {
        const asset = input.asset; const useAsCollateral = typeof input.use_as_collateral === 'boolean' ? input.use_as_collateral : input.useAsCollateral;
        if (!isAddress(asset) || typeof useAsCollateral !== 'boolean') return { success: false, error: 'asset and use_as_collateral (boolean) are required' };
        return {
          success: true,
          output: {
            transactions: [{ to: POOL, data: encodeFunctionData({ abi: POOL_ABI, functionName: 'setUserUseReserveAsCollateral', args: [asset, useAsCollateral] }), value: '0x0', chain_id: 1, description: `Set ${asset} collateral: ${useAsCollateral}` }],
            asset, use_as_collateral: useAsCollateral,
          },
        };
      }

      case 'flashloan': {
        const receiverAddress = input.receiver ?? input.receiverAddress;
        const assets = input.assets;
        const amounts = input.amounts?.map((a: string) => BigInt(a));
        const modes = input.modes?.map((m: number) => BigInt(m));
        const onBehalfOf = input.on_behalf_of ?? input.onBehalfOf;
        const payload = input.params ?? '0x';
        if (!isAddress(receiverAddress) || !Array.isArray(assets) || !amounts || !modes || !isAddress(onBehalfOf)) {
          return { success: false, error: 'receiver, assets, amounts, modes, and on_behalf_of are required' };
        }
        return {
          success: true,
          output: {
            transactions: [{ to: POOL, data: encodeFunctionData({ abi: POOL_ABI, functionName: 'flashLoan', args: [receiverAddress, assets, amounts, modes, onBehalfOf, payload, 0] }), value: '0x0', chain_id: 1, description: `Flash loan ${assets.length} asset(s) from Aave v3` }],
            receiver: receiverAddress, assets, amounts: amounts.map(String), modes: input.modes, on_behalf_of: onBehalfOf,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: supply, withdraw, borrow, repay, set_collateral, get_user_account_data, get_reserve_data, flashloan` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Aave v3 Mainnet skill error' };
  }
}
