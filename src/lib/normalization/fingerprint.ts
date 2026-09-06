import { createHash } from "crypto";
import { getIngredientText } from "@/lib/format";
import { composeRecipeSchema } from "@/lib/recipeSchema";
import type { RecipeRow, SchemaRecipe } from "@/types/recipe";

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

/**
 * The fingerprint of a stored recipe — what a completed normalization run
 * writes to `recipes.normalized_fingerprint`, and what anything deciding
 * whether that value is stale must compare against.
 *
 * Goes through `composeRecipeSchema` on purpose: since db/migrations/0016 the
 * line text lives on the `recipe_ingredients` rows, and `metadata.schema` still
 * carries a FROZEN pre-0016 copy of `recipeIngredient` on every backfilled row.
 * Hashing that copy does not throw — it just answers for the recipe as it was
 * at migration time, which is how `backfill:normalization` once selected the
 * wrong set. Every comparison against the stored fingerprint should start
 * here rather than re-deriving the schema at the call site.
 */
export function recipeFingerprint(
  row: Pick<RecipeRow, "ingredients" | "instructions" | "metadata" | "ingredientRows">,
): string {
  return ingredientFingerprint(composeRecipeSchema(row));
}
