-- Official Sumplus Skills Seed
-- Run this after applying supabase-schema.sql.
-- Skills are inserted with author_id = NULL (official Sumplus skills don't require a user owner).

INSERT INTO public.skills (
  name, description, category, version, author_type,
  is_paid, price, tags, status, schema, code
) VALUES
(
  'SUI Blockchain Toolkit',
  'Interact with the SUI blockchain network. Check wallet balances, query token holdings, inspect NFTs, and retrieve transaction history. Supports SUI mainnet and testnet.',
  'Blockchain',
  '1.0.0',
  'official',
  false,
  NULL,
  ARRAY['sui', 'blockchain', 'wallet', 'nft', 'tokens'],
  'approved',
  '{
    "input": {
      "type": "object",
      "required": ["action", "address"],
      "properties": {
        "action": {
          "type": "string",
          "enum": ["get_balance", "get_tokens", "get_nfts", "get_transactions"],
          "description": "The action to perform on the SUI network"
        },
        "address": {
          "type": "string",
          "description": "SUI wallet address (0x...)"
        },
        "network": {
          "type": "string",
          "enum": ["mainnet", "testnet", "devnet"],
          "description": "SUI network to query (default: mainnet)"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "description": "Maximum results to return"
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "balance": { "type": "number" },
        "tokens": { "type": "array" },
        "nfts": { "type": "array" },
        "transactions": { "type": "array" }
      }
    }
  }',
  '// See src/skills/sui-blockchain.ts for implementation'
),
(
  'Crypto Wallet Manager',
  'Multi-chain crypto wallet utilities. Aggregate balances across Ethereum, Polygon, Arbitrum, and SUI. Estimate gas fees, validate addresses, and get token prices.',
  'Blockchain',
  '1.0.0',
  'official',
  false,
  NULL,
  ARRAY['wallet', 'ethereum', 'polygon', 'multichain', 'gas', 'defi'],
  'approved',
  '{
    "input": {
      "type": "object",
      "required": ["action"],
      "properties": {
        "action": {
          "type": "string",
          "enum": ["aggregate_balances", "estimate_gas", "validate_address", "get_token_price"],
          "description": "Wallet action to perform"
        },
        "address": {
          "type": "string",
          "description": "Wallet address to query"
        },
        "chains": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Chains to query (default: all)"
        },
        "token_symbol": {
          "type": "string",
          "description": "Token symbol for price lookup"
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "balances": { "type": "array" },
        "total_usd": { "type": "number" },
        "gas_estimate": { "type": "object" },
        "price": { "type": "number" }
      }
    }
  }',
  '// See src/skills/wallet.ts for implementation'
),
(
  'Sumplus Yield Optimizer',
  'Access Sumplus Yield (sumpl.us) — the automated yield optimizer. Find the best farming opportunities, calculate APY, check your positions, and get rebalancing recommendations across DeFi protocols.',
  'Finance',
  '1.0.0',
  'official',
  true,
  2.99,
  ARRAY['yield', 'defi', 'farming', 'sumplus', 'apy', 'optimization'],
  'approved',
  '{
    "input": {
      "type": "object",
      "required": ["action"],
      "properties": {
        "action": {
          "type": "string",
          "enum": ["list_opportunities", "get_my_positions", "calculate_apy", "get_recommendation"],
          "description": "Yield action to perform"
        },
        "address": {
          "type": "string",
          "description": "Wallet address (required for position queries)"
        },
        "protocol": {
          "type": "string",
          "description": "Filter by protocol"
        },
        "asset": {
          "type": "string",
          "description": "Asset symbol to filter"
        },
        "amount_usd": {
          "type": "number",
          "description": "Amount in USD for APY calculation"
        },
        "risk_tolerance": {
          "type": "string",
          "enum": ["low", "medium", "high"],
          "description": "Risk tolerance for recommendations"
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "opportunities": { "type": "array" },
        "positions": { "type": "array" },
        "apy": { "type": "number" },
        "recommendation": { "type": "object" }
      }
    }
  }',
  '// See src/skills/sumplus-yield.ts for implementation'
)
ON CONFLICT DO NOTHING;
