/**
 * Official Skill: Crypto Wallet Manager
 *
 * Multi-chain wallet queries powered by Alchemy.
 * Sumplus provides the Alchemy API key — users don't need their own.
 *
 * Supported chains: Ethereum, Polygon, Arbitrum, Optimism, Base
 * (SUI handled separately via sui-blockchain.ts)
 */

export const WALLET_SKILL_METADATA = {
  name: "Crypto Wallet Manager",
  description:
    "Multi-chain crypto wallet queries powered by Alchemy. Get real on-chain token balances, " +
    "ETH/native balances, NFT holdings, transaction history, and gas estimates across " +
    "Ethereum, Polygon, Arbitrum, Optimism, and Base.",
  category: 'Infrastructure',
  version: "2.0.0",
  author_type: "official",
  is_paid: false,
  price: null,
  tags: ["wallet", "ethereum", "polygon", "multichain", "gas", "defi", "alchemy", "nft"],
  partner_verified: true,
  status: "approved",
  schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        type: "string",
        enum: [
          "get_balances",
          "get_token_balances",
          "get_nfts",
          "get_transactions",
          "estimate_gas",
          "validate_address",
        ],
        description: "Wallet action to perform",
      },
      address: {
        type: "string",
        description: "EVM wallet address (0x...)",
      },
      chain: {
        type: "string",
        enum: ["ethereum", "polygon", "arbitrum", "optimism", "base"],
        description: "Chain to query (default: ethereum)",
      },
      token_address: {
        type: "string",
        description: "ERC-20 contract address to query directly (optional)",
      },
      token_symbol: {
        type: "string",
        description: "Token symbol to search for (e.g. USDC, WETH). Searches across all known contracts for that symbol.",
      },
      limit: {
        type: "number",
        description: "Max results per page (default: 20, max: 100)",
      },
      page_key: {
        type: "string",
        description: "Pagination cursor from previous response's next_page_key. Use to fetch next page of token balances.",
      },
      tx_type: {
        type: "string",
        enum: ["external", "erc20", "erc721", "erc1155", "all"],
        description: "Transaction type filter (default: all)",
      },
    },
  },
};

// ── Chain config ──────────────────────────────────────────────────────────

const CHAIN_URLS: Record<string, string> = {
  ethereum: "https://eth-mainnet.g.alchemy.com/v2",
  polygon: "https://polygon-mainnet.g.alchemy.com/v2",
  arbitrum: "https://arb-mainnet.g.alchemy.com/v2",
  optimism: "https://opt-mainnet.g.alchemy.com/v2",
  base: "https://base-mainnet.g.alchemy.com/v2",
};

const NFT_URLS: Record<string, string> = {
  ethereum: "https://eth-mainnet.g.alchemy.com/nft/v3",
  polygon: "https://polygon-mainnet.g.alchemy.com/nft/v3",
  arbitrum: "https://arb-mainnet.g.alchemy.com/nft/v3",
  optimism: "https://opt-mainnet.g.alchemy.com/nft/v3",
  base: "https://base-mainnet.g.alchemy.com/nft/v3",
};

const NATIVE_SYMBOLS: Record<string, string> = {
  ethereum: "ETH",
  polygon: "MATIC",
  arbitrum: "ETH",
  optimism: "ETH",
  base: "ETH",
};

// ── Alchemy HTTP helpers ──────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("ALCHEMY_API_KEY not configured");
  return key;
}

async function alchemyRpc(
  chain: string,
  method: string,
  params: unknown[]
): Promise<unknown> {
  const apiKey = getApiKey();
  const url = `${CHAIN_URLS[chain]}/${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) throw new Error(`Alchemy RPC error: ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`Alchemy error: ${json.error.message}`);
  return json.result;
}

async function alchemyGet(
  baseUrl: string,
  path: string,
  params: Record<string, string>
): Promise<unknown> {
  const apiKey = getApiKey();
  const url = new URL(`${baseUrl}/${apiKey}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Alchemy API error: ${res.status}`);
  return res.json();
}

// ── Token address maps (module-level, shared across actions) ─────────────

const MAJOR_TOKENS: Record<string, string[]> = {
  ethereum: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","0xdAC17F958D2ee523a2206206994597C13D831ec7","0x6B175474E89094C44Da98b954EedeAC495271d0F","0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2","0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"],
  polygon:  ["0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174","0xc2132D05D31c914a87C6611C10748AEb04B58e8F","0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063","0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"],
  arbitrum: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9","0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"],
  optimism: ["0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85","0x94b008aA00579c1307B0EF2c499aD98a8ce58e58","0x4200000000000000000000000000000000000006"],
  base:     ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","0x4200000000000000000000000000000000000006"],
};

const SYMBOL_MAP: Record<string, Record<string, string>> = {
  USDC:  { ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  USDT:  { ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7", polygon: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", arbitrum: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", optimism: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" },
  WETH:  { ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", polygon: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", optimism: "0x4200000000000000000000000000000000000006", base: "0x4200000000000000000000000000000000000006" },
  DAI:   { ethereum: "0x6B175474E89094C44Da98b954EedeAC495271d0F", polygon: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063" },
  WBTC:  { ethereum: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
};

// ── Executors ─────────────────────────────────────────────────────────────

export async function executeWalletSkill(input: {
  action: string;
  address?: string;
  chain?: string;
  token_address?: string;
  token_symbol?: string;
  limit?: number;
  page_key?: string;
  tx_type?: string;
}): Promise<unknown> {
  const {
    action,
    address,
    chain = "ethereum",
    token_address,
    token_symbol,
    limit = 20,
    page_key,
    tx_type = "all",
  } = input;

  if (!CHAIN_URLS[chain]) {
    throw new Error(`Unsupported chain: ${chain}. Use: ${Object.keys(CHAIN_URLS).join(", ")}`);
  }

  switch (action) {
    // ── Native ETH/MATIC balance ────────────────────────────────────────
    case "get_balances": {
      if (!address) throw new Error("address is required");

      const balanceHex = await alchemyRpc(chain, "eth_getBalance", [address, "latest"]) as string;
      const balanceWei = BigInt(balanceHex);
      const balanceNative = Number(balanceWei) / 1e18;
      const nativeSymbol = NATIVE_SYMBOLS[chain];

      return {
        address,
        chain,
        native: {
          symbol: nativeSymbol,
          balance: parseFloat(balanceNative.toFixed(6)),
          balance_wei: balanceWei.toString(),
        },
        source: "Alchemy",
      };
    }

    // ── ERC-20 token balances ───────────────────────────────────────────
    case "get_token_balances": {
      if (!address) throw new Error("address is required");

      // Major tokens guaranteed to be checked on each chain
      const MAJOR_TOKENS: Record<string, string[]> = {
        ethereum: [
          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
          "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
          "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
          "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
          "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
        ],
        polygon: [
          "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
          "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
          "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", // DAI
          "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH
        ],
        arbitrum: [
          "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
          "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
          "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
        ],
        optimism: [
          "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // USDC
          "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", // USDT
          "0x4200000000000000000000000000000000000006", // WETH
        ],
        base: [
          "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
          "0x4200000000000000000000000000000000000006", // WETH
        ],
      };

      type TokenBalance = { contractAddress: string; tokenBalance: string; error?: string };
      type RpcResult = { tokenBalances: TokenBalance[]; pageKey?: string };

      const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const pageLimit = Math.min(limit, 100);

      // ── Case 1: search by symbol (e.g. token_symbol: "USDC") ──────────
      if (token_symbol && !token_address) {
        const sym = token_symbol.toUpperCase();
        // Map common symbols to known contract addresses per chain

        const contractAddr = SYMBOL_MAP[sym]?.[chain];
        if (contractAddr) {
          const r = await alchemyRpc(chain, "alchemy_getTokenBalances", [address, [contractAddr]]) as RpcResult;
          const t = r.tokenBalances[0];
          if (!t || t.tokenBalance === ZERO) {
            return { address, chain, token_symbol: sym, balance: 0, found: true, message: `No ${sym} balance on ${chain}`, source: "Alchemy" };
          }
          const meta = await alchemyRpc(chain, "alchemy_getTokenMetadata", [contractAddr]) as { symbol: string; name: string; decimals: number };
          const decimals = meta.decimals ?? 18;
          const balance = parseFloat((Number(BigInt(t.tokenBalance)) / Math.pow(10, decimals)).toFixed(6));
          return { address, chain, token_symbol: sym, contract: contractAddr, balance, name: meta.name, decimals, source: "Alchemy" };
        }
        // Symbol not in map — fall through to full scan below
      }

      // ── Case 2: specific contract address ──────────────────────────────
      if (token_address) {
        const r = await alchemyRpc(chain, "alchemy_getTokenBalances", [address, [token_address]]) as RpcResult;
        const t = r.tokenBalances[0];
        if (!t || t.tokenBalance === ZERO) {
          return { address, chain, contract: token_address, balance: 0, found: true, message: "No balance for this token", source: "Alchemy" };
        }
        const meta = await alchemyRpc(chain, "alchemy_getTokenMetadata", [token_address]) as { symbol: string; name: string; decimals: number };
        const decimals = meta.decimals ?? 18;
        const balance = parseFloat((Number(BigInt(t.tokenBalance)) / Math.pow(10, decimals)).toFixed(6));
        return { address, chain, contract: token_address, symbol: meta.symbol, name: meta.name, balance, decimals, source: "Alchemy" };
      }

      // ── Case 3: full scan with pagination ──────────────────────────────

      // Fetch current page from Alchemy (supports pageKey)
      const erc20Params: unknown[] = page_key
        ? [address, "erc20", { pageKey: page_key }]
        : [address, "erc20"];
      const erc20Result = await alchemyRpc(chain, "alchemy_getTokenBalances", erc20Params) as RpcResult;
      const nextPageKey = erc20Result.pageKey ?? null;

      let allBalances: TokenBalance[] = [];

      if (!page_key) {
        // First page: also query major tokens and merge (major tokens first)
        const majorResult = await alchemyRpc(chain, "alchemy_getTokenBalances", [address, MAJOR_TOKENS[chain] ?? []]) as RpcResult;
        const seen = new Set<string>();
        for (const t of [...majorResult.tokenBalances, ...erc20Result.tokenBalances]) {
          const key = t.contractAddress.toLowerCase();
          if (!seen.has(key)) { seen.add(key); allBalances.push(t); }
        }
      } else {
        allBalances = erc20Result.tokenBalances;
      }

      const nonZero = allBalances
        .filter((t) => !t.error && t.tokenBalance !== ZERO)
        .slice(0, pageLimit);

      // Fetch metadata for each token
      const enriched = await Promise.all(
        nonZero.map(async (t) => {
          try {
            const meta = await alchemyRpc(chain, "alchemy_getTokenMetadata", [t.contractAddress]) as { name: string; symbol: string; decimals: number };
            const decimals = meta.decimals ?? 18;
            const balance = parseFloat((Number(BigInt(t.tokenBalance)) / Math.pow(10, decimals)).toFixed(6));
            return { contract: t.contractAddress, symbol: meta.symbol, name: meta.name, balance, decimals };
          } catch {
            return { contract: t.contractAddress, symbol: "UNKNOWN", name: "Unknown Token", balance: 0, decimals: 18 };
          }
        })
      );

      return {
        address,
        chain,
        token_count: enriched.length,
        tokens: enriched,
        has_more: nextPageKey !== null,
        next_page_key: nextPageKey,
        pagination_hint: nextPageKey
          ? `More tokens available. Call again with page_key: "${nextPageKey}" to fetch the next page.`
          : "All tokens fetched.",
        source: "Alchemy",
      };
    }

    // ── NFT holdings ────────────────────────────────────────────────────
    case "get_nfts": {
      if (!address) throw new Error("address is required");

      const params: Record<string, string> = {
        owner: address,
        pageSize: String(Math.min(limit, 100)),
        withMetadata: "true",
      };
      if (token_address) params.contractAddresses = token_address;

      const result = await alchemyGet(NFT_URLS[chain], "getNFTsForOwner", params) as {
        ownedNfts: Array<{
          contract: { address: string; name?: string };
          tokenId: string;
          name?: string;
          description?: string;
          image?: { cachedUrl?: string; originalUrl?: string };
          collection?: { name?: string };
        }>;
        totalCount: number;
      };

      const nfts = result.ownedNfts.map((n) => ({
        contract: n.contract.address,
        collection: n.collection?.name ?? n.contract.name ?? "Unknown",
        token_id: n.tokenId,
        name: n.name ?? `#${n.tokenId}`,
        description: n.description?.slice(0, 120),
        image: n.image?.cachedUrl ?? n.image?.originalUrl ?? null,
      }));

      return {
        address,
        chain,
        total_count: result.totalCount,
        nfts,
        source: "Alchemy",
      };
    }

    // ── Transaction history ──────────────────────────────────────────────
    case "get_transactions": {
      if (!address) throw new Error("address is required");

      const category = tx_type === "all"
        ? ["external", "erc20", "erc721", "erc1155", "specialnft"]
        : [tx_type];

      const result = await alchemyRpc(chain, "alchemy_getAssetTransfers", [
        {
          fromAddress: address,
          category,
          maxCount: `0x${limit.toString(16)}`,
          withMetadata: true,
          order: "desc",
        },
      ]) as {
        transfers: Array<{
          hash: string;
          from: string;
          to: string | null;
          value: number | null;
          asset: string | null;
          category: string;
          metadata: { blockTimestamp?: string };
          rawContract?: { address?: string };
        }>;
      };

      const txs = result.transfers.map((t) => ({
        hash: t.hash,
        from: t.from,
        to: t.to,
        value: t.value,
        asset: t.asset,
        category: t.category,
        timestamp: t.metadata?.blockTimestamp ?? null,
        contract: t.rawContract?.address ?? null,
      }));

      return {
        address,
        chain,
        tx_count: txs.length,
        transactions: txs,
        source: "Alchemy",
      };
    }

    // ── Gas estimate ─────────────────────────────────────────────────────
    case "estimate_gas": {
      const [gasPriceHex, block] = await Promise.all([
        alchemyRpc(chain, "eth_gasPrice", []) as Promise<string>,
        alchemyRpc(chain, "eth_getBlockByNumber", ["latest", false]) as Promise<{
          baseFeePerGas?: string;
        }>,
      ]);

      const gasPriceGwei = parseInt(gasPriceHex, 16) / 1e9;
      const baseFeeGwei = block.baseFeePerGas
        ? parseInt(block.baseFeePerGas, 16) / 1e9
        : null;

      const ethTransferCost = (gasPriceGwei * 21000) / 1e9;
      const erc20TransferCost = (gasPriceGwei * 65000) / 1e9;
      const nativeSymbol = NATIVE_SYMBOLS[chain];

      return {
        chain,
        gas_price_gwei: parseFloat(gasPriceGwei.toFixed(4)),
        base_fee_gwei: baseFeeGwei ? parseFloat(baseFeeGwei.toFixed(4)) : null,
        estimates: {
          native_transfer: {
            gas_units: 21000,
            cost_native: parseFloat(ethTransferCost.toFixed(8)),
            symbol: nativeSymbol,
          },
          erc20_transfer: {
            gas_units: 65000,
            cost_native: parseFloat(erc20TransferCost.toFixed(8)),
            symbol: nativeSymbol,
          },
        },
        source: "Alchemy",
      };
    }

    // ── Address validation ───────────────────────────────────────────────
    case "validate_address": {
      if (!address) throw new Error("address is required");

      const isEvm = /^0x[0-9a-fA-F]{40}$/.test(address);
      const isSui = /^0x[0-9a-fA-F]{64}$/.test(address);
      const isEns = /^[a-zA-Z0-9-]+\.eth$/.test(address);

      let resolvedAddress: string | null = null;
      if (isEns) {
        try {
          // Try ENS resolution on Ethereum
          const result = await alchemyRpc("ethereum", "eth_call", [
            { to: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", data: `0x0178b8bf${Buffer.from(address).toString("hex").padStart(64, "0")}` },
            "latest",
          ]);
          if (result && result !== "0x") resolvedAddress = result as string;
        } catch { /* ENS resolution optional */ }
      }

      return {
        address,
        valid: isEvm || isSui || isEns,
        type: isEvm ? "evm" : isSui ? "sui" : isEns ? "ens" : "unknown",
        checksum_valid: isEvm
          ? address === address.toLowerCase() || /^0x[0-9a-fA-F]{40}$/.test(address)
          : null,
        ens_resolved: resolvedAddress,
      };
    }

    default:
      throw new Error(`Unknown wallet action: ${action}`);
  }
}
