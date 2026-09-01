import { parseNumeric } from "@/lib/format";
import type { IngredientNutrition } from "@/types/ingredient";
import { NUTRITION_BASIS_GRAMS } from "./nutritionColumns";
import { portionGrams, portionOptionLabel, type PortionDraft } from "./portions";

// Editor-specific pure logic for the drawer's Nutrition Facts label preview
// (co-located per the project's "Editor Helper Placement" rule).
//
// Naming: the label rows below deliberately use FDA panel wording ("Total
// Fat", "Dietary Fiber") instead of the app-canonical nutritionColumns names
// ("Fat", "Fiber"). Mimicking the physical package label IS the feature — the
// user holds the real label next to this preview to confirm the entered
// amounts — so the divergence is scoped to this label only. Rows still bind to
// NUTRITION_COLUMNS keys, and the coverage test in nutritionFacts.test.ts
// keeps the two lists in lockstep.

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

/** One row of the Nutrition Facts panel, bound to a catalog nutrition key. */
export interface NutritionLabelRow {
  key: keyof IngredientNutrition;
  /** FDA panel wording (see the naming note in the file header). */
  name: string;
  unit: string;
  /** Sub-nutrient rendering: indented under its parent, per the FDA layout. */
  indent?: boolean;
  /** FDA bolds the top-level nutrients. */
  bold?: boolean;
}

/** Main panel rows. The macro order (fat, carbs, protein, then cholesterol
 *  and sodium) is the user's preferred reading order rather than the strict
 *  FDA 2016 sequence; sub-nutrients stay indented under their parent.
 *  Calories is rendered separately as the big number, so it's not in this
 *  list. */
export const NUTRITION_LABEL_ROWS: readonly NutritionLabelRow[] = [
  { key: "fat_g", name: "Total Fat", unit: "g", bold: true },
  { key: "saturated_fat_g", name: "Saturated Fat", unit: "g", indent: true },
  { key: "carbs_g", name: "Total Carbohydrate", unit: "g", bold: true },
  { key: "fiber_g", name: "Dietary Fiber", unit: "g", indent: true },
  { key: "sugars_g", name: "Total Sugars", unit: "g", indent: true },
  { key: "protein_g", name: "Protein", unit: "g", bold: true },
  { key: "cholesterol_mg", name: "Cholesterol", unit: "mg", bold: true },
  { key: "sodium_mg", name: "Sodium", unit: "mg", bold: true },
];

/** Minerals below the closing heavy rule, rendered as full-width rows just
 *  like the main panel (not an inline footer). */
export const NUTRITION_LABEL_MICRONUTRIENTS: readonly NutritionLabelRow[] = [
  { key: "potassium_mg", name: "Potassium", unit: "mg" },
  { key: "calcium_mg", name: "Calcium", unit: "mg" },
  { key: "iron_mg", name: "Iron", unit: "mg" },
];
