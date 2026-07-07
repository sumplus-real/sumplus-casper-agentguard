import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import type { SkillExecutionResult } from '@/types/skill';

export const WORMHOLE_MAINNET_SKILL_METADATA = {
  name: 'Wormhole Token Bridge',
  description:
    '[ARSENAL-HOSTED ✓] Wormhole Token Bridge — lock/burn-and-mint cross-chain token bridge. ' +
    'Build transferTokens/wrapAndTransferETH txs on EVM chains, fetch VAAs from Wormhole Scan, ' +
    'and build completeTransfer txs on EVM destination chains. ' +
    'Supports Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche, BSC. ' +
    'For Solana/Sui destinations, returns VAA bytes to submit via platform SDK. No API key required.',
  category: 'Bridge',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['wormhole', 'bridge', 'cross-chain', 'ethereum', 'arbitrum', 'solana', 'sui', 'portal'],
  external_url: 'https://wormhole.com',
  logo_url: 'https://icons.llamao.fi/icons/protocols/wormhole?w=48&h=48',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_supported_chains', 'get_message_fee', 'transfer_tokens', 'transfer_eth', 'get_vaa', 'complete_transfer'],
        description:
          'get_supported_chains: list EVM chains with Wormhole chain IDs and Token Bridge addresses. ' +
          'get_message_fee: read ETH mainnet Core Bridge messageFee() (usually 0). ' +
          'transfer_tokens: build [approve + transferTokens] txs on source chain (requires source_chain, token, amount, recipient_chain, recipient). ' +
          'transfer_eth: build wrapAndTransferETH tx to bridge native ETH (requires amount_wei, recipient_chain, recipient, wormhole_fee). ' +
          'get_vaa: fetch signed VAA bytes from Wormhole Scan (requires tx_hash or chain_id+emitter+sequence). ' +
          'complete_transfer: build completeTransfer tx on destination EVM chain (requires destination_chain, vaa).',
      },
      source_chain:      { type: 'string', description: 'Source EVM chain key: ethereum | arbitrum | optimism | base | polygon | avalanche | bsc.' },
      destination_chain: { type: 'string', description: 'Destination EVM chain key for complete_transfer. For Solana/Sui, use get_vaa and submit via their SDK.' },
      recipient_chain:   { type: 'number', description: 'Wormhole chain ID of the recipient chain (e.g. 2=ETH, 1=Solana, 23=Arbitrum, 21=Sui). See get_supported_chains.' },
      token:             { type: 'string', description: 'ERC-20 token address to bridge (0x...). For native ETH use transfer_eth.' },
      amount:            { type: 'string', description: 'Amount in token smallest unit (wei).' },
      amount_wei:        { type: 'string', description: 'Native ETH amount in wei for transfer_eth.' },
      recipient:         { type: 'string', description: 'Recipient address — for EVM: 0x... address (padded to bytes32 internally); for Solana: base58 pubkey; for Sui: 32-byte hex.' },
      wormhole_fee:      { type: 'string', description: 'Wormhole message fee in wei (from get_message_fee; usually "0"). For transfer_eth add this to msg.value on top of amount.' },
      arbiter_fee:       { type: 'string', description: 'Relayer fee in token units for transfer_tokens (usually "0" for direct bridge).' },
      nonce:             { type: 'number', description: 'Random 32-bit nonce (generated automatically if not provided).' },
      tx_hash:           { type: 'string', description: 'Source transaction hash for get_vaa (0x...).' },
      chain_id:          { type: 'number', description: 'Wormhole chain ID for get_vaa (e.g. 2=ETH).' },
      emitter:           { type: 'string', description: 'Emitter address (Token Bridge address as 0x-prefixed hex) for get_vaa.' },
      sequence:          { type: 'number', description: 'Log sequence number for get_vaa (from TransferTokens tx receipt).' },
      vaa:               { type: 'string', description: 'Signed VAA bytes hex (from get_vaa) for complete_transfer.' },
    },
  },
  usage_examples: [
    { title: 'Get supported chains', input: { action: 'get_supported_chains' } },
    { title: 'Bridge USDC ETH → Arbitrum', input: { action: 'transfer_tokens', source_chain: 'ethereum', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000', recipient_chain: 23, recipient: '0xYourAddress' } },
    { title: 'Bridge ETH → Solana', input: { action: 'transfer_eth', amount_wei: '100000000000000000', recipient_chain: 1, recipient: 'YourSolanaBase58Pubkey', wormhole_fee: '0' } },
    { title: 'Get VAA by tx hash', input: { action: 'get_vaa', tx_hash: '0x...' } },
    { title: 'Complete transfer on Arbitrum', input: { action: 'complete_transfer', destination_chain: 'arbitrum', vaa: '0x...' } },
  ],
};

type EvmChainKey = 'ethereum' | 'arbitrum' | 'optimism' | 'base' | 'polygon' | 'avalanche' | 'bsc';

const EVM_CHAINS: Record<EvmChainKey, {
  name: string; chainId: number; wormholeChainId: number;
  tokenBridge: `0x${string}`; coreBridge: `0x${string}`;
}> = {
  ethereum:  { name: 'Ethereum',  chainId: 1,     wormholeChainId: 2,  tokenBridge: '0x3ee18B2214AFF97000D974cf647E7C347E8fa585', coreBridge: '0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B' },
  arbitrum:  { name: 'Arbitrum',  chainId: 42161, wormholeChainId: 23, tokenBridge: '0x0b2402144Bb366A632D14B83F244D2e0e21bD39c', coreBridge: '0xa5f208e072434bC67592E4C49C1B991BA79BCA46' },
  optimism:  { name: 'Optimism',  chainId: 10,    wormholeChainId: 24, tokenBridge: '0x1D68124e65faFC907325e3EDbF8c4d84499DAa8b', coreBridge: '0xEe91C335eab126dF5fDB3797EA5d45135Beast' },
  base:      { name: 'Base',      chainId: 8453,  wormholeChainId: 30, tokenBridge: '0x8d2de8d2f73F1F4cAB472AC9A881C9b123C79627', coreBridge: '0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6' },
  polygon:   { name: 'Polygon',   chainId: 137,   wormholeChainId: 5,  tokenBridge: '0x5a58505a96D1dbf8dF91cB21B54419FC36e93fdE', coreBridge: '0x7A4B5a56256163F07b2C80A7cA55aBE66c4ec4d7' },
  avalanche: { name: 'Avalanche', chainId: 43114, wormholeChainId: 6,  tokenBridge: '0x0e082F06FF657D94310cB8cE8B0D9a04541d8052', coreBridge: '0x54a8e5f9c4CbA08F9943965859F6c34eAF03E26c' },
  bsc:       { name: 'BSC',       chainId: 56,    wormholeChainId: 4,  tokenBridge: '0xB6F6D86a8f9879A9c87f643768d9efc38c1Da6E7', coreBridge: '0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B' },
};

const NON_EVM_CHAINS = [
  { name: 'Solana',   wormholeChainId: 1,  note: 'Recipient must be base58 pubkey. Complete transfer with @wormhole-foundation/sdk-solana-tokenbridge.' },
  { name: 'Sui',      wormholeChainId: 21, note: 'Recipient must be 32-byte hex. Complete transfer with @wormhole-foundation/sdk-sui-tokenbridge.' },
  { name: 'Aptos',    wormholeChainId: 22, note: 'Use Wormhole Aptos SDK for completeTransfer.' },
];

const TOKEN_BRIDGE_ABI = parseAbi([
  'function transferTokens(address token,uint256 amount,uint16 recipientChain,bytes32 recipient,uint256 arbiterFee,uint32 nonce) payable returns (uint64 sequence)',
  'function wrapAndTransferETH(uint16 recipientChain,bytes32 recipient,uint256 arbiterFee,uint32 nonce) payable returns (uint64 sequence)',
  'function completeTransfer(bytes encodedVm)',
]);
const CORE_BRIDGE_ABI = parseAbi(['function messageFee() view returns (uint256)']);
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);

const WORMHOLE_API = 'https://api.wormholescan.io/api/v1';

function getEthClient() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not configured');
  return createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`) });
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function padToBytes32(addr: string): `0x${string}` {
  const clean = addr.startsWith('0x') ? addr.slice(2) : addr;
  return `0x${'0'.repeat(Math.max(0, 64 - clean.length))}${clean.toLowerCase()}` as `0x${string}`;
}

function recipientToBytes32(recipient: string): `0x${string}` {
  if (/^0x[a-fA-F0-9]{40}$/.test(recipient)) return padToBytes32(recipient);
  if (/^0x[a-fA-F0-9]{64}$/.test(recipient)) return recipient as `0x${string}`;
  // For Solana/Sui: decode base58 or raw hex — callers should pass hex for non-EVM
  return padToBytes32(recipient.startsWith('0x') ? recipient : `0x${Buffer.from(recipient, 'base64').toString('hex')}`);
}

export async function executeWormholeMainnetSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_supported_chains': {
        return {
          success: true,
          output: {
            evm_chains: Object.entries(EVM_CHAINS).map(([key, c]) => ({
              key, name: c.name, chainId: c.chainId,
              wormholeChainId: c.wormholeChainId,
              tokenBridge: c.tokenBridge,
              coreBridge: c.coreBridge,
            })),
            non_evm_chains: NON_EVM_CHAINS,
            note: 'Use wormholeChainId as recipient_chain in transfer_tokens/transfer_eth. For non-EVM destinations, call get_vaa after transfer and submit via the platform SDK.',
          },
        };
      }

      case 'get_message_fee': {
        const c = getEthClient();
        const fee = await c.readContract({
          address: EVM_CHAINS.ethereum.coreBridge,
          abi: CORE_BRIDGE_ABI,
          functionName: 'messageFee',
        });
        return { success: true, output: { message_fee_wei: fee.toString(), note: 'Pass as wormhole_fee parameter.' } };
      }

      case 'transfer_tokens': {
        const srcKey = (input.source_chain ?? '').toLowerCase() as EvmChainKey;
        const src = EVM_CHAINS[srcKey];
        if (!src) return { success: false, error: `Unknown source_chain. Use: ${Object.keys(EVM_CHAINS).join(', ')}` };

        const token = input.token;
        const amount = BigInt(input.amount ?? '0');
        const recipientChain = Number(input.recipient_chain ?? 0);
        const recipient = input.recipient;
        const arbiterFee = BigInt(input.arbiter_fee ?? '0');
        const nonce = Number(input.nonce ?? Math.floor(Math.random() * 0xFFFFFFFF));
        const wormholeFee = BigInt(input.wormhole_fee ?? '0');

        if (!isAddress(token)) return { success: false, error: 'token address is required (0x...)' };
        if (amount === 0n) return { success: false, error: 'amount must be > 0' };
        if (!recipientChain) return { success: false, error: 'recipient_chain (Wormhole chain ID) is required' };
        if (!recipient) return { success: false, error: 'recipient is required' };

        const recipientBytes32 = recipientToBytes32(recipient);
        const feeHex = wormholeFee > 0n ? `0x${wormholeFee.toString(16)}` : '0x0';

        return {
          success: true,
          output: {
            transactions: [
              {
                to: token,
                data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [src.tokenBridge, amount] }),
                value: '0x0',
                chain_id: src.chainId,
                description: `Approve ${amount} tokens to Wormhole Token Bridge`,
              },
              {
                to: src.tokenBridge,
                data: encodeFunctionData({
                  abi: TOKEN_BRIDGE_ABI,
                  functionName: 'transferTokens',
                  args: [token, amount, recipientChain, recipientBytes32, arbiterFee, nonce],
                }),
                value: feeHex,
                chain_id: src.chainId,
                description: `Transfer ${amount} tokens via Wormhole to chain ${recipientChain}`,
              },
            ],
            approvals: [{ token, spender: src.tokenBridge, amount: amount.toString() }],
            source_chain: srcKey,
            recipient_chain: recipientChain,
            note: 'After broadcast, use get_vaa (pass tx_hash) to fetch the signed VAA. Then complete_transfer on destination (EVM) or use platform SDK (Solana/Sui).',
          },
        };
      }

      case 'transfer_eth': {
        const srcKey = ((input.source_chain ?? 'ethereum') as string).toLowerCase() as EvmChainKey;
        const src = EVM_CHAINS[srcKey];
        if (!src) return { success: false, error: `Unknown source_chain. Use: ${Object.keys(EVM_CHAINS).join(', ')}` };

        const amountWei = BigInt(input.amount_wei ?? '0');
        const recipientChain = Number(input.recipient_chain ?? 0);
        const recipient = input.recipient;
        const wormholeFee = BigInt(input.wormhole_fee ?? '0');
        const arbiterFee = BigInt(input.arbiter_fee ?? '0');
        const nonce = Number(input.nonce ?? Math.floor(Math.random() * 0xFFFFFFFF));

        if (amountWei === 0n) return { success: false, error: 'amount_wei must be > 0' };
        if (!recipientChain) return { success: false, error: 'recipient_chain (Wormhole chain ID) is required' };
        if (!recipient) return { success: false, error: 'recipient is required' };

        const recipientBytes32 = recipientToBytes32(recipient);
        const totalValue = amountWei + wormholeFee;

        return {
          success: true,
          output: {
            transactions: [{
              to: src.tokenBridge,
              data: encodeFunctionData({
                abi: TOKEN_BRIDGE_ABI,
                functionName: 'wrapAndTransferETH',
                args: [recipientChain, recipientBytes32, arbiterFee, nonce],
              }),
              value: `0x${totalValue.toString(16)}`,
              chain_id: src.chainId,
              description: `Bridge ${amountWei} wei ETH via Wormhole to chain ${recipientChain} (includes ${wormholeFee} fee)`,
            }],
            source_chain: srcKey,
            amount_wei: amountWei.toString(),
            wormhole_fee: wormholeFee.toString(),
            total_value: totalValue.toString(),
            recipient_chain: recipientChain,
            note: 'After broadcast, use get_vaa (pass tx_hash) to fetch the signed VAA.',
          },
        };
      }

      case 'get_vaa': {
        const txHash = input.tx_hash;
        if (txHash) {
          // Lookup by tx hash
          const r = await fetch(`${WORMHOLE_API}/vaas?txHash=${txHash}`, {
            headers: { 'Accept': 'application/json' },
          });
          const data = await r.json();
          if (!r.ok) return { success: false, error: `Wormhole API error ${r.status}: ${JSON.stringify(data)}` };
          const vaas = data.data ?? [];
          if (vaas.length === 0) return { success: false, error: 'No VAA found for this tx hash yet. Guardian finality may take 1-15 minutes depending on source chain.' };
          return { success: true, output: { vaas, vaa: vaas[0]?.vaa, note: 'Pass vaa to complete_transfer on destination EVM chain.' } };
        }

        // Lookup by chain_id + emitter + sequence
        const chainId = input.chain_id;
        const emitter = input.emitter;
        const sequence = input.sequence;
        if (!chainId || !emitter || sequence === undefined) {
          return { success: false, error: 'Provide either tx_hash OR (chain_id + emitter + sequence)' };
        }
        const emitterNorm = emitter.startsWith('0x') ? emitter.slice(2).toLowerCase().padStart(64, '0') : emitter;
        const r = await fetch(`${WORMHOLE_API}/vaas/${chainId}/${emitterNorm}/${sequence}`, {
          headers: { 'Accept': 'application/json' },
        });
        const data = await r.json();
        if (!r.ok) return { success: false, error: `Wormhole API error ${r.status}: ${JSON.stringify(data)}` };
        return { success: true, output: { ...data, note: 'Pass vaa field to complete_transfer.' } };
      }

      case 'complete_transfer': {
        const dstKey = (input.destination_chain ?? '').toLowerCase() as EvmChainKey;
        const dst = EVM_CHAINS[dstKey];
        if (!dst) return { success: false, error: `Unknown destination_chain. Use: ${Object.keys(EVM_CHAINS).join(', ')}` };

        const vaa = input.vaa;
        if (!vaa || typeof vaa !== 'string') return { success: false, error: 'vaa (signed VAA hex bytes) is required. Get it from get_vaa.' };

        const vaaHex = vaa.startsWith('0x') ? vaa : `0x${vaa}`;

        return {
          success: true,
          output: {
            transactions: [{
              to: dst.tokenBridge,
              data: encodeFunctionData({
                abi: TOKEN_BRIDGE_ABI,
                functionName: 'completeTransfer',
                args: [vaaHex as `0x${string}`],
              }),
              value: '0x0',
              chain_id: dst.chainId,
              description: `Complete Wormhole transfer on ${dst.name}`,
            }],
            destination_chain: dstKey,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_supported_chains, get_message_fee, transfer_tokens, transfer_eth, get_vaa, complete_transfer` };
    }
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Wormhole skill error' };
  }
}
