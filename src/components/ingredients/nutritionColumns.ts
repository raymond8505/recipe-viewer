import { NUTRITION_FIELDS, type NutritionField } from "@/lib/nutritionFields";
import type { IngredientNutrition } from "@/types/ingredient";

// Catalog nutrition is stored on a fixed per-100 g basis (USDA analytical
// values). This is the single source for that basis so every label that states
// it — the manager caption, the detail-drawer heading — can never drift from
// the actual stored scale.
export const NUTRITION_BASIS_GRAMS = 100;
export const NUTRITION_BASIS_LABEL = `per ${NUTRITION_BASIS_GRAMS} g`;

// Column order + naming for the editable nutrition cells (IngredientsTable
// headers and IngredientRowEditor inputs iterate this same list, so the two
// can never disagree on order or naming). `name` is the single canonical label
// for a nutrient — used verbatim in the header, the detail drawer, and every
// aria-label so the UI never calls the same nutrient two different things
// (these match NutritionPanel's plain names, e.g. "Fiber" not "Dietary
// fiber"). `unit` shows the scale beside the name (g vs mg; calories keeps
// "kcal"). All values are per 100 g.
export interface NutritionColumn {
  key: keyof IngredientNutrition;
  name: string;
  unit: string;
}

// The one place a nutrient's display label is composed, so header/drawer/
// aria-labels stay identical: "Fiber (g)", "Calories (kcal)", etc.
export function nutritionLabel(col: NutritionColumn): string {
  return `${col.name} (${col.unit})`;
}

// Labels only — which nutrients exist and in what order comes from
// NUTRITION_FIELDS, so this table and the MCP tool prose can't disagree about
// the catalog. `satisfies Record<NutritionField, …>` is exhaustive in both
// directions: a nutrient with no label and a label for no nutrient are both
// compile errors.
const NUTRITION_LABELS = {
  calories_kcal: { name: "Calories", unit: "kcal" },
  protein_g: { name: "Protein", unit: "g" },
  fat_g: { name: "Fat", unit: "g" },
  saturated_fat_g: { name: "Saturated fat", unit: "g" },
  carbs_g: { name: "Carbs", unit: "g" },
  fiber_g: { name: "Fiber", unit: "g" },
  sugars_g: { name: "Sugars", unit: "g" },
  sodium_mg: { name: "Sodium", unit: "mg" },
  cholesterol_mg: { name: "Cholesterol", unit: "mg" },
  calcium_mg: { name: "Calcium", unit: "mg" },
  iron_mg: { name: "Iron", unit: "mg" },
  potassium_mg: { name: "Potassium", unit: "mg" },
} satisfies Record<NutritionField, Omit<NutritionColumn, "key">>;

export const NUTRITION_COLUMNS: NutritionColumn[] = NUTRITION_FIELDS.map(
  (key) => ({ key, ...NUTRITION_LABELS[key] }),
);

// The subset shown as always-visible columns in the manager table (the rest
// live in the expandable detail row). Ordered as the user reads a label:
// calories, protein, carbs, fat, fiber, sodium — note carbs before fat, which
// differs from NUTRITION_COLUMNS' USDA-derived order.
export const PRIMARY_NUTRITION_KEYS = [
  "calories_kcal",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "sodium_mg",
] as const satisfies readonly (keyof IngredientNutrition)[];

export const PRIMARY_NUTRITION_COLUMNS: NutritionColumn[] =
  PRIMARY_NUTRITION_KEYS.map(
    (key) => NUTRITION_COLUMNS.find((col) => col.key === key)!,
  );

// Column order for the NutritionDetail table: the primary six first (the same
// nutrients the manager surfaces and NutritionPanel reads, in that reading
// order), then the remaining nutrients in catalog order. Reuses the same
// NUTRITION_COLUMNS objects, so labels via nutritionLabel() stay identical
// across the manager table and this screen.
const PRIMARY_KEY_SET = new Set<keyof IngredientNutrition>(PRIMARY_NUTRITION_KEYS);
export const NUTRITION_DETAIL_COLUMNS: NutritionColumn[] = [
  ...PRIMARY_NUTRITION_COLUMNS,
  ...NUTRITION_COLUMNS.filter((col) => !PRIMARY_KEY_SET.has(col.key)),
];
