import { getIngredientText } from "@/lib/format";
import type { RecipeIngredient } from "@/types/recipe";

// Identity for a recipe's ingredient LINES.
//
// A line's text is display copy — people fix typos, reword, reorder. None of
// that changes which ingredient the line refers to, so none of it may disturb
// the derived `recipe_ingredients` row or the association a user curated on
// it. `id` is what the row keys on; text and position are free to move.
//
// This module owns minting and, importantly, PRESERVING those ids: a write
// that dropped them would silently re-key every row and throw away curation.

/** The stable id of a line, or null for a plain-string / legacy line. */
export function lineId(line: string | RecipeIngredient): string | null {
  return typeof line === "string" ? null : (line.id ?? null);
}

/**
 * Ensure every line carries a stable id, returning object-form lines.
 *
 * Ids already on `next` always win — a client that read the recipe and handed
 * its lines back keeps every association, whatever it did to the text.
 *
 * For a line with no id we try to carry one over from `current` by exact text
 * match before minting a fresh one. That is a compatibility shim, not the
 * mechanism: callers that don't know about ids (an agent posting a bare string
 * array, a scrape) would otherwise re-key every row on every save. Each
 * carried id is claimed once, so duplicate lines can't both inherit it.
 *
 * Minting a new id is the correct outcome for a genuinely new line — it has no
 * derived row yet, and normalization will guess one for it.
 */
export function withLineIds(
  next: ReadonlyArray<string | RecipeIngredient>,
  current: ReadonlyArray<string | RecipeIngredient> = [],
): RecipeIngredient[] {
  const claimed = new Set(
    next.map(lineId).filter((id): id is string => id != null),
  );

  // text → ids from `current` still up for grabs, in order, so repeated
  // identical lines carry over positionally rather than collapsing.
  const carryable = new Map<string, string[]>();
  for (const line of current) {
    const id = lineId(line);
    if (id == null || claimed.has(id)) continue;
    const text = getIngredientText(line);
    const queue = carryable.get(text);
    if (queue) queue.push(id);
    else carryable.set(text, [id]);
  }

  return next.map((line) => {
    const base: RecipeIngredient =
      typeof line === "string" ? { name: line } : { ...line };
    const existing = lineId(line);
    if (existing != null) return { ...base, id: existing };

    const carried = carryable.get(getIngredientText(line))?.shift();
    if (carried != null) claimed.add(carried);
    return { ...base, id: carried ?? crypto.randomUUID() };
  });
}

/**
 * The set of line ids in a recipe, as a stable string.
 *
 * This is what decides whether normalization has work to do: guessing is only
 * needed for lines that don't have a row yet. Rewording or reordering leaves
 * this untouched, so neither re-runs the matcher — which is the whole point of
 * keying on ids. Adding or removing a line changes it.
 */
export function lineIdSetKey(
  lines: ReadonlyArray<string | RecipeIngredient>,
): string {
  return JSON.stringify(
    lines
      .map(lineId)
      .filter((id): id is string => id != null)
      .sort(),
  );
}
