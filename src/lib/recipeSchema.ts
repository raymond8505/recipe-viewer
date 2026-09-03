import type {
  RecipeIngredient,
  RecipeIngredientGroup,
  RecipeRow,
  SchemaRecipe,
} from "@/types/recipe";
import type { RecipeIngredientRow } from "@/types/ingredient";

/**
 * Rebuild the whole Schema.org Recipe from the two places it now lives.
 *
 * Since db/migrations/0016 a recipe's ingredient list is stored as groups of
 * `recipe_ingredients` ids and its instructions as their own column, so
 * `metadata.schema` on its own is an incomplete Recipe. Everything that wants a
 * real SchemaRecipe — JSON-LD, ScalableRecipe, the editor, the MCP tools, the
 * /update response — goes through here.
 *
 * Pure and client-safe on purpose: RecipeDetail and CookingMode both need it,
 * and src/lib/recipes.ts can't be imported from a client component (it reaches
 * @/env via the Supabase client).
 *
 * IDENTITY WARNING: this returns a fresh object every call. Two call sites
 * (RecipeDetail, CookingMode) hold the composed schema in state and compare it
 * by reference against the prop's schema to decide whether server-computed
 * nutrition still applies. They must memoize one instance per row rather than
 * re-composing inside the comparison, or that check is always false.
 */
export function composeRecipeSchema(
  row: Pick<RecipeRow, "ingredients" | "instructions" | "metadata" | "ingredientRows">,
): SchemaRecipe {
  return {
    ...row.metadata.schema,
    recipeIngredient: composeRecipeIngredient(row.ingredients, row.ingredientRows),
    recipeInstructions: row.instructions,
  };
}

/**
 * Flatten stored groups back into the single ordered line array the app speaks.
 *
 * An id that resolves to no row is skipped. That is a real, reachable state
 * rather than a defensive nicety: the write path is not transactional
 * (PostgREST gives one statement per request), so a failure between writing the
 * group array and writing the rows leaves a dangling id behind. Skipping
 * renders the recipe one line short, which the next save repairs; throwing
 * would take the whole page down over it.
 */
export function composeRecipeIngredient(
  groups: readonly RecipeIngredientGroup[],
  rows: readonly Pick<RecipeIngredientRow, "id" | "raw_text">[],
): RecipeIngredient[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const lines: RecipeIngredient[] = [];

  for (const group of groups) {
    for (const id of group.ingredients) {
      const row = byId.get(id);
      if (!row) continue;
      lines.push(
        group.name == null
          ? { name: row.raw_text, id }
          : { name: row.raw_text, group: group.name, id },
      );
    }
  }

  return lines;
}

/**
 * The inverse: an ordered line array → the stored group shape, given each
 * line's row id.
 *
 * Groups are emitted in first-appearance order and a line with no group joins
 * the run it sits in, which is what `groupIngredientsWithIndex` (the renderer's
 * grouping, src/lib/format.ts) already does — the two must agree or a save
 * would reorder the list it just displayed. An ungrouped recipe collapses to a
 * single group with no `name` key.
 */
export function toIngredientGroups(
  lines: ReadonlyArray<{ group?: string; id: string }>,
): RecipeIngredientGroup[] {
  const order: Array<string | undefined> = [];
  const byGroup = new Map<string | undefined, string[]>();

  for (const line of lines) {
    const group = line.group ?? undefined;
    if (!byGroup.has(group)) {
      order.push(group);
      byGroup.set(group, []);
    }
    byGroup.get(group)!.push(line.id);
  }

  if (order.length === 0) return [];

  return order.map((name) =>
    name == null
      ? { ingredients: byGroup.get(name)! }
      : { name, ingredients: byGroup.get(name)! },
  );
}
