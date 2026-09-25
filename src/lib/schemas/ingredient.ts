import { z } from "zod";
import { nutritionSchema } from "./nutrition";
import {
  normalizeFoodPortions,
  portionConflictMessage,
} from "@/lib/foodPortions";
import type { Assert, Assignable } from "@/lib/exhaustive";
import type { IngredientSource } from "@/types/ingredient";

// Zod validators for the ingredient CRUD/search surface. Shared by the HTTP
// routes and the MCP search tool so both agree on the allowed shapes.
//
// Deliberately NOT client-settable: `embedding` (server-derived from the name).
// `food_portions` IS client-settable, and is the ONLY thing that writes that
// column — the manager lets users add/edit/delete portions (the seed row is a
// 100 g portion). Matches the UsdaFoodPortion shape so the USDA-import path and
// hand-entered rows share one column + serving-size render. The nutrition basis
// is a separate plain number (`nutrition_basis_g`) that writes nothing.

const foodPortionSchema = z.object({
  gramWeight: z.number().positive(),
  amount: z.number().positive().optional(),
  // The label / unit for manual portions (USDA foods put it here too, e.g.
  // "tsp, whole"); formatServingSize reads it when measureUnit.name is absent.
  modifier: z.string().max(100).optional(),
  measureUnit: z.object({ name: z.string().max(100).optional() }).optional(),
});

// Repeats collapse and contradictions are rejected at the input boundary, so a
// caller cannot mint "1 cup" twice at two weights. Deliberately NOT at the repo
// chokepoint: src/lib/ingredientImport.ts writes USDA's own foodPortions
// straight through createIngredientRow, and USDA legitimately ships one label
// at several weights. That payload is an audit trail recorded verbatim; this
// rule governs what a CALLER may assert.
const foodPortionsSchema = z
  .array(foodPortionSchema)
  .max(50)
  .superRefine((portions, ctx) => {
    const { conflicts } = normalizeFoodPortions(portions);
    if (conflicts.length > 0) {
      // No `path` here: zod prefixes the issue with the field this schema sits
      // on, so naming it again would report ["food_portions","food_portions"].
      ctx.addIssue({ code: "custom", message: portionConflictMessage(conflicts) });
    }
  })
  .transform((portions) => normalizeFoodPortions(portions).portions);

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
  food_portions: foodPortionsSchema.nullish(),
  // The UI creates hand-entered rows; the workflow's USDA rows go through the
  // repo layer directly.
  source: ingredientSourceSchema.default(DEFAULT_INGREDIENT_SOURCE),
  // When the row was last verified against a source (db/migrations/0026).
  // `offset: true` accepts "+00:00" as well as "Z": an agent's clock formats
  // it either way, and both are the same instant. `.nullish()` gives the same
  // three-way semantics the rest of this schema has — absent leaves the column
  // alone, null clears the stamp, a string sets it.
  last_checked: z.iso.datetime({ offset: true }).nullish(),
});

// `.partial()` makes every key optional but does NOT drop create's
// `.default()`, so an absent `source` would still parse as
// DEFAULT_INGREDIENT_SOURCE and every patch would rewrite the column — even
// one that only stamps last_checked. Whether an update demotes a row to
// "manual" is `updateIngredientRow`'s call, because only it can see whether
// the patch changes any of the row's data.
export const ingredientUpdateInputSchema = ingredientCreateInputSchema
  .partial()
  .extend({ source: ingredientSourceSchema.optional() });

export const ingredientIdInputSchema = z.object({
  id: z.string().min(1),
});

// MCP tool inputs. Unlike the HTTP routes (whose UI converts client-side),
// agents pass nutrition AS MEASURED against `nutrition_basis_g` and the tool
// scales to the per-100g storage form deterministically. Setting nutrition
// therefore requires a basis; clearing it (null) does not.
//
// The basis is a PLAIN NUMBER OF GRAMS, which is the whole point: it is the
// only thing the conversion ever reads, and a number cannot be mistaken for
// food_portions' list of objects the way a portion-shaped field was.
export const NUTRITION_BASIS_REQUIRED =
  'Pass nutrition_basis_g: the gram weight the nutrition values are measured against — 30 for a label reading "per 30 g", or 2 tbsp weighed at 28 g. The server converts to its per-100g storage form.';

const nutritionRequiresBasis = (d: {
  nutrition?: unknown;
  nutrition_basis_g?: unknown;
}) => d.nutrition == null || d.nutrition_basis_g != null;
const NUTRITION_REQUIRES_BASIS_ISSUE = {
  message: NUTRITION_BASIS_REQUIRED,
  path: ["nutrition_basis_g"],
};

const nutritionBasisGrams = z.number().positive().optional();

export const ingredientCreateToolInputSchema = ingredientCreateInputSchema
  .extend({ nutrition_basis_g: nutritionBasisGrams })
  .refine(nutritionRequiresBasis, NUTRITION_REQUIRES_BASIS_ISSUE);

// MCP update_ingredient — flat { id, ...patch }, matching update_recipe's shape.
export const ingredientUpdateToolInputSchema = ingredientUpdateInputSchema
  .extend({
    id: z.string().min(1),
    nutrition_basis_g: nutritionBasisGrams,
  })
  .refine(nutritionRequiresBasis, NUTRITION_REQUIRES_BASIS_ISSUE);

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

// PATCH /api/recipes/[id]/ingredients — edit one ingredient's text in place
// (the NutritionDetail inline edit). Addressed by the recipe_ingredients row
// id, which since db/migrations/0016 IS the line's identity.
export const recipeLineTextPatchSchema = z.object({
  id: z.string().min(1),
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
