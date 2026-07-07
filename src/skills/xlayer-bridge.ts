import { encodeFunctionData, parseAbi } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';

export const XLAYER_BRIDGE_SKILL_METADATA = {
  name: 'XLayer Official Bridge',
  description:
    '[ARSENAL-HOSTED ✓] Official OKX XLayer ↔ Ethereum bridge (Polygon CDK PolygonZkEVMBridge). ' +
    'Build bridge transactions for ETH and ERC-20 tokens between Ethereum mainnet (chain 1) and XLayer (chain 196). ' +
    'Deposits are auto-processed by the XLayer bridge service. ' +
    'No API key required.',
  category: 'Bridge',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['xlayer', 'okx', 'bridge', 'cross-chain', 'ethereum', 'l2', 'polygon-cdk'],
  external_url: 'https://web3.okx.com/xlayer/bridge',
  logo_url: 'https://icons.llamao.fi/icons/chains/rsz_x_layer?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_chain_info', 'bridge_to_xlayer', 'bridge_from_xlayer'],
        description:
          'get_chain_info: return bridge contract address, network IDs, and chain details. ' +
          'bridge_to_xlayer: build bridge tx from Ethereum mainnet → XLayer (ETH or ERC-20). ' +
          '  For ETH: set token to 0x0000000000000000000000000000000000000000, amount = wei. ' +
          '  For ERC-20: returns [approve + bridgeAsset] txs. ' +
          'bridge_from_xlayer: build bridge tx from XLayer → Ethereum mainnet (ETH or ERC-20). ' +
          '  Note: after bridging from XLayer, the deposit is auto-claimed on ETH mainnet by the bridge service (no manual claimAsset needed for most transfers).',
      },
      token:   { type: 'string', description: 'Token address on the source chain (0x...). Use 0x0000000000000000000000000000000000000000 for native ETH.' },
      amount:  { type: 'string', description: 'Amount in wei (token smallest unit).' },
      recipient: { type: 'string', description: 'Recipient address on the destination chain (0x...).' },
      force_update_exit_root: { type: 'boolean', description: 'Force global exit root update (default: true). Set false to save gas when multiple bridges batched.' },
    },
  },
  usage_examples: [
    { title: 'Get chain info', input: { action: 'get_chain_info' } },
    { title: 'Bridge ETH → XLayer', input: { action: 'bridge_to_xlayer', token: '0x0000000000000000000000000000000000000000', amount: '1000000000000000000', recipient: '0xYourAddress' } },
    { title: 'Bridge USDC → XLayer', input: { action: 'bridge_to_xlayer', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000', recipient: '0xYourAddress' } },
    { title: 'Bridge ETH back to Ethereum', input: { action: 'bridge_from_xlayer', token: '0x0000000000000000000000000000000000000000', amount: '1000000000000000000', recipient: '0xYourAddress' } },
  ],
};

// PolygonZkEVMBridge deployed at same address on both ETH mainnet and XLayer (standard CDK pattern)
const BRIDGE = '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe' as `0x${string}`;

// CDK network IDs (not EVM chain IDs): L1=0, XLayer L2=1
const NETWORK_ETH     = 0;   // Ethereum mainnet (L1 in bridge terms)
const NETWORK_XLAYER  = 1;   // XLayer (L2 in bridge terms)

const CHAIN_ID_ETH    = 1;
const CHAIN_ID_XLAYER = 196;

const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000' as `0x${string}`;

const BRIDGE_ABI = parseAbi([
  'function bridgeAsset(uint32 destinationNetwork,address destinationAddress,uint256 amount,address token,bool forceUpdateGlobalExitRoot,bytes permitData) payable',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function isNative(addr: string): boolean {
  return addr === NATIVE_TOKEN || addr === '0x' || addr === '';
}

function buildBridgeTxs(
  token: `0x${string}`,
  amount: bigint,
  recipient: string,
  destinationNetwork: number,
  srcChainId: number,
  forceUpdate: boolean,
): any[] {
  const txs: any[] = [];

  // ERC-20: approve bridge first
  if (!isNative(token)) {
    txs.push({
      to: token,
      data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [BRIDGE, amount] }),
      value: '0x0',
      chain_id: srcChainId,
      description: `Approve ${amount} tokens to XLayer Bridge`,
    });
  }

  txs.push({
    to: BRIDGE,
    data: encodeFunctionData({
      abi: BRIDGE_ABI,
      functionName: 'bridgeAsset',
      args: [
        destinationNetwork,
        recipient as `0x${string}`,
        amount,
        token,
        forceUpdate,
        '0x',
      ],
    }),
    value: isNative(token) ? `0x${amount.toString(16)}` : '0x0',
    chain_id: srcChainId,
    description: `Bridge ${isNative(token) ? 'ETH' : 'tokens'} via XLayer Official Bridge (network ${destinationNetwork})`,
  });

  return txs;
}

export async function executeXLayerBridgeSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_chain_info': {
        return {
          success: true,
          output: {
            bridge_contract: BRIDGE,
            note: 'Same bridge contract address on both ETH mainnet and XLayer (Polygon CDK standard).',
            chains: [
              { name: 'Ethereum', evm_chain_id: CHAIN_ID_ETH,    bridge_network_id: NETWORK_ETH,    role: 'L1' },
              { name: 'XLayer',   evm_chain_id: CHAIN_ID_XLAYER,  bridge_network_id: NETWORK_XLAYER,  role: 'L2' },
            ],
            native_token_address: NATIVE_TOKEN,
            auto_claim: 'ETH mainnet → XLayer deposits are auto-claimed by the XLayer bridge service. XLayer → ETH mainnet withdrawals may require a 30-minute challenge period before auto-claim.',
          },
        };
      }

      case 'bridge_to_xlayer': {
        const token = (input.token ?? NATIVE_TOKEN) as `0x${string}`;
        const amount = BigInt(input.amount ?? '0');
        const recipient = input.recipient;
        const forceUpdate = input.force_update_exit_root !== false;

        if (!isAddress(token) && !isNative(token)) return { success: false, error: 'token must be a valid 0x address (or 0x000...000 for native ETH)' };
        if (amount === 0n) return { success: false, error: 'amount must be > 0 (in wei)' };
        if (!isAddress(recipient)) return { success: false, error: 'recipient address is required (0x...)' };

        const txs = buildBridgeTxs(token, amount, recipient, NETWORK_XLAYER, CHAIN_ID_ETH, forceUpdate);

        return {
          success: true,
          output: {
            transactions: txs,
            ...(isNative(token) ? {} : { approvals: [{ token, spender: BRIDGE, amount: amount.toString() }] }),
            direction: 'ETH mainnet → XLayer',
            bridge: BRIDGE,
            destination_network_id: NETWORK_XLAYER,
            amount: amount.toString(),
            recipient,
            note: 'Deposit is auto-claimed on XLayer within minutes by the bridge service.',
          },
        };
      }

      case 'bridge_from_xlayer': {
        const token = (input.token ?? NATIVE_TOKEN) as `0x${string}`;
        const amount = BigInt(input.amount ?? '0');
        const recipient = input.recipient;
        const forceUpdate = input.force_update_exit_root !== false;

        if (!isAddress(token) && !isNative(token)) return { success: false, error: 'token must be a valid 0x address (or 0x000...000 for native ETH)' };
        if (amount === 0n) return { success: false, error: 'amount must be > 0 (in wei)' };
        if (!isAddress(recipient)) return { success: false, error: 'recipient address is required (0x...)' };

        const txs = buildBridgeTxs(token, amount, recipient, NETWORK_ETH, CHAIN_ID_XLAYER, forceUpdate);

        return {
          success: true,
          output: {
            transactions: txs,
            ...(isNative(token) ? {} : { approvals: [{ token, spender: BRIDGE, amount: amount.toString() }] }),
            direction: 'XLayer → ETH mainnet',
            bridge: BRIDGE,
            destination_network_id: NETWORK_ETH,
            amount: amount.toString(),
            recipient,
            note: 'After bridging from XLayer, the claim on ETH mainnet may take ~30 minutes (CDK challenge window). The OKX bridge service auto-submits claimAsset on ETH mainnet.',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_chain_info, bridge_to_xlayer, bridge_from_xlayer` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'XLayer Bridge skill error' };
  }
}
