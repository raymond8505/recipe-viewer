import { parseNumeric } from "@/lib/format";
import type { IngredientNutrition } from "@/types/ingredient";
import { NUTRITION_BASIS_GRAMS } from "./nutritionColumns";
import { portionGrams, portionOptionLabel, type PortionDraft } from "./portions";

// Editor-specific pure logic for the drawer's Nutrition Facts label preview
// (co-located per the project's "Editor Helper Placement" rule).

/** Parse the drawer's per-100g draft strings into numbers, exactly as
 *  buildPatch persists them: only real numbers survive; blank or unparseable
 *  fields are omitted (key sparsity is meaningful — absent ≠ 0). */
export function parseDraftNutrition(
  draft: Record<string, string>,
): IngredientNutrition {
  const nutrition: IngredientNutrition = {};
  for (const key of Object.keys(draft) as (keyof IngredientNutrition)[]) {
    const value = parseNumeric(draft[key]);
    if (typeof value === "number") nutrition[key] = value;
  }
  return nutrition;
}

/** One choice in the label's portion selector. */
export interface NutritionBasisOption {
  /** "100g" for the synthetic baseline; "p{index}" for a draft portion. */
  key: string;
  /** Display text, via portionOptionLabel ("tbsp (6 g)", "100 g"). */
  label: string;
  /** Parsed positive gram weight the label scales to. */
  grams: number;
}

/**
 * The label's selectable portions: a synthetic 100 g baseline first (the
 * stored per-100g basis is always previewable), then every draft portion with
 * a positive gram weight. Rows seeded with the default unlabelled 100 g
 * portion would otherwise show "100 g" twice, so the baseline is suppressed
 * when an unlabelled portion already weighs exactly NUTRITION_BASIS_GRAMS; a
 * *labelled* 100 g portion (e.g. "serving (100 g)") reads differently and
 * doesn't suppress it. Options re-derive from the live draft, so a portion
 * edited to blank/non-positive grams simply drops out.
 */
export function nutritionBasisOptions(
  portions: PortionDraft[],
): NutritionBasisOption[] {
  const portionOptions: NutritionBasisOption[] = [];
  let hasBareBasisPortion = false;
  portions.forEach((portion, index) => {
    const grams = portionGrams(portion);
    if (grams == null) return;
    if (!portion.label.trim() && grams === NUTRITION_BASIS_GRAMS) {
      hasBareBasisPortion = true;
    }
    portionOptions.push({
      key: `p${index}`,
      label: portionOptionLabel(portion),
      grams,
    });
  });
  const baseline: NutritionBasisOption[] = hasBareBasisPortion
    ? []
    : [
        {
          key: "100g",
          label: `${NUTRITION_BASIS_GRAMS} g`,
          grams: NUTRITION_BASIS_GRAMS,
        },
      ];
  return [...baseline, ...portionOptions];
}

// The label's row definitions used to live here. They now sit in
// src/components/nutrition/labelRows.ts, shared with the recipe panel's label —
// see that file's header for why the row list, rather than either nutrition
// type, is the shared abstraction. What remains here is the draft parsing and
// portion-selection logic, which is genuinely editor-only.
