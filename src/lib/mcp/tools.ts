import { getSupabaseClient } from "@/lib/supabase";
import { getRecipes, getRecipeById } from "@/lib/recipes";
import type { RecipeRow, SchemaRecipe } from "@/types/recipe";
import type {
  CreateRecipeArgs,
  DeleteRecipeArgs,
  GetRecipeArgs,
  SearchRecipesArgs,
  UpdateRecipeArgs,
} from "./schemas";

// All five tools return raw values; the server wraps them in MCP content envelopes.

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
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      url: args.url,
      source: args.source,
      status: args.status ?? "draft",
      metadata: { schema: args.schema },
    })
    .select("id, url, source, status, metadata")
    .single();

  if (error || !data) {
    throw new ToolError("create_failed", error?.message ?? "Insert returned no row");
  }
  return data as RecipeRow;
}

export async function updateRecipe(args: UpdateRecipeArgs): Promise<RecipeRow> {
  const supabase = getSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("recipes")
    .select("id, url, source, status, metadata")
    .eq("id", args.id)
    .single();

  if (fetchError || !existing) {
    throw new ToolError("not_found", `Recipe ${args.id} not found`);
  }

  const current = existing as RecipeRow;
  const patch: Partial<{
    url: string;
    source: string;
    status: string;
    metadata: { schema: SchemaRecipe };
  }> = {};

  if (args.url !== undefined) patch.url = args.url;
  if (args.source !== undefined) patch.source = args.source;
  if (args.status !== undefined) patch.status = args.status;
  if (args.schema !== undefined) {
    patch.metadata = {
      ...current.metadata,
      schema: { ...current.metadata.schema, ...args.schema } as SchemaRecipe,
    };
  }

  if (Object.keys(patch).length === 0) return current;

  const { data, error } = await supabase
    .from("recipes")
    .update(patch)
    .eq("id", args.id)
    .select("id, url, source, status, metadata")
    .single();

  if (error || !data) {
    throw new ToolError("update_failed", error?.message ?? "Update returned no row");
  }
  return data as RecipeRow;
}

export async function deleteRecipe(args: DeleteRecipeArgs): Promise<{ id: string; status: "archived" }> {
  const supabase = getSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", args.id)
    .single();

  if (fetchError || !existing) {
    throw new ToolError("not_found", `Recipe ${args.id} not found`);
  }

  const { error } = await supabase
    .from("recipes")
    .update({ status: "archived" })
    .eq("id", args.id);

  if (error) throw new ToolError("delete_failed", error.message);
  return { id: args.id, status: "archived" };
}

export class ToolError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ToolError";
  }
}
