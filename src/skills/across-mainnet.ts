import { encodeFunctionData, parseAbi } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';

export const ACROSS_MAINNET_SKILL_METADATA = {
  name: 'Across Protocol Bridge',
  description:
    '[ARSENAL-HOSTED ✓] Across Protocol V3 — fast cross-chain token bridge using an optimistic relayer network. ' +
    'Get quotes (relayer fees), build deposit transactions, and check fill status. ' +
    'Supports Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche. ' +
    'No API key required.',
  category: 'Bridge',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['across', 'bridge', 'cross-chain', 'relayer', 'ethereum', 'arbitrum', 'optimism', 'base', 'polygon'],
  external_url: 'https://across.to',
  logo_url: 'https://icons.llamao.fi/icons/protocols/across?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_supported_routes', 'get_quote', 'deposit', 'get_deposit_status'],
        description:
          'get_supported_routes: list supported origin/destination chains and their SpokePool addresses. ' +
          'get_quote: get relayer fee quote from Across API (requires input_token, output_token, origin_chain_id, destination_chain_id, amount). ' +
          'deposit: build [approve + depositV3] txs on origin SpokePool (requires all depositV3 params + origin_chain_id). ' +
          'get_deposit_status: check if a deposit has been filled (requires deposit_id, origin_chain_id).',
      },
      origin_chain_id:      { type: 'number', description: 'Source chain ID (e.g. 1=Ethereum, 42161=Arbitrum, 10=Optimism, 8453=Base).' },
      destination_chain_id: { type: 'number', description: 'Destination chain ID.' },
      input_token:          { type: 'string', description: 'Input token address on origin chain (0x...).' },
      output_token:         { type: 'string', description: 'Output token address on destination chain (0x...).' },
      amount:               { type: 'string', description: 'Input amount in wei (token smallest unit).' },
      depositor:            { type: 'string', description: 'Depositor address (0x...). Required for deposit.' },
      recipient:            { type: 'string', description: 'Recipient address on destination chain (0x...). Required for deposit.' },
      output_amount:        { type: 'string', description: 'Output amount in wei (inputAmount minus fees; get from get_quote totalRelayFee). Required for deposit.' },
      exclusive_relayer:    { type: 'string', description: 'Exclusive relayer address from get_quote (or zero address for no exclusivity).' },
      quote_timestamp:      { type: 'number', description: 'Unix timestamp from get_quote response.' },
      fill_deadline:        { type: 'number', description: 'Fill deadline unix timestamp (default: quote_timestamp + 21600 = 6 hours).' },
      exclusivity_deadline: { type: 'number', description: 'Exclusivity deadline unix timestamp from get_quote (or 0 for none).' },
      message:              { type: 'string', description: 'Optional cross-chain message bytes (0x for none).' },
      deposit_id:           { type: 'number', description: 'Deposit ID for checking fill status.' },
    },
  },
  usage_examples: [
    { title: 'Get supported routes', input: { action: 'get_supported_routes' } },
    { title: 'Quote USDC ETH → Arb', input: { action: 'get_quote', input_token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', output_token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', origin_chain_id: 1, destination_chain_id: 42161, amount: '1000000' } },
    { title: 'Deposit USDC', input: { action: 'deposit', origin_chain_id: 1, destination_chain_id: 42161, depositor: '0xYour', recipient: '0xYour', input_token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', output_token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', amount: '1000000', output_amount: '990000', exclusive_relayer: '0x0000000000000000000000000000000000000000', quote_timestamp: 1700000000, fill_deadline: 1700021600, exclusivity_deadline: 0 } },
  ],
};

const SPOKE_POOLS: Record<number, { name: string; spokePool: `0x${string}` }> = {
  1:     { name: 'Ethereum', spokePool: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5' },
  10:    { name: 'Optimism', spokePool: '0x6f26Bf09B1C792e3228e5467807a900A503c0281' },
  137:   { name: 'Polygon',  spokePool: '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096' },
  8453:  { name: 'Base',     spokePool: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64' },
  42161: { name: 'Arbitrum', spokePool: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A' },
  43114: { name: 'Avalanche',spokePool: '0x33fCB1d4d63E2e2D893abb3f8E4DaD0a84e8c574' },
  324:   { name: 'zkSync',   spokePool: '0xE0B015E54d54fc84a6cB9B666099560efF0c6B0a' },
  59144: { name: 'Linea',    spokePool: '0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75' },
};

const SPOKE_POOL_ABI = parseAbi([
  'function depositV3(address depositor,address recipient,address inputToken,address outputToken,uint256 inputAmount,uint256 outputAmount,uint256 destinationChainId,address exclusiveRelayer,uint32 quoteTimestamp,uint32 fillDeadline,uint32 exclusivityDeadline,bytes message) payable',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

const ACROSS_API = 'https://app.across.to/api';

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

export async function executeAcrossMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_supported_routes': {
        const routes = Object.entries(SPOKE_POOLS).map(([chainId, info]) => ({
          chainId: Number(chainId),
          name: info.name,
          spokePool: info.spokePool,
        }));
        return {
          success: true,
          output: {
            routes,
            note: 'Any route between these chains is supported. Use get_quote to check fees for a specific token pair.',
          },
        };
      }

      case 'get_quote': {
        const { input_token, output_token, origin_chain_id, destination_chain_id, amount, depositor } = input;
        if (!isAddress(input_token)) return { success: false, error: 'input_token is required (0x...)' };
        if (!isAddress(output_token)) return { success: false, error: 'output_token is required (0x...)' };
        if (!origin_chain_id || !destination_chain_id) return { success: false, error: 'origin_chain_id and destination_chain_id are required' };
        if (!amount) return { success: false, error: 'amount is required (in wei)' };

        const params = new URLSearchParams({
          inputToken: input_token,
          outputToken: output_token,
          originChainId: String(origin_chain_id),
          destinationChainId: String(destination_chain_id),
          amount: String(amount),
        });
        if (depositor && isAddress(depositor)) params.set('depositor', depositor);

        const r = await fetch(`${ACROSS_API}/suggested-fees?${params}`);
        const data = await r.json();
        if (!r.ok) return { success: false, error: `Across API error ${r.status}: ${JSON.stringify(data)}` };

        const totalFee = BigInt(data.totalRelayFee?.total ?? '0');
        const inputAmount = BigInt(amount);
        const outputAmount = inputAmount > totalFee ? inputAmount - totalFee : 0n;

        return {
          success: true,
          output: {
            ...data,
            suggested_output_amount: outputAmount.toString(),
            note: 'Use suggested_output_amount as output_amount in deposit. Use timestamp as quote_timestamp. exclusivityDeadline and exclusiveRelayer are from this response.',
          },
        };
      }

      case 'deposit': {
        const originChainId = input.origin_chain_id;
        const spoke = SPOKE_POOLS[originChainId];
        if (!spoke) return { success: false, error: `Unsupported origin_chain_id ${originChainId}. Supported: ${Object.keys(SPOKE_POOLS).join(', ')}` };

        const depositor = input.depositor;
        const recipient = input.recipient;
        const inputToken = input.input_token;
        const outputToken = input.output_token;
        const inputAmount = BigInt(input.amount ?? '0');
        const outputAmount = BigInt(input.output_amount ?? '0');
        const destinationChainId = BigInt(input.destination_chain_id ?? 0);
        const exclusiveRelayer = input.exclusive_relayer ?? '0x0000000000000000000000000000000000000000';
        const quoteTimestamp = Number(input.quote_timestamp ?? 0);
        const fillDeadline = Number(input.fill_deadline ?? (quoteTimestamp + 21600));
        const exclusivityDeadline = Number(input.exclusivity_deadline ?? 0);
        const message = (input.message ?? '0x') as `0x${string}`;

        if (!isAddress(depositor)) return { success: false, error: 'depositor is required (0x...)' };
        if (!isAddress(recipient)) return { success: false, error: 'recipient is required (0x...)' };
        if (!isAddress(inputToken)) return { success: false, error: 'input_token is required (0x...)' };
        if (!isAddress(outputToken)) return { success: false, error: 'output_token is required (0x...)' };
        if (inputAmount === 0n) return { success: false, error: 'amount must be > 0' };
        if (outputAmount === 0n) return { success: false, error: 'output_amount must be > 0 (use get_quote to compute)' };
        if (destinationChainId === 0n) return { success: false, error: 'destination_chain_id is required' };
        if (!isAddress(exclusiveRelayer)) return { success: false, error: 'exclusive_relayer must be a valid address (use 0x000...000 for none)' };
        if (quoteTimestamp === 0) return { success: false, error: 'quote_timestamp is required (from get_quote response)' };

        const depositData = encodeFunctionData({
          abi: SPOKE_POOL_ABI,
          functionName: 'depositV3',
          args: [
            depositor, recipient, inputToken, outputToken,
            inputAmount, outputAmount, destinationChainId,
            exclusiveRelayer,
            quoteTimestamp, fillDeadline, exclusivityDeadline,
            message,
          ],
        });

        return {
          success: true,
          output: {
            transactions: [
              {
                to: inputToken,
                data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [spoke.spokePool, inputAmount] }),
                value: '0x0',
                chain_id: originChainId,
                description: `Approve ${inputAmount} tokens to Across SpokePool on ${spoke.name}`,
              },
              {
                to: spoke.spokePool,
                data: depositData,
                value: '0x0',
                chain_id: originChainId,
                description: `Deposit ${inputAmount} via Across to chain ${input.destination_chain_id}`,
              },
            ],
            approvals: [{ token: inputToken, spender: spoke.spokePool, amount: inputAmount.toString() }],
            origin_chain_id: originChainId,
            destination_chain_id: input.destination_chain_id,
            input_amount: inputAmount.toString(),
            output_amount: outputAmount.toString(),
          },
        };
      }

      case 'get_deposit_status': {
        const depositId = input.deposit_id;
        const originChainId = input.origin_chain_id;
        if (depositId === undefined || depositId === null) return { success: false, error: 'deposit_id is required' };
        if (!originChainId) return { success: false, error: 'origin_chain_id is required' };

        const r = await fetch(`${ACROSS_API}/deposit/status?originChainId=${originChainId}&depositId=${depositId}`);
        const data = await r.json();
        if (!r.ok) return { success: false, error: `Across API error ${r.status}: ${JSON.stringify(data)}` };
        return { success: true, output: data };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_supported_routes, get_quote, deposit, get_deposit_status` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Across Protocol skill error' };
  }
}
