import { exhaustiveKeys } from "@/lib/exhaustive";
import type { NutrientField } from "@/lib/nutritionMath";

// Row config for NutritionLinearLabel — the reader-facing FDA "linear display"
// label (co-located per the project's "Editor Helper Placement" rule: pure
// config must not live in the component file).
//
// Naming: FDA panel wording ("Total Fat", "Dietary Fiber") rather than the
// app-canonical nutritionColumns names ("Fat", "Fiber") — the same deliberate
// divergence ingredients/nutritionFacts.ts makes, for the same reason:
// mimicking the physical package label IS the feature. The overlapping names in
// the two lists are held in lockstep by src/__tests__/nutritionLinearRows.test.ts.

/** One nutrient in the linear run. */
export interface LinearNutrientRow {
  key: NutrientField;
  /** FDA panel wording (see the naming note above). */
  name: string;
  /**
   * Sub-nutrient. The linear format has no indent to express hierarchy, so
   * weight carries it: majors bold, subs normal, adjacency to the parent does
   * the rest. (The vertical label uses `bold` + `indent` for the same thing.)
   */
  sub?: boolean;
}

// A Record annotation is bidirectionally exhaustive for an object literal: an
// unknown key is rejected and a missing one is named in the error.
//
// "Unsaturated Fat" has no FDA counterpart (the real label carries Trans /
// Polyunsaturated / Monounsaturated) and no IngredientNutrition key — it's
// Schema.org-only, so it's excluded from the lockstep test. Don't "correct" it
// to "Trans Fat": that's a different nutrient and would be a data lie.
const LINEAR_NUTRIENT_LABELS: Record<
  NutrientField,
  Omit<LinearNutrientRow, "key">
> = {
  calories: { name: "Calories" },
  fatContent: { name: "Total Fat" },
  saturatedFatContent: { name: "Saturated Fat", sub: true },
  unsaturatedFatContent: { name: "Unsaturated Fat", sub: true },
  cholesterolContent: { name: "Cholesterol" },
  sodiumContent: { name: "Sodium" },
  carbohydrateContent: { name: "Total Carbohydrate" },
  fiberContent: { name: "Dietary Fiber", sub: true },
  sugarContent: { name: "Total Sugars", sub: true },
  proteinContent: { name: "Protein" },
};

/**
 * FDA 2016 panel order (fat → cholesterol → sodium → carbs → protein), with
 * Calories leading the run as it does on a real linear label — unlike the
 * vertical panel, which pulls Calories out as the big display number.
 *
 * Order isn't type-visible, so it's pinned by a test; `exhaustiveKeys` pins
 * membership — an 11th NutrientField becomes a compile error naming it.
 */
export const LINEAR_NUTRIENT_ORDER = exhaustiveKeys<
  Record<NutrientField, unknown>
>()([
  "calories",
  "fatContent",
  "saturatedFatContent",
  "unsaturatedFatContent",
  "cholesterolContent",
  "sodiumContent",
  "carbohydrateContent",
  "fiberContent",
  "sugarContent",
  "proteinContent",
]);

/**
 * Every NutrientField in reading order. The label renders all of them —
 * absent ones as an em dash — so the run doubles as a map of which Schema.org
 * slots this recipe leaves empty.
 *
 * No `unit` field here, unlike ingredients/nutritionFacts.ts's
 * NutritionLabelRow: that one keys on IngredientNutrition (bare per-100g
 * numbers) so the row has to supply the unit, whereas a NutrientValue carries
 * its own and formatNutrientDisplay re-attaches it. A unit here would be a
 * second source of truth that could contradict the parsed schema string.
 */
export const LINEAR_NUTRIENT_ROWS: readonly LinearNutrientRow[] =
  LINEAR_NUTRIENT_ORDER.map((key) => ({ key, ...LINEAR_NUTRIENT_LABELS[key] }));
