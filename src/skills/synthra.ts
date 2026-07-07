import type { SkillExecutionResult } from '@/types/skill';

export const SYNTHRA_SKILL_METADATA = {
  name: 'Synthra',
  description:
    '[ARSENAL-HOSTED ✓] Synthra SynRoute — chain-abstracted DEX routing on Arc, Robinhood Chain, and Sepolia (testnet). ' +
    'Get swap quotes, token prices, and build executable swap transactions across Synthra V3 concentrated-liquidity pools. ' +
    'Requires SYNTHRA_API_KEY on the server (already configured).',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['synthra', 'synroute', 'swap', 'dex', 'routing', 'arc', 'robinhood', 'sepolia', 'testnet'],
  external_url: 'https://synthra.org',
  logo_url: 'https://docs.synthra.org/synthra-mark-cropped.png',
  partner_verified: false,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'get_price', 'build_swap_tx'],
        description:
          'get_quote: preview a same-chain swap route and expected output (chain_id, token_in, token_out, amount). ' +
          'get_price: spot price of base in terms of quote (chain_id, base, quote). ' +
          'build_swap_tx: build the ordered swap transactions for a wallet to sign (chain_id, token_in, token_out, amount, sender).',
      },
      chain_id: {
        type: 'number',
        description: 'Execution chain id. Arc testnet 5042002 (default), Robinhood Chain 46630, Sepolia 11155111.',
      },
      token_in: { type: 'string', description: 'Input token address (0x...) or supported alias (e.g. USDC).' },
      token_out: { type: 'string', description: 'Output token address (0x...) or supported alias.' },
      amount: { type: 'string', description: 'Raw integer amount of the input token (wei-style, no decimals).' },
      sender: { type: 'string', description: 'Wallet address that signs and receives the swap (0x...). Required for build_swap_tx.' },
      trade_type: { type: 'string', enum: ['EXACT_INPUT', 'EXACT_OUTPUT'], description: 'Defaults to EXACT_INPUT.' },
      slippage_bps: { type: 'number', description: 'Max slippage in basis points for build_swap_tx (default 50).' },
      route_quality_policy: {
        type: 'string',
        enum: ['cex_safe', 'best_output', 'trustless_full'],
        description: 'Route scoring policy for get_quote (default cex_safe).',
      },
      base: { type: 'string', description: 'Base token address or alias for get_price.' },
      quote: { type: 'string', description: 'Quote token address or alias for get_price.' },
      token_in_decimals: { type: 'number', description: 'Optional, only when token metadata is unknown to SynRoute.' },
      token_out_decimals: { type: 'number', description: 'Optional, only when token metadata is unknown to SynRoute.' },
    },
  },
  usage_examples: [
    {
      title: 'Quote 1 USDC → SYN on Arc',
      input: {
        action: 'get_quote',
        chain_id: 5042002,
        token_in: '0x3600000000000000000000000000000000000000',
        token_out: '0xC5124C846c6e6307986988dFb7e743327aA05F19',
        amount: '1000000',
      },
    },
    {
      title: 'Build swap tx',
      input: {
        action: 'build_swap_tx',
        chain_id: 5042002,
        token_in: '0x3600000000000000000000000000000000000000',
        token_out: '0xC5124C846c6e6307986988dFb7e743327aA05F19',
        amount: '1000000',
        sender: '0x0000000000000000000000000000000000000000',
      },
    },
  ],
};

const BASE = process.env.SYNTHRA_API_BASE || 'https://trading-api.synthra.org';

// Synthra runs on testnets only today.
const SUPPORTED_CHAINS: Record<number, string> = {
  5042002: 'Arc',
  46630: 'Robinhood Chain',
  11155111: 'Sepolia',
};

interface TxRequest {
  to?: string;
  data?: string;
  value?: string;
  gasLimit?: string;
}

function isAddress(v: unknown): boolean {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

function isHex(v: unknown): boolean {
  return typeof v === 'string' && /^0x([a-fA-F0-9]{2})*$/.test(v);
}

function toHexValue(value?: string): string {
  try {
    return `0x${BigInt(value ?? '0').toString(16)}`;
  } catch {
    return '0x0';
  }
}

// Arc native-USDC is an ERC20-facade precompile that gas estimation under-models;
// the agent template sends swaps with headroom (max of 2x estimate and a 4M floor).
function arcGasHeadroom(gasLimit?: string): string | undefined {
  const FLOOR = 4_000_000n;
  let est = 0n;
  try {
    est = gasLimit ? BigInt(gasLimit) * 2n : 0n;
  } catch {
    est = 0n;
  }
  const g = est > FLOOR ? est : FLOOR;
  return `0x${g.toString(16)}`;
}

function toArsenalTx(tx: TxRequest, chainId: number, description: string) {
  const out: Record<string, unknown> = {
    to: tx.to,
    data: tx.data,
    value: toHexValue(tx.value),
    chain_id: chainId,
    description,
  };
  // Pass through a gas limit; on Arc add headroom because estimation under-models the USDC precompile.
  if (chainId === 5042002) {
    const g = arcGasHeadroom(tx.gasLimit);
    if (g) out.gas = g;
  } else if (tx.gasLimit) {
    out.gas = `0x${BigInt(tx.gasLimit).toString(16)}`;
  }
  return out;
}

async function apiRequest(
  method: 'GET' | 'POST',
  path: string,
  key: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; ok: boolean; data: any }> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': key },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await r.json();
  } catch {
    data = await r.text().catch(() => '');
  }
  return { status: r.status, ok: r.ok, data };
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  return q.toString();
}

export async function executeSynthraSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  const key = process.env.SYNTHRA_API_KEY;
  if (!key) return { success: false, error: 'SYNTHRA_API_KEY is not configured on the server' };

  const chainId = Number(input?.chain_id ?? input?.chainId ?? 5042002);
  if (!SUPPORTED_CHAINS[chainId]) {
    return {
      success: false,
      error: `Unsupported chain ${chainId}. Synthra supports: ${Object.entries(SUPPORTED_CHAINS)
        .map(([id, name]) => `${name} (${id})`)
        .join(', ')}`,
    };
  }

  try {
    switch (action) {
      case 'get_quote': {
        const tokenIn = input.token_in ?? input.tokenIn;
        const tokenOut = input.token_out ?? input.tokenOut;
        const amount = input.amount;
        if (!tokenIn || !tokenOut || !amount) {
          return { success: false, error: 'token_in, token_out, and amount are required' };
        }
        const r = await apiRequest('POST', '/v1/quote', key, {
          chainId,
          tokenIn,
          tokenOut,
          amount: String(amount),
          tradeType: input.trade_type ?? input.tradeType ?? 'EXACT_INPUT',
          routeQualityPolicy: input.route_quality_policy ?? input.routeQualityPolicy ?? 'cex_safe',
          tokenInDecimals: input.token_in_decimals,
          tokenOutDecimals: input.token_out_decimals,
        });
        if (!r.ok) return { success: false, error: `Synthra quote error ${r.status}: ${JSON.stringify(r.data)}` };
        return { success: true, output: r.data as Record<string, unknown> };
      }

      case 'get_price': {
        const base = input.base ?? input.token_in ?? input.tokenIn;
        const quote = input.quote ?? input.token_out ?? input.tokenOut;
        if (!base || !quote) return { success: false, error: 'base and quote are required' };
        const r = await apiRequest(
          'GET',
          `/v1/price?${toQuery({ chainId, base, quote, amount: input.amount })}`,
          key,
        );
        if (!r.ok) return { success: false, error: `Synthra price error ${r.status}: ${JSON.stringify(r.data)}` };
        return { success: true, output: r.data as Record<string, unknown> };
      }

      case 'build_swap_tx': {
        const sender = input.sender ?? input.from ?? input.wallet_address ?? input.walletAddress;
        const recipient = input.recipient ?? sender;
        if (!isAddress(sender)) return { success: false, error: 'sender address is required (0x...)' };
        const tokenIn = input.token_in ?? input.tokenIn;
        const tokenOut = input.token_out ?? input.tokenOut;
        const amount = input.amount;
        if (!tokenIn || !tokenOut || !amount) {
          return { success: false, error: 'token_in, token_out, and amount are required' };
        }
        const slippageBps = input.slippage_bps ?? input.slippageBps ?? 50;

        // erc20 approval mode → returns standard ERC20 approve (if needed) + swap, both on-chain txs.
        const r = await apiRequest('POST', '/v1/swap', key, {
          chainId,
          tokenIn,
          tokenOut,
          amount: String(amount),
          recipient,
          sender,
          approvalMode: 'erc20',
          slippageBps,
        });
        if (r.status === 401 || r.status === 403) return { success: false, error: 'Synthra API unauthorized (check SYNTHRA_API_KEY)' };
        if (!r.ok) return { success: false, error: `Synthra swap error ${r.status}: ${JSON.stringify(r.data)}` };

        const built = r.data as {
          transaction?: TxRequest;
          approval?: { needsApproval?: boolean; approveTransaction?: TxRequest; tokenApproval?: { needsApproval?: boolean; approveTransaction?: TxRequest } };
          amountOut?: string;
          amountOutDecimals?: string;
          routeString?: string;
        };

        const transactions: Record<string, unknown>[] = [];

        const tokenApproval = built.approval?.tokenApproval ?? built.approval;
        if (tokenApproval?.needsApproval && tokenApproval.approveTransaction?.to) {
          transactions.push(
            toArsenalTx(tokenApproval.approveTransaction, chainId, `Approve ${tokenIn} for Synthra swap`),
          );
        }

        if (!built.transaction?.to || !isHex(built.transaction.data)) {
          return { success: false, error: `Synthra response missing swap transaction: ${JSON.stringify(built)}` };
        }
        transactions.push(toArsenalTx(built.transaction, chainId, `Synthra swap ${tokenIn} → ${tokenOut}`));

        return {
          success: true,
          output: {
            transactions,
            amount_out: built.amountOut,
            amount_out_decimals: built.amountOutDecimals,
            route: built.routeString,
            chain: SUPPORTED_CHAINS[chainId],
          },
        };
      }

      default:
        return { success: false, error: `Unknown action "${action}". Available: get_quote, get_price, build_swap_tx` };
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Synthra skill error' };
  }
}
