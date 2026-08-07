import {
  archiveRecipe,
  createRecipeRow,
  getRecipeById,
  getRecipes,
  RecipeRepoError,
  updateRecipeRow,
} from "@/lib/recipes";
import {
  createIngredientRow,
  deleteIngredientRow,
  getIngredientById,
  getRecipeNormalizedNutrition,
  IngredientRepoError,
  matchIngredients,
  updateIngredientRow,
  type UpdateIngredientPatch,
} from "@/lib/ingredients";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import {
  nutrientValuesToSchema,
  scalePortionNutritionToPer100g,
} from "@/lib/nutritionMath";
import { generateEmbedding } from "@/lib/embedding";
import { ingredientEmbeddingText, ingredientQueryText } from "@/lib/ingredientAliases";
import { RECIPE_TOKEN_TTL_SECONDS, signRecipeToken } from "./recipeToken";
import { env } from "@/env";
import {
  fetchImageBytes,
  StorageUploadError,
  uploadRecipeImage as uploadImageToStorage,
} from "@/lib/storage";
import type { RecipeRow } from "@/types/recipe";
import type {
  RecipeCreateInput,
  RecipeIdInput,
  RecipeImageUploadInput,
  RecipeSearchInput,
  RecipeUpdateInput,
} from "@/lib/schemas/recipe";
import type {
  IngredientCreateToolInput,
  IngredientIdInput,
  IngredientSearchInput,
  IngredientUpdateToolInput,
} from "@/lib/schemas/ingredient";
import type { IngredientMatch, IngredientRow } from "@/types/ingredient";

// Every tool here is a thin wrapper over a repo helper (`@/lib/recipes`,
// `@/lib/ingredients`). They handle argument typing + translate repo errors
// into ToolError so the MCP dispatcher can render a uniform isError content
// envelope. Supabase calls live in the repo modules — see CR feedback on PR #13.

// Trimmed search hit. Search returns enough to identify/disambiguate a recipe
// without shipping the full schema (ingredients, instructions, nutrition, …) for
// every row — agents call get_recipe for the full document once they pick one.
export interface RecipeSearchResultItem {
  id: string;
  url: string;
  name: string;
  description?: string;
}

export async function searchRecipes(
  args: RecipeSearchInput,
): Promise<{ data: RecipeSearchResultItem[]; count: number }> {
  const { data, count } = await getRecipes({
    query: args.query,
    source: args.source,
    status: args.status,
    page: args.page,
    limit: args.limit,
    // MCP callers are authenticated via OAuth — treat as logged-in so they see
    // drafts/archived rows when filtering explicitly by status.
    isLoggedIn: true,
  });
  return {
    data: data.map((row) => ({
      id: row.id,
      url: row.url,
      name: row.metadata.schema.name,
      description: row.metadata.schema.description,
    })),
    count,
  };
}

// Semantic search over the ingredient catalog: embed the query with the same
// model that embedded the catalog names, then cosine-match via the
// match_ingredients RPC. IngredientMatch already carries everything an agent
// needs (per-100g nutrition + density) — no follow-up fetch tool required.
export async function searchIngredients(
  args: IngredientSearchInput,
): Promise<{ data: IngredientMatch[] }> {
  // ingredientQueryText, not the raw query: catalog vectors are built from
  // lowercased name + aliases, so the query side has to fold case identically
  // or the normalization works against the match instead of for it.
  const embedding = await generateEmbedding(ingredientQueryText(args.query));
  if (!embedding) {
    throw new ToolError(
      "embedding_unavailable",
      "Semantic ingredient search is temporarily unavailable (embedding generation failed) — retry shortly.",
    );
  }

  try {
    return { data: await matchIngredients(args.query, embedding, args.limit) };
  } catch (err) {
    if (err instanceof IngredientRepoError) {
      throw new ToolError("search_failed", err.detail);
    }
    throw err;
  }
}

// Ingredient CRUD — mirrors the session-gated HTTP routes (/api/ingredients,
// /api/ingredients/[id]) so OAuth-authenticated agents can maintain the
// catalog. The embedding is never client-settable: it is derived here from
// name + aliases via ingredientEmbeddingText, exactly like those routes do.
// Deriving it from the bare name instead would still compile and still write a
// row — it would just be embedded differently from every other write path
// (manager UI, USDA import, normalization accretion), so agent-created rows
// would match worse than identical rows made anywhere else.
//
// Nutrition arrives AS MEASURED for the accompanying `nutrition_portion`
// (agents think in "1 tbsp = 14 g", not storage units) and is scaled to the
// per-100g storage form here — the same deterministic conversion the manager
// UI's create form does client-side (IngredientCreateForm →
// scalePortionNutritionToPer100g).

export async function getIngredient(args: IngredientIdInput): Promise<IngredientRow> {
  const row = await getIngredientById(args.id);
  if (!row) throw new ToolError("not_found", `Ingredient ${args.id} not found`);
  return row;
}

export async function createIngredient(
  args: IngredientCreateToolInput,
): Promise<IngredientRow> {
  // The column is NOT NULL (db/migrations/0006) — an embedding-less row can't
  // exist (it would be invisible to matching), so a failed embedding is a
  // retryable error rather than a partial create.
  //
  // A tool-supplied name is canonical as given (unlike a USDA import, which is
  // named by the food's description), but the vector still spans name +
  // aliases — any aliases passed here have to be in the embedded text.
  const embedding = await generateEmbedding(
    ingredientEmbeddingText(args.name, args.aliases ?? []),
  );
  if (!embedding) {
    throw new ToolError(
      "embedding_unavailable",
      "Could not generate an embedding for this ingredient — retry shortly.",
    );
  }

  const { nutrition_portion: portion, ...fields } = args;
  const input = { ...fields, embedding };
  if (portion) {
    // The portion is real data, not just a math basis — persist it (first, as
    // the nutrition-entry basis) like the UI stores its portion list.
    input.food_portions = [portion, ...(fields.food_portions ?? [])];
    if (fields.nutrition) {
      input.nutrition = scalePortionNutritionToPer100g(fields.nutrition, portion.gramWeight);
    }
  }

  try {
    return await createIngredientRow(input);
  } catch (err) {
    throw toIngredientToolError(err, "create_failed");
  }
}

export async function updateIngredient(
  args: IngredientUpdateToolInput,
): Promise<IngredientRow> {
  const { id, nutrition_portion: portion, ...fields } = args;
  const patch: UpdateIngredientPatch = { ...fields };
  // Unlike create, the portion here is only the math basis for the new
  // nutrition values — food_portions changes only when passed explicitly.
  if (fields.nutrition && portion) {
    patch.nutrition = scalePortionNutritionToPer100g(fields.nutrition, portion.gramWeight);
  }
  // The embedding spans name + aliases (that's what matching searches), so
  // EITHER field moving invalidates it. A one-sided patch needs the other
  // side's current value, hence the read. Best-effort: on null the repo keeps
  // the old vector, which still describes the previous text — re-saving retries.
  if (fields.name !== undefined || fields.aliases !== undefined) {
    const current = await getIngredientById(id);
    if (current) {
      // null (embedding failed) → omit, so the repo keeps the old vector; the
      // column is NOT NULL and can never be cleared. UpdateIngredientPatch's
      // embedding is `number[] | undefined`, so coalesce null away.
      patch.embedding =
        (await generateEmbedding(
          ingredientEmbeddingText(
            fields.name ?? current.name,
            fields.aliases ?? current.aliases,
          ),
        )) ?? undefined;
    }
  }

  try {
    return await updateIngredientRow(id, patch);
  } catch (err) {
    throw toIngredientToolError(err, "update_failed");
  }
}

export async function deleteIngredient(
  args: IngredientIdInput,
): Promise<{ id: string; deleted: true }> {
  try {
    await deleteIngredientRow(args.id);
    // Referencing recipe_ingredients rows keep their parsed data; their
    // ingredient_id nulls out via the FK (see db/migrations/0003).
    return { id: args.id, deleted: true };
  } catch (err) {
    throw toIngredientToolError(err, "delete_failed");
  }
}

export async function getRecipe(args: RecipeIdInput): Promise<RecipeRow> {
  const row = await getRecipeById(args.id);
  if (!row) throw new ToolError("not_found", `Recipe ${args.id} not found`);

  // Serve the recipe's single resolved nutrition view — the same
  // ScalableRecipe.nutrition() decision as the UI panel and JSON-LD. Only an
  // ingredients-sourced result overrides; otherwise the row's own nutrition is
  // already what nutrition() would serve.
  const schema = row.metadata.schema;
  const normalized = await getRecipeNormalizedNutrition(
    args.id,
    schema.recipeIngredient ?? [],
  );
  const resolved = new ScalableRecipe(schema, undefined, normalized).nutrition();
  if (resolved?.source !== "ingredients") return row;

  return {
    ...row,
    metadata: {
      ...row.metadata,
      schema: {
        ...schema,
        nutrition: {
          "@type": "NutritionInformation",
          ...nutrientValuesToSchema(resolved.values),
        },
      },
    },
  };
}

export async function getToken(
  args: RecipeIdInput,
): Promise<{ token: string; recipeId: string; expiresInSeconds: number }> {
  // Mint only for recipes that exist, so the agent gets a clear not_found
  // rather than a token that will 404 at upload time.
  const row = await getRecipeById(args.id);
  if (!row) throw new ToolError("not_found", `Recipe ${args.id} not found`);
  const token = await signRecipeToken(args.id);
  return { token, recipeId: args.id, expiresInSeconds: RECIPE_TOKEN_TTL_SECONDS };
}

// cookingNotes is user-authored in cooking mode and read-only to agents: the
// create/update tools strip it rather than fail, and surface why in the
// response. The dedicated clear_cooking_notes tool is the only agent-writable
// path. See CLAUDE.md "Cooking Notes" rules.
const COOKING_NOTES_IGNORED_WARNING =
  "cookingNotes is read-only for agents and was ignored — it is authored by users in cooking mode. Use the clear_cooking_notes tool when explicitly asked to clear it.";

export type RecipeRowWithWarnings = RecipeRow & { warnings?: string[] };

export async function createRecipe(
  args: RecipeCreateInput,
): Promise<RecipeRowWithWarnings> {
  const { cookingNotes, ...schema } = args.schema;
  const id = crypto.randomUUID();
  // Default to the recipe's own canonical page on this instance.
  // MCP_PUBLIC_URL is the app's base-URL source of truth (also the OAuth /
  // recipe-token issuer), and is overridden per-PR on staging.
  const url = args.url ?? `${env.MCP_PUBLIC_URL}/recipes/${id}`;
  try {
    const row = await createRecipeRow({
      id,
      url,
      source: args.source,
      status: args.status,
      schema,
    });
    return cookingNotes !== undefined
      ? { ...row, warnings: [COOKING_NOTES_IGNORED_WARNING] }
      : row;
  } catch (err) {
    throw toToolError(err, "create_failed");
  }
}

export async function updateRecipe(
  args: RecipeUpdateInput,
): Promise<RecipeRowWithWarnings> {
  const { cookingNotes, ...schema } = args.schema ?? {};
  try {
    const row = await updateRecipeRow(args.id, {
      url: args.url,
      source: args.source,
      status: args.status,
      schema: args.schema !== undefined ? schema : undefined,
    });
    return cookingNotes !== undefined
      ? { ...row, warnings: [COOKING_NOTES_IGNORED_WARNING] }
      : row;
  } catch (err) {
    throw toToolError(err, "update_failed");
  }
}

// The only agent-writable path for cookingNotes. Sets it to empty string;
// used when the user explicitly asks to clear notes (e.g. after applying them).
export async function clearCookingNotes(args: RecipeIdInput): Promise<RecipeRow> {
  try {
    return await updateRecipeRow(args.id, { schema: { cookingNotes: "" } });
  } catch (err) {
    throw toToolError(err, "update_failed");
  }
}

export async function deleteRecipe(
  args: RecipeIdInput,
): Promise<{ id: string; status: "archived" }> {
  try {
    await archiveRecipe(args.id);
    return { id: args.id, status: "archived" };
  } catch (err) {
    throw toToolError(err, "delete_failed");
  }
}

export async function uploadRecipeImage(
  args: RecipeImageUploadInput,
): Promise<RecipeRow> {
  let bytes: Buffer;
  let contentType: string;

  try {
    const fetched = await fetchImageBytes(args.imageUrl);
    bytes = fetched.bytes;
    contentType = fetched.contentType;
  } catch (err) {
    if (err instanceof StorageUploadError) {
      throw new ToolError(err.kind, err.detail);
    }
    throw new ToolError(
      "fetch_failed",
      err instanceof Error ? err.message : "Failed to fetch image",
    );
  }

  let imageUrl: string;
  try {
    imageUrl = await uploadImageToStorage(args.id, bytes, contentType);
  } catch (err) {
    if (err instanceof StorageUploadError) {
      throw new ToolError(err.kind, err.detail);
    }
    throw new ToolError("upload_failed", err instanceof Error ? err.message : "Upload failed");
  }
  try {
    return await updateRecipeRow(args.id, { schema: { image: imageUrl } });
  } catch (err) {
    throw toToolError(err, "update_failed");
  }
}

function toIngredientToolError(err: unknown, fallbackCode: string): ToolError {
  if (err instanceof IngredientRepoError) {
    if (err.kind === "not_found") return new ToolError("not_found", err.detail);
    if (err.kind === "conflict") {
      // Two unique indexes raise this: lower(name), and fdc_id
      // (db/migrations/0011). Naming only the first sends an agent into a
      // rename loop against what is really an already-imported USDA record —
      // so state both causes and the move that resolves either.
      return new ToolError(
        "conflict",
        `${err.detail} — a row already exists with that name (unique case-insensitively) or that fdc_id. Do NOT retry with a varied name: search_ingredients to find the existing row, then update_ingredient it.`,
      );
    }
    return new ToolError(fallbackCode, err.detail);
  }
  if (err instanceof Error) return new ToolError(fallbackCode, err.message);
  return new ToolError(fallbackCode, "Unknown error");
}

function toToolError(err: unknown, fallbackCode: string): ToolError {
  if (err instanceof RecipeRepoError) {
    // `not_found` from the repo always maps cleanly; insert/update_failed
    // surface with the caller's fallback code so the MCP response makes sense.
    const code = err.kind === "not_found" ? "not_found" : fallbackCode;
    return new ToolError(code, err.detail);
  }
  if (err instanceof Error) return new ToolError(fallbackCode, err.message);
  return new ToolError(fallbackCode, "Unknown error");
}

export class ToolError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ToolError";
  }
}
