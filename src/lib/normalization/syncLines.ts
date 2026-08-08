import { getIngredientText } from "@/lib/format";
import { lineId } from "@/lib/ingredientLines";
import {
  getRecipeIngredients,
  updateRecipeIngredientRows,
  type RecipeIngredientParsePatch,
} from "@/lib/ingredients";
import type { RecipeIngredientRow } from "@/types/ingredient";
import type { RecipeIngredient } from "@/types/recipe";
import { parseLineDeterministic } from "./parseLine";

/**
 * Re-read edited line text into the rows that already exist for those lines.
 *
 * This is the cheap half of normalization, and the only half a reword needs.
 * It re-derives what follows from the TEXT — raw_text, quantity, unit,
 * name_text, position — and touches nothing else. The association
 * (`ingredient_id`, `match_status`) is a claim about which food the line means,
 * which is exactly what a typo fix or a reorder does NOT change, so re-running
 * the matcher there would replace the user's judgement with the machine's.
 *
 * Deterministic by construction: no Gemini, no USDA, no embedding, no catalog
 * read. That's what makes it safe to run inline on the write path where a
 * matcher run would not be.
 *
 * Lines with no id, and ids with no row, are skipped — a line that has never
 * been normalized has nothing to re-sync, and normalization will pick it up.
 *
 * The one exception is a row written before line ids existed: it has no
 * `line_id`, so it can only be found by position, and this is where it gets
 * stamped with the id its line was just minted (db/migrations/0013). Without
 * that, the first save of a legacy recipe would leave every row unreachable —
 * the schema line joins by an id no row carries.
 */
export async function syncRecipeIngredientText(
  recipeId: string,
  lines: ReadonlyArray<string | RecipeIngredient>,
): Promise<void> {
  const rows = await getRecipeIngredients(recipeId);
  const rowByLineId = new Map(
    rows
      .filter((row) => row.line_id != null)
      .map((row) => [row.line_id!, row]),
  );
  const legacyRowByPosition = new Map(
    rows.filter((row) => row.line_id == null).map((row) => [row.position, row]),
  );

  const updated: RecipeIngredientRow[] = [];
  lines.forEach((line, index) => {
    const id = lineId(line);
    if (id == null) return;
    const stamped = rowByLineId.get(id);
    const row = stamped ?? legacyRowByPosition.get(index);
    if (!row) return;

    const text = getIngredientText(line);
    const patch: RecipeIngredientParsePatch = {};
    // Write-once. A legacy row is reachable only by position, so this is the
    // save that keys it properly; a row that already has an id keeps it.
    if (stamped == null) patch.line_id = id;
    if (row.position !== index) patch.position = index;

    // Re-parse ONLY on a text change. A reorder or a stamping pass carries the
    // same words, and the stored parse came from the model — replacing it with
    // the deterministic parser's reading would degrade the row (and could drop
    // a curated gram weight) over an edit that never touched the text.
    if (row.raw_text !== text) {
      const parsed = parseLineDeterministic(text, index);
      patch.raw_text = text;
      patch.quantity = parsed.quantity;
      patch.unit = parsed.unit;
      patch.name_text = parsed.name;
      // A stored gram weight was measured against the old amount. If the
      // amount moved, keeping it would silently misreport the line —
      // estimated_grams OVERRIDES the density-derived value, so a stale one
      // wins and nothing flags it. Dropping it puts the line back in the
      // "needs an estimate" state the UI already knows how to show. Rewording
      // around an unchanged amount leaves it alone: the weight is still a
      // measurement of the same quantity of the same food.
      if (row.quantity !== parsed.quantity || row.unit !== parsed.unit) {
        patch.estimated_grams = null;
        patch.grams_source = null;
      }
    }

    if (Object.keys(patch).length === 0) return;
    // Merge onto the whole row: the write is an upsert on the primary key, in
    // one statement, because a reorder swaps positions and the uniqueness
    // check on (recipe_id, position) only defers to COMMIT.
    updated.push({ ...row, ...patch });
  });

  await updateRecipeIngredientRows(recipeId, updated);
}
