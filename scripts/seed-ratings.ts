/**
 * seed-ratings.ts
 *
 * For every approved skill with rating_count = 0:
 *   Sets rating_avg = 5, rating_count = 1
 *
 * This simulates "one virtual agent call with 5-star feedback" for cold-start UX.
 * Future real ratings dilute naturally: new_avg = (old_avg * old_count + new_rating) / (old_count + 1)
 *
 * Run: npm run seed-ratings
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const SEED_RATING = 5;

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch all approved skills with no ratings yet
  const { data: skills, error: fetchErr } = await supabase
    .from('skills')
    .select('id, name')
    .eq('status', 'approved')
    .eq('rating_count', 0);

  if (fetchErr) throw fetchErr;
  if (!skills?.length) {
    console.log('No unrated approved skills found — nothing to do.');
    return;
  }

  console.log(`Found ${skills.length} unrated skills. Seeding rating=${SEED_RATING}…\n`);

  const ids = skills.map((s) => s.id);

  const { error: updateErr } = await supabase
    .from('skills')
    .update({ rating_avg: SEED_RATING, rating_count: 1 })
    .in('id', ids);

  if (updateErr) throw updateErr;

  for (const s of skills) console.log(`  ✓  ${s.name}`);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
