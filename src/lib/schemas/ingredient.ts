import { z } from "zod";

// Zod validators for the ingredient CRUD/search surface. Shared by the HTTP
// routes and the MCP search tool so both agree on the allowed shapes.
//
// Deliberately NOT client-settable anywhere: `embedding` (server-derived from
// the name) and `food_portions` (USDA provenance — the audit trail for a
// density value; manual corrections edit density_g_per_ml itself).

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

export type IngredientCreateInput = z.infer<typeof ingredientCreateInputSchema>;
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateInputSchema>;
export type IngredientSearchInput = z.infer<typeof ingredientSearchInputSchema>;
