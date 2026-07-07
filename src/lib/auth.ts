import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

/**
 * Resolves a Bearer token (JWT or API key) to a user ID.
 * Returns null if the token is invalid or not found.
 */
export async function resolveUser(token: string): Promise<string | null> {
  const supabase = getServiceSupabase();

  // Try JWT first
  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) return user.id;

  // Fall back to API key lookup
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("api_key", token)
    .single();
  const row = data as { id: string } | null;
  return row?.id ?? null;
}
