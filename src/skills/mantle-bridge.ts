import { encodeFunctionData, parseAbi } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';

export const MANTLE_BRIDGE_SKILL_METADATA = {
  name: 'Mantle Official Bridge',
  description:
    '[ARSENAL-HOSTED ✓] Official canonical Mantle Bridge (OP-stack StandardBridge) between Ethereum mainnet (chain 1) and Mantle (chain 5000). ' +
    'Build deposit (L1→L2) and withdraw-initiation (L2→L1) transactions for ETH, MNT, USDC and USDT. ' +
    'Handles Mantle\'s native-token asymmetry automatically: MNT is native gas on L2 but an ERC-20 on L1, and ETH is an ERC-20 on L2. ' +
    'Deposits land on Mantle within minutes. Withdrawals are a 7-day OP-stack flow; this skill builds only the L2 initiation tx (prove + finalize on L1 happen later). ' +
    'No API key required.',
  category: 'Bridge',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['mantle', 'bridge', 'cross-chain', 'ethereum', 'l2', 'op-stack', 'mnt'],
  external_url: 'https://bridge.mantle.xyz',
  logo_url: 'https://icons.llamao.fi/icons/chains/rsz_mantle.jpg',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_chain_info', 'bridge_to_mantle', 'bridge_from_mantle'],
        description:
          'get_chain_info: return bridge contract addresses, supported tokens, and the cross-layer asymmetry notes. ' +
          'bridge_to_mantle: build deposit tx Ethereum mainnet (chain 1) → Mantle (chain 5000). ' +
          'bridge_from_mantle: build withdraw-initiation tx Mantle (chain 5000) → Ethereum mainnet (chain 1). ' +
          'For ERC-20-type transfers (MNT-on-L1, ETH-on-L2, USDC, USDT) the result is an [approve, bridge] transactions array to execute in order.',
      },
      token: {
        type: 'string',
        description:
          'Token symbol: "eth", "mnt", "usdc", or "usdt" (case-insensitive). The skill resolves the correct L1/L2 address and native-vs-ERC20 handling for each direction. ' +
          'For an arbitrary canonical-bridged ERC-20, omit this and pass l1_token + l2_token instead.',
      },
      l1_token: { type: 'string', description: 'Advanced: explicit L1 (Ethereum) ERC-20 address for a custom token. Required with l2_token when token symbol is not used.' },
      l2_token: { type: 'string', description: 'Advanced: explicit L2 (Mantle) ERC-20 address for a custom token. Required with l1_token when token symbol is not used.' },
      amount: { type: 'string', description: 'Amount in smallest unit (raw). e.g. 1 MNT/ETH = 1000000000000000000 (18 dec); 1 USDC/USDT = 1000000 (6 dec).' },
      recipient: { type: 'string', description: 'Optional recipient address on the destination chain (0x...). If set, uses the *To bridge variants (also required for smart-contract wallets, since base variants are EOA-only). Defaults to the sender on the destination chain.' },
      min_gas_limit: { type: 'string', description: 'Optional cross-domain message gas limit for finalization. Default 200000.' },
    },
  },
  usage_examples: [
    { title: 'Get chain info', input: { action: 'get_chain_info' } },
    { title: 'Bridge 1 ETH → Mantle', input: { action: 'bridge_to_mantle', token: 'eth', amount: '1000000000000000000' } },
    { title: 'Bridge 100 MNT → Mantle', input: { action: 'bridge_to_mantle', token: 'mnt', amount: '100000000000000000000' } },
    { title: 'Bridge 50 USDC → Mantle', input: { action: 'bridge_to_mantle', token: 'usdc', amount: '50000000' } },
    { title: 'Withdraw 100 MNT → Ethereum', input: { action: 'bridge_from_mantle', token: 'mnt', amount: '100000000000000000000', recipient: '0xYourAddress' } },
    { title: 'Withdraw 1 ETH → Ethereum', input: { action: 'bridge_from_mantle', token: 'eth', amount: '1000000000000000000' } },
  ],
};

// ── Canonical bridge contracts ───────────────────────────────────────────────
const L1_STANDARD_BRIDGE = '0x95fC37A27a2f68e3A647CDc081F0A89bb47c3012' as `0x${string}`; // Ethereum mainnet
const L2_STANDARD_BRIDGE = '0x4200000000000000000000000000000000000010' as `0x${string}`; // Mantle (OP predeploy)

const CHAIN_ID_ETH    = 1;
const CHAIN_ID_MANTLE = 5000;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;
const DEFAULT_MIN_GAS_LIMIT = 200000n;

// Per-token resolution. native:true means use msg.value (no approve) on that layer.
//  - On L1: ETH is native (msg.value), MNT/USDC/USDT are ERC-20 (approve + transferFrom).
//  - On L2: MNT is native (msg.value), ETH(BVM_ETH)/USDC/USDT are ERC-20 (approve + transferFrom).
const TOKENS: Record<string, { l1: `0x${string}`; l2: `0x${string}`; decimals: number; l1Native: boolean; l2Native: boolean }> = {
  eth: {
    l1: ZERO_ADDRESS,                                                       // native ETH on L1
    l2: '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111' as `0x${string}`,      // BVM_ETH (ERC-20, symbol WETH) on L2
    decimals: 18, l1Native: true, l2Native: false,
  },
  mnt: {
    l1: '0x3c3a81e81dc49A522A592e7622A7E711c06bf354' as `0x${string}`,      // MNT ERC-20 on L1
    l2: ZERO_ADDRESS,                                                       // native MNT (gas token) on L2
    decimals: 18, l1Native: false, l2Native: true,
  },
  usdc: {
    l1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
    l2: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9' as `0x${string}`,
    decimals: 6, l1Native: false, l2Native: false,
  },
  usdt: {
    l1: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as `0x${string}`,
    l2: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE' as `0x${string}`,
    decimals: 6, l1Native: false, l2Native: false,
  },
};

const BRIDGE_ABI = parseAbi([
  // L1 deposits
  'function depositETH(uint32 _minGasLimit, bytes _extraData) payable',
  'function depositETHTo(address _to, uint32 _minGasLimit, bytes _extraData) payable',
  'function depositMNT(uint256 _amount, uint32 _minGasLimit, bytes _extraData)',
  'function depositMNTTo(address _to, uint256 _amount, uint32 _minGasLimit, bytes _extraData) payable',
  'function depositERC20(address _l1Token, address _l2Token, uint256 _amount, uint32 _minGasLimit, bytes _extraData)',
  'function depositERC20To(address _l1Token, address _l2Token, address _to, uint256 _amount, uint32 _minGasLimit, bytes _extraData)',
  // L2 withdrawals
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

// Resolve token metadata from symbol, or build a generic ERC-20 descriptor from explicit addresses.
function resolveToken(input: any): { sym: string; l1: `0x${string}`; l2: `0x${string}`; decimals: number | null; l1Native: boolean; l2Native: boolean } | { error: string } {
  const sym = typeof input.token === 'string' ? input.token.toLowerCase() : '';
  if (sym) {
    const t = TOKENS[sym];
    if (!t) return { error: `Unknown token symbol "${input.token}". Supported: eth, mnt, usdc, usdt. For other tokens pass l1_token + l2_token.` };
    return { sym, ...t };
  }
  // Generic ERC-20 path (both addresses required; never native on either layer).
  if (isAddress(input.l1_token) && isAddress(input.l2_token)) {
    return { sym: 'erc20', l1: input.l1_token, l2: input.l2_token, decimals: null, l1Native: false, l2Native: false };
  }
  return { error: 'Provide token (eth|mnt|usdc|usdt) OR both l1_token and l2_token addresses.' };
}

export async function executeMantleBridgeSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_chain_info': {
        return {
          success: true,
          output: {
            bridge: { l1_standard_bridge: L1_STANDARD_BRIDGE, l2_standard_bridge: L2_STANDARD_BRIDGE },
            chains: [
              { name: 'Ethereum', chain_id: CHAIN_ID_ETH, role: 'L1' },
              { name: 'Mantle', chain_id: CHAIN_ID_MANTLE, role: 'L2' },
            ],
            supported_tokens: Object.fromEntries(
              Object.entries(TOKENS).map(([k, v]) => [k, { l1: v.l1, l2: v.l2, decimals: v.decimals, native_on_l1: v.l1Native, native_on_l2: v.l2Native }]),
            ),
            notes: [
              'MNT is the native gas token on Mantle L2 but an ERC-20 on Ethereum L1.',
              'ETH is native on L1 but an ERC-20 (BVM_ETH 0xdEAd...1111, symbol WETH) on Mantle L2.',
              'Deposits (L1→L2) land on Mantle within minutes.',
              'Withdrawals (L2→L1) are a 7-day OP-stack flow: this skill builds only the L2 initiation tx; you must later prove + finalize on the L1 OptimismPortal.',
              'USDC and USDT are 6 decimals on both layers (no 18-decimal trap here).',
            ],
          },
        };
      }

      case 'bridge_to_mantle': {
        const r = resolveToken(input);
        if ('error' in r) return { success: false, error: r.error };
        const amount = BigInt(input.amount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount must be > 0 (in smallest unit)' };
        const minGas = input.min_gas_limit ? BigInt(input.min_gas_limit) : DEFAULT_MIN_GAS_LIMIT;
        const recipient = input.recipient;
        if (recipient !== undefined && !isAddress(recipient)) return { success: false, error: 'recipient must be a valid 0x address' };

        const txs: any[] = [];

        if (r.l1Native) {
          // Native ETH deposit: msg.value = amount, no approve.
          const data = recipient
            ? encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'depositETHTo', args: [recipient as `0x${string}`, Number(minGas), '0x'] })
            : encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'depositETH', args: [Number(minGas), '0x'] });
          txs.push({ to: L1_STANDARD_BRIDGE, data, value: hex(amount), chain_id: CHAIN_ID_ETH, description: `Deposit ${amount} ETH to Mantle` });
        } else if (r.sym === 'mnt') {
          // MNT deposit: approve MNT, then depositMNT (msg.value = 0).
          txs.push({ to: r.l1, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [L1_STANDARD_BRIDGE, amount] }), value: '0x0', chain_id: CHAIN_ID_ETH, description: `Approve ${amount} MNT to Mantle Bridge` });
          const data = recipient
            ? encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'depositMNTTo', args: [recipient as `0x${string}`, amount, Number(minGas), '0x'] })
            : encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'depositMNT', args: [amount, Number(minGas), '0x'] });
          txs.push({ to: L1_STANDARD_BRIDGE, data, value: '0x0', chain_id: CHAIN_ID_ETH, description: `Deposit ${amount} MNT to Mantle` });
        } else {
          // ERC-20 deposit (USDC/USDT/custom): approve, then depositERC20 (msg.value = 0).
          txs.push({ to: r.l1, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [L1_STANDARD_BRIDGE, amount] }), value: '0x0', chain_id: CHAIN_ID_ETH, description: `Approve ${amount} ${r.sym.toUpperCase()} to Mantle Bridge` });
          const data = recipient
            ? encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'depositERC20To', args: [r.l1, r.l2, recipient as `0x${string}`, amount, Number(minGas), '0x'] })
            : encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'depositERC20', args: [r.l1, r.l2, amount, Number(minGas), '0x'] });
          txs.push({ to: L1_STANDARD_BRIDGE, data, value: '0x0', chain_id: CHAIN_ID_ETH, description: `Deposit ${amount} ${r.sym.toUpperCase()} to Mantle` });
        }

        return {
          success: true,
          output: {
            transactions: txs,
            direction: 'Ethereum mainnet → Mantle',
            token: r.sym, amount: amount.toString(), recipient: recipient ?? '(sender)',
            bridge: L1_STANDARD_BRIDGE,
            note: 'Execute the transactions in order. Deposit lands on Mantle within minutes.',
          },
        };
      }

      case 'bridge_from_mantle': {
        const r = resolveToken(input);
        if ('error' in r) return { success: false, error: r.error };
        const amount = BigInt(input.amount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount must be > 0 (in smallest unit)' };
        const minGas = input.min_gas_limit ? BigInt(input.min_gas_limit) : DEFAULT_MIN_GAS_LIMIT;
        const recipient = input.recipient;
        if (recipient !== undefined && !isAddress(recipient)) return { success: false, error: 'recipient must be a valid 0x address' };

        const txs: any[] = [];

        if (r.l2Native) {
          // Native MNT withdraw: _l2Token = address(0), msg.value = amount, no approve.
          const data = recipient
            ? encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'withdrawTo', args: [ZERO_ADDRESS, recipient as `0x${string}`, amount, Number(minGas), '0x'] })
            : encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'withdraw', args: [ZERO_ADDRESS, amount, Number(minGas), '0x'] });
          txs.push({ to: L2_STANDARD_BRIDGE, data, value: hex(amount), chain_id: CHAIN_ID_MANTLE, description: `Initiate withdraw ${amount} MNT to Ethereum` });
        } else {
          // ERC-20-type withdraw (ETH as BVM_ETH, USDC/USDT/custom): approve L2 token, then withdraw (msg.value = 0).
          txs.push({ to: r.l2, data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [L2_STANDARD_BRIDGE, amount] }), value: '0x0', chain_id: CHAIN_ID_MANTLE, description: `Approve ${amount} ${r.sym.toUpperCase()} to Mantle Bridge (L2)` });
          const data = recipient
            ? encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'withdrawTo', args: [r.l2, recipient as `0x${string}`, amount, Number(minGas), '0x'] })
            : encodeFunctionData({ abi: BRIDGE_ABI, functionName: 'withdraw', args: [r.l2, amount, Number(minGas), '0x'] });
          txs.push({ to: L2_STANDARD_BRIDGE, data, value: '0x0', chain_id: CHAIN_ID_MANTLE, description: `Initiate withdraw ${amount} ${r.sym.toUpperCase()} to Ethereum` });
        }

        return {
          success: true,
          output: {
            transactions: txs,
            direction: 'Mantle → Ethereum mainnet',
            token: r.sym, amount: amount.toString(), recipient: recipient ?? '(sender)',
            bridge: L2_STANDARD_BRIDGE,
            note: 'This is only the L2 withdraw-initiation tx. After the ~7-day OP-stack challenge period you must prove + finalize the withdrawal on the L1 OptimismPortal before funds arrive on Ethereum.',
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_chain_info, bridge_to_mantle, bridge_from_mantle` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Mantle Bridge skill error' };
  }
}
