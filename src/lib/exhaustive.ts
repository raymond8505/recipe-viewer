// Type-level drift guards. Deliberately dependency-free: the modules that need
// them (supabase.ts, nutritionFields.ts, the MCP description layer) must not
// pull each other's dependencies in to get them.

/**
 * The argument type for a bidirectionally-exhaustive key array. When `Keys`
 * covers every key of `T` it resolves to `Keys` itself, so the literal tuple
 * survives inference; otherwise it resolves to an array of the MISSING keys,
 * which is what makes the compile error name them.
 *
 * `Exclude<...>` is a computed type rather than a naked type parameter, so the
 * conditional does not distribute — `never extends never` takes the true
 * branch, which is what makes the fully-covered case work.
 */
export type ExhaustiveKeysArg<T, Keys extends readonly (keyof T & string)[]> =
  Exclude<keyof T, Keys[number]> extends never
    ? Keys
    : readonly Exclude<keyof T, Keys[number]>[];

/**
 * `exhaustiveKeys<T>()([...])` — a key array checked against `T` in both
 * directions: an unknown key is rejected by the constraint, and a missing key
 * is named in the error. Same idiom as `selectColumns` (src/lib/supabase.ts),
 * minus the PostgREST join.
 *
 * Reach for this over `satisfies readonly (keyof T)[]` whenever the array is
 * meant to enumerate T completely: `satisfies` only rejects unknown keys, so it
 * silently accepts a key ADDED to `T` and forgotten here — which is the drift
 * that actually happens.
 */
export function exhaustiveKeys<T>() {
  return <const Keys extends readonly (keyof T & string)[]>(
    keys: ExhaustiveKeysArg<T, Keys>,
  ): Keys => keys as readonly string[] as Keys;
}

/**
 * Compile error unless `A` is assignable to `B`; the failure names both sides.
 * Pair it in both directions to assert two types are equivalent — prefer that
 * over a strict identity check, since zod runs inferred object types through
 * its own optional-key machinery and equivalent-but-not-identical is expected.
 */
export type Assignable<A, B> = A extends B
  ? true
  : { error: "not assignable"; from: A; to: B };

/**
 * `export type X = Assert<Assignable<A, B>>` — errors at the alias when the
 * relation fails. Must live in a non-test file: tsconfig excludes
 * `src/__tests__`, so an assertion written there checks nothing.
 */
export type Assert<T extends true> = T;
