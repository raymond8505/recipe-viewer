// Client-side wrappers for the /api/ingredients routes (pattern:
// src/lib/api/recipes.ts). UI components import from here instead of calling
// `fetch` directly so the network shape stays in one place and tests/stories
// can mock a single module.

import type {
  IngredientKeywordMatch,
  IngredientRow,
  IngredientsResult,
} from "@/types/ingredient";
import type {
  IngredientCreateInput,
  IngredientUpdateInput,
} from "@/lib/schemas/ingredient";
// Type-only: the runtime module pulls in @/env and must not reach the client.
import type { UsdaSearchFood } from "@/lib/usda";

export async function fetchIngredients(opts?: {
  q?: string;
  page?: number;
  limit?: number;
}): Promise<IngredientsResult> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();

  const res = await fetch(`/api/ingredients${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(`Ingredient list failed with status ${res.status}`);
  }
  return res.json();
}

/**
 * Keyword-only trigram search over the catalog — the NutritionDetail
 * autocomplete path. Cheap per-keystroke (no embedding on the server side).
 */
export async function searchIngredientsKeyword(
  q: string,
  limit?: number,
): Promise<IngredientKeywordMatch[]> {
  const params = new URLSearchParams({ q });
  if (limit) params.set("limit", String(limit));

  const res = await fetch(`/api/ingredients/search?${params}`);
  if (!res.ok) {
    throw new Error(`Ingredient search failed with status ${res.status}`);
  }
  const body = await res.json();
  if (!Array.isArray(body.data)) {
    throw new Error("Ingredient search returned no data");
  }
  return body.data;
}

/**
 * USDA candidates for the manual-import fallback (includes Branded — a human
 * picks). Server proxies FoodData Central so the API key stays private.
 */
export async function searchUsdaFoods(q: string): Promise<UsdaSearchFood[]> {
  const params = new URLSearchParams({ q });
  const res = await fetch(`/api/usda/search?${params}`);
  if (!res.ok) {
    throw new Error(`USDA search failed with status ${res.status}`);
  }
  const body = await res.json();
  if (!Array.isArray(body.data)) {
    throw new Error("USDA search returned no data");
  }
  return body.data;
}

/**
 * Mint a catalog ingredient from a picked USDA food. `name` becomes the
 * catalog's canonical (recipe-language) name. Returns the new row — or the
 * existing one if the name was already taken.
 */
export async function importUsdaIngredient(
  fdcId: number,
  name: string,
): Promise<IngredientRow> {
  const res = await fetch("/api/ingredients/import-usda", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fdcId, name }),
  });
  if (!res.ok) {
    throw new Error(`USDA import failed with status ${res.status}`);
  }
  const row = await res.json();
  if (!row || typeof row.id !== "string") {
    throw new Error("USDA import returned no ingredient");
  }
  return row;
}

export async function createIngredient(
  input: IngredientCreateInput,
): Promise<IngredientRow> {
  const res = await fetch("/api/ingredients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 409) {
    throw new Error("An ingredient with that name already exists");
  }
  if (!res.ok) {
    throw new Error(`Ingredient create failed with status ${res.status}`);
  }
  return res.json();
}

export async function updateIngredient(
  id: string,
  patch: IngredientUpdateInput,
): Promise<IngredientRow> {
  const res = await fetch(`/api/ingredients/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (res.status === 409) {
    throw new Error("An ingredient with that name already exists");
  }
  if (!res.ok) {
    throw new Error(`Ingredient update failed with status ${res.status}`);
  }
  return res.json();
}

export async function deleteIngredient(id: string): Promise<void> {
  const res = await fetch(`/api/ingredients/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Ingredient delete failed with status ${res.status}`);
  }
}
