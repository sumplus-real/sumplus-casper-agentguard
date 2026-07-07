-- Solana DEX Skills: Jupiter Aggregator + Raydium DEX
-- Run in Supabase SQL Editor after applying supabase-schema.sql.

INSERT INTO public.skills (
  id, name, description, category, version, author_type,
  is_paid, price, tags, status, usage_count
) VALUES
(
  'a8f2c1d4-7e3b-4a9f-b6c5-2d8e1f403b91',
  'Jupiter Aggregator',
  'Interact with Jupiter (jup.ag) — the leading DEX aggregator on Solana. Get best-price swap quotes routed through Raydium, Orca, Meteora, and 20+ DEXes. Build serialised swap transactions ready for wallet signing, look up real-time token prices, and resolve token symbols to mint addresses.',
  'Blockchain',
  '1.0.0',
  'official',
  false,
  NULL,
  ARRAY['jupiter', 'solana', 'dex', 'swap', 'aggregator', 'defi', 'spl'],
  'approved',
  0
),
(
  'c5e9d2a7-3f4b-4c8e-a1b6-8f5d923e140c',
  'Raydium DEX',
  'Interact with Raydium (raydium.io) — Solana''s largest native AMM + CLMM DEX. Query top trading pairs by volume or liquidity, get detailed pool information, view real-time protocol TVL and fee stats, and look up token prices.',
  'Blockchain',
  '1.0.0',
  'official',
  false,
  NULL,
  ARRAY['raydium', 'solana', 'dex', 'amm', 'clmm', 'liquidity', 'defi', 'spl'],
  'approved',
  0
)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  status      = EXCLUDED.status,
  tags        = EXCLUDED.tags;
