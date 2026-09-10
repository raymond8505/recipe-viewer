// Client-side wrappers for the /api/recipes routes. UI components import from
// here instead of calling `fetch` directly so the network shape stays in one
// place and tests/stories can mock a single module.

import type { RecipeIngredientRow } from "@/types/ingredient";
import type {
  RecipeIngredientGroup,
  RecipeIngredientGroupInput,
  SchemaRecipe,
} from "@/types/recipe";
import type { RecipeStatus } from "@/lib/schemas/recipe";

export interface SaveRecipeBody {
  schema: SchemaRecipe;
  /** The whole list; the editor always sends it. Lines keep their rows by id. */
  ingredients: RecipeIngredientGroupInput[];
  status: string;
  url: string;
  source: string;
}

export interface SavedRecipe {
  schema: SchemaRecipe;
  ingredients: RecipeIngredientGroup[];
  /** The column-backed times, in seconds — the document's, not the blob's. */
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
  status: RecipeStatus;
  url: string;
  source: string;
}

/**
 * Persist an edit (the editor's Save). The response echoes what was actually
 * stored — the ingredient groups with every line's row id, the time columns
 * — so the caller re-seeds its document from that rather than from its own
 * draft: values degrade or canonicalize server-side, and a new line only has
 * an id after the round trip.
 */
export async function saveRecipe(
  recipeId: string,
  body: SaveRecipeBody,
): Promise<SavedRecipe> {
  const res = await fetch(`/api/recipes/${recipeId}/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Recipe save failed with status ${res.status}`);
  }
  const saved = await res.json();
  if (!saved.schema || !Array.isArray(saved.ingredients)) {
    throw new Error("Recipe save returned no recipe");
  }
  return saved;
}

/**
 * Edit one ingredient's text in place (the NutritionDetail inline edit). This
 * edits the RECIPE — the server re-parses the row deterministically. It does
 * NOT re-match: the line's catalog association is the user's, not the
 * matcher's. The groups come back current so the caller replaces its copy
 * wholesale — a stale row misreports the edited line.
 */
export async function updateRecipeIngredientLine(
  recipeId: string,
  lineId: string,
  text: string,
): Promise<{ ingredients: RecipeIngredientGroup[] }> {
  const res = await fetch(`/api/recipes/${recipeId}/ingredients`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: lineId, text }),
  });
  if (!res.ok) {
    throw new Error(`Ingredient line update failed with status ${res.status}`);
  }
  const body = await res.json();
  if (!Array.isArray(body.ingredients)) {
    throw new Error("Ingredient line update returned no ingredients");
  }
  return { ingredients: body.ingredients };
}

/**
 * Manually re-point one parsed line at a catalog ingredient; null clears the
 * association (the line becomes "unmatched"). Returns the updated row.
 */
export async function updateRecipeIngredientAssociation(
  recipeId: string,
  recipeIngredientId: string,
  ingredientId: string | null,
): Promise<RecipeIngredientRow> {
  const res = await fetch(
    `/api/recipes/${recipeId}/ingredients/${recipeIngredientId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredient_id: ingredientId }),
    },
  );
  if (!res.ok) {
    throw new Error(`Association update failed with status ${res.status}`);
  }
  const row = await res.json();
  if (!row || typeof row.id !== "string") {
    throw new Error("Association update returned no row");
  }
  return row;
}

/**
 * Run the Gemini estimator for one parsed line and store the result
 * (grams_source "llm") — the NutritionDetail "Estimate" button. Returns the
 * updated row. Throws on a 422 (the model declined) so the caller can surface
 * a "couldn't estimate" message.
 */
export async function estimateIngredientGrams(
  recipeId: string,
  recipeIngredientId: string,
): Promise<RecipeIngredientRow> {
  const res = await fetch(
    `/api/recipes/${recipeId}/ingredients/${recipeIngredientId}/grams`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(`Grams estimate failed with status ${res.status}`);
  }
  const row = await res.json();
  if (!row || typeof row.id !== "string") {
    throw new Error("Grams estimate returned no row");
  }
  return row;
}

/**
 * Set a user-typed per-line gram value (grams_source "manual"), or clear it
 * with null so the line reverts to the density-derived value. Returns the
 * updated row.
 */
export async function setIngredientGrams(
  recipeId: string,
  recipeIngredientId: string,
  grams: number | null,
): Promise<RecipeIngredientRow> {
  const res = await fetch(
    `/api/recipes/${recipeId}/ingredients/${recipeIngredientId}/grams`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grams }),
    },
  );
  if (!res.ok) {
    throw new Error(`Grams update failed with status ${res.status}`);
  }
  const row = await res.json();
  if (!row || typeof row.id !== "string") {
    throw new Error("Grams update returned no row");
  }
  return row;
}

/**
 * Queue an ingredient-normalization re-run for a recipe (the recovery path
 * after a failed run, or after threshold/catalog changes). The work itself
 * happens post-response — a 200 means "queued", not "done".
 */
export async function normalizeRecipe(recipeId: string): Promise<void> {
  const res = await fetch(`/api/recipes/${recipeId}/normalize`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Normalization request failed with status ${res.status}`);
  }
}

// Named ...File to stay distinct from the server-side uploadRecipeImage in
// @/lib/storage and the MCP tool of the same name.
export async function uploadRecipeImageFile(
  recipeId: string,
  file: File,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  // The UI saves the image through its own verified full-schema save, so opt out
  // of the route's default schema update (which exists for the review-less agent path).
  form.append("updateSchema", "false");
  const res = await fetch(`/api/recipes/${recipeId}/upload-image`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Image upload failed with status ${res.status}`);
  }
  const body = await res.json();
  if (!body.image || typeof body.image !== "string") {
    throw new Error("Image upload returned no image URL");
  }
  return body.image;
}
