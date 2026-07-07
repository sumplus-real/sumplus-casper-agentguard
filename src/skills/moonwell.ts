/**
 * Moonwell Finance Skill — Server-side execution on Base
 *
 * Moonwell is the dominant lending protocol on Base (~$800M TVL).
 * Compound V2 fork with timestamp-based interest rates.
 *
 * [ARSENAL-HOSTED ✓] Arsenal provides Alchemy RPC. No API key needed.
 *
 * Contracts on Base (chain ID 8453):
 *   Comptroller: 0xfBb21d0380beE3312B33c4353c8936a0F13EF26C
 *   Oracle:      0xEC942bE8A8114bFD0396A5052c36027f2cA6a9d0
 */

import type { SkillExecutionResult } from '@/types/skill';

const ALCHEMY_URL = 'https://base-mainnet.g.alchemy.com/v2';

const COMPTROLLER = '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C';

// mToken markets on Base — verified from Moonwell docs
const MARKETS: Record<string, { mToken: string; underlying: string; decimals: number; symbol: string }> = {
  USDC:   { mToken: '0xedc817a28e8b93b03976fbd4a3ddbc9f7d176c22', underlying: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,  symbol: 'USDC'   },
  WETH:   { mToken: '0x628ff693426583D9a7FB391E54366292F509D457', underlying: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH'   },
  DAI:    { mToken: '0x73b06d8d18de422e269645eace15400de7462417', underlying: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, symbol: 'DAI'    },
  USDT:   { mToken: '0x36918B66F9A3eC7a59d0007D8458DB17bDffBF21', underlying: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6,  symbol: 'USDT'   },
  CBETH:  { mToken: '0x3bf93770f2d4a794c3d9EBEfBAeBAE2a8f09A5E5', underlying: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18, symbol: 'cbETH'  },
  WSTETH: { mToken: '0x627Fe393Bc6EdDA28e99AE648fD6fF362514304b', underlying: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', decimals: 18, symbol: 'wstETH' },
  AERO:   { mToken: '0x73902f619CEB9B31FD8EFecf435CbDf89E369Ba6', underlying: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18, symbol: 'AERO'   },
};

// Verified selectors
const SEL = {
  supplyRatePerTimestamp:  'd3bd2c72',
  borrowRatePerTimestamp:  'cd91801c',
  totalSupply:             '18160ddd',
  totalBorrows:            '47bd3718',
  exchangeRateCurrent:     'bd6d894d',
  balanceOfUnderlying:     '3af9e669',
  borrowBalanceCurrent:    '17bfdfbc',
  getAccountLiquidity:     '5ec88c79',
  mint:                    'a0712d68',
  borrow:                  'c5ebeaec',
  repayBorrow:             '0e752702',
  redeemUnderlying:        '852a12e3',
  approve:                 '095ea7b3',
  enterMarkets:            'c2998238',
} as const;

const SECONDS_PER_YEAR = 31536000;

// ── skill metadata ────────────────────────────────────────────────────────────
export const MOONWELL_SKILL_METADATA = {
  name: 'Moonwell',
  description:
    '[ARSENAL-HOSTED ✓] Interact with Moonwell — the dominant lending protocol on Base (~$800M TVL). ' +
    'Compound V2 fork. Get live market rates and TVL, check user positions across all markets, ' +
    'and build unsigned supply/borrow/repay/withdraw transactions.\n\n' +
    'execution_mode: server-side\nchain: base (id: 8453)\n' +
    'protocol: Moonwell (moonwell.fi)\nmarkets: USDC, WETH, DAI, USDT, cbETH, wstETH, AERO',
  category: 'DeFi',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  tags: ['moonwell', 'base', 'lending', 'borrowing', 'defi', 'compound', 'l2', 'coinbase'],
  external_url: 'https://moonwell.fi',
  logo_url: 'https://icons.llamao.fi/icons/protocols/moonwell?w=48&h=48',
  partner_verified: true,
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['get_markets', 'get_user_position', 'build_supply_tx', 'build_borrow_tx', 'build_repay_tx', 'build_withdraw_tx'],
        description:
          'get_markets: Live supply/borrow APY and TVL for all markets. ' +
          'get_user_position: Supplied and borrowed amounts for a wallet across all markets. ' +
          'build_supply_tx: Build approve + mint transactions to supply assets. ' +
          'build_borrow_tx: Build borrow transaction (collateral must be supplied first). ' +
          'build_repay_tx: Build approve + repayBorrow transactions. ' +
          'build_withdraw_tx: Build redeemUnderlying transaction to withdraw supplied assets.',
      },
      token: {
        type: 'string',
        description: 'Token symbol: USDC, WETH, DAI, USDT, cbETH, wstETH, AERO. Required for all tx actions.',
      },
      amount: {
        type: 'string',
        description: 'Human-readable amount (e.g. "100" for 100 USDC, "0.5" for 0.5 WETH). Required for tx actions.',
      },
      sender: {
        type: 'string',
        description: 'Wallet address (0x). Required for get_user_position and all tx actions.',
      },
      repay_all: {
        type: 'boolean',
        description: 'For build_repay_tx: if true, repays the full borrow balance (passes uint256.max). Default: false.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Get all market rates',
      input: { action: 'get_markets' },
    },
    {
      title: 'Check user position',
      input: { action: 'get_user_position', sender: '0xYourAddress' },
    },
    {
      title: 'Supply 100 USDC',
      input: { action: 'build_supply_tx', token: 'USDC', amount: '100', sender: '0xYourAddress' },
    },
    {
      title: 'Borrow 0.05 WETH',
      input: { action: 'build_borrow_tx', token: 'WETH', amount: '0.05', sender: '0xYourAddress' },
    },
    {
      title: 'Repay all USDC borrow',
      input: { action: 'build_repay_tx', token: 'USDC', sender: '0xYourAddress', repay_all: true },
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
  if (json.error) throw new Error(`eth_call: ${json.error.message}`);
  return json.result ?? '0x';
}

function p32(v: string | bigint | number): string {
  if (typeof v === 'string' && v.startsWith('0x'))
    return v.slice(2).toLowerCase().padStart(64, '0');
  return BigInt(v).toString(16).padStart(64, '0');
}

function readU256(hex: string, slot = 0): bigint {
  const h = hex.replace('0x', '');
  return BigInt('0x' + (h.slice(slot * 64, slot * 64 + 64) || '0'));
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

/** Convert per-second rate (scaled 1e18) to APY percentage */
function rateToAPY(ratePerSecond: bigint): string {
  const rate = Number(ratePerSecond) / 1e18;
  const apy = (Math.pow(1 + rate, SECONDS_PER_YEAR) - 1) * 100;
  return apy.toFixed(2) + '%';
}

function resolveMarket(token: string): typeof MARKETS[string] {
  const key = token.trim().toUpperCase();
  const market = MARKETS[key] ?? MARKETS[token.toUpperCase().replace('ETH', 'WETH')];
  if (!market) throw new Error(
    `Unknown token "${token}". Supported: ${Object.keys(MARKETS).join(', ')}`
  );
  return market;
}

// ── actions ───────────────────────────────────────────────────────────────────
async function getMarkets(input: any): Promise<SkillExecutionResult> {
  try {
    const apiKey = getApiKey();

    const results = await Promise.all(
      Object.entries(MARKETS).map(async ([symbol, market]) => {
        try {
          const [supplyRateHex, borrowRateHex, totalSupplyHex, totalBorrowsHex, exchangeRateHex] =
            await Promise.all([
              ethCall(market.mToken, '0x' + SEL.supplyRatePerTimestamp, apiKey),
              ethCall(market.mToken, '0x' + SEL.borrowRatePerTimestamp, apiKey),
              ethCall(market.mToken, '0x' + SEL.totalSupply, apiKey),
              ethCall(market.mToken, '0x' + SEL.totalBorrows, apiKey),
              ethCall(market.mToken, '0x' + SEL.exchangeRateCurrent, apiKey),
            ]);

          const supplyRate   = readU256(supplyRateHex);
          const borrowRate   = readU256(borrowRateHex);
          const totalSupplyM = readU256(totalSupplyHex);   // in mTokens
          const totalBorrows = readU256(totalBorrowsHex);  // in underlying
          const exchangeRate = readU256(exchangeRateHex);  // scaled 1e18 * 10^(18 - underlying decimals + 8)

          // Compound V2: rawUnderlying = rawMToken * exchangeRate / 1e18
          // formatUnits then converts rawUnderlying → human readable
          const totalSupplyUnderlying = totalSupplyM * exchangeRate / (10n ** 18n);

          return {
            symbol,
            mToken: market.mToken,
            supply_apy: rateToAPY(supplyRate),
            borrow_apy: rateToAPY(borrowRate),
            total_supply: formatUnits(totalSupplyUnderlying, market.decimals),
            total_borrows: formatUnits(totalBorrows, market.decimals),
          };
        } catch {
          return { symbol, mToken: market.mToken, error: 'failed to fetch' };
        }
      })
    );

    return { success: true, output: { markets: results, chain: 'base', protocol: 'Moonwell' } };
  } catch (err: any) {
    return { success: false, error: `get_markets failed: ${err.message}` };
  }
}

async function getUserPosition(input: any): Promise<SkillExecutionResult> {
  const { sender } = input;
  if (!sender) return { success: false, error: 'sender is required for get_user_position' };

  try {
    const apiKey = getApiKey();

    const positions = await Promise.all(
      Object.entries(MARKETS).map(async ([symbol, market]) => {
        try {
          const [suppliedHex, borrowedHex] = await Promise.all([
            ethCall(market.mToken, '0x' + SEL.balanceOfUnderlying + p32(sender), apiKey),
            ethCall(market.mToken, '0x' + SEL.borrowBalanceCurrent + p32(sender), apiKey),
          ]);
          const supplied = readU256(suppliedHex);
          const borrowed = readU256(borrowedHex);
          if (supplied === 0n && borrowed === 0n) return null;
          return {
            symbol,
            supplied: formatUnits(supplied, market.decimals),
            borrowed: formatUnits(borrowed, market.decimals),
            mToken: market.mToken,
          };
        } catch {
          return null;
        }
      })
    );

    const active = positions.filter(Boolean);

    // Account liquidity (how much more can be borrowed)
    const liquidityHex = await ethCall(
      COMPTROLLER,
      '0x' + SEL.getAccountLiquidity + p32(sender),
      apiKey
    ).catch(() => '0x');
    const liquidity = liquidityHex !== '0x' ? readU256(liquidityHex, 1) : 0n;
    const shortfall = liquidityHex !== '0x' ? readU256(liquidityHex, 2) : 0n;

    return {
      success: true,
      output: {
        address: sender,
        positions: active,
        liquidity_usd: formatUnits(liquidity, 18),
        shortfall_usd: formatUnits(shortfall, 18),
        at_risk: shortfall > 0n,
        chain: 'base',
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_user_position failed: ${err.message}` };
  }
}

async function buildSupplyTx(input: any): Promise<SkillExecutionResult> {
  const { token, amount, sender } = input;
  if (!token)  return { success: false, error: 'token is required' };
  if (!amount) return { success: false, error: 'amount is required' };
  if (!sender) return { success: false, error: 'sender is required' };

  try {
    const market = resolveMarket(token);
    const amountRaw = parseUnits(String(amount), market.decimals);

    return {
      success: true,
      output: {
        transactions: [
          {
            to: market.underlying,
            data: '0x' + SEL.approve + p32(market.mToken) + p32(amountRaw),
            value: '0x0',
            description: `Approve ${amount} ${market.symbol} to Moonwell m${market.symbol}`,
          },
          {
            to: market.mToken,
            data: '0x' + SEL.mint + p32(amountRaw),
            value: '0x0',
            description: `Supply ${amount} ${market.symbol} to Moonwell`,
          },
        ],
        token: market.symbol,
        amount,
        mToken: market.mToken,
        chain: 'base',
        note: 'Execute transactions in order. After supplying, call enterMarkets if you plan to use this as collateral for borrowing.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_supply_tx failed: ${err.message}` };
  }
}

async function buildBorrowTx(input: any): Promise<SkillExecutionResult> {
  const { token, amount, sender } = input;
  if (!token)  return { success: false, error: 'token is required' };
  if (!amount) return { success: false, error: 'amount is required' };
  if (!sender) return { success: false, error: 'sender is required' };

  try {
    const apiKey = getApiKey();
    const market = resolveMarket(token);
    const amountRaw = parseUnits(String(amount), market.decimals);

    // Check account liquidity first
    const liquidityHex = await ethCall(
      COMPTROLLER,
      '0x' + SEL.getAccountLiquidity + p32(sender),
      apiKey
    ).catch(() => '0x');
    const liquidity = liquidityHex !== '0x' ? readU256(liquidityHex, 1) : 0n;
    const shortfall = liquidityHex !== '0x' ? readU256(liquidityHex, 2) : 0n;

    if (shortfall > 0n) {
      return {
        success: false,
        error: `Account is already under-collateralised (shortfall: $${formatUnits(shortfall, 18)}). Repay borrow or add collateral first.`,
      };
    }

    const transactions = [];

    // enterMarkets for the borrow token's mToken (idempotent — safe to call even if already entered)
    transactions.push({
      to: COMPTROLLER,
      data: '0x' + SEL.enterMarkets
        + p32(0x20)           // offset to array
        + p32(1)              // length
        + p32(market.mToken), // mToken address
      value: '0x0',
      description: `Enter ${market.symbol} market as collateral on Moonwell (idempotent)`,
    });

    transactions.push({
      to: market.mToken,
      data: '0x' + SEL.borrow + p32(amountRaw),
      value: '0x0',
      description: `Borrow ${amount} ${market.symbol} from Moonwell`,
    });

    return {
      success: true,
      output: {
        transactions,
        token: market.symbol,
        amount,
        mToken: market.mToken,
        available_liquidity_usd: formatUnits(liquidity, 18),
        chain: 'base',
        warning: liquidity === 0n
          ? 'No collateral detected. Supply assets first, then enterMarkets before borrowing.'
          : undefined,
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_borrow_tx failed: ${err.message}` };
  }
}

async function buildRepayTx(input: any): Promise<SkillExecutionResult> {
  const { token, amount, sender, repay_all = false } = input;
  if (!token)  return { success: false, error: 'token is required' };
  if (!sender) return { success: false, error: 'sender is required' };
  if (!repay_all && !amount) return { success: false, error: 'amount is required (or set repay_all: true)' };

  try {
    const apiKey = getApiKey();
    const market = resolveMarket(token);

    let amountRaw: bigint;
    let amountDisplay: string;

    if (repay_all) {
      // uint256.max — repays entire balance
      amountRaw = (2n ** 256n) - 1n;
      // Fetch actual borrow balance for display
      const borrowHex = await ethCall(
        market.mToken, '0x' + SEL.borrowBalanceCurrent + p32(sender), apiKey
      ).catch(() => '0x');
      const actualBorrow = borrowHex !== '0x' ? readU256(borrowHex) : 0n;
      amountDisplay = formatUnits(actualBorrow, market.decimals) + ' (full balance)';
    } else {
      amountRaw = parseUnits(String(amount), market.decimals);
      amountDisplay = String(amount);
    }

    // For approve, use actual amount if repay_all, else exact amount
    const approveAmount = repay_all
      ? (2n ** 256n) - 1n  // max approve
      : amountRaw;

    return {
      success: true,
      output: {
        transactions: [
          {
            to: market.underlying,
            data: '0x' + SEL.approve + p32(market.mToken) + p32(approveAmount),
            value: '0x0',
            description: `Approve ${market.symbol} to Moonwell for repayment`,
          },
          {
            to: market.mToken,
            data: '0x' + SEL.repayBorrow + p32(amountRaw),
            value: '0x0',
            description: `Repay ${amountDisplay} ${market.symbol} to Moonwell`,
          },
        ],
        token: market.symbol,
        amount: amountDisplay,
        mToken: market.mToken,
        chain: 'base',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_repay_tx failed: ${err.message}` };
  }
}

async function buildWithdrawTx(input: any): Promise<SkillExecutionResult> {
  const { token, amount, sender } = input;
  if (!token)  return { success: false, error: 'token is required' };
  if (!amount) return { success: false, error: 'amount is required' };
  if (!sender) return { success: false, error: 'sender is required' };

  try {
    const market = resolveMarket(token);
    const amountRaw = parseUnits(String(amount), market.decimals);

    return {
      success: true,
      output: {
        transactions: [
          {
            to: market.mToken,
            data: '0x' + SEL.redeemUnderlying + p32(amountRaw),
            value: '0x0',
            description: `Withdraw ${amount} ${market.symbol} from Moonwell`,
          },
        ],
        token: market.symbol,
        amount,
        mToken: market.mToken,
        chain: 'base',
        note: 'Withdrawal may be limited if assets are used as collateral for active borrows.',
      },
    };
  } catch (err: any) {
    return { success: false, error: `build_withdraw_tx failed: ${err.message}` };
  }
}

// ── entry ─────────────────────────────────────────────────────────────────────
export async function executeMoonwellSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'get_markets':       return await getMarkets(input);
    case 'get_user_position': return await getUserPosition(input);
    case 'build_supply_tx':   return await buildSupplyTx(input);
    case 'build_borrow_tx':   return await buildBorrowTx(input);
    case 'build_repay_tx':    return await buildRepayTx(input);
    case 'build_withdraw_tx': return await buildWithdrawTx(input);
    default:
      return {
        success: false,
        error: `Unknown action: "${action}". Valid: get_markets, get_user_position, build_supply_tx, build_borrow_tx, build_repay_tx, build_withdraw_tx`,
      };
  }
}
