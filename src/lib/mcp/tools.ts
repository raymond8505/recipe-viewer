import {
  archiveRecipe,
  createRecipeRow,
  getRecipeById,
  getRecipes,
  RecipeRepoError,
  updateRecipeRow,
} from "@/lib/recipes";
import { env } from "@/env";
import { RECIPE_TOKEN_TTL_SECONDS, signRecipeToken } from "./recipeToken";
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

export async function searchRecipes(args: RecipeSearchInput) {
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
  return { data, count };
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

export async function createRecipe(args: RecipeCreateInput): Promise<RecipeRow> {
  try {
    return await createRecipeRow({
      url: args.url,
      source: args.source,
      status: args.status,
      schema: args.schema,
    });
  } catch (err) {
    throw toToolError(err, "create_failed");
  }
}

export async function updateRecipe(args: RecipeUpdateInput): Promise<RecipeRow> {
  try {
    return await updateRecipeRow(args.id, {
      url: args.url,
      source: args.source,
      status: args.status,
      schema: args.schema,
    });
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

  if (args.imageUrl) {
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
  } else {
    bytes = Buffer.from(args.imageBase64!, "base64");
    if (bytes.length > env.MAX_IMAGE_BYTES) {
      throw new ToolError(
        "too_large",
        `Decoded image is ${bytes.length} bytes (max ${env.MAX_IMAGE_BYTES})`,
      );
    }
    contentType = args.contentType!;
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
