import type { IngredientNutrition } from "@/types/ingredient";

// Column order + labels for the editable nutrition cells (IngredientsTable
// headers and IngredientRowEditor inputs iterate this same list, so the two
// can never disagree on order). Labels are abbreviated to keep 12 numeric
// columns scannable; `title` carries the full name for hover. All values are
// per 100 g.
export interface NutritionColumn {
  key: keyof IngredientNutrition;
  label: string;
  title: string;
}

export const NUTRITION_COLUMNS: NutritionColumn[] = [
  { key: "calories_kcal", label: "kcal", title: "Calories (kcal)" },
  { key: "protein_g", label: "prot", title: "Protein (g)" },
  { key: "fat_g", label: "fat", title: "Total fat (g)" },
  { key: "saturated_fat_g", label: "sat", title: "Saturated fat (g)" },
  { key: "carbs_g", label: "carb", title: "Carbohydrate (g)" },
  { key: "fiber_g", label: "fib", title: "Dietary fiber (g)" },
  { key: "sugars_g", label: "sug", title: "Sugars (g)" },
  { key: "sodium_mg", label: "Na", title: "Sodium (mg)" },
  { key: "cholesterol_mg", label: "chol", title: "Cholesterol (mg)" },
  { key: "calcium_mg", label: "Ca", title: "Calcium (mg)" },
  { key: "iron_mg", label: "Fe", title: "Iron (mg)" },
  { key: "potassium_mg", label: "K", title: "Potassium (mg)" },
];
