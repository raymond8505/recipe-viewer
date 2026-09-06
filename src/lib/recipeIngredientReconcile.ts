import { getIngredientText } from "./format";
import { parseLineDeterministic } from "./normalization/parseLine";
import { toIngredientGroups } from "./recipeSchema";
import type { RecipeIngredientRow } from "@/types/ingredient";
import type { RecipeIngredient, RecipeIngredientGroup } from "@/types/recipe";

/**
 * A `recipe_ingredients` row to create, id already minted by the caller.
 *
 * `position` and `line_id` are omitted: since db/migrations/0016 a line's
 * position is its index in `recipes.ingredients` and its identity is this row's
 * own id, so both columns are dead. They are kept as artifacts of the old
 * shape rather than dropped — `position` takes its column default (0), and
 * `line_id` stays null.
 */
export type RecipeIngredientInsertRow = Omit<
  RecipeIngredientRow,
  "recipe_id" | "position" | "line_id"
>;

/**
 * An insert promoted to a full row, for the value a write returns without
 * re-reading. `line_id` and `position` are the dead columns kept as artifacts
 * of the pre-0016 shape — the database fills `position` from its default and
 * nothing reads either.
 */
export function insertedRow(
  row: RecipeIngredientInsertRow,
  recipeId: string,
): RecipeIngredientRow {
  return { ...row, recipe_id: recipeId, line_id: null, position: 0 };
}

export interface RecipeIngredientReconcile {
  /** Rows that don't exist yet — lines that arrived without an id. */
  inserts: RecipeIngredientInsertRow[];
  /** Existing rows whose text moved, already merged with the re-parse. */
  updates: RecipeIngredientRow[];
  /** Rows the incoming list no longer references. */
  deleteIds: string[];
  /** The new `recipes.ingredients` value. */
  groups: RecipeIngredientGroup[];
  /**
   * Whether the SET of lines changed (something added or removed), as opposed
   * to the same lines reworded or reordered. Only a set change is worth
   * re-running the matcher for: re-guessing a line that merely moved would
   * overwrite a curated association with the matcher's opinion.
   */
  lineSetChanged: boolean;
}

/**
 * Work out what has to happen to a recipe's `recipe_ingredients` rows for an
 * incoming ingredient list, and what its `ingredients` groups become.
 *
 * Pure — it mints ids but writes nothing, so the whole decision is testable
 * without a database. The caller performs the writes in the order documented on
 * `updateRecipeRow`.
 *
 * Lines are matched to rows by `RecipeIngredient.id`, which is the row's own
 * primary key (db/migrations/0016). A line with no id is new: callers that
 * round-trip a recipe hand ids back, but an MCP `update_recipe` or a re-scrape
 * may legitimately send bare strings, and each of those becomes a fresh row.
 *
 * `mintId` is injected so tests can be deterministic; production passes
 * `crypto.randomUUID`. Ids are minted HERE, before any write, because the group
 * array has to reference them — waiting for the database to assign them would
 * mean trusting PostgREST to return bulk-inserted rows in the order they were
 * sent, which it does not promise.
 */
export function reconcileRecipeIngredients(
  lines: ReadonlyArray<string | RecipeIngredient>,
  existingRows: readonly RecipeIngredientRow[],
  mintId: () => string = () => crypto.randomUUID(),
): RecipeIngredientReconcile {
  const rowById = new Map(existingRows.map((row) => [row.id, row]));

  const inserts: RecipeIngredientInsertRow[] = [];
  const updates: RecipeIngredientRow[] = [];
  const keptIds = new Set<string>();
  const grouped: Array<{ group?: string; id: string }> = [];

  lines.forEach((line, index) => {
    const text = getIngredientText(line);
    const group = typeof line === "string" ? undefined : line.group;
    const existing = typeof line === "string" ? undefined : rowById.get(line.id ?? "");

    if (!existing) {
      const id = mintId();
      const parsed = parseLineDeterministic(text, index);
      inserts.push({
        id,
        ingredient_id: null,
        raw_text: text,
        quantity: parsed.quantity,
        unit: parsed.unit,
        name_text: parsed.name,
        note: parsed.note,
        // Never guessed here. The matcher runs out of band, after the write,
        // and only when the line set actually changed.
        match_status: "unmatched",
        confidence: null,
        estimated_grams: null,
        grams_source: null,
      });
      grouped.push(group == null ? { id } : { group, id });
      return;
    }

    keptIds.add(existing.id);
    grouped.push(group == null ? { id: existing.id } : { group, id: existing.id });

    // Re-parse ONLY on a text change. A reorder or a regrouping carries the
    // same words, and the stored parse may have come from the model —
    // replacing it with the deterministic parser's reading would degrade the
    // row over an edit that never touched the text.
    if (existing.raw_text === text) return;

    const parsed = parseLineDeterministic(text, index);
    const amountMoved =
      existing.quantity !== parsed.quantity || existing.unit !== parsed.unit;
    updates.push({
      ...existing,
      raw_text: text,
      quantity: parsed.quantity,
      unit: parsed.unit,
      name_text: parsed.name,
      // A stored gram weight was measured against the old amount. If the amount
      // moved, keeping it would silently misreport the line — estimated_grams
      // OVERRIDES the density-derived value, so a stale one wins and nothing
      // flags it. Rewording around an unchanged amount leaves it alone: it is
      // still a measurement of the same quantity of the same food.
      ...(amountMoved ? { estimated_grams: null, grams_source: null } : {}),
    });
  });

  const deleteIds = existingRows
    .map((row) => row.id)
    .filter((id) => !keptIds.has(id));

  return {
    inserts,
    updates,
    deleteIds,
    groups: toIngredientGroups(grouped),
    lineSetChanged: inserts.length > 0 || deleteIds.length > 0,
  };
}
