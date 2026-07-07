/**
 * migrate-agent-skill-columns.ts
 *
 * Adds agent skill taxonomy columns to the skills table.
 * Run once: npx tsx scripts/migrate-agent-skill-columns.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const MIGRATION_SQL = `
ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'protocol',
  ADD COLUMN IF NOT EXISTS execution_protocol TEXT NOT NULL DEFAULT 'rest_json',
  ADD COLUMN IF NOT EXISTS input_style TEXT NOT NULL DEFAULT 'structured',
  ADD COLUMN IF NOT EXISTS deterministic BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS multi_step BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS supports_streaming_events TEXT[],
  ADD COLUMN IF NOT EXISTS requires_user_session BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimated_duration_seconds JSONB;
`;

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Use the Supabase REST API to execute raw SQL via the pg_execute RPC
  // (requires a helper function in Supabase; fall back to printing SQL if unavailable)
  const sb = createClient(supabaseUrl, serviceKey);

  const { error } = await (sb as any).rpc('pg_execute', { query: MIGRATION_SQL });

  if (error) {
    if (error.message?.includes('Could not find the function')) {
      console.log('pg_execute RPC not available. Run the following SQL in your Supabase SQL editor:\n');
      console.log(MIGRATION_SQL);
    } else {
      console.error('Migration error:', error.message);
      process.exit(1);
    }
  } else {
    console.log('✓ Agent skill taxonomy columns added successfully.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
