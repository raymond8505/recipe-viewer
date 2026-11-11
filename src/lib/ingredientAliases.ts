import { generateEmbedding } from "./embedding";
import { parseIngredient } from "./units";
import {
  addIngredientAliases,
  removeIngredientAlias,
  updateIngredientRow,
  type AliasMutationResult,
} from "./ingredients";

// A catalog ingredient's `aliases` are the recipe-language names that have been
// associated with it ("cilantro", "fresh coriander"); `name` is the canonical
// USDA description. This module owns the two things that must stay in lockstep
// whenever that set moves: the stored array (via the atomic RPCs in
// db/migrations/0010) and the embedding derived from it.
//
// It sits outside ingredients.ts on purpose. That module is a pure repo — its
// only imports are ./supabase, ./nutritionMath and types — and pulling
// generateEmbedding (which reaches @/env) into it would put a heavy dependency
// on every route that touches an ingredient row. Same split as ingredientImport.ts.

// Case is normalized HERE, at the matching boundary, and nowhere else: stored
// aliases keep whatever casing the user gave us because we display them back.
function normalize(text: string): string {
  return text.trim().toLowerCase();
}

// What a line uses to add a second amount to its first: "1¾ cups + 2 tbsp
// all-purpose flour". Stripped before the test below because it is the very
// thing that stops `parseIngredient` from seeing the amount behind it.
const LEADING_CONNECTOR_RE = /^\s*(?:\+|&|plus|and)\s+/i;

/**
 * Whether a candidate alias leads with an AMOUNT rather than naming a food.
 *
 * An alias is recipe language for what a row IS, so a quantity in one is never
 * identity — it is a parse remainder. A line worded "1¾ cups + 2 tbsp
 * all-purpose flour" yields its first amount as the line's quantity and leaves
 * the second in the parsed name, so accreting that name teaches the row to
 * answer to "+ 2 tbsp all-purpose flour" — in its embedding as much as in its
 * array, since both are built from the same text.
 *
 * `parseIngredient` is the judge so the unit table stays the only definition of
 * a unit; a unit added there is covered here with no second list to maintain.
 * A bare number is deliberately NOT enough to reject: "1% cottage cheese" and
 * "3% milk" are how those foods are named.
 */
function leadsWithQuantity(alias: string): boolean {
  const parsed = parseIngredient(alias.replace(LEADING_CONNECTOR_RE, ""));
  return parsed != null && parsed.unit != null;
}

/**
 * The text an ingredient's embedding encodes: canonical name first, then every
 * alias. One definition so create, rename and alias accretion can never
 * disagree about what a row's vector means.
 *
 * The name leads because it is the row's identity; aliases widen it with the
 * recipe language people actually search in.
 */
export function ingredientEmbeddingText(name: string, aliases: string[]): string {
  return [name, ...aliases]
    .map(normalize)
    .filter(Boolean)
    .join(", ");
}

/**
 * The query-side counterpart: the text to embed when searching FOR an
 * ingredient by a parsed line name. Shares `normalize` with
 * ingredientEmbeddingText so the two sides of a cosine comparison can't drift
 * apart on casing — an asymmetry there would make matching worse, not better.
 */
export function ingredientQueryText(name: string): string {
  return normalize(name);
}

/**
 * Recompute and store an ingredient's embedding from a name + alias set.
 * Best-effort: a null embedding leaves the previous vector in place, since the
 * column is NOT NULL (db/migrations/0006) and can never be cleared.
 */
async function reembed(row: AliasMutationResult): Promise<void> {
  const embedding = await generateEmbedding(
    ingredientEmbeddingText(row.name, row.aliases),
  );
  if (!embedding) return;
  await updateIngredientRow(row.id, { embedding });
}

/**
 * Add aliases to an ingredient and re-embed it — but only when the alias set
 * actually changed. That short-circuit is what keeps steady-state cost at zero:
 * re-normalizing an unchanged recipe spends no embedding calls at all.
 *
 * Never throws. Alias upkeep is bookkeeping that runs after the association it
 * describes is already committed, so a failure here must not fail the caller's
 * request or normalization run. Returns null when nothing is left to add, when
 * the ingredient is gone, or when the mutation failed.
 *
 * Candidates that lead with an amount are dropped HERE rather than at either
 * call site: the batch accretion and the manual re-point both arrive through
 * this function, so one guard covers both and a third caller cannot be written
 * without it. A parse gap this guard does not anticipate costs a missing alias,
 * which the next association re-offers; an accreted one is permanent.
 */
export async function addAliasesAndReembed(
  id: string,
  aliases: string[],
): Promise<AliasMutationResult | null> {
  const named = aliases.filter((alias) => !leadsWithQuantity(alias));
  if (named.length === 0) return null;

  try {
    const result = await addIngredientAliases(id, named);
    if (result?.changed) await reembed(result);
    return result;
  } catch (err) {
    console.error(`Failed to add aliases to ingredient ${id}:`, err);
    return null;
  }
}

/** The inverse of addAliasesAndReembed; same never-throws contract. */
export async function removeAliasAndReembed(
  id: string,
  alias: string,
): Promise<AliasMutationResult | null> {
  try {
    const result = await removeIngredientAlias(id, alias);
    if (result?.changed) await reembed(result);
    return result;
  } catch (err) {
    console.error(`Failed to remove alias from ingredient ${id}:`, err);
    return null;
  }
}

/**
 * Accrete each associated line's parsed name onto its catalog ingredient.
 *
 * Batched by ingredient: five lines resolving to one row cost a single RPC and
 * at most one re-embed, not five of each. Lines with no association are
 * skipped, as is any name that leads with an amount (see
 * addAliasesAndReembed). Names are deduped case-insensitively before the call,
 * but passed through verbatim — the first casing seen is the one stored.
 *
 * Never throws (each ingredient is independent; one failure can't sink the rest).
 */
export async function accreteAliasesFromLines(
  lines: ReadonlyArray<{ ingredient_id: string | null; name_text: string }>,
): Promise<void> {
  const byIngredient = new Map<string, string[]>();

  for (const line of lines) {
    if (!line.ingredient_id) continue;
    const name = line.name_text.trim();
    if (!name) continue;

    const names = byIngredient.get(line.ingredient_id) ?? [];
    if (!names.some((n) => normalize(n) === normalize(name))) {
      names.push(name);
    }
    byIngredient.set(line.ingredient_id, names);
  }

  await Promise.all(
    [...byIngredient].map(([id, names]) => addAliasesAndReembed(id, names)),
  );
}
