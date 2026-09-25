import type { UsdaFoodPortion } from "@/types/ingredient";

// Identity rules for `ingredients.food_portions` — the named portions a product
// converts to ("1/4 package = 85 g"). Pure and zod-free so the schema layer,
// the serving-size render and the editor can all key on the same label.
//
// Distinct from the nutrition basis: `nutrition_basis_g` is a plain number of
// grams that every stored value is computed against, and it writes nothing.
// This column is the only thing that writes this column.

/**
 * The label a portion is read under — what the Serving column renders and what
 * uniqueness keys on. SR Legacy foods hide the unit in `modifier` with
 * `measureUnit.name === "undetermined"`; Foundation foods populate
 * `measureUnit.name`. null when a portion is a bare weight.
 */
export function portionLabel(portion: UsdaFoodPortion): string | null {
  const name = portion.measureUnit?.name;
  if (name && name !== "undetermined") return name;
  return portion.modifier ?? null;
}

/**
 * The rule, in the words the caller is told it in. One constant behind the
 * thrown error and both model-facing descriptions, so an agent that reads the
 * docs and an agent that learns by failing get the same sentence.
 */
export const FOOD_PORTION_UNIQUE_RULE =
  'Each label may carry only one gramWeight — "1 cup" cannot be both 85 g and 90 g. The same weight under different labels is fine (85 g can be both "1/4 package" and "about 1 cup"), and an exactly repeated portion is collapsed rather than rejected.';

/** The thrown/raised form, naming the label that is doubly defined. */
export function portionConflictMessage(labels: readonly string[]): string {
  const named = labels.map((label) => `"${label}"`).join(", ");
  return `food_portions gives ${named} more than one gramWeight. ${FOOD_PORTION_UNIQUE_RULE}`;
}

export interface NormalizedFoodPortions {
  /** The list with exact repeats collapsed, in first-appearance order. */
  portions: UsdaFoodPortion[];
  /** Labels given more than one weight, in first-appearance order. */
  conflicts: string[];
}

/**
 * Collapse repeats and report contradictions.
 *
 * A LABELLED portion is identified by its label and household amount, so the
 * same label at two weights is a contradiction — the name promises one weight.
 * An UNLABELLED portion is identified by its weight instead: a bare "100 g" and
 * a bare "85 g" read as two distinct servings with nothing to contradict, so
 * they coexist while an exact repeat collapses.
 *
 * Labels compare case-insensitively and trimmed, but the caller's own casing is
 * what survives into the list — the fold is only a comparison, as it is for
 * aliases.
 */
export function normalizeFoodPortions(
  portions: readonly UsdaFoodPortion[],
): NormalizedFoodPortions {
  const seen = new Map<string, UsdaFoodPortion>();
  const conflicts: string[] = [];
  const kept: UsdaFoodPortion[] = [];

  for (const portion of portions) {
    const label = portionLabel(portion);
    const key =
      label == null
        ? `g:${portion.gramWeight}`
        : `l:${portion.amount ?? 1} ${label.trim().toLowerCase()}`;

    const prior = seen.get(key);
    if (!prior) {
      seen.set(key, portion);
      kept.push(portion);
      continue;
    }
    if (prior.gramWeight === portion.gramWeight) continue;
    if (label != null && !conflicts.includes(label)) conflicts.push(label);
  }

  return { portions: kept, conflicts };
}

/**
 * The portion-conflict message out of a failed parse, or null when the failure
 * was something else. A contradiction here is a mistake the CALLER can fix —
 * a curator retyping a weight, an agent reconciling two sources — so the
 * ingredient routes answer with this sentence, which names the offending
 * label, and keep the generic wording for parse failures nobody can act on.
 */
export function portionConflictIssue(
  issues: readonly { path: PropertyKey[]; message: string }[],
): string | null {
  const issue = issues.find((i) => i.path.includes("food_portions"));
  return issue?.message ?? null;
}
