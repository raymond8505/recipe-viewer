import { parseLineDeterministic } from "./normalization/parseLine";
import { newRecipeIngredient } from "./recipeIngredients";
import type { RecipeIngredientRow } from "@/types/ingredient";
import type {
  RecipeIngredientGroupInput,
  StoredIngredientGroup,
} from "@/types/recipe";

export interface RecipeIngredientReconcile {
  /** Rows that don't exist yet, ids already minted. */
  inserts: RecipeIngredientRow[];
  /** Existing rows whose text moved, with the re-parse merged in. */
  updates: RecipeIngredientRow[];
  /** Rows the incoming groups do not name. */
  deleteIds: string[];
  /** The new `recipes.ingredients` value. */
  stored: StoredIngredientGroup[];
  /** Every row the recipe has after the write, in reading order. */
  rows: RecipeIngredientRow[];
  /**
   * Whether the SET of lines changed — something added or removed — as opposed
   * to the same lines reworded, reordered or regrouped. Only a set change is
   * worth running the matcher for: re-guessing a line that merely moved would
   * overwrite a curated association with the matcher's opinion.
   */
  lineSetChanged: boolean;
}

/**
 * Work out what has to happen to a recipe's `recipe_ingredients` rows for an
 * incoming ingredient list, and what its `ingredients` column becomes.
 *
 * Pure: it mints ids but writes nothing, so the whole decision is testable
 * without a database. The caller performs the writes in the order documented
 * on `updateRecipeRow`.
 *
 * A line keeps its row by naming it (`id`), and only rows of THIS recipe
 * count — an id from anywhere else is treated as unknown. Each row is claimed
 * once, so a duplicated id can't make two lines share one.
 *
 * A line with no usable id falls back to an unclaimed row with the same text.
 * That is a shim for writers that don't carry ids — a re-scrape, an MCP
 * `create_recipe`, an agent posting bare strings — and it exists because the
 * alternative is worse in exactly the common case: without it, a re-scrape
 * carrying unchanged text recreates every row and drops every catalog
 * association a user curated. Repeated identical lines carry over
 * positionally rather than collapsing.
 *
 * Whatever is left is a genuinely new line and gets a fresh row. `mintId` is
 * injectable so tests can assert exact ids; ids are minted HERE, before any
 * write, because the group array has to name them and PostgREST does not
 * promise to return bulk-inserted rows in the order they were sent.
 */
export function reconcileRecipeIngredients(
  recipeId: string,
  input: readonly RecipeIngredientGroupInput[],
  existing: readonly RecipeIngredientRow[],
  mintId: () => string = () => crypto.randomUUID(),
): RecipeIngredientReconcile {
  const rowById = new Map(existing.map((row) => [row.id, row]));

  // Ids claimed up front so the text fallback can't hand a row to a line
  // ahead of the one that keeps it by id.
  const claimed = new Set<string>();
  for (const group of input) {
    for (const line of group.ingredients) {
      if (line.id != null && rowById.has(line.id) && !claimed.has(line.id)) {
        claimed.add(line.id);
      }
    }
  }

  // text → unclaimed rows, in existing order, for the id-less fallback.
  const carryable = new Map<string, RecipeIngredientRow[]>();
  for (const row of existing) {
    if (claimed.has(row.id)) continue;
    const text = row.raw_text.trim();
    const queue = carryable.get(text);
    if (queue) queue.push(row);
    else carryable.set(text, [row]);
  }

  const inserts: RecipeIngredientRow[] = [];
  const updates: RecipeIngredientRow[] = [];
  const rows: RecipeIngredientRow[] = [];
  const kept = new Set<string>();
  const stored: StoredIngredientGroup[] = [];
  const seen = new Set<string>();
  let index = 0;

  for (const group of input) {
    const ids: string[] = [];
    for (const line of group.ingredients) {
      const text = line.raw_text.trim();
      if (!text) continue;

      let row: RecipeIngredientRow | undefined;
      if (line.id != null && claimed.has(line.id) && !seen.has(line.id)) {
        row = rowById.get(line.id);
      }
      row ??= carryable.get(text)?.shift();

      if (!row) {
        const fresh = newRecipeIngredient(text, mintId());
        const insert: RecipeIngredientRow = {
          id: fresh.id,
          recipe_id: recipeId,
          line_id: null,
          ingredient_id: fresh.ingredient_id,
          raw_text: fresh.raw_text,
          quantity: fresh.quantity,
          unit: fresh.unit,
          name_text: fresh.name_text,
          note: fresh.note,
          match_status: fresh.match_status,
          confidence: fresh.confidence,
          position: 0,
          estimated_grams: fresh.estimated_grams,
          grams_source: fresh.grams_source,
        };
        inserts.push(insert);
        rows.push(insert);
        ids.push(insert.id);
        index++;
        continue;
      }

      seen.add(row.id);
      kept.add(row.id);
      ids.push(row.id);

      // Re-parse ONLY on a text change. A reorder or a regrouping carries the
      // same words, and the stored parse may have come from the model —
      // replacing it with the deterministic parser's reading would degrade
      // the row over an edit that never touched the text.
      if (row.raw_text === text) {
        rows.push(row);
        index++;
        continue;
      }

      const parsed = parseLineDeterministic(text, index);
      const amountMoved =
        row.quantity !== parsed.quantity || row.unit !== parsed.unit;
      const updated: RecipeIngredientRow = {
        ...row,
        raw_text: text,
        quantity: parsed.quantity,
        unit: parsed.unit,
        name_text: parsed.name,
        // A stored gram weight describes one specific amount, and it
        // OVERRIDES the density-derived value — left in place across an
        // amount change, it wins silently. Rewording around an unchanged
        // amount keeps it: it is still a measurement of the same quantity of
        // the same food.
        ...(amountMoved ? { estimated_grams: null, grams_source: null } : {}),
      };
      updates.push(updated);
      rows.push(updated);
      index++;
    }

    // A group with nothing in it means nothing; the editor never shows one.
    if (ids.length === 0) continue;
    const name = group.name?.trim();
    stored.push(name ? { name, ingredients: ids } : { ingredients: ids });
  }

  const deleteIds = existing
    .map((row) => row.id)
    .filter((id) => !kept.has(id));

  return {
    inserts,
    updates,
    deleteIds,
    stored,
    rows,
    lineSetChanged: inserts.length > 0 || deleteIds.length > 0,
  };
}
