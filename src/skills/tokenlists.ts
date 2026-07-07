import type { SkillExecutionResult } from '@/types/skill';

export const TOKENLISTS_SKILL_METADATA = {
  name: 'Token Lists',
  description:
    '[ARSENAL-HOSTED ✓] Canonical Ethereum mainnet token registry. ' +
    'Look up tokens by address, resolve symbols to addresses, and verify canonical status. ' +
    'Covers ETH, WETH, USDC, USDT, DAI, USDe, sUSDe, stETH, wstETH. No API key required.',
  category: 'Data & Oracles',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['tokenlists', 'token', 'canonical', 'ethereum', 'mainnet', 'erc20'],
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_token', 'resolve_by_symbol', 'is_canonical'],
        description:
          'get_token: look up token metadata by 0x address. ' +
          'resolve_by_symbol: get address/decimals for a token symbol. ' +
          'is_canonical: verify if an address is a canonical mainnet token.',
      },
      address: { type: 'string', description: 'Token 0x address. Required for get_token, is_canonical.' },
      symbol: { type: 'string', description: 'Token symbol (e.g. USDC, WETH). Required for resolve_by_symbol.' },
    },
  },
  usage_examples: [
    { title: 'Resolve USDC', input: { action: 'resolve_by_symbol', symbol: 'USDC' } },
    { title: 'Look up WETH', input: { action: 'get_token', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' } },
  ],
};

const TOKENS = [
  { chainId: 1, symbol: 'ETH',   name: 'Ether',                              address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, canonical: true },
  { chainId: 1, symbol: 'WETH',  name: 'Wrapped Ether',                      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, canonical: true },
  { chainId: 1, symbol: 'USDC',  name: 'USD Coin',                           address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6,  canonical: true },
  { chainId: 1, symbol: 'USDT',  name: 'Tether USD',                         address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6,  canonical: true },
  { chainId: 1, symbol: 'DAI',   name: 'Dai Stablecoin',                     address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, canonical: true },
  { chainId: 1, symbol: 'USDe',  name: 'USDe',                               address: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', decimals: 18, canonical: true },
  { chainId: 1, symbol: 'sUSDe', name: 'Staked USDe',                        address: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', decimals: 18, canonical: true },
  { chainId: 1, symbol: 'stETH', name: 'Liquid staked Ether 2.0',            address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', decimals: 18, canonical: true },
  { chainId: 1, symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0',   address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', decimals: 18, canonical: true },
  { chainId: 1, symbol: 'WBTC',  name: 'Wrapped BTC',                        address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8,  canonical: true },
  { chainId: 1, symbol: 'LINK',  name: 'ChainLink Token',                    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, canonical: true },
] as const;

function isAddress(v: unknown): boolean {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

export async function executeTokenListsSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_token': {
        if (!isAddress(input.address)) return { success: false, error: 'address is required (0x...)' };
        const token = TOKENS.find((t) => t.address.toLowerCase() === input.address.toLowerCase());
        return { success: true, output: (token ?? null) as Record<string, any> };
      }

      case 'resolve_by_symbol': {
        if (!input.symbol) return { success: false, error: 'symbol is required' };
        const matches = TOKENS.filter((t) => t.symbol.toLowerCase() === input.symbol.toLowerCase());
        if (matches.length > 1) return { success: false, error: `Symbol "${input.symbol}" is ambiguous: ${matches.map((m) => m.address).join(', ')}` };
        return { success: true, output: (matches[0] ?? null) as Record<string, any> };
      }

      case 'is_canonical': {
        if (!isAddress(input.address)) return { success: false, error: 'address is required (0x...)' };
        const token = TOKENS.find((t) => t.address.toLowerCase() === input.address.toLowerCase());
        if (!token) return { success: false, error: 'Address is not in the canonical mainnet token list' };
        return { success: true, output: { canonical: token.canonical, token: { ...token } } };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_token, resolve_by_symbol, is_canonical` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Token Lists skill error' };
  }
}
