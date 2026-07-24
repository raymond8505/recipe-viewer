// Client-side wrappers for the /api/recipes routes. UI components import from
// here instead of calling `fetch` directly so the network shape stays in one
// place and tests/stories can mock a single module.

import type { IngredientRow, RecipeIngredientRow } from "@/types/ingredient";

export interface RecipeIngredientsPayload {
  rows: RecipeIngredientRow[];
  ingredients: IngredientRow[];
}

/**
 * A recipe's normalized ingredient rows plus the catalog rows they point at
 * (the NutritionDetail data set) — for client-side refresh after a
 * re-normalization run; the page's initial load is server-side.
 */
export async function fetchRecipeIngredients(
  recipeId: string,
): Promise<RecipeIngredientsPayload> {
  const res = await fetch(`/api/recipes/${recipeId}/ingredients`);
  if (!res.ok) {
    throw new Error(`Recipe ingredients fetch failed with status ${res.status}`);
  }
  const body = await res.json();
  if (!Array.isArray(body.rows) || !Array.isArray(body.ingredients)) {
    throw new Error("Recipe ingredients fetch returned no rows");
  }
  return body;
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
