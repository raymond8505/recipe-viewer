import { z } from "zod";
import { nutritionSchema } from "./nutrition";
import type { Assert, Assignable } from "@/lib/exhaustive";
import type { IngredientSource } from "@/types/ingredient";

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

// The catalog's provenance enum. Mirrors the CHECK in
// db/migrations/0002_ingredients.sql; this is the app-side source the JSON
// schema, the create default and the MCP tool prose all derive from.
export const ingredientSourceSchema = z.enum(["usda", "manual"]);
export const INGREDIENT_SOURCES = ingredientSourceSchema.options;
export const DEFAULT_INGREDIENT_SOURCE = ingredientSourceSchema.enum.manual;

// Parity with the hand-written union in @/types/ingredient. The check lives on
// this side because a value import back the other way would be a cycle.
export type SourceEnumCoversType = Assert<
  Assignable<IngredientSource, z.infer<typeof ingredientSourceSchema>>
>;
export type SourceTypeCoversEnum = Assert<
  Assignable<z.infer<typeof ingredientSourceSchema>, IngredientSource>
>;

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
  source: ingredientSourceSchema.default(DEFAULT_INGREDIENT_SOURCE),
});

export const ingredientUpdateInputSchema = ingredientCreateInputSchema.partial();

export const ingredientIdInputSchema = z.object({
  id: z.string().min(1),
});

// MCP tool inputs. Unlike the HTTP routes (whose UI does the conversion
// client-side), agents pass nutrition AS MEASURED for an accompanying
// `nutrition_portion`; the tool scales to the per-100g storage form
// deterministically. Setting nutrition therefore requires a nutrition_portion;
// clearing (null) does not.
//
// The field is named nutrition_portion (not `portion`) and the error names it
// explicitly with a path: an agent conflated the bare word "portion" with
// food_portions and burned 13 calls varying that field's shape before giving
// up. The message must be a recovery instruction, not a description.
const nutritionRequiresPortion = (d: {
  nutrition?: unknown;
  nutrition_portion?: unknown;
}) => d.nutrition == null || d.nutrition_portion != null;
const NUTRITION_REQUIRES_PORTION_ISSUE = {
  message:
    "Pass nutrition_portion ({ gramWeight, amount?, modifier? }) describing what the nutrition values are measured for. This is a separate field from food_portions — food_portions does not satisfy it.",
  path: ["nutrition_portion"],
};

export const ingredientCreateToolInputSchema = ingredientCreateInputSchema
  .extend({ nutrition_portion: foodPortionSchema.optional() })
  .refine(nutritionRequiresPortion, NUTRITION_REQUIRES_PORTION_ISSUE);

// MCP update_ingredient — flat { id, ...patch }, matching update_recipe's shape.
export const ingredientUpdateToolInputSchema = ingredientUpdateInputSchema
  .extend({
    id: z.string().min(1),
    nutrition_portion: foodPortionSchema.optional(),
  })
  .refine(nutritionRequiresPortion, NUTRITION_REQUIRES_PORTION_ISSUE);

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

// PATCH /api/recipes/[id]/ingredients — edit one schema ingredient line's
// text in place (the NutritionDetail inline edit). Index-addressed because
// the schema line, not the recipe_ingredients row, is the edit target — a
// stale or never-normalized line has no row to key on.
export const recipeLineTextPatchSchema = z.object({
  index: z.number().int().min(0),
  text: z.string().trim().min(1).max(500),
});

// PATCH /api/recipes/[id]/ingredients/[riId]/grams — user-typed per-line gram
// override. Three meanings, all deliberate:
//   a weight — this is what the line masses;
//   0        — "don't count this line", the answer to an ingredient that can't
//              reasonably be weighed ("salt to taste"). Zero is BOTH the signal
//              and the mechanism: the line computes as `ok` at 0 g, so it stops
//              blocking `fullyCovered` while contributing nothing to the totals;
//   null     — clear the override (line reverts to the derived value).
// Negatives are rejected — a negative mass is neither.
export const recipeIngredientGramsPatchSchema = z.object({
  grams: z.number().nonnegative().nullable(),
});

// GET /api/usda/search — USDA candidates for the manual-import flow.
export const usdaSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

// POST /api/ingredients/import-usda — resolve a picked USDA food to its
// catalog row. `name` is the recipe line's parsed name, which becomes an ALIAS
// on that row; the canonical name is USDA's own description.
export const usdaImportInputSchema = z.object({
  fdcId: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

export type IngredientCreateInput = z.infer<typeof ingredientCreateInputSchema>;
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateInputSchema>;
export type IngredientIdInput = z.infer<typeof ingredientIdInputSchema>;
export type IngredientCreateToolInput = z.infer<typeof ingredientCreateToolInputSchema>;
export type IngredientUpdateToolInput = z.infer<typeof ingredientUpdateToolInputSchema>;
export type IngredientSearchInput = z.infer<typeof ingredientSearchInputSchema>;
