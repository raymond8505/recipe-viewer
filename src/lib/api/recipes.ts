// Client-side wrappers for the /api/recipes routes. UI components import from
// here instead of calling `fetch` directly so the network shape stays in one
// place and tests/stories can mock a single module.

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
