import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const ETHENA_MAINNET_SKILL_METADATA = {
  name: 'Ethena Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Ethena Protocol on Ethereum mainnet — USDe staking and yield. ' +
    'Stake USDe to get sUSDe, initiate cooldown (required before unstaking), unstake after cooldown, ' +
    'check cooldown status and duration, preview deposit/redeem amounts. ' +
    'Returns unsigned EVM transactions ready for wallet signing.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['ethena', 'usde', 'susde', 'staking', 'yield', 'cooldown', 'ethereum', 'mainnet', 'clarity-act'],
  external_url: 'https://app.ethena.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/ethena?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_cooldown_duration', 'cooldown_status', 'preview_deposit', 'preview_redeem',
          'stake_usde', 'cooldown_assets', 'cooldown_shares', 'unstake',
        ],
        description:
          'get_cooldown_duration: read current cooldown period in seconds. ' +
          'cooldown_status: check cooldown for an account. ' +
          'preview_deposit: preview sUSDe received for USDe deposit. ' +
          'preview_redeem: preview USDe received for sUSDe redemption. ' +
          'stake_usde: build tx to deposit USDe → sUSDe (requires assets, receiver). ' +
          'cooldown_assets: build tx to start cooldown by USDe amount (requires amount, sender). ' +
          'cooldown_shares: build tx to start cooldown by sUSDe shares (requires shares, sender). ' +
          'unstake: build tx to claim after cooldown (requires receiver).',
      },
      account:  { type: 'string', description: 'Address to check cooldown_status for (0x...).' },
      assets:   { type: 'string', description: 'USDe amount in wei for stake_usde/cooldown_assets.' },
      shares:   { type: 'string', description: 'sUSDe shares in wei for cooldown_shares.' },
      amount:   { type: 'string', description: 'Amount in wei (alias for assets or shares depending on action).' },
      receiver: { type: 'string', description: 'Recipient address for stake_usde and unstake (0x...).' },
      sender:   { type: 'string', description: 'Sender address for cooldown_assets/cooldown_shares (0x...).' },
    },
  },
  usage_examples: [
    { title: 'Check cooldown duration', input: { action: 'get_cooldown_duration' } },
    { title: 'Stake 100 USDe', input: { action: 'stake_usde', assets: '100000000000000000000', receiver: '0xYourAddress' } },
    { title: 'Preview stake', input: { action: 'preview_deposit', assets: '100000000000000000000' } },
  ],
};

const USDE  = '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3';
const SUSDE = '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497';

const SUSDE_ABI = parseAbi([
  'function deposit(uint256 assets,address receiver) returns (uint256)',
  'function cooldownAssets(uint256 assets) returns (uint256)',
  'function cooldownShares(uint256 shares) returns (uint256)',
  'function unstake(address receiver)',
  'function cooldownDuration() view returns (uint24)',
  'function cooldowns(address) view returns (uint104 cooldownEnd,uint152 underlyingAmount)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
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

export async function executeEthenaMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_cooldown_duration': {
        const c = getClient();
        const d = await c.readContract({ address: SUSDE, abi: SUSDE_ABI, functionName: 'cooldownDuration' });
        return { success: true, output: { cooldown_duration_seconds: Number(d) } };
      }

      case 'cooldown_status': {
        const account = input.account ?? input.owner;
        if (!isAddress(account)) return { success: false, error: 'account is required (0x...)' };
        const c = getClient();
        const data = await c.readContract({ address: SUSDE, abi: SUSDE_ABI, functionName: 'cooldowns', args: [account] });
        return { success: true, output: normalize(data) as Record<string, any> };
      }

      case 'preview_deposit': {
        const assets = BigInt(input.assets ?? input.amount ?? '0');
        if (assets === 0n) return { success: false, error: 'assets amount is required' };
        const c = getClient();
        const shares = await c.readContract({ address: SUSDE, abi: SUSDE_ABI, functionName: 'previewDeposit', args: [assets] });
        return { success: true, output: { assets: assets.toString(), shares: shares.toString() } };
      }

      case 'preview_redeem': {
        const shares = BigInt(input.shares ?? input.amount ?? '0');
        if (shares === 0n) return { success: false, error: 'shares amount is required' };
        const c = getClient();
        const assets = await c.readContract({ address: SUSDE, abi: SUSDE_ABI, functionName: 'previewRedeem', args: [shares] });
        return { success: true, output: { shares: shares.toString(), assets: assets.toString() } };
      }

      case 'stake_usde': {
        const assets = BigInt(input.assets ?? input.amount ?? '0');
        const receiver = input.receiver ?? input.sender;
        if (assets === 0n) return { success: false, error: 'assets amount is required' };
        if (!isAddress(receiver)) return { success: false, error: 'receiver is required (0x...)' };
        return {
          success: true,
          output: {
            transactions: [
              {
                to: USDE,
                data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [SUSDE, assets] }),
                value: '0x0',
                chain_id: 1,
                description: `Approve ${assets} USDe to sUSDe contract`,
              },
              {
                to: SUSDE,
                data: encodeFunctionData({ abi: SUSDE_ABI, functionName: 'deposit', args: [assets, receiver] }),
                value: '0x0',
                chain_id: 1,
                description: `Deposit ${assets} USDe to receive sUSDe`,
              },
            ],
            approvals: [{ token: USDE, spender: SUSDE, amount: assets.toString() }],
            assets: assets.toString(),
            receiver,
            note: 'Execute transactions in order: approve first, then deposit.',
          },
        };
      }

      case 'cooldown_assets': {
        const value = BigInt(input.amount ?? input.assets ?? '0');
        if (value === 0n) return { success: false, error: 'amount is required' };
        return {
          success: true,
          output: {
            transactions: [{
              to: SUSDE,
              data: encodeFunctionData({ abi: SUSDE_ABI, functionName: 'cooldownAssets', args: [value] }),
              value: '0x0',
              chain_id: 1,
              description: `Initiate cooldown for ${value} USDe worth of sUSDe`,
            }],
            amount: value.toString(),
            note: 'After cooldown period ends, call unstake to claim. Check cooldown_duration first.',
          },
        };
      }

      case 'cooldown_shares': {
        const shares = BigInt(input.shares ?? input.amount ?? '0');
        if (shares === 0n) return { success: false, error: 'shares amount is required' };
        return {
          success: true,
          output: {
            transactions: [{
              to: SUSDE,
              data: encodeFunctionData({ abi: SUSDE_ABI, functionName: 'cooldownShares', args: [shares] }),
              value: '0x0',
              chain_id: 1,
              description: `Initiate cooldown for ${shares} sUSDe shares`,
            }],
            shares: shares.toString(),
            note: 'After cooldown period ends, call unstake to claim.',
          },
        };
      }

      case 'unstake': {
        const receiver = input.receiver ?? input.sender;
        if (!isAddress(receiver)) return { success: false, error: 'receiver is required (0x...)' };
        return {
          success: true,
          output: {
            transactions: [{
              to: SUSDE,
              data: encodeFunctionData({ abi: SUSDE_ABI, functionName: 'unstake', args: [receiver] }),
              value: '0x0',
              chain_id: 1,
              description: `Unstake and send to ${receiver}`,
            }],
            receiver,
            note: 'Only callable after cooldown period has ended.',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_cooldown_duration, cooldown_status, preview_deposit, preview_redeem, stake_usde, cooldown_assets, cooldown_shares, unstake` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Ethena skill error' };
  }
}
