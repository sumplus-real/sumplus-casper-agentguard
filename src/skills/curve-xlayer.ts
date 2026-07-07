/**
 * Curve Finance on XLayer — Server-side execution
 *
 * Curve is the leading stable-swap AMM on XLayer with ~$5M TVL.
 * Primary pool: USDC-USDT (3pool-style stablecoin swap).
 *
 * [ARSENAL-HOSTED ✓] Queries Curve's public API + direct RPC fallback.
 *
 * Chain: XLayer (chain ID 196)
 * API:   https://api.curve.fi/v1/getPools/xlayer/main
 * RPC:   https://rpc.xlayer.tech
 */

import type { SkillExecutionResult } from '@/types/skill';

const CURVE_API = 'https://api.curve.fi/v1';
const RPC       = 'https://rpc.xlayer.tech';
const CHAIN     = 'xlayer';
const CHAIN_ID  = 196;

// ── Skill metadata ────────────────────────────────────────────────────────────

export const CURVE_XLAYER_SKILL_METADATA = {
  name: 'Curve Finance on XLayer',
  description:
    '[ARSENAL-HOSTED ✓] Stablecoin swap and pool data for Curve Finance on XLayer (chain ID 196). ' +
    'Curve is the leading stable AMM on XLayer with ~$5M TVL, primarily USDC/USDT pools. ' +
    'Get pool details, live swap quotes (virtual price, slippage), and list all active pools.',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['curve', 'xlayer', 'okx', 'stablecoin', 'swap', 'defi', 'amm', 'usdc', 'usdt'],
  external_url: 'https://curve.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/curve-dex?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['list_pools', 'get_pool', 'get_quote', 'build_swap_tx'],
        description:
          'list_pools: all Curve pools on XLayer with TVL and APY. ' +
          'get_pool: details for one pool (requires pool_address or pool_name). ' +
          'get_quote: estimated output for a stable swap (requires pool_address, tokenIn, tokenOut, amountIn). ' +
          'build_swap_tx: build approve + exchange transactions for a stable swap (requires pool_address or pool_name, tokenIn, tokenOut, amountIn, sender).',
      },
      pool_address: {
        type: 'string',
        description: '0x pool contract address. Use list_pools to discover addresses.',
      },
      pool_name: {
        type: 'string',
        description: 'Pool name shorthand (e.g. "usdc-usdt"). Resolved to address automatically.',
      },
      tokenIn:  { type: 'string', description: 'Input token symbol (USDC, USDT) or 0x address.' },
      tokenOut: { type: 'string', description: 'Output token symbol or 0x address.' },
      amountIn: { type: 'string', description: 'Input amount in human-readable units (e.g. "100").' },
      sender:   { type: 'string', description: 'EVM wallet address (0x...). Required for build_swap_tx.' },
      slippageBps: { type: 'number', description: 'Slippage tolerance in bps (default: 10 = 0.1%). Used by build_swap_tx.' },
    },
  },
  usage_examples: [
    { title: 'List all pools', input: { action: 'list_pools' } },
    { title: 'USDC-USDT pool details', input: { action: 'get_pool', pool_name: 'usdc-usdt' } },
    { title: 'Quote 100 USDC → USDT', input: { action: 'get_quote', pool_name: 'usdc-usdt', tokenIn: 'USDC', tokenOut: 'USDT', amountIn: '100' } },
    { title: 'Swap 100 USDC → USDT', input: { action: 'build_swap_tx', pool_name: 'usdc-usdt', tokenIn: 'USDC', tokenOut: 'USDT', amountIn: '100', sender: '0xYourAddress' } },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path: string): Promise<any> {
  const res = await fetch(`${CURVE_API}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Curve API ${res.status} for ${path}`);
  return res.json();
}

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const json = await res.json() as any;
  if (json.error) throw new Error(json.error.message);
  return json.result as string;
}

function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * (10n ** BigInt(decimals))
       + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
}

function formatUnits(value: bigint, decimals: number): string {
  const d = BigInt(decimals);
  const whole = value / (10n ** d);
  const frac  = value % (10n ** d);
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function listPools(): Promise<SkillExecutionResult> {
  try {
    // Try all registry types
    const registries = ['main', 'crypto', 'factory'];
    const allPools: any[] = [];

    for (const registry of registries) {
      try {
        const data = await apiFetch(`/getPools/${CHAIN}/${registry}`);
        const pools = data?.data?.poolData ?? [];
        allPools.push(...pools.map((p: any) => ({
          name:         p.name,
          address:      p.address,
          registry,
          tvl_usd:      p.usdTotal ?? p.tvl,
          apy:          p.latestDailyApy ?? p.apy,
          coins:        (p.coins ?? []).map((c: any) => c.symbol ?? c.address),
          volume_24h:   p.volumeUSD,
        })));
      } catch { /* skip registry if not found */ }
    }

    if (allPools.length === 0) {
      return {
        success: true,
        output: {
          chain: CHAIN,
          chain_id: CHAIN_ID,
          pool_count: 0,
          pools: [],
          _note: 'No pools found via API — Curve may be indexing XLayer. Check https://curve.fi/#/xlayer/pools directly.',
        },
      };
    }

    return {
      success: true,
      output: {
        chain:      CHAIN,
        chain_id:   CHAIN_ID,
        pool_count: allPools.length,
        pools:      allPools.sort((a, b) => (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0)),
      },
    };
  } catch (err: any) {
    return { success: false, error: `list_pools failed: ${err.message}` };
  }
}

async function getPool(input: any): Promise<SkillExecutionResult> {
  const { pool_address, pool_name } = input;
  if (!pool_address && !pool_name) {
    return { success: false, error: 'pool_address or pool_name is required.' };
  }

  try {
    const registries = ['main', 'crypto', 'factory'];
    for (const registry of registries) {
      try {
        const data = await apiFetch(`/getPools/${CHAIN}/${registry}`);
        const pools: any[] = data?.data?.poolData ?? [];
        const pool = pools.find((p: any) =>
          (pool_address && p.address?.toLowerCase() === pool_address.toLowerCase()) ||
          (pool_name && p.name?.toLowerCase().includes(pool_name.toLowerCase()))
        );
        if (pool) {
          return {
            success: true,
            output: {
              name:       pool.name,
              address:    pool.address,
              chain:      CHAIN,
              chain_id:   CHAIN_ID,
              tvl_usd:    pool.usdTotal ?? pool.tvl,
              apy:        pool.latestDailyApy ?? pool.apy,
              coins:      (pool.coins ?? []).map((c: any) => ({ symbol: c.symbol, address: c.address, decimals: c.decimals })),
              virtual_price: pool.virtualPrice,
              volume_24h: pool.volumeUSD,
              fee:        pool.fee,
              admin_fee:  pool.adminFee,
            },
          };
        }
      } catch { /* try next */ }
    }
    return { success: false, error: `Pool not found: "${pool_address ?? pool_name}". Use list_pools to see available pools.` };
  } catch (err: any) {
    return { success: false, error: `get_pool failed: ${err.message}` };
  }
}

async function getQuote(input: any): Promise<SkillExecutionResult> {
  const { pool_address, pool_name, tokenIn, tokenOut, amountIn } = input;
  if ((!pool_address && !pool_name) || !tokenIn || !tokenOut || !amountIn) {
    return { success: false, error: 'pool_address (or pool_name), tokenIn, tokenOut, and amountIn are required.' };
  }

  try {
    // Resolve pool address first
    let poolAddr = pool_address;
    let poolCoins: Array<{ symbol: string; address: string; decimals: number }> = [];

    if (!poolAddr || pool_name) {
      const registries = ['main', 'factory'];
      for (const registry of registries) {
        try {
          const data = await apiFetch(`/getPools/${CHAIN}/${registry}`);
          const pools: any[] = data?.data?.poolData ?? [];
          const found = pools.find((p: any) =>
            (pool_address && p.address?.toLowerCase() === pool_address?.toLowerCase()) ||
            (pool_name && p.name?.toLowerCase().includes(pool_name.toLowerCase()))
          );
          if (found) {
            poolAddr = found.address;
            poolCoins = (found.coins ?? []).map((c: any) => ({
              symbol: c.symbol,
              address: c.address,
              decimals: c.decimals ?? 18,
            }));
            break;
          }
        } catch { /* try next */ }
      }
    }

    if (!poolAddr) {
      return { success: false, error: `Pool not found: "${pool_address ?? pool_name}".` };
    }

    // Resolve token indices
    const tInSymbol  = tokenIn.toUpperCase();
    const tOutSymbol = tokenOut.toUpperCase();

    const iIn  = poolCoins.findIndex(c => c.symbol.toUpperCase() === tInSymbol || c.address.toLowerCase() === tokenIn.toLowerCase());
    const iOut = poolCoins.findIndex(c => c.symbol.toUpperCase() === tOutSymbol || c.address.toLowerCase() === tokenOut.toLowerCase());

    if (iIn === -1 || iOut === -1) {
      return {
        success: false,
        error: `Token not found in pool. Pool contains: ${poolCoins.map(c => c.symbol).join(', ')}`,
      };
    }

    const decimalsIn = poolCoins[iIn].decimals;
    const decimalsOut = poolCoins[iOut].decimals;
    const amountInRaw = parseUnits(String(amountIn), decimalsIn);

    // Call get_dy(i, j, dx) on the pool — selector: 0x5e0d443f
    const data = '0x5e0d443f' + p32(iIn) + p32(iOut) + p32(amountInRaw);
    const result = await ethCall(poolAddr, data);
    const amountOut = BigInt(result);
    const amountOutStr = formatUnits(amountOut, decimalsOut);

    // Effective price and slippage
    const effectivePrice = Number(amountOutStr) / Number(amountIn);
    const slippage = Math.max(0, (1 - effectivePrice) * 100);

    return {
      success: true,
      output: {
        pool:          poolAddr,
        tokenIn:       poolCoins[iIn].symbol,
        tokenOut:      poolCoins[iOut].symbol,
        amountIn:      String(amountIn),
        amountOut:     amountOutStr,
        effectivePrice: effectivePrice.toFixed(6),
        slippage_pct:  slippage.toFixed(4),
        chain:         CHAIN,
        chain_id:      CHAIN_ID,
        _mock:         false,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_quote failed: ${err.message}` };
  }
}

async function buildSwapTx(input: any): Promise<SkillExecutionResult> {
  const { pool_address, pool_name, tokenIn, tokenOut, amountIn, sender, slippageBps = 10 } = input;
  if ((!pool_address && !pool_name) || !tokenIn || !tokenOut || !amountIn) {
    return { success: false, error: 'pool_address (or pool_name), tokenIn, tokenOut, amountIn are required.' };
  }
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
    return { success: false, error: 'sender (0x EVM address) is required.' };
  }

  try {
    // Resolve pool and coins (reuse getQuote logic)
    let poolAddr = pool_address as string | undefined;
    let poolCoins: Array<{ symbol: string; address: string; decimals: number }> = [];

    const registries = ['main', 'factory'];
    for (const registry of registries) {
      try {
        const data = await apiFetch(`/getPools/${CHAIN}/${registry}`);
        const pools: any[] = data?.data?.poolData ?? [];
        const found = pools.find((p: any) =>
          (pool_address && p.address?.toLowerCase() === pool_address?.toLowerCase()) ||
          (pool_name && p.name?.toLowerCase().includes(pool_name.toLowerCase()))
        );
        if (found) {
          poolAddr   = found.address;
          poolCoins  = (found.coins ?? []).map((c: any) => ({ symbol: c.symbol, address: c.address, decimals: c.decimals ?? 18 }));
          break;
        }
      } catch { /* try next */ }
    }

    if (!poolAddr) return { success: false, error: `Pool not found: "${pool_address ?? pool_name}".` };

    const tInSymbol  = tokenIn.toUpperCase();
    const tOutSymbol = tokenOut.toUpperCase();
    const iIn  = poolCoins.findIndex(c => c.symbol.toUpperCase() === tInSymbol || c.address.toLowerCase() === tokenIn.toLowerCase());
    const iOut = poolCoins.findIndex(c => c.symbol.toUpperCase() === tOutSymbol || c.address.toLowerCase() === tokenOut.toLowerCase());

    if (iIn === -1 || iOut === -1) {
      return { success: false, error: `Token not found in pool. Pool contains: ${poolCoins.map(c => c.symbol).join(', ')}` };
    }

    const decimalsIn  = poolCoins[iIn].decimals;
    const decimalsOut = poolCoins[iOut].decimals;
    const amountInRaw = parseUnits(String(amountIn), decimalsIn);

    // Get expected output to calculate min_dy
    const getDyData = '0x5e0d443f' + p32(iIn) + p32(iOut) + p32(amountInRaw);
    const getDyResult = await ethCall(poolAddr, getDyData);
    const expectedOut  = BigInt(getDyResult);
    const slip         = BigInt(slippageBps);
    const minDy        = expectedOut * (10000n - slip) / 10000n;

    // Curve StableSwap: exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) — selector 3df02124
    const exchangeData = '0x3df02124' + p32(iIn) + p32(iOut) + p32(amountInRaw) + p32(minDy);
    const tokenInAddr  = poolCoins[iIn].address;

    return {
      success: true,
      output: {
        transactions: [
          {
            to: tokenInAddr,
            data: '0x095ea7b3' + p32(poolAddr) + p32(amountInRaw),
            value: '0x0',
            chain_id: CHAIN_ID,
            description: `Approve ${amountIn} ${tInSymbol} to Curve pool`,
          },
          {
            to: poolAddr,
            data: exchangeData,
            value: '0x0',
            chain_id: CHAIN_ID,
            description: `Swap ${amountIn} ${tInSymbol} → at least ${formatUnits(minDy, decimalsOut)} ${tOutSymbol} via Curve on XLayer`,
          },
        ],
        amountIn:    String(amountIn),
        amountOutMin: formatUnits(minDy, decimalsOut),
        expected_out: formatUnits(expectedOut, decimalsOut),
        slippage_bps: slippageBps,
        pool:        poolAddr,
        chain:       CHAIN,
        chain_id:    CHAIN_ID,
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_swap_tx failed: ${err.message}` };
  }
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeCurveXLayerSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'list_pools':    return listPools();
    case 'get_pool':      return getPool(input);
    case 'get_quote':     return getQuote(input);
    case 'build_swap_tx': return buildSwapTx(input);
    default:
      return { success: false, error: `Unknown action "${action}". Valid: list_pools, get_pool, get_quote, build_swap_tx` };
  }
}
