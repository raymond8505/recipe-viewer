import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

export function getSupabaseClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY);
}

export function getSupabaseAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Format a float array as a pgvector literal ("[v1,v2,...]"). supabase-js sends
// values as JSON via PostgREST; a `vector` column accepts this bracketed string.
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
