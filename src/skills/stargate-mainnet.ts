import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const STARGATE_MAINNET_SKILL_METADATA = {
  name: 'Stargate Bridge',
  description:
    '[ARSENAL-HOSTED ✓] Stargate V2 (LayerZero) — cross-chain token bridge with unified liquidity. ' +
    'Supports ETH, USDC, USDT pools on Ethereum mainnet → Arbitrum, Optimism, Base, Polygon, Avalanche, BSC. ' +
    'Get fee quotes on-chain and build sendToken transactions. ' +
    'No API key required.',
  category: 'Bridge',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['stargate', 'layerzero', 'bridge', 'cross-chain', 'ethereum', 'arbitrum', 'optimism', 'base', 'usdc', 'usdt'],
  external_url: 'https://stargate.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/stargate?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_supported_pools', 'quote_send', 'send_token'],
        description:
          'get_supported_pools: list Stargate V2 pool addresses on Ethereum mainnet and destination endpoint IDs. ' +
          'quote_send: get on-chain fee quote for a cross-chain send (requires pool, dst_eid, to, amount). Returns nativeFee to pass to send_token. ' +
          'send_token: build [approve + sendToken] txs (requires pool, dst_eid, to, amount, min_amount, native_fee, refund_address). For native ETH pool use send instead (set is_eth_pool: true).',
      },
      pool:          { type: 'string', description: 'Stargate pool contract address on source chain (0x...).' },
      dst_eid:       { type: 'number', description: 'Destination LayerZero V2 endpoint ID (e.g. 30110=Arbitrum, 30111=Optimism, 30184=Base, 30109=Polygon, 30106=Avalanche, 30102=BSC).' },
      to:            { type: 'string', description: 'Recipient address on destination chain (0x...). Will be padded to bytes32.' },
      amount:        { type: 'string', description: 'Amount to send in token smallest unit (wei).' },
      min_amount:    { type: 'string', description: 'Minimum amount to receive after slippage. Defaults to 99.5% of amount if not set.' },
      native_fee:    { type: 'string', description: 'LayerZero native fee in wei (from quote_send). Required for send_token.' },
      refund_address:{ type: 'string', description: 'Address to refund excess native fee (0x...). Defaults to `to` address.' },
      is_eth_pool:   { type: 'boolean', description: 'Set true for native ETH pool (uses send() instead of sendToken()). Value = amount + native_fee.' },
    },
  },
  usage_examples: [
    { title: 'Get supported pools', input: { action: 'get_supported_pools' } },
    { title: 'Quote USDC → Arbitrum', input: { action: 'quote_send', pool: '0xc026395860Db2d07ee33e05fE50ed7bD583189C7', dst_eid: 30110, to: '0xYourAddress', amount: '1000000' } },
    { title: 'Send USDC → Arbitrum', input: { action: 'send_token', pool: '0xc026395860Db2d07ee33e05fE50ed7bD583189C7', dst_eid: 30110, to: '0xYourAddress', amount: '1000000', min_amount: '995000', native_fee: '50000000000000', refund_address: '0xYourAddress' } },
  ],
};

// Stargate V2 pools on Ethereum mainnet (source chain = ETH mainnet, chain_id = 1)
const ETH_MAINNET_POOLS: Record<string, { token: string; address: `0x${string}`; decimals: number; isNative: boolean }> = {
  ETH:  { token: 'ETH',  address: '0x77b2043768d28E9C9aB44E1aBfC95944bcE57931', decimals: 18, isNative: true },
  USDC: { token: 'USDC', address: '0xc026395860Db2d07ee33e05fE50ed7bD583189C7', decimals: 6,  isNative: false },
  USDT: { token: 'USDT', address: '0x933597a323Eb81cAe705C5bC29985172fd5A3973', decimals: 6,  isNative: false },
};

const DESTINATION_EIDS: Record<string, { name: string; eid: number }> = {
  arbitrum: { name: 'Arbitrum', eid: 30110 },
  optimism: { name: 'Optimism', eid: 30111 },
  base:     { name: 'Base',     eid: 30184 },
  polygon:  { name: 'Polygon',  eid: 30109 },
  avalanche:{ name: 'Avalanche',eid: 30106 },
  bsc:      { name: 'BSC',      eid: 30102 },
  linea:    { name: 'Linea',    eid: 30183 },
  scroll:   { name: 'Scroll',   eid: 30214 },
  ethereum: { name: 'Ethereum', eid: 30101 },
};

// SendParam tuple: (uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd)
// MessagingFee tuple: (uint256 nativeFee, uint256 lzTokenFee)
const STARGATE_ABI = parseAbi([
  'function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes) sendParam,bool payInLzToken) view returns ((uint256,uint256) msgFee)',
  'function sendToken((uint32,bytes32,uint256,uint256,bytes,bytes,bytes) sendParam,(uint256,uint256) fee,address refundAddress) payable',
  'function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes) sendParam,(uint256,uint256) fee,address refundAddress) payable',
  'function token() view returns (address)',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

function getClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function padAddressToBytes32(addr: string): `0x${string}` {
  return `0x${'0'.repeat(24)}${addr.slice(2).toLowerCase()}` as `0x${string}`;
}

function buildSendParam(dstEid: number, to: string, amountLD: bigint, minAmountLD: bigint): readonly [number, `0x${string}`, bigint, bigint, `0x${string}`, `0x${string}`, `0x${string}`] {
  return [dstEid, padAddressToBytes32(to), amountLD, minAmountLD, '0x', '0x', '0x'];
}

export async function executeStargateMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_supported_pools': {
        return {
          success: true,
          output: {
            source_chain: 'Ethereum Mainnet (chain_id: 1)',
            pools: Object.entries(ETH_MAINNET_POOLS).map(([symbol, p]) => ({
              symbol,
              address: p.address,
              decimals: p.decimals,
              is_native: p.isNative,
            })),
            destinations: Object.entries(DESTINATION_EIDS).map(([key, d]) => ({
              key,
              name: d.name,
              eid: d.eid,
            })),
            note: 'Use pool address as `pool` param. Use destination eid as `dst_eid` param. Call quote_send first to get native_fee, then send_token.',
          },
        };
      }

      case 'quote_send': {
        const poolAddr = input.pool;
        const dstEid = Number(input.dst_eid ?? 0);
        const to = input.to;
        const amountLD = BigInt(input.amount ?? '0');
        const minAmountLD = input.min_amount ? BigInt(input.min_amount) : (amountLD * 995n / 1000n);

        if (!isAddress(poolAddr)) return { success: false, error: 'pool address is required (0x...)' };
        if (!dstEid) return { success: false, error: 'dst_eid is required (LayerZero V2 endpoint ID)' };
        if (!isAddress(to)) return { success: false, error: 'to address is required (0x...)' };
        if (amountLD === 0n) return { success: false, error: 'amount must be > 0' };

        const c = getClient();
        const sendParam = buildSendParam(dstEid, to, amountLD, minAmountLD);

        const [nativeFee, lzTokenFee] = await c.readContract({
          address: poolAddr,
          abi: STARGATE_ABI,
          functionName: 'quoteSend',
          args: [sendParam, false],
        }) as [bigint, bigint];

        return {
          success: true,
          output: {
            native_fee: nativeFee.toString(),
            lz_token_fee: lzTokenFee.toString(),
            pool: poolAddr,
            dst_eid: dstEid,
            amount: amountLD.toString(),
            min_amount: minAmountLD.toString(),
            note: `Pass native_fee (${nativeFee}) to send_token as the tx value for LayerZero messaging fee.`,
          },
        };
      }

      case 'send_token': {
        const poolAddr = input.pool;
        const dstEid = Number(input.dst_eid ?? 0);
        const to = input.to;
        const amountLD = BigInt(input.amount ?? '0');
        const minAmountLD = input.min_amount ? BigInt(input.min_amount) : (amountLD * 995n / 1000n);
        const nativeFee = BigInt(input.native_fee ?? '0');
        const refundAddress = input.refund_address ?? to;
        const isEthPool = Boolean(input.is_eth_pool);

        if (!isAddress(poolAddr)) return { success: false, error: 'pool address is required (0x...)' };
        if (!dstEid) return { success: false, error: 'dst_eid is required' };
        if (!isAddress(to)) return { success: false, error: 'to address is required (0x...)' };
        if (!isAddress(refundAddress)) return { success: false, error: 'refund_address must be a valid address (0x...)' };
        if (amountLD === 0n) return { success: false, error: 'amount must be > 0' };
        if (nativeFee === 0n) return { success: false, error: 'native_fee is required (from quote_send). Cannot be 0.' };

        const sendParam = buildSendParam(dstEid, to, amountLD, minAmountLD);
        const fee: readonly [bigint, bigint] = [nativeFee, 0n];

        if (isEthPool) {
          // Native ETH: send amount + fee as msg.value
          const totalValue = amountLD + nativeFee;
          const sendData = encodeFunctionData({
            abi: STARGATE_ABI,
            functionName: 'send',
            args: [sendParam, fee, refundAddress],
          });
          return {
            success: true,
            output: {
              transactions: [{
                to: poolAddr,
                data: sendData,
                value: `0x${totalValue.toString(16)}`,
                chain_id: 1,
                description: `Send ${amountLD} ETH via Stargate to endpoint ${dstEid} (includes ${nativeFee} LZ fee)`,
              }],
              pool: poolAddr,
              dst_eid: dstEid,
              amount: amountLD.toString(),
              native_fee: nativeFee.toString(),
              total_value: totalValue.toString(),
            },
          };
        }

        // ERC20 token: approve then sendToken (msg.value = nativeFee only)
        const c = getClient();
        let tokenAddr: `0x${string}`;
        try {
          tokenAddr = await c.readContract({ address: poolAddr, abi: STARGATE_ABI, functionName: 'token' }) as `0x${string}`;
        } catch {
          return { success: false, error: 'Could not read token() from pool. If this is a native ETH pool, set is_eth_pool: true.' };
        }

        const sendTokenData = encodeFunctionData({
          abi: STARGATE_ABI,
          functionName: 'sendToken',
          args: [sendParam, fee, refundAddress],
        });

        return {
          success: true,
          output: {
            transactions: [
              {
                to: tokenAddr,
                data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [poolAddr, amountLD] }),
                value: '0x0',
                chain_id: 1,
                description: `Approve ${amountLD} tokens to Stargate pool`,
              },
              {
                to: poolAddr,
                data: sendTokenData,
                value: `0x${nativeFee.toString(16)}`,
                chain_id: 1,
                description: `Send ${amountLD} tokens via Stargate to endpoint ${dstEid}`,
              },
            ],
            approvals: [{ token: tokenAddr, spender: poolAddr, amount: amountLD.toString() }],
            pool: poolAddr,
            token: tokenAddr,
            dst_eid: dstEid,
            amount: amountLD.toString(),
            native_fee: nativeFee.toString(),
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_supported_pools, quote_send, send_token` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Stargate skill error' };
  }
}
