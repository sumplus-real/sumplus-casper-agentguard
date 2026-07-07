/**
 * EtherFi — Liquid Restaking Protocol on Ethereum
 *
 * EtherFi lets users stake ETH to receive eETH (rebasing liquid restaking token)
 * that earns both ETH validator rewards and EigenLayer restaking rewards.
 * weETH is a non-rebasing wrapped version of eETH suitable for DeFi integrations.
 *
 * Docs: https://docs.ether.fi
 */

import type { SkillExecutionResult } from '@/types/skill';
import { formatUnits } from 'viem';
import { getPublicClient } from '@/lib/rpc';

const CONTRACTS = {
  eETH: '0x35fA164735182de50811E8e2E824cFb9B6118ac2' as const,
  weETH: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee' as const,
  LiquidityPool: '0x308861A430be4cce5502d0A12724771Fc6DaF216' as const,
};

const ERC20_ABI = [
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const LIQUIDITY_POOL_ABI = [
  { name: 'getExchangeRate', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

function getClient() {
  return getPublicClient('ethereum');
}

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'EtherFi',
      type: 'Liquid Restaking Protocol',
      website: 'https://www.ether.fi',
      docs: 'https://docs.ether.fi',
      description: [
        'EtherFi is a non-custodial liquid restaking protocol on Ethereum.',
        'Users stake ETH and receive eETH, a rebasing liquid token that earns both ETH staking rewards and EigenLayer restaking rewards simultaneously.',
        'weETH is a non-rebasing wrapped version of eETH, compatible with DeFi protocols that require stable-balance ERC-20s.',
        'EtherFi also offers a crypto debit card (Cash) that lets users spend yield without selling their staked ETH.',
      ],
      products: {
        eETH: {
          address: CONTRACTS.eETH,
          description: 'Rebasing liquid restaking token. Balance increases as rewards accrue.',
          type: 'Rebasing ERC-20',
        },
        weETH: {
          address: CONTRACTS.weETH,
          description: 'Wrapped eETH, non-rebasing. Price increases vs ETH instead of balance increasing.',
          type: 'Non-rebasing ERC-20',
        },
        Cash: {
          description: 'Crypto debit card — spend yield while keeping principal staked.',
          type: 'Product',
        },
      },
      contracts: {
        eETH: CONTRACTS.eETH,
        weETH: CONTRACTS.weETH,
        LiquidityPool: CONTRACTS.LiquidityPool,
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_eeth_stats — eETH and weETH total supply, TVL from DefiLlama',
        'get_exchange_rate — current eETH/ETH exchange rate from LiquidityPool contract',
        'get_token_balance — check eETH or weETH balance for an address',
      ],
    },
  };
}

async function actionGetEEthStats(): Promise<SkillExecutionResult> {
  try {
    const client = getClient();
    const llamaPromise = fetch('https://api.llama.fi/protocol/ether.fi', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.json())
      .catch(() => null);

    const [eEthSupplyRaw, weEthSupplyRaw, llama] = await Promise.all([
      client.readContract({ address: CONTRACTS.eETH, abi: ERC20_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: CONTRACTS.weETH, abi: ERC20_ABI, functionName: 'totalSupply' }),
      llamaPromise,
    ]);

    const eEthSupply = formatUnits(eEthSupplyRaw, 18);
    const weEthSupply = formatUnits(weEthSupplyRaw, 18);

    return {
      success: true,
      output: {
        eETH: {
          contract: CONTRACTS.eETH,
          total_supply: eEthSupply,
          type: 'Rebasing liquid restaking token',
          note: 'Balance increases as staking and restaking rewards accrue',
        },
        weETH: {
          contract: CONTRACTS.weETH,
          total_supply: weEthSupply,
          type: 'Non-rebasing wrapped eETH',
          note: 'Exchange rate vs ETH increases over time instead of balance',
        },
        tvl_usd: llama?.tvl ?? null,
        chain: 'Ethereum',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetExchangeRate(): Promise<SkillExecutionResult> {
  try {
    const client = getClient();
    const rateRaw = await client.readContract({
      address: CONTRACTS.LiquidityPool,
      abi: LIQUIDITY_POOL_ABI,
      functionName: 'getExchangeRate',
    });

    // getExchangeRate returns eETH per ETH in wei (18 decimals)
    const rateDecimal = parseFloat(formatUnits(rateRaw, 18));

    return {
      success: true,
      output: {
        exchange_rate: rateDecimal,
        interpretation: `1 ETH = ${rateDecimal.toFixed(6)} eETH (in value terms)`,
        source_contract: CONTRACTS.LiquidityPool,
        note: 'Rate increases over time as staking and EigenLayer restaking rewards accumulate. A rate of 1.042 means 1 ETH worth of eETH has grown 4.2% in value.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetTokenBalance(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { address, token = 'eETH' } = input;
  if (!address) return { success: false, output: { error: 'address is required' } };

  const isWeETH = (token as string).toLowerCase().includes('weeth') || (token as string).toLowerCase() === 'weeth';
  const contractAddress = isWeETH ? CONTRACTS.weETH : CONTRACTS.eETH;
  const tokenName = isWeETH ? 'weETH' : 'eETH';

  try {
    const client = getClient();
    const balanceRaw = await client.readContract({
      address: contractAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    return {
      success: true,
      output: {
        address,
        token: tokenName,
        contract: contractAddress,
        balance: formatUnits(balanceRaw, 18),
        note: isWeETH
          ? 'weETH is non-rebasing; value accrues via exchange rate appreciation vs ETH.'
          : 'eETH is rebasing; balance increases automatically as rewards accrue.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const ETHERFI_SKILL_METADATA = {
  name: 'EtherFi',
  description: 'EtherFi liquid restaking — eETH/weETH balances, exchange rates, and TVL. Earn ETH staking + EigenLayer restaking rewards with liquid tokens.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['etherfi', 'eeth', 'weeth', 'liquid-restaking', 'lrt', 'eigenlayer', 'ethereum', 'staking', 'clarity-act'],
  external_url: 'https://www.ether.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/ether.fi?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_eeth_stats', 'get_exchange_rate', 'get_token_balance'],
        description:
          'get_protocol_info: Overview of EtherFi protocol, products (eETH, weETH, Cash debit card), and contract addresses. ' +
          'get_eeth_stats: eETH and weETH total supply on-chain plus TVL from DefiLlama. ' +
          'get_exchange_rate: Current eETH/ETH exchange rate from the LiquidityPool contract (e.g. 1.042 means 1 ETH = 1.042 eETH in value). ' +
          'get_token_balance: Check eETH or weETH balance for an Ethereum address (requires address; token defaults to eETH).',
      },
      address: {
        type: 'string',
        description: 'Ethereum address (0x...). Required for get_token_balance.',
      },
      token: {
        type: 'string',
        enum: ['eETH', 'weETH'],
        description: 'Token to query for get_token_balance. Options: "eETH" (rebasing, default) or "weETH" (non-rebasing wrapped).',
      },
    },
  },
};

export async function executeEtherFiSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info': return actionGetProtocolInfo();
    case 'get_eeth_stats': return actionGetEEthStats();
    case 'get_exchange_rate': return actionGetExchangeRate();
    case 'get_token_balance': return actionGetTokenBalance(input);
    default:
      return {
        success: false,
        output: { error: `Unknown action: ${input.action}. Available: get_protocol_info, get_eeth_stats, get_exchange_rate, get_token_balance` },
      };
  }
}
