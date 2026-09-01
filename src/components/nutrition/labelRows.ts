import type { NutrientValue, NutrientValues } from "@/lib/nutritionMath";
import type { IngredientNutrition } from "@/types/ingredient";

// The presentation model behind NutritionFactsLabel, plus one adapter per
// surface that feeds it. Why the shared type is the row list rather than either
// nutrition type: .claude/docs/nutrition-label.md.

/** One nutrient line on the label. */
export interface LabelRow {
  key: string;
  /** Full FDA panel wording, used by the vertical layout. */
  name: string;
  /**
   * Abbreviated FDA wording for the tabular layout's narrow columns
   * ("Sat. Fat", "Cholest.", "Total Carb."). Falls back to `name`.
   */
  short?: string;
  /** null = this source doesn't carry the nutrient; the row isn't rendered. */
  value: NutrientValue | null;
  /** Sub-nutrient, indented under the group's lead nutrient. */
  sub?: boolean;
}

/**
 * A whole label's worth of rows. The two nutrient groups are the tabular
 * layout's two columns; stacked (vertical layout) they read as one continuous
 * list in FDA panel order.
 */
export interface LabelData {
  calories: NutrientValue | null;
  /** Fats, cholesterol, sodium. */
  fats: LabelRow[];
  /** Carbohydrates and protein. */
  carbs: LabelRow[];
  /** Minerals, below the closing heavy rule. */
  micros: LabelRow[];
}

// The one FDA naming table. `sub` lives here too, since indentation follows
// from what a nutrient IS, not from which surface is rendering it.
const SLOTS = {
  fat: { name: "Total Fat" },
  saturatedFat: { name: "Saturated Fat", short: "Sat. Fat", sub: true },
  // No FDA counterpart (the real label carries Trans / Poly / Mono) and no
  // catalog column — Schema.org-only, so it appears on the recipe label alone.
  // Don't "correct" it to "Trans Fat": different nutrient, and a data lie.
  unsaturatedFat: { name: "Unsaturated Fat", short: "Unsat. Fat", sub: true },
  cholesterol: { name: "Cholesterol", short: "Cholest." },
  sodium: { name: "Sodium" },
  carbohydrate: { name: "Total Carbohydrate", short: "Total Carb." },
  fiber: { name: "Dietary Fiber", short: "Fiber", sub: true },
  sugars: { name: "Total Sugars", short: "Sugars", sub: true },
  protein: { name: "Protein" },
  potassium: { name: "Potassium" },
  calcium: { name: "Calcium" },
  iron: { name: "Iron" },
} as const satisfies Record<string, Omit<LabelRow, "key" | "value">>;

type SlotKey = keyof typeof SLOTS;

function row(slot: SlotKey, value: NutrientValue | null): LabelRow {
  return { key: slot, ...SLOTS[slot], value };
}

/**
 * The recipe panel's rows, from `ScalableRecipe.nutrition()!.values`.
 *
 * There are no mineral rows: the catalog tracks them, but they have no
 * Schema.org slot (see SCHEMA_NUTRITION_MAP), so the recipe path can never
 * supply them. Emitting them as permanently-empty rows would only ever render a
 * row of em dashes for data this side cannot have.
 */
export function recipeNutritionRows(values: NutrientValues): LabelData {
  const at = (field: keyof NutrientValues) => values[field] ?? null;
  return {
    calories: at("calories"),
    fats: [
      row("fat", at("fatContent")),
      row("saturatedFat", at("saturatedFatContent")),
      row("unsaturatedFat", at("unsaturatedFatContent")),
      row("cholesterol", at("cholesterolContent")),
      row("sodium", at("sodiumContent")),
    ],
    carbs: [
      row("carbohydrate", at("carbohydrateContent")),
      row("fiber", at("fiberContent")),
      row("sugars", at("sugarContent")),
      row("protein", at("proteinContent")),
    ],
    micros: [],
  };
}

/**
 * The catalog editor's rows, from a per-100g `IngredientNutrition` already
 * scaled to the portion being previewed.
 *
 * There is deliberately no unsaturated-fat row: the catalog has no column for
 * it, so including it would add a permanently-empty line to a screen whose
 * whole job is checking entered values against a package label. Every other
 * catalog nutrient appears exactly once (asserted in nutritionLabelRows.test.ts
 * against NUTRITION_COLUMNS).
 */
export function ingredientNutritionRows(
  nutrition: IngredientNutrition,
): LabelData {
  const at = (
    key: keyof IngredientNutrition,
    unit: string,
  ): NutrientValue | null => {
    const value = nutrition[key];
    return value != null ? { value, unit } : null;
  };
  return {
    calories: at("calories_kcal", "kcal"),
    fats: [
      row("fat", at("fat_g", "g")),
      row("saturatedFat", at("saturated_fat_g", "g")),
      row("cholesterol", at("cholesterol_mg", "mg")),
      row("sodium", at("sodium_mg", "mg")),
    ],
    carbs: [
      row("carbohydrate", at("carbs_g", "g")),
      row("fiber", at("fiber_g", "g")),
      row("sugars", at("sugars_g", "g")),
      row("protein", at("protein_g", "g")),
    ],
    micros: [
      row("potassium", at("potassium_mg", "mg")),
      row("calcium", at("calcium_mg", "mg")),
      row("iron", at("iron_mg", "mg")),
    ],
  };
}
