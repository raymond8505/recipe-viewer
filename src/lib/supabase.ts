import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";
import type { ExhaustiveKeysArg } from "./exhaustive";

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

type Join<Cols extends readonly string[]> = Cols extends readonly [
  infer First extends string,
  ...infer Rest extends readonly string[],
]
  ? Rest extends readonly []
    ? First
    : `${First}, ${Join<Rest>}`
  : string;

// Build a PostgREST select list checked against the row type: a column that
// isn't a key of Row is rejected, and omitting a key of Row fails to compile
// with the missing column names in the error (see ExhaustiveKeysArg, which
// holds that conditional for every caller of the idiom). Write-only columns
// (embedding) are enforced too — they're absent from the Row type, so listing
// them is a compile error. The return type is the joined string *literal* so
// supabase-js's select-string parser keeps inferring row types from it.
//
// Shares the type with `exhaustiveKeys` but not the runtime: inside this
// generic `Cols` is unresolved, so the deferred conditional can't be proven to
// satisfy that helper's parameter without an `as never` that would defeat the
// check.
export function selectColumns<Row>() {
  return <const Cols extends readonly (keyof Row & string)[]>(
    cols: ExhaustiveKeysArg<Row, Cols>,
  ): Join<Cols> => (cols as readonly string[]).join(", ") as Join<Cols>;
}
