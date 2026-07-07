import { encodeFunctionData, parseAbi } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';

export const HASHKEY_BRIDGE_SKILL_METADATA = {
  name: 'HashKey Official Bridge',
  description:
    '[ARSENAL-HOSTED ✓] Official canonical HashKey Chain bridge (OP-stack) between Ethereum mainnet (chain 1) and HashKey Chain (chain 177), the bridge behind bridge.hsk.xyz. ' +
    'Build deposit (L1→L2) and withdraw-initiation (L2→L1) transactions for HSK and USDT. ' +
    'HashKey Chain uses HSK as its custom native gas token: HSK is an ERC-20 on Ethereum L1 and the native gas asset on L2, so HSK deposits go through the OptimismPortal (depositERC20Transaction), not the StandardBridge. ' +
    'ETH cannot be bridged through this standard bridge on a custom-gas-token chain. USDT uses the StandardBridge with its canonical L2 mintable token. ' +
    'Deposits land on HashKey within minutes. Withdrawals are a multi-day OP-stack flow; this skill builds only the L2 initiation tx (prove + finalize on L1 happen later). ' +
    'No API key required.',
  category: 'Bridge',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['hashkey', 'hsk', 'bridge', 'cross-chain', 'ethereum', 'l2', 'op-stack'],
  external_url: 'https://bridge.hsk.xyz',
  logo_url: 'https://icons.llamao.fi/icons/chains/rsz_hashkey.jpg',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_chain_info', 'bridge_to_hashkey', 'bridge_from_hashkey'],
        description:
          'get_chain_info: return bridge contract addresses, supported tokens, and the custom-gas-token notes. ' +
          'bridge_to_hashkey: build deposit tx Ethereum mainnet (chain 1) → HashKey (chain 177). ' +
          'bridge_from_hashkey: build withdraw-initiation tx HashKey (chain 177) → Ethereum mainnet (chain 1). ' +
          'HSK deposits return an [approve, deposit] array (approve HSK to the OptimismPortal, then depositERC20Transaction). USDT deposits/withdrawals return an [approve, bridge] array.',
      },
      token: {
        type: 'string',
        description:
          'Token symbol: "hsk" or "usdt" (case-insensitive). The skill resolves the correct L1/L2 address and native-vs-ERC20 handling for each direction.',
      },
      amount: { type: 'string', description: 'Amount in smallest unit (raw). 1 HSK = 1000000000000000000 (18 dec); 1 USDT = 1000000 (6 dec).' },
      sender: { type: 'string', description: 'The transaction originator address (0x...). Required for HSK deposits, where the OptimismPortal needs an explicit L2 recipient and defaults to this address when recipient is omitted.' },
      recipient: { type: 'string', description: 'Optional recipient address on the destination chain (0x...). Defaults to the sender. For USDT the base bridge variant resolves to msg.sender when omitted.' },
      min_gas_limit: { type: 'string', description: 'Optional cross-domain message / L2 execution gas limit. Default 200000.' },
    },
  },
  usage_examples: [
    { title: 'Get chain info', input: { action: 'get_chain_info' } },
    { title: 'Bridge 100 HSK → HashKey', input: { action: 'bridge_to_hashkey', token: 'hsk', amount: '100000000000000000000', sender: '0xYourAddress' } },
    { title: 'Bridge 50 USDT → HashKey', input: { action: 'bridge_to_hashkey', token: 'usdt', amount: '50000000' } },
    { title: 'Withdraw 100 HSK → Ethereum', input: { action: 'bridge_from_hashkey', token: 'hsk', amount: '100000000000000000000' } },
    { title: 'Withdraw 50 USDT → Ethereum', input: { action: 'bridge_from_hashkey', token: 'usdt', amount: '50000000', recipient: '0xYourAddress' } },
  ],
};

// ── Canonical bridge contracts (verified on-chain 2026-07) ───────────────────
const OPTIMISM_PORTAL   = '0xe7Aa79B59CAc06F9706D896a047fEb9d3BDA8bD3' as `0x${string}`; // Ethereum mainnet (HSK gas-token deposits)
const L1_STANDARD_BRIDGE = '0x2171E6d3B7964fA9654Ce41dA8a8fFAff2Cc70be' as `0x${string}`; // Ethereum mainnet (ERC-20 deposits)
const L2_STANDARD_BRIDGE = '0x4200000000000000000000000000000000000010' as `0x${string}`; // HashKey (OP predeploy)

// OP legacy sentinel that the L2StandardBridge treats as the native gas token (HSK) on withdraw.
const LEGACY_ERC20_ETH = '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000' as `0x${string}`;

const CHAIN_ID_ETH     = 1;
const CHAIN_ID_HASHKEY = 177;

const DEFAULT_MIN_GAS_LIMIT = 200000n;

// Per-token resolution.
//  - hsk:  ERC-20 on L1 (0xe7c6...c98a), native gas token on L2. Deposit via OptimismPortal; withdraw via L2 bridge withdraw(LEGACY_ERC20_ETH).
//  - usdt: ERC-20 on both layers, canonical OP-mintable token on L2 (l1Token() -> L1 USDT). Deposit/withdraw via StandardBridge bridgeERC20.
const TOKENS: Record<string, { l1: `0x${string}`; l2: `0x${string}`; decimals: number; gasToken: boolean }> = {
  hsk: {
    l1: '0xe7c6bf469e97eeb0bfb74c8dbff5bd47d4c1c98a' as `0x${string}`, // HSK ERC-20 on Ethereum
    l2: LEGACY_ERC20_ETH,                                              // native gas token on HashKey (withdraw sentinel)
    decimals: 18, gasToken: true,
  },
  usdt: {
    l1: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as `0x${string}`, // Tether USD on Ethereum
    l2: '0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029' as `0x${string}`, // canonical bridged USDT on HashKey
    decimals: 6, gasToken: false,
  },
};

const PORTAL_ABI = parseAbi([
  'function depositERC20Transaction(address _to, uint256 _mint, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes _data)',
]);
const BRIDGE_ABI = parseAbi([
  'function bridgeERC20(address _localToken, address _remoteToken, uint256 _amount, uint32 _minGasLimit, bytes _extraData)',
  'function bridgeERC20To(address _localToken, address _remoteToken, address _to, uint256 _amount, uint32 _minGasLimit, bytes _extraData)',
  'function withdraw(address _l2Token, uint256 _amount, uint32 _minGasLimit, bytes _extraData) payable',
  'function withdrawTo(address _l2Token, address _to, uint256 _amount, uint32 _minGasLimit, bytes _extraData) payable',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}
function hex(amount: bigint): string {
  return `0x${amount.toString(16)}`;
}

function resolveToken(input: any): { sym: string; l1: `0x${string}`; l2: `0x${string}`; decimals: number; gasToken: boolean } | { error: string } {
  const sym = typeof input.token === 'string' ? input.token.toLowerCase() : '';
  const t = TOKENS[sym];
  if (!t) return { error: `Unknown token "${input.token}". Supported: hsk, usdt. (ETH is not bridgeable via the standard bridge on a custom-gas-token chain.)` };
  return { sym, ...t };
}

export async function executeHashKeyBridgeSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_chain_info': {
        return {
          success: true,
          output: {
            bridge: {
              optimism_portal: OPTIMISM_PORTAL,
              l1_standard_bridge: L1_STANDARD_BRIDGE,
              l2_standard_bridge: L2_STANDARD_BRIDGE,
            },
            chains: [
              { name: 'Ethereum', chain_id: CHAIN_ID_ETH, role: 'L1' },
              { name: 'HashKey Chain', chain_id: CHAIN_ID_HASHKEY, role: 'L2' },
            ],
            supported_tokens: Object.fromEntries(
              Object.entries(TOKENS).map(([k, v]) => [k, { l1: v.l1, l2: v.l2, decimals: v.decimals, is_gas_token: v.gasToken }]),
            ),
            notes: [
              'HSK is the native gas token on HashKey Chain (L2) and an ERC-20 (0xe7c6...c98a) on Ethereum (L1).',
              'HSK deposits go through the OptimismPortal (depositERC20Transaction): approve HSK to the portal, then deposit. This mints native HSK on L2.',
              'HSK withdrawals use the L2 StandardBridge withdraw(LEGACY_ERC20_ETH, ...) with the native amount as msg.value.',
              'ETH cannot be bridged through this standard bridge because HashKey uses a custom gas token.',
              'USDT is 6 decimals on both layers and uses the canonical StandardBridge (L2 token 0xF1B5...9029).',
              'Deposits (L1→L2) land on HashKey within minutes.',
              'Withdrawals (L2→L1) are a multi-day OP-stack flow: this skill builds only the L2 initiation tx; you must later prove + finalize on the L1 OptimismPortal.',
            ],
          },
        };
      }

      case 'bridge_to_hashkey': {
        const r = resolveToken(input);
        if ('error' in r) return { success: false, error: r.error };
        const amount = BigInt(input.amount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount must be > 0 (in smallest unit)' };
        const minGas = input.min_gas_limit ? BigInt(input.min_gas_limit) : DEFAULT_MIN_GAS_LIMIT;
        const recipient = input.recipient;
        if (recipient !== undefined && !isAddress(recipient)) return { success: false, error: 'recipient must be a valid 0x address' };
        const sender = input.sender;
        if (sender !== undefined && !isAddress(sender)) return { success: false, error: 'sender must be a valid 0x address' };

        const txs: any[] = [];

        if (r.gasToken) {
          // HSK deposit: approve HSK to the OptimismPortal, then depositERC20Transaction. The portal has no implicit-sender variant, so _to is explicit.
          const to = (isAddress(recipient) ? recipient : sender) as `0x${string}` | undefined;
          if (!to) return { success: false, error: 'HSK deposits need an explicit L2 recipient: provide recipient (or sender).' };
          txs.push({ to: r.l1, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [OPTIMISM_PORTAL, amount] }), value: '0x0', chain_id: CHAIN_ID_ETH, description: `Approve ${amount} HSK to the HashKey OptimismPortal` });
          const data = encodeFunctionData({ abi: PORTAL_ABI, functionName: 'depositERC20Transaction', args: [to, amount, amount, minGas, false, '0x'] });
          txs.push({ to: OPTIMISM_PORTAL, data, value: '0x0', chain_id: CHAIN_ID_ETH, description: `Deposit ${amount} HSK to HashKey (native on L2)` });
        } else {
          // USDT deposit: approve to the L1 StandardBridge, then bridgeERC20 / bridgeERC20To.
          txs.push({ to: r.l1, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [L1_STANDARD_BRIDGE, amount] }), value: '0x0', chain_id: CHAIN_ID_ETH, description: `Approve ${amount} ${r.sym.toUpperCase()} to HashKey Bridge` });
          const data = recipient
            ? encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'bridgeERC20To', args: [r.l1, r.l2, recipient as `0x${string}`, amount, Number(minGas), '0x'] })
            : encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'bridgeERC20', args: [r.l1, r.l2, amount, Number(minGas), '0x'] });
          txs.push({ to: L1_STANDARD_BRIDGE, data, value: '0x0', chain_id: CHAIN_ID_ETH, description: `Deposit ${amount} ${r.sym.toUpperCase()} to HashKey` });
        }

        return {
          success: true,
          output: {
            transactions: txs,
            direction: 'Ethereum mainnet → HashKey Chain',
            token: r.sym, amount: amount.toString(), recipient: recipient ?? sender ?? '(sender)',
            note: 'Execute the transactions in order. Deposit lands on HashKey within minutes.',
          },
        };
      }

      case 'bridge_from_hashkey': {
        const r = resolveToken(input);
        if ('error' in r) return { success: false, error: r.error };
        const amount = BigInt(input.amount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount must be > 0 (in smallest unit)' };
        const minGas = input.min_gas_limit ? BigInt(input.min_gas_limit) : DEFAULT_MIN_GAS_LIMIT;
        const recipient = input.recipient;
        if (recipient !== undefined && !isAddress(recipient)) return { success: false, error: 'recipient must be a valid 0x address' };

        const txs: any[] = [];

        if (r.gasToken) {
          // Native HSK withdraw: withdraw(LEGACY_ERC20_ETH, amount, ...) with msg.value = amount, no approve.
          const data = recipient
            ? encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'withdrawTo', args: [LEGACY_ERC20_ETH, recipient as `0x${string}`, amount, Number(minGas), '0x'] })
            : encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'withdraw', args: [LEGACY_ERC20_ETH, amount, Number(minGas), '0x'] });
          txs.push({ to: L2_STANDARD_BRIDGE, data, value: hex(amount), chain_id: CHAIN_ID_HASHKEY, description: `Initiate withdraw ${amount} HSK to Ethereum` });
        } else {
          // USDT withdraw: approve L2 token to the L2 StandardBridge, then bridgeERC20 / bridgeERC20To (msg.value = 0).
          txs.push({ to: r.l2, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [L2_STANDARD_BRIDGE, amount] }), value: '0x0', chain_id: CHAIN_ID_HASHKEY, description: `Approve ${amount} ${r.sym.toUpperCase()} to HashKey Bridge (L2)` });
          const data = recipient
            ? encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'bridgeERC20To', args: [r.l2, r.l1, recipient as `0x${string}`, amount, Number(minGas), '0x'] })
            : encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'bridgeERC20', args: [r.l2, r.l1, amount, Number(minGas), '0x'] });
          txs.push({ to: L2_STANDARD_BRIDGE, data, value: '0x0', chain_id: CHAIN_ID_HASHKEY, description: `Initiate withdraw ${amount} ${r.sym.toUpperCase()} to Ethereum` });
        }

        return {
          success: true,
          output: {
            transactions: txs,
            direction: 'HashKey Chain → Ethereum mainnet',
            token: r.sym, amount: amount.toString(), recipient: recipient ?? '(sender)',
            bridge: L2_STANDARD_BRIDGE,
            note: 'This is only the L2 withdraw-initiation tx. After the OP-stack challenge period you must prove + finalize the withdrawal on the L1 OptimismPortal before funds arrive on Ethereum.',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_chain_info, bridge_to_hashkey, bridge_from_hashkey` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'HashKey Bridge skill error' };
  }
}
