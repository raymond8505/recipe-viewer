import { createHash } from "crypto";

/**
 * Stable identity of a recipe's ingredient TEXT list — sha256 over the ordered
 * line texts (`ingredientTexts` of the recipe's groups). Group names and every
 * other field are ignored; they don't change what normalization would produce.
 *
 * Two uses (see db/migrations/0004):
 * - `backfill:normalization` compares it to `recipes.normalized_fingerprint`
 *   to find recipes whose lines moved since their last completed run
 * - a finishing run aborts persist if the recipe's current fingerprint no
 *   longer matches its snapshot (a newer save owns the result)
 */
export function ingredientFingerprint(texts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(texts)).digest("hex");
}
