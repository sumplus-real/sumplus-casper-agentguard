import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const LIDO_MAINNET_SKILL_METADATA = {
  name: 'Lido Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Lido liquid staking on Ethereum mainnet. ' +
    'Stake ETH to receive stETH, wrap stETH to wstETH, initiate withdrawal requests, ' +
    'claim withdrawals after finalization, and query pool stats. ' +
    'Returns unsigned EVM transactions ready for wallet signing.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['lido', 'steth', 'wsteth', 'liquid-staking', 'lst', 'ethereum', 'mainnet', 'withdrawal', 'clarity-act'],
  external_url: 'https://stake.lido.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/lido?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'submit_eth', 'wrap_steth_to_wsteth', 'unwrap_wsteth_to_steth',
          'preview_wrap', 'preview_unwrap',
          'request_withdrawal_steth', 'request_withdrawal_wsteth',
          'get_withdrawal_status', 'find_checkpoint_hints', 'claim_withdrawals_to',
          'get_total_pooled_eth',
        ],
        description:
          'submit_eth: stake ETH to get stETH (requires value in wei). ' +
          'wrap_steth_to_wsteth: convert stETH to wstETH. ' +
          'unwrap_wsteth_to_steth: convert wstETH back to stETH. ' +
          'preview_wrap/preview_unwrap: get preview amounts. ' +
          'request_withdrawal_steth/wsteth: initiate withdrawal NFT. ' +
          'get_withdrawal_status: check withdrawal NFT status. ' +
          'find_checkpoint_hints: get hints for claim. ' +
          'claim_withdrawals_to: claim finalized withdrawals. ' +
          'get_total_pooled_eth: read total ETH in Lido pool.',
      },
      value:       { type: 'string', description: 'ETH amount in wei for submit_eth.' },
      amount:      { type: 'string', description: 'stETH/wstETH amount in wei.' },
      amounts:     { type: 'array', items: { type: 'string' }, description: 'Array of amounts for batch withdrawal requests.' },
      owner:       { type: 'string', description: 'Owner address for withdrawal requests (0x...).' },
      referral:    { type: 'string', description: 'Optional referral address for submit_eth.' },
      request_ids: { type: 'array', items: { type: 'string' }, description: 'Withdrawal NFT request IDs.' },
      hints:       { type: 'array', items: { type: 'string' }, description: 'Checkpoint hints for claim_withdrawals_to.' },
      recipient:   { type: 'string', description: 'Recipient for claimed ETH in claim_withdrawals_to (0x...).' },
      first_index: { type: 'string', description: 'First checkpoint index for find_checkpoint_hints.' },
      last_index:  { type: 'string', description: 'Last checkpoint index for find_checkpoint_hints.' },
    },
  },
  usage_examples: [
    { title: 'Stake 1 ETH', input: { action: 'submit_eth', value: '1000000000000000000', owner: '0xYourAddress' } },
    { title: 'Wrap 1 stETH', input: { action: 'wrap_steth_to_wsteth', amount: '1000000000000000000' } },
    { title: 'Preview wrap', input: { action: 'preview_wrap', amount: '1000000000000000000' } },
  ],
};

const STETH = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as `0x${string}`;
const WSTETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0' as `0x${string}`;
const WITHDRAWAL_QUEUE = '0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1' as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

const STETH_ABI = parseAbi([
  'function submit(address _referral) payable returns (uint256)',
  'function getTotalPooledEther() view returns (uint256)',
]);
const WSTETH_ABI = parseAbi([
  'function wrap(uint256 _stETHAmount) returns (uint256)',
  'function unwrap(uint256 _wstETHAmount) returns (uint256)',
  'function getWstETHByStETH(uint256) view returns (uint256)',
  'function getStETHByWstETH(uint256) view returns (uint256)',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);
const QUEUE_ABI = parseAbi([
  'function requestWithdrawals(uint256[] _amounts,address _owner) returns (uint256[] requestIds)',
  'function requestWithdrawalsWstETH(uint256[] _amounts,address _owner) returns (uint256[] requestIds)',
  'function getWithdrawalStatus(uint256[] _requestIds) view returns ((uint256 amountOfStETH,uint256 amountOfShares,address owner,uint256 timestamp,bool isFinalized,bool isClaimed)[])',
  'function findCheckpointHints(uint256[] _requestIds,uint256 _firstIndex,uint256 _lastIndex) view returns (uint256[])',
  'function claimWithdrawalsTo(uint256[] _requestIds,uint256[] _hints,address _recipient)',
]);

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function toBigints(v: unknown): bigint[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out = v.map((x) => {
    try { return BigInt(String(x)); } catch { return null; }
  });
  return out.every((x): x is bigint => x !== null) ? out : null;
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

export async function executeLidoMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'submit_eth': {
        const value = BigInt(input.value ?? input.amount ?? '0');
        if (value < 100n) return { success: false, error: 'ETH amount below Lido minimum (100 wei)' };
        const referral = isAddress(input.referral) ? input.referral : ZERO_ADDRESS;
        return {
          success: true,
          output: {
            transactions: [{
              to: STETH,
              data: encodeFunctionData({ abi: STETH_ABI, functionName: 'submit', args: [referral] }),
              value: `0x${value.toString(16)}`,
              chain_id: 1,
              description: `Stake ${value} wei ETH in Lido to receive stETH`,
            }],
            value: value.toString(),
            referral,
            note: 'ETH is sent as the tx value. Receive stETH at the same address.',
          },
        };
      }

      case 'wrap_steth_to_wsteth': {
        const amount = BigInt(input.amount ?? input._stETHAmount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount is required' };
        return {
          success: true,
          output: {
            transactions: [
              {
                to: STETH,
                data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [WSTETH, amount] }),
                value: '0x0',
                chain_id: 1,
                description: `Approve ${amount} stETH to wstETH contract`,
              },
              {
                to: WSTETH,
                data: encodeFunctionData({ abi: WSTETH_ABI, functionName: 'wrap', args: [amount] }),
                value: '0x0',
                chain_id: 1,
                description: `Wrap ${amount} stETH to wstETH`,
              },
            ],
            approvals: [{ token: STETH, spender: WSTETH, amount: amount.toString() }],
            amount: amount.toString(),
          },
        };
      }

      case 'unwrap_wsteth_to_steth': {
        const amount = BigInt(input.amount ?? input._wstETHAmount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount is required' };
        return {
          success: true,
          output: {
            transactions: [{
              to: WSTETH,
              data: encodeFunctionData({ abi: WSTETH_ABI, functionName: 'unwrap', args: [amount] }),
              value: '0x0',
              chain_id: 1,
              description: `Unwrap ${amount} wstETH to stETH`,
            }],
            amount: amount.toString(),
          },
        };
      }

      case 'preview_wrap': {
        const amount = BigInt(input.amount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount is required' };
        const c = getClient();
        const result = await c.readContract({ address: WSTETH, abi: WSTETH_ABI, functionName: 'getWstETHByStETH', args: [amount] });
        return { success: true, output: { steth_in: amount.toString(), wsteth_out: result.toString() } };
      }

      case 'preview_unwrap': {
        const amount = BigInt(input.amount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount is required' };
        const c = getClient();
        const result = await c.readContract({ address: WSTETH, abi: WSTETH_ABI, functionName: 'getStETHByWstETH', args: [amount] });
        return { success: true, output: { wsteth_in: amount.toString(), steth_out: result.toString() } };
      }

      case 'request_withdrawal_steth':
      case 'request_withdrawal_wsteth': {
        const owner = input.owner;
        const amounts = toBigints(input.amounts);
        if (!isAddress(owner)) return { success: false, error: 'owner is required (0x...)' };
        if (!amounts) return { success: false, error: 'amounts array is required' };
        const fn = action === 'request_withdrawal_steth' ? 'requestWithdrawals' : 'requestWithdrawalsWstETH';
        const token = action === 'request_withdrawal_steth' ? STETH : WSTETH;
        const totalAmount = amounts.reduce((a, b) => a + b, 0n);
        return {
          success: true,
          output: {
            transactions: [
              {
                to: token,
                data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [WITHDRAWAL_QUEUE, totalAmount] }),
                value: '0x0',
                chain_id: 1,
                description: `Approve ${totalAmount} ${action === 'request_withdrawal_steth' ? 'stETH' : 'wstETH'} to Withdrawal Queue`,
              },
              {
                to: WITHDRAWAL_QUEUE,
                data: encodeFunctionData({ abi: QUEUE_ABI, functionName: fn, args: [amounts, owner] }),
                value: '0x0',
                chain_id: 1,
                description: `Request withdrawal of ${amounts.length} positions`,
              },
            ],
            approvals: [{ token, spender: WITHDRAWAL_QUEUE, amount: totalAmount.toString() }],
            amounts: amounts.map(String),
            owner,
            note: 'Withdrawals take 1-5 days to finalize. Use get_withdrawal_status to track.',
          },
        };
      }

      case 'get_withdrawal_status': {
        const ids = toBigints(input.request_ids ?? input.requestIds);
        if (!ids) return { success: false, error: 'request_ids array is required' };
        const c = getClient();
        const data = await c.readContract({ address: WITHDRAWAL_QUEUE, abi: QUEUE_ABI, functionName: 'getWithdrawalStatus', args: [ids] });
        return { success: true, output: { statuses: normalize(data) } };
      }

      case 'find_checkpoint_hints': {
        const ids = toBigints(input.request_ids ?? input.requestIds);
        if (!ids) return { success: false, error: 'request_ids is required' };
        const first = BigInt(input.first_index ?? input.firstIndex ?? '1');
        const last = BigInt(input.last_index ?? input.lastIndex ?? '1000000000');
        const c = getClient();
        const data = await c.readContract({ address: WITHDRAWAL_QUEUE, abi: QUEUE_ABI, functionName: 'findCheckpointHints', args: [ids, first, last] });
        return { success: true, output: { hints: normalize(data) } };
      }

      case 'claim_withdrawals_to': {
        const ids = toBigints(input.request_ids ?? input.requestIds);
        const hints = toBigints(input.hints);
        const recipient = input.recipient;
        if (!ids || !hints || ids.length !== hints.length) return { success: false, error: 'request_ids and hints (same length) are required' };
        if (!isAddress(recipient)) return { success: false, error: 'recipient is required (0x...)' };
        return {
          success: true,
          output: {
            transactions: [{
              to: WITHDRAWAL_QUEUE,
              data: encodeFunctionData({ abi: QUEUE_ABI, functionName: 'claimWithdrawalsTo', args: [ids, hints, recipient] }),
              value: '0x0',
              chain_id: 1,
              description: `Claim ${ids.length} withdrawal(s) to ${recipient}`,
            }],
            request_ids: ids.map(String),
            hints: hints.map(String),
            recipient,
          },
        };
      }

      case 'get_total_pooled_eth': {
        const c = getClient();
        const data = await c.readContract({ address: STETH, abi: STETH_ABI, functionName: 'getTotalPooledEther' });
        return { success: true, output: { total_pooled_eth: data.toString() } };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: submit_eth, wrap_steth_to_wsteth, unwrap_wsteth_to_steth, preview_wrap, preview_unwrap, request_withdrawal_steth, request_withdrawal_wsteth, get_withdrawal_status, find_checkpoint_hints, claim_withdrawals_to, get_total_pooled_eth` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Lido skill error' };
  }
}
