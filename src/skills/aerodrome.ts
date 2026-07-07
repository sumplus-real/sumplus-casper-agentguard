/**
 * Aerodrome Finance Skill — Server-side execution on Base
 *
 * Aerodrome is the dominant DEX on Base (Coinbase L2), a Velodrome V2 fork.
 * Uses ve(3,3) tokenomics with volatile (xy=k) and stable (x³y+xy³=k) pools.
 *
 * [ARSENAL-HOSTED ✓] Arsenal provides Alchemy RPC. No API key needed.
 *
 * Contracts on Base (chain ID 8453):
 *   Router:  0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
 *   Factory: 0x420DD381b31aEf6683db6B902084cB0FFECe40Da  (verified: Router.defaultFactory() = this)
 */

import type { SkillExecutionResult } from '@/types/skill';

const ALCHEMY_URL = 'https://base-mainnet.g.alchemy.com/v2';

const CONTRACTS = {
  router:  '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
  factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da', // verified: Router.defaultFactory()
} as const;

// Verified selectors
const SEL = {
  getAmountsOut: '5509a1ac', // getAmountsOut(uint256,(address,address,bool,address)[])
  getPool:       '79bc57d5', // getPool(address,address,bool)
  getReserves:   '0902f1ac', // getReserves()
  decimals:      '313ce567', // decimals()
  symbol:        '95d89b41', // symbol()
} as const;

// Well-known tokens on Base
const TOKENS: Record<string, { address: string; decimals: number }> = {
  ETH:    { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  WETH:   { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  USDC:   { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6  },
  USDBC:  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6  }, // bridged USDC.e
  DAI:    { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
  USDT:   { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6  },
  CBETH:  { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
  AERO:   { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18 },
  WSTETH: { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', decimals: 18 },
  BRETT:  { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', decimals: 18 },
};

// ── metadata ──────────────────────────────────────────────────────────────────
export const AERODROME_SKILL_METADATA = {
  name: 'Aerodrome Finance',
  description:
    '[ARSENAL-HOSTED ✓] Swap tokens on Aerodrome — the dominant DEX on Base (Coinbase L2). ' +
    'Aerodrome is a Velodrome V2 fork with volatile (xy=k) and stable (x³y+xy³=k) pools, ' +
    've(3,3) tokenomics, and ~50% of all DEX volume on Base.\n\n' +
    'Get live swap quotes, build unsigned swap transactions, or inspect pool details.\n\n' +
    'execution_mode: server-side\nchain: base (id: 8453)\n' +
    'dex: Aerodrome Finance (aerodrome.finance)',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['aerodrome', 'base', 'dex', 'swap', 'defi', 'velodrome', 'coinbase', 'l2'],
  external_url: 'https://aerodrome.finance',
  logo_url: 'https://icons.llamao.fi/icons/protocols/aerodrome?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_quote', 'build_swap_tx', 'get_pools'],
        description:
          'get_quote: Get a live swap quote for a token pair. Returns amount_out, price_impact, pool_type. ' +
          'build_swap_tx: Build an unsigned swap transaction ready for wallet signing. Returns transactions array. ' +
          'get_pools: Get pool info (reserves, type) for a token pair.',
      },
      token_in: {
        type: 'string',
        description: 'Input token symbol (ETH, USDC, AERO, cbETH…) or 0x address.',
      },
      token_out: {
        type: 'string',
        description: 'Output token symbol or 0x address.',
      },
      amount_in: {
        type: 'string',
        description: 'Human-readable input amount (e.g. "100" for 100 USDC or "0.5" for 0.5 ETH).',
      },
      sender: {
        type: 'string',
        description: 'Sender wallet address (0x, 40 hex). Required for build_swap_tx.',
      },
      slippage: {
        type: 'number',
        description: 'Max slippage as decimal (e.g. 0.005 = 0.5%). Default: 0.005. Used in build_swap_tx.',
      },
      pool_type: {
        type: 'string',
        enum: ['volatile', 'stable', 'auto'],
        description: 'Pool type to use. "auto" tries both and picks the better rate. Default: auto.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Quote 100 USDC → WETH',
      input: { action: 'get_quote', token_in: 'USDC', token_out: 'ETH', amount_in: '100' },
    },
    {
      title: 'Build swap tx: 0.1 ETH → USDC',
      input: {
        action: 'build_swap_tx',
        token_in: 'ETH', token_out: 'USDC', amount_in: '0.1',
        sender: '0xYourAddress', slippage: 0.005,
      },
    },
    {
      title: 'Get USDC/WETH pool info',
      input: { action: 'get_pools', token_in: 'USDC', token_out: 'ETH' },
    },
  ],
};

// ── helpers ───────────────────────────────────────────────────────────────────
function getApiKey(): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('No Alchemy API key configured on Arsenal server.');
  return key;
}

async function ethCall(to: string, data: string, apiKey: string): Promise<string> {
  const res = await fetch(`${ALCHEMY_URL}/${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`eth_call reverted: ${json.error.message}`);
  return json.result ?? '0x';
}

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x'))
    return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}

function readU256(hex: string, slot = 0): bigint {
  const h = hex.replace('0x', '');
  return BigInt('0x' + h.slice(slot * 64, slot * 64 + 64));
}

function readAddress(hex: string, slot = 0): string {
  const h = hex.replace('0x', '');
  return '0x' + h.slice(slot * 64 + 24, slot * 64 + 64);
}

function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(fracPadded || '0');
}

function formatUnits(value: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const frac = value % divisor;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

interface TokenInfo { address: string; decimals: number; symbol: string }

async function resolveToken(raw: string, apiKey: string): Promise<TokenInfo> {
  const upper = raw.trim().toUpperCase();
  if (TOKENS[upper]) return { ...TOKENS[upper], symbol: upper };
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    const decHex = await ethCall(raw, '0x' + SEL.decimals, apiKey).catch(() => '0x');
    const decimals = decHex === '0x' ? 18 : Number(readU256(decHex));
    const symHex = await ethCall(raw, '0x' + SEL.symbol, apiKey).catch(() => '0x');
    const symbol = symHex.length > 130
      ? Buffer.from(symHex.slice(130).replace(/^0+/, ''), 'hex').toString('utf8').replace(/\0/g, '')
      : raw.slice(0, 8) + '…';
    return { address: raw, decimals, symbol };
  }
  throw new Error(
    `Unknown token "${raw}" on Base. Use a symbol (${Object.keys(TOKENS).join(', ')}) or a 0x address.`
  );
}

function encodeGetAmountsOut(amountIn: bigint, tokenIn: string, tokenOut: string, stable: boolean): string {
  return '0x'
    + SEL.getAmountsOut
    + p32(amountIn)
    + p32(0x40)
    + p32(1)
    + p32(tokenIn)
    + p32(tokenOut)
    + p32(stable ? 1 : 0)
    + p32(0); // factory = address(0) → Router uses defaultFactory
}

async function quoteRoute(
  tokenIn: string, tokenOut: string, amountIn: bigint, stable: boolean, apiKey: string
): Promise<bigint | null> {
  try {
    const data = encodeGetAmountsOut(amountIn, tokenIn, tokenOut, stable);
    const hex = (await ethCall(CONTRACTS.router, data, apiKey)).replace('0x', '');
    if (!hex || hex.length < 256) return null;
    return readU256(hex, 3); // amounts[1]
  } catch {
    return null;
  }
}

async function getPairAddress(
  tokenA: string, tokenB: string, stable: boolean, apiKey: string
): Promise<string | null> {
  const data = '0x' + SEL.getPool + p32(tokenA) + p32(tokenB) + p32(stable ? 1 : 0);
  const result = await ethCall(CONTRACTS.factory, data, apiKey).catch(() => '0x');
  if (!result || result.length < 66) return null;
  const addr = readAddress(result, 0);
  return addr === '0x0000000000000000000000000000000000000000' ? null : addr;
}

// ── actions ───────────────────────────────────────────────────────────────────
async function getQuote(input: any): Promise<SkillExecutionResult> {
  const { token_in, token_out, amount_in, pool_type = 'auto' } = input;
  if (!token_in)  return { success: false, error: 'token_in is required' };
  if (!token_out) return { success: false, error: 'token_out is required' };
  if (!amount_in) return { success: false, error: 'amount_in is required' };

  try {
    const apiKey = getApiKey();
    const [inToken, outToken] = await Promise.all([
      resolveToken(token_in, apiKey),
      resolveToken(token_out, apiKey),
    ]);
    const amountInRaw = parseUnits(String(amount_in), inToken.decimals);

    const tryStable   = pool_type === 'stable'   || pool_type === 'auto';
    const tryVolatile = pool_type === 'volatile'  || pool_type === 'auto';

    const [stableOut, volatileOut] = await Promise.all([
      tryStable   ? quoteRoute(inToken.address, outToken.address, amountInRaw, true,  apiKey) : Promise.resolve(null),
      tryVolatile ? quoteRoute(inToken.address, outToken.address, amountInRaw, false, apiKey) : Promise.resolve(null),
    ]);

    const bestStable   = stableOut   ?? 0n;
    const bestVolatile = volatileOut ?? 0n;

    if (bestStable === 0n && bestVolatile === 0n) {
      return { success: false, error: `No Aerodrome pool found for ${inToken.symbol}/${outToken.symbol} on Base` };
    }

    const useStable = bestStable > bestVolatile;
    const bestOut = useStable ? bestStable : bestVolatile;
    const poolType = useStable ? 'stable' : 'volatile';

    const amountOutFormatted = formatUnits(bestOut, outToken.decimals);
    const amountInFloat  = Number(amount_in);
    const amountOutFloat = parseFloat(amountOutFormatted);
    const priceImpact    = amountInFloat > 0 && amountOutFloat > 0
      ? ((amountInFloat - amountOutFloat) / amountInFloat * 100).toFixed(2) + '%'
      : 'unknown';

    return {
      success: true,
      output: {
        token_in:   inToken.symbol,
        token_out:  outToken.symbol,
        amount_in:  String(amount_in),
        amount_out: amountOutFormatted,
        pool_type:  poolType,
        price_impact: priceImpact,
        router: CONTRACTS.router,
        chain: 'base',
        volatile_out: bestVolatile > 0n ? formatUnits(bestVolatile, outToken.decimals) : null,
        stable_out:   bestStable   > 0n ? formatUnits(bestStable,   outToken.decimals) : null,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_quote failed: ${err.message}` };
  }
}

async function buildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { token_in, token_out, amount_in, sender, slippage = 0.005, pool_type = 'auto' } = input;
  if (!token_in)  return { success: false, error: 'token_in is required' };
  if (!token_out) return { success: false, error: 'token_out is required' };
  if (!amount_in) return { success: false, error: 'amount_in is required' };
  if (!sender)    return { success: false, error: 'sender is required for build_swap_tx' };

  try {
    const apiKey = getApiKey();
    const [inToken, outToken] = await Promise.all([
      resolveToken(token_in, apiKey),
      resolveToken(token_out, apiKey),
    ]);
    const amountInRaw = parseUnits(String(amount_in), inToken.decimals);

    const tryStable   = pool_type === 'stable'  || pool_type === 'auto';
    const tryVolatile = pool_type === 'volatile' || pool_type === 'auto';

    const [stableOut, volatileOut] = await Promise.all([
      tryStable   ? quoteRoute(inToken.address, outToken.address, amountInRaw, true,  apiKey) : Promise.resolve(null),
      tryVolatile ? quoteRoute(inToken.address, outToken.address, amountInRaw, false, apiKey) : Promise.resolve(null),
    ]);

    const useStable = (stableOut ?? 0n) > (volatileOut ?? 0n);
    const bestOut   = useStable ? (stableOut ?? 0n) : (volatileOut ?? 0n);

    if (bestOut === 0n) {
      return { success: false, error: `No Aerodrome pool found for ${inToken.symbol}/${outToken.symbol}` };
    }

    const slippageBps  = BigInt(Math.round(slippage * 10000));
    const amountOutMin = bestOut * (10000n - slippageBps) / 10000n;
    const deadline     = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 min

    const isEthIn  = inToken.address.toLowerCase()  === TOKENS.WETH.address.toLowerCase();
    const isEthOut = outToken.address.toLowerCase() === TOKENS.WETH.address.toLowerCase();

    // swapExactETHForTokens(uint256 amountOutMin, Route[], address to, uint256 deadline)
    // swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, Route[], address to, uint256 deadline)
    // swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[], address to, uint256 deadline)
    let selector: string;
    let calldata: string;

    if (isEthIn) {
      // swapExactETHForTokens selector
      selector = 'cd4e8b2a'; // swapExactETHForTokens(uint256,(address,address,bool,address)[],address,uint256)
      calldata = '0x' + selector
        + p32(amountOutMin)
        + p32(0x80)               // offset to routes array
        + p32(sender)             // to
        + p32(deadline)
        + p32(1)                  // routes.length
        + p32(inToken.address)   // route.from (WETH)
        + p32(outToken.address)  // route.to
        + p32(useStable ? 1 : 0)
        + p32(0);                 // factory = address(0)
    } else if (isEthOut) {
      // swapExactTokensForETH
      selector = 'c3b18b8a'; // swapExactTokensForETH(uint256,uint256,(address,address,bool,address)[],address,uint256)
      calldata = '0x' + selector
        + p32(amountInRaw)
        + p32(amountOutMin)
        + p32(0xa0)               // offset to routes array
        + p32(sender)             // to
        + p32(deadline)
        + p32(1)
        + p32(inToken.address)
        + p32(outToken.address)
        + p32(useStable ? 1 : 0)
        + p32(0);
    } else {
      // swapExactTokensForTokens
      selector = '9981509f'; // swapExactTokensForTokens(uint256,uint256,(address,address,bool,address)[],address,uint256)
      calldata = '0x' + selector
        + p32(amountInRaw)
        + p32(amountOutMin)
        + p32(0xa0)               // offset to routes array
        + p32(sender)             // to
        + p32(deadline)
        + p32(1)
        + p32(inToken.address)
        + p32(outToken.address)
        + p32(useStable ? 1 : 0)
        + p32(0);
    }

    const transactions: object[] = [];

    // ERC20 approve needed if not ETH in
    if (!isEthIn) {
      const approveSelector = '095ea7b3'; // approve(address,uint256)
      transactions.push({
        to: inToken.address,
        data: '0x' + approveSelector + p32(CONTRACTS.router) + p32(amountInRaw),
        value: '0x0',
        description: `Approve ${formatUnits(amountInRaw, inToken.decimals)} ${inToken.symbol} to Aerodrome Router`,
      });
    }

    transactions.push({
      to: CONTRACTS.router,
      data: calldata,
      value: isEthIn ? '0x' + amountInRaw.toString(16) : '0x0',
      description: `Swap ${amount_in} ${inToken.symbol} → min ${formatUnits(amountOutMin, outToken.decimals)} ${outToken.symbol} via Aerodrome (${useStable ? 'stable' : 'volatile'} pool)`,
    });

    return {
      success: true,
      output: {
        transactions,
        amount_in:     String(amount_in),
        amount_out_min: formatUnits(amountOutMin, outToken.decimals),
        amount_out_expected: formatUnits(bestOut, outToken.decimals),
        pool_type: useStable ? 'stable' : 'volatile',
        slippage: `${(slippage * 100).toFixed(2)}%`,
        token_in:  inToken.symbol,
        token_out: outToken.symbol,
        router: CONTRACTS.router,
        chain: 'base',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_swap_tx failed: ${err.message}` };
  }
}

async function getPools(input: any): Promise<SkillExecutionResult> {
  const { token_in, token_out } = input;
  if (!token_in)  return { success: false, error: 'token_in is required' };
  if (!token_out) return { success: false, error: 'token_out is required' };

  try {
    const apiKey = getApiKey();
    const [inToken, outToken] = await Promise.all([
      resolveToken(token_in, apiKey),
      resolveToken(token_out, apiKey),
    ]);

    const [volatilePool, stablePool] = await Promise.all([
      getPairAddress(inToken.address, outToken.address, false, apiKey),
      getPairAddress(inToken.address, outToken.address, true,  apiKey),
    ]);

    const pools: object[] = [];

    for (const [poolAddr, stable] of [[volatilePool, false], [stablePool, true]] as [string | null, boolean][]) {
      if (!poolAddr) continue;
      try {
        const reserves = await ethCall(poolAddr, '0x' + SEL.getReserves, apiKey);
        const r0 = readU256(reserves, 0);
        const r1 = readU256(reserves, 1);
        pools.push({
          address: poolAddr,
          type: stable ? 'stable' : 'volatile',
          reserve_0: formatUnits(r0, inToken.decimals),
          reserve_1: formatUnits(r1, outToken.decimals),
          token_0: inToken.symbol,
          token_1: outToken.symbol,
        });
      } catch {
        pools.push({ address: poolAddr, type: stable ? 'stable' : 'volatile', error: 'failed to fetch reserves' });
      }
    }

    if (!pools.length) {
      return { success: false, error: `No Aerodrome pool found for ${inToken.symbol}/${outToken.symbol} on Base` };
    }

    return { success: true, output: { pools, token_0: inToken.symbol, token_1: outToken.symbol, chain: 'base' } };
  } catch (err: any) {
    return { success: false, error: `get_pools failed: ${err.message}` };
  }
}

// ── entry ─────────────────────────────────────────────────────────────────────
export async function executeAerodromeSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'get_quote':     return await getQuote(input);
    case 'build_swap_tx': return await buildSwapTx(input);
    case 'get_pools':     return await getPools(input);
    default:
      return { success: false, error: `Unknown action: "${action}". Valid: get_quote, build_swap_tx, get_pools` };
  }
}
