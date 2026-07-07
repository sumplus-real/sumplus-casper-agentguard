/**
 * Uniswap V4 Mainnet
 *
 * Uniswap V4 — launched on Ethereum mainnet in January 2025.
 * Key architectural changes from V3:
 * - Singleton PoolManager: all pools in one contract (gas efficient)
 * - Hooks: custom logic before/after swap and liquidity events
 * - Flash accounting: optimistic balance tracking, settled at end of tx
 * - Native ETH support: no WETH wrapping needed for ETH pools
 * - PoolKey: pools identified by (currency0, currency1, fee, tickSpacing, hooks)
 */

import { keccak256, encodeAbiParameters, parseAbiParameters, encodeFunctionData, parseAbi } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';
import { getPublicClient } from '@/lib/rpc';

// ─── Contract addresses ───────────────────────────────────────────────────────

const CONTRACTS = {
  poolManager:     '0x000000000004444c5dc75cB358380D2e3dE08A90' as const,
  stateView:       '0x7ffe42c4a5deea5b0fec41c94c136cf115597227' as const,
  // Same UniversalRouter address already used (and verified live) by the Uniswap v3 Mainnet skill —
  // this router accepts both V3_SWAP and V4_SWAP commands. Ground-truth verified via eth_call simulation
  // against the real ETH/HSK V4 pool (2026-07-03) — the previous value here was wrong (unused, display-only).
  universalRouter: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af' as const,
  quoterV4:        '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203' as const,
  positionManager: '0xbD216513d74C8cf14cf4747E6AaE6D4b5b5b91dF' as const,
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const STATE_VIEW_ABI = [
  {
    name: 'getSlot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick',         type: 'int24'   },
      { name: 'protocolFee',  type: 'uint24'  },
      { name: 'lpFee',        type: 'uint24'  },
    ],
  },
  {
    name: 'getLiquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClient() {
  return getPublicClient('ethereum');
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

/**
 * Compute the Uniswap V4 poolId:
 *   keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 * Per the V4 PoolKey struct: all fields packed as (address, address, uint24, int24, address).
 */
function computePoolId(
  currency0:   `0x${string}`,
  currency1:   `0x${string}`,
  fee:         number,
  tickSpacing: number,
  hooks:       `0x${string}`,
): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters('address, address, uint24, int24, address'),
    [currency0, currency1, fee, tickSpacing, hooks],
  );
  return keccak256(encoded);
}

/**
 * Derive hook flags from the hooks address lower bits.
 * Uniswap V4 embeds permission flags in specific bits of the hooks address.
 * Reference: https://github.com/Uniswap/v4-core/blob/main/src/libraries/Hooks.sol
 */
function decodeHookFlags(addr: `0x${string}`): string[] {
  const lower = BigInt(addr) & BigInt('0xFFFF');
  const flags: string[] = [];
  const flagMap: [bigint, string][] = [
    [BigInt(1 << 13), 'BEFORE_INITIALIZE'],
    [BigInt(1 << 12), 'AFTER_INITIALIZE'],
    [BigInt(1 << 11), 'BEFORE_ADD_LIQUIDITY'],
    [BigInt(1 << 10), 'AFTER_ADD_LIQUIDITY'],
    [BigInt(1 <<  9), 'BEFORE_REMOVE_LIQUIDITY'],
    [BigInt(1 <<  8), 'AFTER_REMOVE_LIQUIDITY'],
    [BigInt(1 <<  7), 'BEFORE_SWAP'],
    [BigInt(1 <<  6), 'AFTER_SWAP'],
    [BigInt(1 <<  5), 'BEFORE_DONATE'],
    [BigInt(1 <<  4), 'AFTER_DONATE'],
    [BigInt(1 <<  3), 'BEFORE_SWAP_RETURNS_DELTA'],
    [BigInt(1 <<  2), 'AFTER_SWAP_RETURNS_DELTA'],
    [BigInt(1 <<  1), 'AFTER_ADD_LIQUIDITY_RETURNS_DELTA'],
    [BigInt(1 <<  0), 'AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA'],
  ];
  for (const [bit, name] of flagMap) {
    if (lower & bit) flags.push(name);
  }
  return flags;
}

const QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
]);
const ROUTER_ABI = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);

// ─── Action handlers ──────────────────────────────────────────────────────────

async function actionGetProtocolInfo(): Promise<SkillExecutionResult> {
  return {
    success: true,
    output: {
      name: 'Uniswap V4',
      version: 'V4',
      launched: 'January 2025',
      network: 'Ethereum Mainnet',
      chain_id: 1,
      website: 'https://app.uniswap.org',
      docs: 'https://docs.uniswap.org/contracts/v4/overview',
      github: 'https://github.com/Uniswap/v4-core',
      contracts: {
        pool_manager:      CONTRACTS.poolManager,
        state_view:        CONTRACTS.stateView,
        universal_router:  CONTRACTS.universalRouter,
        position_manager:  CONTRACTS.positionManager,
      },
      architecture: {
        singleton_pool_manager: {
          description: 'All pools live in a single PoolManager contract instead of individual pool contracts (like V3). Reduces gas by eliminating inter-contract token transfers.',
          address: CONTRACTS.poolManager,
        },
        hooks: {
          description: 'Arbitrary custom logic can be attached to each pool. Hook contracts run before/after swap, add liquidity, remove liquidity, donate events.',
          permission_model: 'Hook permissions are encoded directly in the hook contract address (specific bits must be set). Immutable once pool is created.',
        },
        flash_accounting: {
          description: 'Balances tracked optimistically throughout a transaction; final settlement happens once at the end via "take" and "settle" calls. Eliminates intermediate token transfers inside complex operations.',
        },
        native_eth: {
          description: 'Pools can use native ETH (address(0)) as a currency. No WETH wrapping needed. ETH-USDC pool can exist directly.',
          eth_currency_address: '0x0000000000000000000000000000000000000000',
        },
        pool_key: {
          description: 'A pool is uniquely identified by its PoolKey: (currency0, currency1, fee, tickSpacing, hooks). PoolId = keccak256(abi.encode(poolKey)).',
          fields: {
            currency0: 'Lower-sort token/ETH address',
            currency1: 'Higher-sort token address',
            fee: 'LP fee in hundredths of a bip (e.g. 3000 = 0.3%)',
            tick_spacing: 'Tick granularity (e.g. 60 for 0.3% pools)',
            hooks: 'Hook contract address (0x0 for no hooks)',
          },
        },
      },
      vs_v3_summary: [
        'V4 uses a single PoolManager contract; V3 deploys one contract per pool',
        'V4 hooks allow custom logic on any pool event; V3 has no hook system',
        'V4 flash accounting settles once per tx; V3 moves tokens on every swap',
        'V4 supports native ETH directly; V3 requires WETH',
        'V4 estimated ~99% gas savings for multi-hop and complex operations',
      ],
      available_actions: [
        'get_protocol_info — V4 architecture overview and contract addresses',
        'get_pool_state — read slot0 (price, tick, fees) and liquidity from StateView',
        'get_protocol_stats — TVL from DefiLlama',
        'get_hook_info — decode hook flags and check code size for a hooks address',
        'swap_exact_input — build a native ETH → ERC20 exact-input swap tx via UniversalRouter (V4_SWAP)',
      ],
    },
  };
}

async function actionGetPoolState(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { currency0, currency1, fee, tick_spacing, hooks = ZERO_ADDRESS } = input;

  if (!isAddress(currency0)) return { success: false, output: { error: 'currency0 must be a valid 0x address' } };
  if (!isAddress(currency1)) return { success: false, output: { error: 'currency1 must be a valid 0x address' } };
  if (fee == null || typeof fee !== 'number') return { success: false, output: { error: 'fee is required (e.g. 3000 for 0.3%)' } };
  if (tick_spacing == null || typeof tick_spacing !== 'number') return { success: false, output: { error: 'tick_spacing is required (e.g. 60 for 0.3% pools)' } };
  if (!isAddress(hooks)) return { success: false, output: { error: 'hooks must be a valid 0x address' } };

  const hooksAddr = hooks as `0x${string}`;
  const c0 = currency0 as `0x${string}`;
  const c1 = currency1 as `0x${string}`;

  try {
    const poolId = computePoolId(c0, c1, fee, tick_spacing, hooksAddr);
    const client = getClient();

    const [slot0, liquidity] = await Promise.all([
      client.readContract({
        address: CONTRACTS.stateView,
        abi: STATE_VIEW_ABI,
        functionName: 'getSlot0',
        args: [poolId],
      }),
      client.readContract({
        address: CONTRACTS.stateView,
        abi: STATE_VIEW_ABI,
        functionName: 'getLiquidity',
        args: [poolId],
      }),
    ]);

    const [sqrtPriceX96, tick, protocolFee, lpFee] = slot0;
    const initialized = sqrtPriceX96 > 0n;

    // sqrtPriceX96 → human-readable price (token1 per token0)
    let price_token1_per_token0: string | null = null;
    if (initialized) {
      const q96 = 2n ** 96n;
      // price = (sqrtPriceX96 / 2^96)^2
      // Use floating point via Number for display (precision sufficient for UI)
      const sqrtPrice = Number(sqrtPriceX96) / Number(q96);
      price_token1_per_token0 = (sqrtPrice * sqrtPrice).toFixed(18);
    }

    return {
      success: true,
      output: {
        pool_key: { currency0: c0, currency1: c1, fee, tick_spacing, hooks: hooksAddr },
        pool_id: poolId,
        state_view: CONTRACTS.stateView,
        initialized,
        slot0: initialized ? {
          sqrt_price_x96: sqrtPriceX96.toString(),
          price_token1_per_token0,
          tick: Number(tick),
          protocol_fee: Number(protocolFee),
          lp_fee: Number(lpFee),
          lp_fee_pct: `${(Number(lpFee) / 10000).toFixed(4)}%`,
        } : null,
        liquidity: liquidity.toString(),
        note: initialized
          ? 'Pool is active. sqrtPriceX96 is the raw price format used by V4 (Q64.96 fixed-point).'
          : 'Pool appears uninitialized (sqrtPriceX96 = 0). Verify the PoolKey parameters.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message ?? 'Failed to read pool state' } };
  }
}

async function actionGetProtocolStats(): Promise<SkillExecutionResult> {
  try {
    // DefiLlama may not have V4 separated from V3 yet; fetch the umbrella uniswap entry
    const [llamaAll, llamaV4] = await Promise.allSettled([
      fetch('https://api.llama.fi/protocol/uniswap', { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
      fetch('https://api.llama.fi/protocol/uniswap-v4', { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
    ]);

    const allData  = llamaAll.status  === 'fulfilled' ? llamaAll.value  : null;
    const v4Data   = llamaV4.status   === 'fulfilled' ? llamaV4.value   : null;

    const hasV4Separate = v4Data && !v4Data.error && v4Data.tvl != null;

    return {
      success: true,
      output: {
        protocol: 'Uniswap V4',
        network: 'Ethereum Mainnet',
        data_source: 'DefiLlama',
        v4_tvl_usd: hasV4Separate ? v4Data.tvl : null,
        all_uniswap_tvl_usd: allData?.tvl ?? null,
        note: hasV4Separate
          ? 'DefiLlama tracks V4 TVL separately.'
          : 'DefiLlama may not yet separate V4 TVL from the combined Uniswap total. "all_uniswap_tvl_usd" covers all Uniswap versions.',
        contracts: {
          pool_manager: CONTRACTS.poolManager,
          state_view:   CONTRACTS.stateView,
        },
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message ?? 'Failed to fetch protocol stats' } };
  }
}

async function actionGetHookInfo(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { hooks_address } = input;
  if (!isAddress(hooks_address)) {
    return { success: false, output: { error: 'hooks_address must be a valid 0x address' } };
  }

  const addr = hooks_address as `0x${string}`;

  if (addr === ZERO_ADDRESS) {
    return {
      success: true,
      output: {
        hooks_address: addr,
        is_zero: true,
        description: 'Zero address — this pool has no hooks attached.',
        flags: [],
      },
    };
  }

  try {
    const client = getClient();
    const bytecode = await client.getBytecode({ address: addr });
    const hasCode = bytecode != null && bytecode !== '0x' && bytecode.length > 2;

    const flags = decodeHookFlags(addr);

    return {
      success: true,
      output: {
        hooks_address: addr,
        is_zero: false,
        has_deployed_code: hasCode,
        bytecode_size_bytes: hasCode ? Math.floor((bytecode!.length - 2) / 2) : 0,
        decoded_flags: flags,
        flags_count: flags.length,
        flags_explanation: [
          'Hook permissions are encoded in the least-significant 14 bits of the hook contract address.',
          'Each set bit grants the hook the right to run at that lifecycle point.',
          'A hook can only implement callbacks whose corresponding flag bit is set in its address.',
          'This is enforced by PoolManager at pool creation time.',
        ],
        flag_reference: {
          BEFORE_INITIALIZE:                    'Runs before a new pool is initialized',
          AFTER_INITIALIZE:                     'Runs after a new pool is initialized',
          BEFORE_ADD_LIQUIDITY:                 'Runs before liquidity is added',
          AFTER_ADD_LIQUIDITY:                  'Runs after liquidity is added',
          BEFORE_REMOVE_LIQUIDITY:              'Runs before liquidity is removed',
          AFTER_REMOVE_LIQUIDITY:               'Runs after liquidity is removed',
          BEFORE_SWAP:                          'Runs before a swap executes',
          AFTER_SWAP:                           'Runs after a swap executes',
          BEFORE_DONATE:                        'Runs before a donation',
          AFTER_DONATE:                         'Runs after a donation',
          BEFORE_SWAP_RETURNS_DELTA:            'Hook can return a delta on before-swap (modify amounts)',
          AFTER_SWAP_RETURNS_DELTA:             'Hook can return a delta on after-swap (modify amounts)',
          AFTER_ADD_LIQUIDITY_RETURNS_DELTA:    'Hook can modify amounts on after-add-liquidity',
          AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA: 'Hook can modify amounts on after-remove-liquidity',
        },
        note: hasCode
          ? `Contract deployed. To audit the hook logic, check Etherscan: https://etherscan.io/address/${addr}`
          : 'No bytecode found at this address. The hook may not be deployed on mainnet.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message ?? 'Failed to inspect hooks address' } };
  }
}

/**
 * Build a native-ETH → ERC20 exact-input swap via UniversalRouter's V4_SWAP command
 * (actions: SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL). Scoped to native ETH input only —
 * ERC20-input swaps would need a proven Permit2/allowance path that hasn't been verified here.
 * Encoding verified 2026-07-03 via eth_call simulation against the real ETH/HSK 1% pool.
 */
async function actionSwapExactInput(input: Record<string, any>): Promise<SkillExecutionResult> {
  const ZERO = ZERO_ADDRESS;
  const { token_out, fee, tick_spacing, hooks = ZERO, amount_in, slippage_bps = 100, sender } = input;
  const tokenOut = token_out as `0x${string}`;

  if (!isAddress(tokenOut) || tokenOut === ZERO) return { success: false, output: { error: 'token_out must be a valid non-zero 0x address (this action only swaps FROM native ETH)' } };
  if (fee == null || typeof fee !== 'number') return { success: false, output: { error: 'fee is required (e.g. 10000 for 1%)' } };
  if (tick_spacing == null || typeof tick_spacing !== 'number') return { success: false, output: { error: 'tick_spacing is required (e.g. 200 for 1% pools)' } };
  if (!isAddress(hooks)) return { success: false, output: { error: 'hooks must be a valid 0x address (use zero address if the pool has no hooks)' } };
  if (!isAddress(sender)) return { success: false, output: { error: 'sender is required' } };
  let amountIn: bigint;
  try { amountIn = BigInt(amount_in); } catch { return { success: false, output: { error: 'amount_in must be a numeric wei string' } }; }
  if (amountIn <= 0n) return { success: false, output: { error: 'amount_in must be > 0' } };

  const hooksAddr = hooks as `0x${string}`;
  // ETH (address 0) always sorts below any ERC20 address, so currency0 = ETH, currency1 = tokenOut.
  const currency0 = ZERO;
  const currency1 = tokenOut;
  const poolKey = { currency0, currency1, fee, tickSpacing: tick_spacing, hooks: hooksAddr };

  try {
    const client = getPublicClient('ethereum');

    const quoteResult = await client.readContract({
      address: CONTRACTS.quoterV4,
      abi: QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{ poolKey, zeroForOne: true, exactAmount: amountIn, hookData: '0x' }],
    }) as unknown as readonly [bigint, bigint];
    const amountOut = quoteResult[0];
    if (amountOut === 0n) return { success: false, output: { error: 'Quoter returned 0 output — pool likely has no liquidity for this pair/fee/tick_spacing/hooks combination' } };

    const amountOutMinimum = (amountOut * BigInt(10_000 - slippage_bps)) / 10_000n;

    const actions = '0x060c0f' as `0x${string}`; // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
    const swapParams = encodeAbiParameters(
      parseAbiParameters('(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData'),
      [poolKey, true, amountIn, amountOutMinimum, '0x'],
    );
    const settleParams = encodeAbiParameters(parseAbiParameters('address currency, uint256 amount'), [currency0, amountIn]);
    const takeParams = encodeAbiParameters(parseAbiParameters('address currency, uint256 amount'), [currency1, amountOutMinimum]);
    const actionsAndParams = encodeAbiParameters(
      parseAbiParameters('bytes actions, bytes[] params'),
      [actions, [swapParams, settleParams, takeParams]],
    );

    const deadline = BigInt(input.tx_deadline ?? Math.floor(Date.now() / 1000) + 1200);
    const data = encodeFunctionData({ abi: ROUTER_ABI, functionName: 'execute', args: ['0x10', [actionsAndParams], deadline] });

    return {
      success: true,
      output: {
        transactions: [{
          to: CONTRACTS.universalRouter,
          data,
          value: `0x${amountIn.toString(16)}`,
          chain_id: 1,
          description: `Uniswap V4: swap ${amountIn} wei ETH → ${tokenOut} (min out ${amountOutMinimum})`,
        }],
        pool_key: poolKey,
        amount_in: amountIn.toString(),
        quoted_amount_out: amountOut.toString(),
        min_amount_out: amountOutMinimum.toString(),
        slippage_bps,
        router: CONTRACTS.universalRouter,
        note: 'Native ETH input only — value field carries the ETH, no token approval needed.',
      },
    };
  } catch (err: any) {
    return { success: false, output: { error: err.message ?? 'Failed to build V4 swap transaction' } };
  }
}

// ─── Metadata & entry point ───────────────────────────────────────────────────

export const UNISWAP_V4_MAINNET_SKILL_METADATA = {
  name: 'Uniswap V4 Mainnet',
  description:
    '[ARSENAL-HOSTED ✓] Uniswap V4 on Ethereum mainnet — singleton PoolManager with hooks. Read pool state, protocol stats, ' +
    'and build native ETH → ERC20 swap transactions via UniversalRouter. New architecture: hooks + flash accounting + native ETH support.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['uniswap', 'uniswap-v4', 'v4', 'dex', 'amm', 'hooks', 'ethereum', 'mainnet', 'swap', 'clarity-act'],
  external_url: 'https://app.uniswap.org',
  logo_url: 'https://icons.llamao.fi/icons/protocols/uniswap?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_protocol_info', 'get_pool_state', 'get_protocol_stats', 'get_hook_info', 'swap_exact_input'],
        description:
          'get_protocol_info: Overview of Uniswap V4 architecture (singleton PoolManager, hooks, flash accounting, native ETH) and mainnet contract addresses. ' +
          'get_pool_state: Read live pool state (price, tick, fees, liquidity) from the StateView contract. Requires currency0, currency1, fee, tick_spacing; hooks defaults to zero address. ' +
          'get_protocol_stats: TVL from DefiLlama for Uniswap V4 (V4-specific data may be combined with other versions). ' +
          'get_hook_info: Inspect a hook contract — decode permission flags encoded in the address and check whether contract code is deployed. ' +
          'swap_exact_input: Build a native ETH → ERC20 exact-input swap tx via UniversalRouter (V4_SWAP command). ETH input only (no ERC20-in support yet — use Uniswap v3 Mainnet or wrap_eth first for ERC20-in swaps). Requires token_out, fee, tick_spacing, amount_in, sender; hooks/slippage_bps/tx_deadline optional.',
      },
      currency0: {
        type: 'string',
        description: 'Lower-sorted token address (0x...) for the pool. Use 0x0000000000000000000000000000000000000000 for native ETH. Required for get_pool_state.',
      },
      currency1: {
        type: 'string',
        description: 'Higher-sorted token address (0x...) for the pool. Required for get_pool_state.',
      },
      fee: {
        type: 'number',
        description: 'Pool LP fee in hundredths of a bip. Common values: 100 (0.01%), 500 (0.05%), 3000 (0.3%), 10000 (1%). Required for get_pool_state.',
      },
      tick_spacing: {
        type: 'number',
        description: 'Tick spacing for the pool. Typically 1 for 0.01%, 10 for 0.05%, 60 for 0.3%, 200 for 1%. Required for get_pool_state.',
      },
      hooks: {
        type: 'string',
        description: 'Hook contract address (0x...) for the pool. Defaults to zero address (no hooks) if omitted. Used for get_pool_state.',
      },
      hooks_address: {
        type: 'string',
        description: 'Hook contract address to inspect (0x...). Required for get_hook_info.',
      },
      token_out: {
        type: 'string',
        description: 'Output ERC20 token address (0x...) for swap_exact_input. Input is always native ETH.',
      },
      amount_in: {
        type: 'string',
        description: 'Exact input amount in wei (native ETH) for swap_exact_input.',
      },
      slippage_bps: {
        type: 'number',
        description: 'Slippage tolerance in basis points for swap_exact_input (default 100 = 1%).',
      },
      sender: {
        type: 'string',
        description: 'Address that will send the transaction (0x...). Required for swap_exact_input.',
      },
      tx_deadline: {
        type: 'number',
        description: 'Unix timestamp deadline for swap_exact_input. Defaults to now + 1200s if omitted.',
      },
    },
  },
};

export async function executeUniswapV4MainnetSkill(input: Record<string, any>): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':  return actionGetProtocolInfo();
      case 'get_pool_state':     return actionGetPoolState(input);
      case 'get_protocol_stats': return actionGetProtocolStats();
      case 'get_hook_info':      return actionGetHookInfo(input);
      case 'swap_exact_input':   return actionSwapExactInput(input);
      default:
        return {
          success: false,
          output: {
            error: `Unknown action: "${action}". Available: get_protocol_info, get_pool_state, get_protocol_stats, get_hook_info, swap_exact_input`,
          },
        };
    }
  } catch (err: any) {
    return { success: false, output: { error: err.message ?? 'Uniswap V4 Mainnet skill error' } };
  }
}
