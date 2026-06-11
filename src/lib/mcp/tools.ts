import {
  archiveRecipe,
  createRecipeRow,
  getRecipeById,
  getRecipes,
  RecipeRepoError,
  updateRecipeRow,
} from "@/lib/recipes";
import type { RecipeRow } from "@/types/recipe";
import type {
  CreateRecipeArgs,
  DeleteRecipeArgs,
  GetRecipeArgs,
  SearchRecipesArgs,
  UpdateRecipeArgs,
} from "./schemas";

// All five tools are thin wrappers over `@/lib/recipes` helpers. They handle
// argument typing + translate RecipeRepoError into ToolError so the MCP
// dispatcher can render a uniform isError content envelope. Supabase calls
// live in the recipes module — see CR feedback on PR #13.

export async function searchRecipes(args: SearchRecipesArgs) {
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

export async function getRecipe(args: GetRecipeArgs): Promise<RecipeRow> {
  const row = await getRecipeById(args.id);
  if (!row) throw new ToolError("not_found", `Recipe ${args.id} not found`);
  return row;
}

export async function createRecipe(args: CreateRecipeArgs): Promise<RecipeRow> {
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

export async function updateRecipe(args: UpdateRecipeArgs): Promise<RecipeRow> {
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
  args: DeleteRecipeArgs,
): Promise<{ id: string; status: "archived" }> {
  try {
    await archiveRecipe(args.id);
    return { id: args.id, status: "archived" };
  } catch (err) {
    throw toToolError(err, "delete_failed");
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
