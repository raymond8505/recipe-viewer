import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

export function getSupabaseClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY);
}
