/**
 * Bedrock Protocol — Multi-Chain BTC/ETH Liquid Staking
 *
 * Bedrock (by RockX) provides liquid staking for BTC (uniBTC) and ETH (uniETH).
 * Stakers receive yield-bearing liquid tokens redeemable 1:1 for the underlying asset.
 *
 * Docs: https://docs.bedrock.technology
 */

import type { SkillExecutionResult } from '@/types/skill';
import { formatUnits } from 'viem';
import { getPublicClient } from '@/lib/rpc';

const CONTRACTS = {
  uniETH: '0xF1376bceF0f78459C0Ed0ba5ddce976F1ddF51F4' as const,
  uniBTC: '0x004E9C3EF86bc1ca1f0bB5C7662861Ee93350568' as const,
  uniETHStaking: '0x4beFa2aA9c305238AA3E0b5D17eB20C045269E9d' as const,
};

const ERC20_ABI = [
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

function getClient() {
  return getPublicClient('ethereum');
}

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Bedrock Protocol',
      type: 'Multi-Chain Liquid Staking',
      website: 'https://bedrock.technology',
      docs: 'https://docs.bedrock.technology',
      developer: 'RockX',
      description: [
        'Bedrock is a liquid staking protocol by RockX supporting BTC, ETH, and other assets.',
        'Stakers receive liquid tokens (uniBTC, uniETH) usable in DeFi while earning staking rewards.',
        'uniBTC is backed by BTC staked through Babylon; uniETH is backed by ETH in Ethereum validators.',
      ],
      tokens: {
        uniETH: { address: CONTRACTS.uniETH, description: 'Liquid staked ETH' },
        uniBTC: { address: CONTRACTS.uniBTC, description: 'Liquid staked BTC (backed by Babylon)' },
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_unibtc_stats — uniBTC total supply and TVL',
        'get_unieth_stats — uniETH total supply and TVL',
        'get_token_balance — check uniBTC or uniETH balance for an address',
      ],
    },
  };
}

async function actionGetUniBTCStats(): Promise<SkillExecutionResult> {
  try {
    const [client, llamaRes] = [
      getClient(),
      fetch('https://api.llama.fi/protocol/bedrock', { signal: AbortSignal.timeout(10_000) }).then(r => r.json()).catch(() => null),
    ];
    const [totalSupplyRaw, decimalsRaw, llama] = await Promise.all([
      client.readContract({ address: CONTRACTS.uniBTC, abi: ERC20_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: CONTRACTS.uniBTC, abi: ERC20_ABI, functionName: 'decimals' }),
      llamaRes,
    ]);
    const totalSupply = formatUnits(totalSupplyRaw, decimalsRaw);
    return {
      success: true,
      output: {
        token: 'uniBTC',
        contract: CONTRACTS.uniBTC,
        chain: 'Ethereum',
        total_supply: totalSupply,
        tvl_usd: llama?.tvl ?? null,
        note: 'uniBTC is pegged 1:1 to BTC and earns Babylon staking rewards',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetUniETHStats(): Promise<SkillExecutionResult> {
  try {
    const [client, llamaRes] = [
      getClient(),
      fetch('https://api.llama.fi/protocol/bedrock', { signal: AbortSignal.timeout(10_000) }).then(r => r.json()).catch(() => null),
    ];
    const [totalSupplyRaw, decimalsRaw, llama] = await Promise.all([
      client.readContract({ address: CONTRACTS.uniETH, abi: ERC20_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: CONTRACTS.uniETH, abi: ERC20_ABI, functionName: 'decimals' }),
      llamaRes,
    ]);
    const totalSupply = formatUnits(totalSupplyRaw, decimalsRaw);
    return {
      success: true,
      output: {
        token: 'uniETH',
        contract: CONTRACTS.uniETH,
        staking_contract: CONTRACTS.uniETHStaking,
        chain: 'Ethereum',
        total_supply: totalSupply,
        tvl_usd: llama?.tvl ?? null,
        note: 'uniETH accrues ETH staking rewards; exchange rate increases over time.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetTokenBalance(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { address, token = 'uniETH' } = input;
  if (!address) return { success: false, output: { error: 'address is required' } };

  const isUniBTC = (token as string).toLowerCase().includes('unibtc') || (token as string).toLowerCase().includes('btc');
  const contractAddress = isUniBTC ? CONTRACTS.uniBTC : CONTRACTS.uniETH;
  const tokenName = isUniBTC ? 'uniBTC' : 'uniETH';

  try {
    const client = getClient();
    const [balanceRaw, decimalsRaw] = await Promise.all([
      client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] }),
      client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: 'decimals' }),
    ]);
    return {
      success: true,
      output: { address, token: tokenName, contract: contractAddress, balance: formatUnits(balanceRaw, decimalsRaw) },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const BEDROCK_SKILL_METADATA = {
  name: 'Bedrock Protocol',
  description: 'Multi-chain liquid staking for BTC (uniBTC via Babylon) and ETH (uniETH) by RockX. Get TVL, supply stats, and token balances.',
  category: 'BTC DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['bedrock', 'unibtc', 'unieth', 'btc', 'eth', 'liquid-staking', 'rockx', 'babylon'],
  external_url: 'https://bedrock.technology',
  logo_url: 'https://icons.llamao.fi/icons/protocols/bedrock?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_unibtc_stats', 'get_unieth_stats', 'get_token_balance'],
        description:
          'get_protocol_info: Overview of Bedrock Protocol and its liquid staking tokens (uniBTC, uniETH). ' +
          'get_unibtc_stats: Total supply and TVL for uniBTC (BTC liquid staking backed by Babylon). ' +
          'get_unieth_stats: Total supply and TVL for uniETH (Ethereum liquid staking). ' +
          'get_token_balance: Check uniBTC or uniETH balance for an Ethereum address (requires address; token defaults to uniETH).',
      },
      address: {
        type: 'string',
        description: 'Ethereum address (0x...). Required for get_token_balance.',
      },
      token: {
        type: 'string',
        enum: ['uniBTC', 'uniETH'],
        description: 'Token to query for get_token_balance. Options: "uniBTC" or "uniETH". Default: "uniETH".',
      },
    },
  },
};

export async function executeBedrockSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info': return actionGetProtocolInfo();
    case 'get_unibtc_stats': return actionGetUniBTCStats();
    case 'get_unieth_stats': return actionGetUniETHStats();
    case 'get_token_balance': return actionGetTokenBalance(input);
    default:
      return { success: false, output: { error: `Unknown action: ${input.action}. Available: get_protocol_info, get_unibtc_stats, get_unieth_stats, get_token_balance` } };
  }
}
