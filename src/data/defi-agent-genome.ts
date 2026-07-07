import type { Genome } from "@/types/evomap";

export const DEFI_AGENT_GENOME: Genome = {
  id: "sumplus-maria-genome",
  name: "Sumplus Maria Genome",
  version: "1.0.0",
  description:
    "Maria is a DeFi expert agent powered by Sumplus Arsenal. Her genome enables " +
    "autonomous token trading, portfolio management, yield optimization, and market " +
    "intelligence across multiple EVM chains and the SUI network.",
  persona:
    "You are Maria, a DeFi expert agent powered by Sumplus Arsenal. You can execute token swaps " +
    "on Uniswap V3, manage multi-chain wallets, optimize yield farming positions across " +
    "Aave, Curve, Compound, and Cetus, and query real-time token prices for 10,000+ " +
    "cryptocurrencies. You provide data-driven recommendations and always consider gas " +
    "costs, slippage, and risk tolerance when advising on DeFi strategies.",
  domain: "DeFi",
  supported_chains: ["ethereum", "polygon", "arbitrum", "optimism", "base", "sui"],
  required_features: ["network-access", "web3-wallet"],
  author: "Sumplus Arsenal",
  created_at: "2026-02-24T00:00:00Z",
  updated_at: "2026-02-24T00:00:00Z",
  genes: [
    {
      id: "uniswap-operations",
      name: "Uniswap Operations",
      description:
        "Execute token swaps, get price quotes, and analyze liquidity pools on Uniswap V3 " +
        "across Ethereum, Arbitrum, Polygon, Base, and Optimism.",
      category: "Blockchain",
      capabilities: [
        "Token Swap - Execute swaps with slippage protection",
        "Price Quote - Get real-time swap quotes without executing",
        "Pool Info - Pool analytics including TVL, volume, and APR",
      ],
      skill_id: null,
      source: "seeds/uniswap-skills.json",
      is_paid: true,
      tags: ["uniswap", "dex", "swap", "liquidity", "v3"],
    },
    {
      id: "wallet-manager",
      name: "Crypto Wallet Manager",
      description:
        "Multi-chain wallet operations: aggregate balances across EVM chains and SUI, " +
        "estimate gas fees, validate addresses, and get token prices.",
      category: "Blockchain",
      capabilities: [
        "aggregate_balances - Portfolio view across chains",
        "estimate_gas - Gas cost estimation for transactions",
        "validate_address - EVM and SUI address validation",
        "get_token_price - Quick token price lookup",
      ],
      skill_id: null,
      source: "src/skills/wallet.ts",
      is_paid: false,
      tags: ["wallet", "multichain", "gas", "balance"],
    },
    {
      id: "yield-optimizer",
      name: "Sumplus Yield Optimizer",
      description:
        "Discover and optimize yield farming opportunities across Aave V3, Curve, " +
        "Compound V3, GMX, and Cetus on the Sumplus platform (sumpl.us).",
      category: "Finance",
      capabilities: [
        "list_opportunities - Browse yield opportunities with risk filtering",
        "get_my_positions - View current farming positions and earnings",
        "calculate_apy - Compute simple and compound APY projections",
        "get_recommendation - AI-powered yield strategy recommendations",
      ],
      skill_id: null,
      source: "src/skills/sumplus-yield.ts",
      is_paid: true,
      tags: ["yield", "farming", "aave", "curve", "apy"],
    },
    {
      id: "token-price-query",
      name: "Token Price Query",
      description:
        "Real-time cryptocurrency price data for 10,000+ tokens via CoinGecko. " +
        "Covers Bitcoin, Ethereum, altcoins, DeFi tokens, and memecoins.",
      category: "DeFi",
      capabilities: [
        "get_price - Current prices with market cap and volume",
        "get_market_data - Detailed market information",
        "search_token - Find tokens by name or symbol",
        "get_historical_price - Historical price data",
      ],
      skill_id: "ff0d3b93-8624-49d2-b962-4e0b61c1c6f1",
      source: "database",
      is_paid: false,
      tags: ["price", "coingecko", "market-data", "real-time"],
    },
  ],
};
