import { createPublicClient, http, encodeFunctionData, parseAbi, type Hex } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const MORPHO_BLUE_MAINNET_SKILL_METADATA = {
  name: 'Morpho Blue Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Morpho Blue on Ethereum mainnet — permissionless lending protocol. ' +
    'List MetaMorpho vaults, get vault details, query market positions, and build supply/borrow/repay transactions. ' +
    'Direct market actions require MarketParams: loanToken, collateralToken, oracle, irm, lltv. ' +
    'Returns unsigned EVM transactions ready for wallet signing.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['morpho', 'lending', 'metamorpho', 'vault', 'defi', 'ethereum', 'mainnet', 'clarity-act'],
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
        enum: [
          'list_metavaults', 'get_vault', 'get_position', 'get_market_params',
          'deposit_to_vault', 'withdraw_from_vault',
          'supply_collateral', 'withdraw_collateral', 'supply', 'withdraw', 'borrow', 'repay',
        ],
        description:
          'list_metavaults: list all MetaMorpho vaults (via Morpho API). ' +
          'get_vault: get vault info (asset, totalAssets, curator). ' +
          'get_position: get user position in a market (requires market_id, account). ' +
          'get_market_params: get market params for a market_id. ' +
          'deposit_to_vault/withdraw_from_vault: MetaMorpho ERC4626 vault operations. ' +
          'supply_collateral/withdraw_collateral/supply/withdraw/borrow/repay: direct Morpho Blue market operations (require market_params).',
      },
      vault:    { type: 'string', description: 'Vault address (0x...).' },
      market_id: { type: 'string', description: 'Morpho market ID (bytes32 hex).' },
      account:  { type: 'string', description: 'User address (0x...).' },
      assets:   { type: 'string', description: 'Asset amount in wei.' },
      shares:   { type: 'string', description: 'Share amount in wei.' },
      receiver: { type: 'string', description: 'Receiver address (0x...).' },
      on_behalf: { type: 'string', description: 'On behalf of address (0x...).' },
      market_params: {
        type: 'object',
        description: 'Market params: { loanToken, collateralToken, oracle, irm, lltv }.',
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
    { title: 'List vaults', input: { action: 'list_metavaults' } },
    { title: 'Get position', input: { action: 'get_position', market_id: '0x...', account: '0x...' } },
    { title: 'Supply collateral', input: { action: 'supply_collateral', market_params: { loanToken: '0x...', collateralToken: '0x...', oracle: '0x...', irm: '0x...', lltv: '770000000000000000' }, assets: '1000000000000000000', on_behalf: '0x...' } },
  ],
};

const MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as `0x${string}`;
const MORPHO_API = 'https://blue-api.morpho.org/graphql';

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
const VAULT_ABI = parseAbi([
  'function deposit(uint256 assets,address receiver) returns (uint256)',
  'function withdraw(uint256 assets,address receiver,address owner) returns (uint256)',
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function curator() view returns (address)',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

type MarketParamsTuple = readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint];

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

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
  } catch {
    return null;
  }
}

export async function executeMorphoBlueMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'list_metavaults': {
        const r = await fetch(MORPHO_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: '{ vaults(first: 50) { items { address name symbol asset { address symbol } state { totalAssets } metadata { curators { name } } } } }' }),
        });
        if (!r.ok) return { success: false, error: `Morpho API error ${r.status}` };
        const data = await r.json();
        return { success: true, output: normalize(data) as Record<string, any> };
      }

      case 'get_vault': {
        const vault = input.vault;
        if (!isAddress(vault)) return { success: false, error: 'vault address is required (0x...)' };
        const c = getClient();
        const [asset, totalAssets, curator] = await Promise.all([
          c.readContract({ address: vault, abi: VAULT_ABI, functionName: 'asset' }),
          c.readContract({ address: vault, abi: VAULT_ABI, functionName: 'totalAssets' }),
          c.readContract({ address: vault, abi: VAULT_ABI, functionName: 'curator' }).catch(() => null),
        ]);
        return { success: true, output: { vault, asset, totalAssets: totalAssets.toString(), curator } };
      }

      case 'get_position':
      case 'get_market_position': {
        const id = input.market_id ?? input.id;
        const account = input.account ?? input.user;
        if (!isBytes32(id)) return { success: false, error: 'market_id must be a bytes32 hex (0x + 64 hex chars)' };
        if (!isAddress(account)) return { success: false, error: 'account is required (0x...)' };
        const c = getClient();
        const data = await c.readContract({ address: MORPHO_BLUE, abi: BLUE_ABI, functionName: 'position', args: [id, account] });
        return { success: true, output: normalize(data) as Record<string, any> };
      }

      case 'get_market_params': {
        const id = input.market_id ?? input.id;
        if (!isBytes32(id)) return { success: false, error: 'market_id must be a bytes32 hex' };
        const c = getClient();
        const data = await c.readContract({ address: MORPHO_BLUE, abi: BLUE_ABI, functionName: 'idToMarketParams', args: [id] });
        return { success: true, output: normalize(data) as Record<string, any> };
      }

      case 'deposit_to_vault': {
        const vault = input.vault;
        const assets = BigInt(input.assets ?? input.amount ?? '0');
        const receiver = input.receiver;
        if (!isAddress(vault)) return { success: false, error: 'vault address is required' };
        if (assets === 0n) return { success: false, error: 'assets must be > 0' };
        if (!isAddress(receiver)) return { success: false, error: 'receiver is required (0x...)' };
        const c = getClient();
        const assetAddr = await c.readContract({ address: vault, abi: VAULT_ABI, functionName: 'asset' });
        return {
          success: true,
          output: {
            transactions: [
              {
                to: assetAddr,
                data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [vault, assets] }),
                value: '0x0',
                chain_id: 1,
                description: `Approve ${assets} tokens to vault`,
              },
              {
                to: vault,
                data: encodeFunctionData({ abi: VAULT_ABI, functionName: 'deposit', args: [assets, receiver] }),
                value: '0x0',
                chain_id: 1,
                description: `Deposit ${assets} to MetaMorpho vault`,
              },
            ],
            approvals: [{ token: assetAddr, spender: vault, amount: assets.toString() }],
            assets: assets.toString(),
            vault,
            receiver,
          },
        };
      }

      case 'withdraw_from_vault': {
        const vault = input.vault;
        const assets = BigInt(input.assets ?? input.amount ?? '0');
        const receiver = input.receiver;
        const owner = input.on_behalf ?? input.owner ?? receiver;
        if (!isAddress(vault) || assets === 0n || !isAddress(receiver) || !isAddress(owner)) {
          return { success: false, error: 'vault, assets, receiver (and optionally on_behalf) are required' };
        }
        return {
          success: true,
          output: {
            transactions: [{
              to: vault,
              data: encodeFunctionData({ abi: VAULT_ABI, functionName: 'withdraw', args: [assets, receiver, owner] }),
              value: '0x0',
              chain_id: 1,
              description: `Withdraw ${assets} from MetaMorpho vault`,
            }],
            assets: assets.toString(),
            vault,
            receiver,
          },
        };
      }

      case 'supply_collateral':
      case 'withdraw_collateral':
      case 'supply':
      case 'withdraw':
      case 'borrow':
      case 'repay': {
        const mp = parseMarketParams(input.market_params);
        if (!mp) return { success: false, error: 'market_params is required: { loanToken, collateralToken, oracle, irm, lltv }' };
        const assets = BigInt(input.assets ?? input.amount ?? '0');
        const shares = BigInt(input.shares ?? '0');
        const onBehalf = input.on_behalf ?? input.onBehalf;
        const receiver = input.receiver ?? onBehalf;
        if (!isAddress(onBehalf)) return { success: false, error: 'on_behalf is required (0x...)' };

        let data: `0x${string}`;
        let description: string;

        if (action === 'supply_collateral') {
          if (assets === 0n) return { success: false, error: 'assets must be > 0 for supply_collateral' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'supplyCollateral', args: [mp, assets, onBehalf, '0x'] });
          description = `Supply ${assets} collateral to Morpho Blue`;
        } else if (action === 'withdraw_collateral') {
          if (!isAddress(receiver)) return { success: false, error: 'receiver is required' };
          if (assets === 0n) return { success: false, error: 'assets must be > 0' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'withdrawCollateral', args: [mp, assets, onBehalf, receiver] });
          description = `Withdraw ${assets} collateral from Morpho Blue`;
        } else if (action === 'supply') {
          if (!isAddress(receiver)) return { success: false, error: 'receiver is required' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'supply', args: [mp, assets, shares, onBehalf, '0x'] });
          description = `Supply to Morpho Blue market`;
        } else if (action === 'withdraw') {
          if (!isAddress(receiver)) return { success: false, error: 'receiver is required' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'withdraw', args: [mp, assets, shares, onBehalf, receiver] });
          description = `Withdraw from Morpho Blue market`;
        } else if (action === 'borrow') {
          if (!isAddress(receiver)) return { success: false, error: 'receiver is required' };
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'borrow', args: [mp, assets, shares, onBehalf, receiver] });
          description = `Borrow from Morpho Blue market`;
        } else {
          data = encodeFunctionData({ abi: BLUE_ABI, functionName: 'repay', args: [mp, assets, shares, onBehalf, '0x'] });
          description = `Repay to Morpho Blue market`;
        }

        const approvals = (action === 'supply' || action === 'repay')
          ? [{ token: mp[0], spender: MORPHO_BLUE, amount: assets.toString() }]
          : action === 'supply_collateral'
          ? [{ token: mp[1], spender: MORPHO_BLUE, amount: assets.toString() }]
          : undefined;

        return {
          success: true,
          output: {
            transactions: [{ to: MORPHO_BLUE, data, value: '0x0', chain_id: 1, description }],
            ...(approvals ? { approvals } : {}),
            market_params: { loanToken: mp[0], collateralToken: mp[1], oracle: mp[2], irm: mp[3], lltv: mp[4].toString() },
            assets: assets.toString(),
            shares: shares.toString(),
            on_behalf: onBehalf,
            receiver,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: list_metavaults, get_vault, get_position, get_market_params, deposit_to_vault, withdraw_from_vault, supply_collateral, withdraw_collateral, supply, withdraw, borrow, repay` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Morpho Blue skill error' };
  }
}
