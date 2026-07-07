import type { SkillExecutionResult } from '@/types/skill';
import { formatUnits } from 'viem';
import { getPublicClient } from '@/lib/rpc';

const CONTRACTS = {
  OUSG: '0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92' as const,
  USDY: '0x96F6eF951840721AdBF46Ac996b59E0235CB985C' as const,
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
      name: 'Ondo Finance',
      type: 'Tokenized Real-World Assets (RWA)',
      website: 'https://ondo.finance',
      docs: 'https://docs.ondo.finance',
      description: [
        'Ondo Finance brings institutional-grade US Treasury products on-chain, enabling permissioned and permissionless access to yield-bearing tokenized assets.',
        'OUSG is a tokenized short-term US Treasury ETF backed by BlackRock BUIDL, restricted to accredited investors, yielding ~5% APY.',
        'USDY is a more accessible US Treasury-backed yield-bearing stablecoin backed by Treasuries and bank deposits.',
        'rOUSG is a rebasing version of OUSG designed for on-chain composability.',
        'The ONDO token is the protocol governance token.',
      ],
      products: {
        OUSG: {
          address: CONTRACTS.OUSG,
          description: 'Tokenized short-term US Treasury ETF (BlackRock BUIDL-backed)',
          apy: '~5%',
          access: 'Accredited investors only',
        },
        USDY: {
          address: CONTRACTS.USDY,
          description: 'US Treasury-backed yield-bearing stablecoin',
          backing: 'US Treasuries + bank deposits',
          access: 'More accessible than OUSG',
        },
        rOUSG: { description: 'Rebasing version of OUSG for on-chain DeFi use' },
        ONDO: { description: 'Protocol governance token' },
      },
      available_actions: [
        'get_protocol_info — this overview',
        'get_ousg_stats — OUSG total supply and TVL',
        'get_usdy_stats — USDY total supply, APY, and TVL',
        'get_token_balance — check OUSG or USDY balance for an address',
      ],
    },
  };
}

async function actionGetOUSGStats(): Promise<SkillExecutionResult> {
  try {
    const client = getClient();
    const llamaFetch = fetch('https://api.llama.fi/protocol/ondo-finance', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.json())
      .catch(() => null);

    const [totalSupplyRaw, decimalsRaw, llama] = await Promise.all([
      client.readContract({ address: CONTRACTS.OUSG, abi: ERC20_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: CONTRACTS.OUSG, abi: ERC20_ABI, functionName: 'decimals' }),
      llamaFetch,
    ]);

    const totalSupply = formatUnits(totalSupplyRaw, decimalsRaw);

    return {
      success: true,
      output: {
        token: 'OUSG',
        contract: CONTRACTS.OUSG,
        chain: 'Ethereum',
        total_supply: totalSupply,
        apy: '~5%',
        backing: 'BlackRock BUIDL (short-term US Treasury ETF)',
        access: 'Accredited investors only',
        tvl_usd: llama?.tvl ?? null,
        note: 'OUSG is non-rebasing; yield is reflected in NAV price increase over time.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetUSDYStats(): Promise<SkillExecutionResult> {
  try {
    const client = getClient();
    const llamaFetch = fetch('https://api.llama.fi/protocol/ondo-finance', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.json())
      .catch(() => null);
    const navFetch = fetch('https://api.ondo.finance/v1/yield/usdy', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.json())
      .catch(() => null);

    const [totalSupplyRaw, decimalsRaw, llama, nav] = await Promise.all([
      client.readContract({ address: CONTRACTS.USDY, abi: ERC20_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: CONTRACTS.USDY, abi: ERC20_ABI, functionName: 'decimals' }),
      llamaFetch,
      navFetch,
    ]);

    const totalSupply = formatUnits(totalSupplyRaw, decimalsRaw);

    return {
      success: true,
      output: {
        token: 'USDY',
        contract: CONTRACTS.USDY,
        chain: 'Ethereum',
        total_supply: totalSupply,
        apy: nav?.apy ?? nav?.yield ?? null,
        nav_price: nav?.nav ?? nav?.price ?? null,
        backing: 'US Treasuries + bank deposits',
        access: 'Permissionless (broader access than OUSG)',
        tvl_usd: llama?.tvl ?? null,
        note: 'USDY is yield-bearing; its exchange rate vs USD increases over time.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

async function actionGetTokenBalance(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { address, token = 'USDY' } = input;
  if (!address) return { success: false, output: { error: 'address is required' } };

  const isOUSG = (token as string).toUpperCase() === 'OUSG';
  const contractAddress = isOUSG ? CONTRACTS.OUSG : CONTRACTS.USDY;
  const tokenName = isOUSG ? 'OUSG' : 'USDY';

  try {
    const client = getClient();
    const [balanceRaw, decimalsRaw] = await Promise.all([
      client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] }),
      client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: 'decimals' }),
    ]);
    return {
      success: true,
      output: {
        address,
        token: tokenName,
        contract: contractAddress,
        balance: formatUnits(balanceRaw, decimalsRaw),
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message } };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const ONDO_SKILL_METADATA = {
  name: 'Ondo Finance',
  description: 'Tokenized US Treasury products on Ethereum. Query OUSG (accredited-investor Treasury ETF) and USDY (yield-bearing stablecoin) stats, supplies, and balances.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['ondo', 'rwa', 'ousg', 'usdy', 'treasury', 'tokenized', 'yield', 'stablecoin', 'ethereum', 'clarity-act'],
  external_url: 'https://ondo.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/ondo-finance?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_ousg_stats', 'get_usdy_stats', 'get_token_balance'],
        description:
          'get_protocol_info: Overview of Ondo Finance, its tokenized Treasury products (OUSG, USDY, rOUSG), and governance token. ' +
          'get_ousg_stats: OUSG total supply, TVL, and product details (BlackRock BUIDL-backed Treasury ETF, ~5% APY, accredited investors only). ' +
          'get_usdy_stats: USDY total supply, current APY, NAV price, and TVL (US Treasury-backed yield-bearing stablecoin). ' +
          'get_token_balance: Check OUSG or USDY balance for an Ethereum address (requires address; token defaults to USDY).',
      },
      address: {
        type: 'string',
        description: 'Ethereum address (0x...). Required for get_token_balance.',
      },
      token: {
        type: 'string',
        enum: ['OUSG', 'USDY'],
        description: 'Token to query for get_token_balance. Options: "OUSG" or "USDY". Default: "USDY".',
      },
    },
  },
};

export async function executeOndoSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  switch (input.action) {
    case 'get_protocol_info': return actionGetProtocolInfo();
    case 'get_ousg_stats': return actionGetOUSGStats();
    case 'get_usdy_stats': return actionGetUSDYStats();
    case 'get_token_balance': return actionGetTokenBalance(input);
    default:
      return { success: false, output: { error: `Unknown action: ${input.action}. Available: get_protocol_info, get_ousg_stats, get_usdy_stats, get_token_balance` } };
  }
}
