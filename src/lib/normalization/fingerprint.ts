import { createHash } from "crypto";
import { getIngredientText } from "@/lib/format";
import type { SchemaRecipe } from "@/types/recipe";

/**
 * Stable identity of a recipe's ingredient TEXT list — sha256 over the ordered
 * display strings (group membership and all other schema fields are ignored;
 * they don't change what normalization would produce).
 *
 * Two uses (see db/migrations/0004):
 * - the write-path trigger skips scheduling when the fingerprint is unchanged
 * - a finishing run aborts persist if the recipe's current fingerprint no
 *   longer matches its snapshot (a newer save owns the result)
 */
export function ingredientFingerprint(
  schema: SchemaRecipe | Partial<SchemaRecipe>,
): string {
  const texts = (schema.recipeIngredient ?? []).map(getIngredientText);
  return createHash("sha256").update(JSON.stringify(texts)).digest("hex");
}
