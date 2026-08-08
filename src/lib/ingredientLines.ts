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
 * Did a save ADD or REMOVE a line — i.e. did normalization gain work?
 *
 * Guessing is only needed for a line that has no row yet, so rewording,
 * reordering and regrouping all answer false: every id (and therefore every
 * derived row and every curated association) stays exactly where it was.
 *
 * `after` is the post-`withLineIds` array, so every line there has an id.
 * That makes minting look like an addition, which it is NOT when the line
 * simply never had an id — a recipe written before ids existed gets one per
 * line on its first save, and treating that as "N new lines" would re-run the
 * matcher over a recipe nobody edited structurally. Hence the comparison is
 * against how many lines were id-less to begin with, rather than a set key.
 */
export function lineSetChanged(
  before: ReadonlyArray<string | RecipeIngredient>,
  after: ReadonlyArray<string | RecipeIngredient>,
): boolean {
  const beforeIds = new Set(
    before.map(lineId).filter((id): id is string => id != null),
  );
  const afterIds = after.map(lineId).filter((id): id is string => id != null);

  // A known line vanished. The length test catches the same thing for legacy
  // arrays, where there are no ids to go missing — and removal must stay
  // detectable there, because pruning the orphaned row is normalization's job.
  const afterIdSet = new Set(afterIds);
  const removed =
    [...beforeIds].some((id) => !afterIdSet.has(id)) ||
    after.length < before.length;

  // Ids in `after` that weren't in `before` are either genuinely new lines or
  // ids minted for lines that never had one. Only the excess is new.
  const idless = before.length - beforeIds.size;
  const added = afterIds.filter((id) => !beforeIds.has(id)).length > idless;

  return removed || added;
}
