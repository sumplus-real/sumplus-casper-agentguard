import { encodeFunctionData, parseAbi } from 'viem';
import type { SkillExecutionResult } from '@/types/skill';

export const CCTP_MAINNET_SKILL_METADATA = {
  name: 'CCTP Bridge',
  description:
    '[ARSENAL-HOSTED ✓] Circle Cross-Chain Transfer Protocol (CCTP) — burn USDC on source chain, mint on destination. ' +
    'Supports Ethereum, Arbitrum, Optimism, Base, Avalanche, Polygon. ' +
    'Build deposit_for_burn tx, fetch Circle attestation, build receive_message tx. ' +
    'No API key required.',
  category: 'Bridge',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['cctp', 'circle', 'usdc', 'bridge', 'cross-chain', 'ethereum', 'arbitrum', 'optimism', 'base', 'avalanche', 'polygon'],
  external_url: 'https://www.circle.com/en/cross-chain-transfer-protocol',
  logo_url: 'https://icons.llamao.fi/icons/protocols/circle?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_supported_chains', 'deposit_for_burn', 'get_attestation', 'receive_message'],
        description:
          'get_supported_chains: list chains with domain IDs, TokenMessenger/MessageTransmitter addresses, and native USDC addresses. ' +
          'deposit_for_burn: build [approve USDC + depositForBurn] txs on source chain (requires source_chain, destination_chain, amount, recipient, sender). ' +
          'get_attestation: fetch Circle attestation by message_hash (requires message_hash; returns attestation hex + status). ' +
          'receive_message: build receiveMessage tx on destination chain (requires destination_chain, message, attestation).',
      },
      source_chain:      { type: 'string', description: 'Source chain key: ethereum | arbitrum | optimism | base | avalanche | polygon.' },
      destination_chain: { type: 'string', description: 'Destination chain key: ethereum | arbitrum | optimism | base | avalanche | polygon.' },
      amount:            { type: 'string', description: 'USDC amount in smallest unit (6 decimals, e.g. "1000000" = 1 USDC).' },
      recipient:         { type: 'string', description: 'Recipient address on destination chain (0x...).' },
      sender:            { type: 'string', description: 'Sender address on source chain (0x...). Used as onBehalfOf in approval.' },
      message_hash:      { type: 'string', description: 'Keccak256 hash of the MessageSent event bytes (0x + 64 hex chars). Emitted by the source chain MessageTransmitter.' },
      message:           { type: 'string', description: 'Raw message bytes hex (from MessageSent event log data). Required for receive_message.' },
      attestation:       { type: 'string', description: 'Circle attestation hex (from get_attestation). Required for receive_message.' },
    },
  },
  usage_examples: [
    { title: 'Get supported chains', input: { action: 'get_supported_chains' } },
    { title: 'Bridge USDC ETH → Arb', input: { action: 'deposit_for_burn', source_chain: 'ethereum', destination_chain: 'arbitrum', amount: '1000000', recipient: '0xYourAddress', sender: '0xYourAddress' } },
    { title: 'Fetch attestation', input: { action: 'get_attestation', message_hash: '0x...' } },
    { title: 'Receive on Arbitrum', input: { action: 'receive_message', destination_chain: 'arbitrum', message: '0x...', attestation: '0x...' } },
  ],
};

type ChainKey = 'ethereum' | 'arbitrum' | 'optimism' | 'base' | 'avalanche' | 'polygon';

const CHAINS: Record<ChainKey, {
  name: string; chainId: number; domain: number;
  tokenMessenger: `0x${string}`; messageTransmitter: `0x${string}`; usdc: `0x${string}`;
}> = {
  ethereum: {
    name: 'Ethereum', chainId: 1, domain: 0,
    tokenMessenger:     '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
    messageTransmitter: '0x0a992d191DEeC32aFe36203Ad87D7d289a738F81',
    usdc:               '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  avalanche: {
    name: 'Avalanche', chainId: 43114, domain: 1,
    tokenMessenger:     '0x6B25532e1060CE10cc3B0A99e5683b91BFDe6982',
    messageTransmitter: '0x8186359aF5F57FbB40c6b14A588d2A59C0C29880',
    usdc:               '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  },
  optimism: {
    name: 'Optimism', chainId: 10, domain: 2,
    tokenMessenger:     '0x2B4069517957735bE00ceE0fadAE88a26365528f',
    messageTransmitter: '0x4D41f22c5a0e5c74090899E5a8Fb597a8842b3e8',
    usdc:               '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
  arbitrum: {
    name: 'Arbitrum', chainId: 42161, domain: 3,
    tokenMessenger:     '0x19330d10D9Cc8751218eaf51E8885D058642E08A',
    messageTransmitter: '0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca',
    usdc:               '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  base: {
    name: 'Base', chainId: 8453, domain: 6,
    tokenMessenger:     '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962',
    messageTransmitter: '0xAD09780d193884d503182aD4588450C416D6F9D4',
    usdc:               '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  polygon: {
    name: 'Polygon', chainId: 137, domain: 7,
    tokenMessenger:     '0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE',
    messageTransmitter: '0xF3be9355363857F3e001be68856A2f96b4C39Ba9',
    usdc:               '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
};

const TOKEN_MESSENGER_ABI = parseAbi([
  'function depositForBurn(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken) returns (uint64 nonce)',
]);
const MESSAGE_TRANSMITTER_ABI = parseAbi([
  'function receiveMessage(bytes message,bytes attestation) returns (bool)',
]);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

const CIRCLE_ATTESTATION_API = 'https://iris-api.circle.com/v1/attestations';

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function isHex(v: unknown): boolean {
  return typeof v === 'string' && /^0x[a-fA-F0-9]*$/.test(v);
}

function padAddressToBytes32(addr: string): `0x${string}` {
  return `0x${'0'.repeat(24)}${addr.slice(2).toLowerCase()}` as `0x${string}`;
}

export async function executeCctpMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_supported_chains': {
        const chains = Object.entries(CHAINS).map(([key, c]) => ({
          key,
          name: c.name,
          chainId: c.chainId,
          domain: c.domain,
          tokenMessenger: c.tokenMessenger,
          messageTransmitter: c.messageTransmitter,
          usdc: c.usdc,
        }));
        return { success: true, output: { chains } };
      }

      case 'deposit_for_burn': {
        const srcKey = (input.source_chain ?? '').toLowerCase() as ChainKey;
        const dstKey = (input.destination_chain ?? '').toLowerCase() as ChainKey;
        const src = CHAINS[srcKey];
        const dst = CHAINS[dstKey];
        if (!src) return { success: false, error: `Unknown source_chain "${input.source_chain}". Use: ${Object.keys(CHAINS).join(', ')}` };
        if (!dst) return { success: false, error: `Unknown destination_chain "${input.destination_chain}". Use: ${Object.keys(CHAINS).join(', ')}` };
        if (srcKey === dstKey) return { success: false, error: 'source_chain and destination_chain must be different' };

        const amount = BigInt(input.amount ?? '0');
        if (amount === 0n) return { success: false, error: 'amount must be > 0 (in USDC smallest unit, 6 decimals)' };

        const recipient = input.recipient;
        const sender = input.sender;
        if (!isAddress(recipient)) return { success: false, error: 'recipient address is required (0x...)' };
        if (!isAddress(sender)) return { success: false, error: 'sender address is required (0x...)' };

        const mintRecipient = padAddressToBytes32(recipient);

        return {
          success: true,
          output: {
            transactions: [
              {
                to: src.usdc,
                data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [src.tokenMessenger, amount] }),
                value: '0x0',
                chain_id: src.chainId,
                description: `Approve ${amount} USDC to CCTP TokenMessenger on ${src.name}`,
              },
              {
                to: src.tokenMessenger,
                data: encodeFunctionData({
                  abi: TOKEN_MESSENGER_ABI,
                  functionName: 'depositForBurn',
                  args: [amount, dst.domain, mintRecipient, src.usdc],
                }),
                value: '0x0',
                chain_id: src.chainId,
                description: `Burn ${amount} USDC on ${src.name} → mint on ${dst.name}`,
              },
            ],
            approvals: [{ token: src.usdc, spender: src.tokenMessenger, amount: amount.toString() }],
            source_chain: srcKey,
            destination_chain: dstKey,
            amount: amount.toString(),
            recipient,
            destination_domain: dst.domain,
            note: 'After broadcast, get the MessageSent event log data (keccak256 hash) and call get_attestation. Then call receive_message on destination.',
          },
        };
      }

      case 'get_attestation': {
        const messageHash = input.message_hash;
        if (!isHex(messageHash) || messageHash.length !== 66) {
          return { success: false, error: 'message_hash must be a 0x-prefixed 32-byte hex (66 chars total)' };
        }
        const r = await fetch(`${CIRCLE_ATTESTATION_API}/${messageHash}`);
        const data = await r.json();
        if (!r.ok) return { success: false, error: `Circle API error ${r.status}: ${JSON.stringify(data)}` };
        return { success: true, output: data };
      }

      case 'receive_message': {
        const dstKey = (input.destination_chain ?? '').toLowerCase() as ChainKey;
        const dst = CHAINS[dstKey];
        if (!dst) return { success: false, error: `Unknown destination_chain "${input.destination_chain}". Use: ${Object.keys(CHAINS).join(', ')}` };

        const message = input.message;
        const attestation = input.attestation;
        if (!isHex(message)) return { success: false, error: 'message must be a hex string (0x...) from the MessageSent event' };
        if (!isHex(attestation)) return { success: false, error: 'attestation must be a hex string (0x...) from get_attestation' };

        return {
          success: true,
          output: {
            transactions: [{
              to: dst.messageTransmitter,
              data: encodeFunctionData({
                abi: MESSAGE_TRANSMITTER_ABI,
                functionName: 'receiveMessage',
                args: [message as `0x${string}`, attestation as `0x${string}`],
              }),
              value: '0x0',
              chain_id: dst.chainId,
              description: `Receive and mint USDC on ${dst.name} via CCTP`,
            }],
            destination_chain: dstKey,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_supported_chains, deposit_for_burn, get_attestation, receive_message` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'CCTP skill error' };
  }
}
