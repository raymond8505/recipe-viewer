import { z } from "zod";

// Zod validators for the ingredient CRUD/search surface. Shared by the HTTP
// routes and the MCP search tool so both agree on the allowed shapes.
//
// Deliberately NOT client-settable: `embedding` (server-derived from the name).
// `food_portions` IS client-settable — the manager lets users add/edit/delete
// portions (the seed row is a 100 g portion), and the create form enters
// nutrition against a chosen portion. Matches the UsdaFoodPortion shape so the
// USDA-import path and hand-entered rows share one column + serving-size render.

const foodPortionSchema = z.object({
  gramWeight: z.number().positive(),
  amount: z.number().positive().optional(),
  // The label / unit for manual portions (USDA foods put it here too, e.g.
  // "tsp, whole"); formatServingSize reads it when measureUnit.name is absent.
  modifier: z.string().max(100).optional(),
  measureUnit: z.object({ name: z.string().max(100).optional() }).optional(),
});

const nutritionSchema = z
  .object({
    calories_kcal: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    saturated_fat_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fiber_g: z.number().nonnegative(),
    sugars_g: z.number().nonnegative(),
    sodium_mg: z.number().nonnegative(),
    cholesterol_mg: z.number().nonnegative(),
    calcium_mg: z.number().nonnegative(),
    iron_mg: z.number().nonnegative(),
    potassium_mg: z.number().nonnegative(),
  })
  .partial();

export const ingredientCreateInputSchema = z.object({
  name: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(200)).max(20).optional(),
  fdc_id: z.number().int().positive().nullish(),
  fdc_data_type: z.string().max(50).nullish(),
  nutrition: nutritionSchema.nullish(),
  density_g_per_ml: z.number().positive().nullish(),
  food_portions: z.array(foodPortionSchema).max(50).nullish(),
  // The UI creates hand-entered rows; the workflow's USDA rows go through the
  // repo layer directly.
  source: z.enum(["usda", "manual"]).default("manual"),
});

export const ingredientUpdateInputSchema = ingredientCreateInputSchema.partial();

export const ingredientListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const ingredientSearchInputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(10).default(5),
});

// GET /api/ingredients/search — the keyword-only trigram autocomplete.
// Coerced numbers because the values arrive as URL query strings.
export const ingredientKeywordSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().positive().max(20).default(8),
});

// PATCH /api/recipes/[id]/ingredients/[riId] — manual association change.
// null clears the association (line becomes "unmatched").
export const recipeIngredientPatchSchema = z.object({
  ingredient_id: z.uuid().nullable(),
});

// PATCH /api/recipes/[id]/ingredients/[riId]/grams — user-typed per-line gram
// override. null clears the estimate (line reverts to the derived value).
export const recipeIngredientGramsPatchSchema = z.object({
  grams: z.number().positive().nullable(),
});

// GET /api/usda/search — USDA candidates for the manual-import flow.
export const usdaSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

// POST /api/ingredients/import-usda — mint a catalog row from a picked USDA
// food. `name` is the recipe-language canonical name for the new ingredient.
export const usdaImportInputSchema = z.object({
  fdcId: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

export type IngredientCreateInput = z.infer<typeof ingredientCreateInputSchema>;
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateInputSchema>;
export type IngredientSearchInput = z.infer<typeof ingredientSearchInputSchema>;
