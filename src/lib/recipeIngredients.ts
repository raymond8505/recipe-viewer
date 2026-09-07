import { parseLineDeterministic } from "./normalization/parseLine";
import type { IngredientRow, RecipeIngredientRow } from "@/types/ingredient";
import type {
  RecipeIngredient,
  RecipeIngredientGroup,
  RecipeIngredientGroupInput,
  SchemaOrgIngredientLine,
  StoredIngredientGroup,
} from "@/types/recipe";

// Pure helpers over a recipe's ingredient groups. Client-safe on purpose: the
// editor, cooking mode and the window API need them, and none of them may
// reach @/env (the Supabase clients do).

/** The groups' ingredients in reading order: group by group, line by line. */
export function flattenIngredients(
  groups: readonly RecipeIngredientGroup[],
): RecipeIngredient[] {
  return groups.flatMap((group) => group.ingredients);
}

/** Every line's text, in reading order — what the normalization fingerprint hashes. */
export function ingredientTexts(groups: readonly RecipeIngredientGroup[]): string[] {
  return flattenIngredients(groups).map((ingredient) => ingredient.raw_text);
}

/**
 * An ingredient that exists only as text so far: parsed deterministically,
 * unmatched, no catalog data. The id is minted here so the line has an
 * identity from the moment it exists — the caller may be building a preview
 * that never gets saved, or a write whose group array must name the row
 * before the insert.
 */
export function newRecipeIngredient(
  raw_text: string,
  id: string = crypto.randomUUID(),
): RecipeIngredient {
  const parsed = parseLineDeterministic(raw_text, 0);
  return {
    id,
    ingredient_id: null,
    raw_text,
    quantity: parsed.quantity,
    unit: parsed.unit,
    name_text: parsed.name,
    note: parsed.note,
    match_status: "unmatched",
    confidence: null,
    estimated_grams: null,
    grams_source: null,
    ingredient: null,
  };
}

/**
 * Groups for input that has not been saved — a re-scrape under review, a
 * recipe pushed in through the window API. Every line becomes a fresh
 * `newRecipeIngredient`; an `id` on the input is kept so a preview built from
 * a saved recipe still names its rows.
 */
export function draftIngredientGroups(
  input: readonly RecipeIngredientGroupInput[],
): RecipeIngredientGroup[] {
  return input.map((group) => ({
    ...(group.name != null ? { name: group.name } : {}),
    ingredients: group.ingredients.map((line) =>
      newRecipeIngredient(line.raw_text, line.id),
    ),
  }));
}

/** Groups → what a writer sends: each line reduced to its id and text. */
export function toIngredientInput(
  groups: readonly RecipeIngredientGroup[],
): RecipeIngredientGroupInput[] {
  return groups.map((group) => ({
    ...(group.name != null ? { name: group.name } : {}),
    ingredients: group.ingredients.map(({ id, raw_text }) => ({ id, raw_text })),
  }));
}

/** Groups → the `recipes.ingredients` column: ids only, `name` key absent when unnamed. */
export function toStoredGroups(
  groups: readonly RecipeIngredientGroup[],
): StoredIngredientGroup[] {
  return groups.map((group) => ({
    ...(group.name != null ? { name: group.name } : {}),
    ingredients: group.ingredients.map((ingredient) => ingredient.id),
  }));
}

/** A row as the app carries it: `recipe_id` (and the dead columns) left behind. */
export function toRecipeIngredient(
  row: RecipeIngredientRow,
  ingredient?: IngredientRow | null,
): RecipeIngredient {
  return {
    id: row.id,
    ingredient_id: row.ingredient_id,
    raw_text: row.raw_text,
    quantity: row.quantity,
    unit: row.unit,
    name_text: row.name_text,
    note: row.note,
    match_status: row.match_status,
    confidence: row.confidence,
    estimated_grams: row.estimated_grams,
    grams_source: row.grams_source,
    ...(ingredient !== undefined ? { ingredient } : {}),
  };
}

/**
 * Reassemble a recipe's groups from the column and the rows it names.
 *
 * With a `catalog` map every line's `ingredient` is set (null when unmatched);
 * without one the key is left off, which is how a list-page row says "not
 * loaded" rather than "unmatched".
 *
 * An id no row answers to is skipped rather than thrown on. That is reachable,
 * not defensive: the write path is not transactional (PostgREST gives one
 * statement per request), so a failure between writing the group array and
 * writing the rows leaves a dangling id. Rendering the recipe one line short
 * — which the next save repairs — beats taking the page down.
 */
export function hydrateIngredientGroups(
  stored: readonly StoredIngredientGroup[],
  rows: readonly RecipeIngredientRow[],
  catalog?: ReadonlyMap<string, IngredientRow>,
): RecipeIngredientGroup[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return stored.map((group) => ({
    ...(group.name != null ? { name: group.name } : {}),
    ingredients: group.ingredients.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      const ingredient =
        catalog === undefined
          ? undefined
          : row.ingredient_id != null
            ? (catalog.get(row.ingredient_id) ?? null)
            : null;
      return [toRecipeIngredient(row, ingredient)];
    }),
  }));
}

/**
 * The inbound Schema.org edge: a `recipeIngredient` array (strings, or objects
 * carrying our `group` extension) → write input.
 *
 * Groups come out in first-appearance order and an ungrouped line joins the
 * one nameless group wherever it sits — the same partition the app has always
 * rendered, so a scrape saved and re-read shows the list it arrived as. All
 * strings collapse to a single nameless group.
 */
export function fromSchemaOrgIngredients(
  lines: ReadonlyArray<string | SchemaOrgIngredientLine>,
): RecipeIngredientGroupInput[] {
  const order: Array<string | undefined> = [];
  const byGroup = new Map<string | undefined, RecipeIngredientGroupInput>();

  for (const line of lines) {
    const raw_text = (typeof line === "string" ? line : line.name).trim();
    if (!raw_text) continue;
    const name = typeof line === "string" ? undefined : line.group?.trim() || undefined;
    let group = byGroup.get(name);
    if (!group) {
      group = { ...(name != null ? { name } : {}), ingredients: [] };
      byGroup.set(name, group);
      order.push(name);
    }
    group.ingredients.push({ raw_text });
  }

  return order.map((name) => byGroup.get(name)!);
}
