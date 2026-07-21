import type { IngredientNutrition } from "@/types/ingredient";

// Column order + labels for the editable nutrition cells (IngredientsTable
// headers and IngredientRowEditor inputs iterate this same list, so the two
// can never disagree on order). Labels are abbreviated to keep 12 numeric
// columns scannable; `unit` is shown next to the label so the scale is
// unambiguous (g vs mg), and `title` carries the full name for hover. Calories
// has no `unit` because its label ("kcal") already is the unit. All values are
// per 100 g.
export interface NutritionColumn {
  key: keyof IngredientNutrition;
  label: string;
  unit?: string;
  title: string;
}

export const NUTRITION_COLUMNS: NutritionColumn[] = [
  { key: "calories_kcal", label: "kcal", title: "Calories (kcal)" },
  { key: "protein_g", label: "prot", unit: "g", title: "Protein (g)" },
  { key: "fat_g", label: "fat", unit: "g", title: "Total fat (g)" },
  { key: "saturated_fat_g", label: "sat", unit: "g", title: "Saturated fat (g)" },
  { key: "carbs_g", label: "carb", unit: "g", title: "Carbohydrate (g)" },
  { key: "fiber_g", label: "fib", unit: "g", title: "Dietary fiber (g)" },
  { key: "sugars_g", label: "sug", unit: "g", title: "Sugars (g)" },
  { key: "sodium_mg", label: "Na", unit: "mg", title: "Sodium (mg)" },
  { key: "cholesterol_mg", label: "chol", unit: "mg", title: "Cholesterol (mg)" },
  { key: "calcium_mg", label: "Ca", unit: "mg", title: "Calcium (mg)" },
  { key: "iron_mg", label: "Fe", unit: "mg", title: "Iron (mg)" },
  { key: "potassium_mg", label: "K", unit: "mg", title: "Potassium (mg)" },
];

// The six nutrients NutritionPanel surfaces, in its display order — the ones
// a reader compares first.
const PANEL_KEYS: (keyof IngredientNutrition)[] = [
  "calories_kcal",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "sodium_mg",
];

// Column order for the NutritionDetail table: the NutritionPanel six first,
// then the remaining nutrients in catalog order. Same column objects as
// NUTRITION_COLUMNS (only the order differs), so the two tables can never
// disagree on labels or titles.
export const NUTRITION_DETAIL_COLUMNS: NutritionColumn[] = [
  ...PANEL_KEYS.map((key) => NUTRITION_COLUMNS.find((col) => col.key === key)!),
  ...NUTRITION_COLUMNS.filter((col) => !PANEL_KEYS.includes(col.key)),
];
