import {
  archiveRecipe,
  createRecipeRow,
  getRecipeById,
  getRecipes,
  RecipeRepoError,
  updateRecipeRow,
} from "@/lib/recipes";
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

// All five tools are thin wrappers over `@/lib/recipes` helpers. They handle
// argument typing + translate RecipeRepoError into ToolError so the MCP
// dispatcher can render a uniform isError content envelope. Supabase calls
// live in the recipes module — see CR feedback on PR #13.

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

export async function getRecipe(args: RecipeIdInput): Promise<RecipeRow> {
  const row = await getRecipeById(args.id);
  if (!row) throw new ToolError("not_found", `Recipe ${args.id} not found`);
  return row;
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
