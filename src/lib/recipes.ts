import { getSupabaseClient } from "./supabase";
import { getFeatures } from "./features";
import { normalizeRecipeInstructions } from "./format";
import type { RecipeRow, RecipesResult, SchemaRecipe } from "@/types/recipe";

export type RecipeStatus = "published" | "archived" | "draft";

// Discriminated error type for the write helpers. Lets callers (routes, MCP
// tools) branch on `kind` instead of inspecting error messages.
export class RecipeRepoError extends Error {
  constructor(
    public kind: "not_found" | "insert_failed" | "update_failed",
    public detail: string,
  ) {
    super(`${kind}: ${detail}`);
    this.name = "RecipeRepoError";
  }
}

const RECIPE_COLUMNS = "id, url, source, status, metadata";

export interface CreateRecipeInput {
  // Optional explicit primary key. When provided (e.g. so the caller can build
  // a self-referential URL before the insert), it's used verbatim; otherwise
  // the column's gen_random_uuid() default applies.
  id?: string;
  url: string;
  source: string;
  status?: RecipeStatus;
  schema: SchemaRecipe;
}

export interface UpdateRecipePatch {
  url?: string;
  source?: string;
  status?: RecipeStatus;
  schema?: Partial<SchemaRecipe>;
}

const PAGE_SIZE = 24;

export type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";

export async function getStatusCounts(opts?: {
  query?: string;
  source?: string;
  isLoggedIn?: boolean;
}): Promise<Record<string, number>> {
  const supabase = getSupabaseClient();

  let queryBuilder = supabase
    .from("recipes")
    .select("status")
    .not("metadata->schema->>name", "ilike", "%(NEEDS RE-SCRAPE)%")
    .not("metadata->schema->>name", "ilike", "%null%");

  if (opts?.source) {
    queryBuilder = queryBuilder.eq("source", opts.source);
  }

  if (opts?.query) {
    const q = opts.query.slice(0, 200);
    queryBuilder = queryBuilder.ilike("metadata->schema->>name", `%${q}%`);
  }

  const { data, error } = await queryBuilder;

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data) {
    const key = row.status ?? "__null";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export async function getRecipes(opts?: {
  query?: string;
  page?: number;
  limit?: number;
  sort?: SortOption;
  source?: string;
  status?: string;
  isLoggedIn?: boolean;
}): Promise<RecipesResult> {
  const supabase = getSupabaseClient();
  const features = getFeatures(opts?.isLoggedIn ?? false);
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? PAGE_SIZE;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const sortMap: Record<SortOption, { column: string; ascending: boolean }> = {
    newest:    { column: "created_at", ascending: false },
    oldest:    { column: "created_at", ascending: true },
    "name-asc":  { column: "metadata->schema->>name", ascending: true },
    "name-desc": { column: "metadata->schema->>name", ascending: false },
  };
  const { column, ascending } = sortMap[opts?.sort ?? "newest"];

  let queryBuilder = supabase
    .from("recipes")
    .select("id, url, source, status, metadata", { count: "exact" })
    .not("metadata->schema->>name", "ilike", "%(NEEDS RE-SCRAPE)%")
    .not("metadata->schema->>name", "ilike", "%null%")
    .range(from, to)
    .order(column, { ascending });

  if (features.filterByStatus) {
    queryBuilder = queryBuilder.eq("status", "published");
  } else if (opts?.status) {
    queryBuilder = queryBuilder.eq("status", opts.status);
  } else {
    queryBuilder = queryBuilder.or("status.neq.archived,status.is.null");
  }

  if (opts?.source) {
    queryBuilder = queryBuilder.eq("source", opts.source);
  }

  if (opts?.query) {
    const q = opts.query.slice(0, 200);
    queryBuilder = queryBuilder.ilike("metadata->schema->>name", `%${q}%`);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error("Supabase error fetching recipes:", error);
    return { data: [], count: 0 };
  }

  return {
    data: (data as RecipeRow[]) ?? [],
    count: count ?? 0,
  };
}

export async function getRecipeById(id: string): Promise<RecipeRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("recipes")
    .select(RECIPE_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const row = data as RecipeRow;
  const raw = row.metadata?.schema?.recipeInstructions;
  if (raw !== undefined && !Array.isArray(raw)) {
    row.metadata.schema.recipeInstructions = normalizeRecipeInstructions(raw as unknown);
  }
  return row;
}

// Insert a new recipe row. Defaults status to "draft" if not provided.
// Throws RecipeRepoError("insert_failed") on Supabase failure.
//
// The `recipes` table has top-level NOT NULL `name` and `content` columns that
// mirror `schema.name` and `schema.description` (the latter is what powers
// vector search). The MCP path is the canonical creator now, so we derive both
// from the SchemaRecipe instead of leaving them for an upstream pipeline.
// `content` falls back to `schema.name` when no description is provided —
// satisfies the NOT NULL constraint and keeps search functioning, even if not
// optimally, for stub rows.
export async function createRecipeRow(input: CreateRecipeInput): Promise<RecipeRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      ...(input.id !== undefined ? { id: input.id } : {}),
      name: input.schema.name,
      content: input.schema.description ?? input.schema.name,
      url: input.url,
      source: input.source,
      status: input.status ?? "draft",
      metadata: { schema: input.schema },
    })
    .select(RECIPE_COLUMNS)
    .single();

  if (error || !data) {
    throw new RecipeRepoError("insert_failed", error?.message ?? "Insert returned no row");
  }
  return data as RecipeRow;
}

// Patch fields on an existing recipe. The `schema` field is merged into the
// existing metadata.schema (not replaced). Throws RecipeRepoError("not_found")
// if the row doesn't exist, or ("update_failed") on Supabase failure.
//
// When `patch` has no defined fields, the existing row is returned unchanged
// without writing to Supabase.
export async function updateRecipeRow(
  id: string,
  patch: UpdateRecipePatch,
): Promise<RecipeRow> {
  const supabase = getSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("recipes")
    .select(RECIPE_COLUMNS)
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    throw new RecipeRepoError("not_found", `Recipe ${id} not found`);
  }

  const current = existing as RecipeRow;
  const writePatch: Partial<{
    name: string;
    content: string;
    url: string;
    source: string;
    status: RecipeStatus;
    metadata: { schema: SchemaRecipe };
  }> = {};

  if (patch.url !== undefined) writePatch.url = patch.url;
  if (patch.source !== undefined) writePatch.source = patch.source;
  if (patch.status !== undefined) writePatch.status = patch.status;
  if (patch.schema !== undefined) {
    writePatch.metadata = {
      ...current.metadata,
      schema: { ...current.metadata.schema, ...patch.schema } as SchemaRecipe,
    };
    // Keep the top-level name/content columns in sync when the schema patch
    // touches them — otherwise list/search views keep showing the old values
    // until the next full re-scrape.
    if (patch.schema.name !== undefined) writePatch.name = patch.schema.name;
    if (patch.schema.description !== undefined) writePatch.content = patch.schema.description;
  }

  if (Object.keys(writePatch).length === 0) return current;

  const { data, error } = await supabase
    .from("recipes")
    .update(writePatch)
    .eq("id", id)
    .select(RECIPE_COLUMNS)
    .single();

  if (error || !data) {
    throw new RecipeRepoError("update_failed", error?.message ?? "Update returned no row");
  }
  return data as RecipeRow;
}

// Soft-delete by setting status="archived". Verifies the row exists first so
// callers can return 404 vs 500. Throws RecipeRepoError("not_found") or
// ("update_failed") accordingly.
export async function archiveRecipe(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    throw new RecipeRepoError("not_found", `Recipe ${id} not found`);
  }

  const { error } = await supabase
    .from("recipes")
    .update({ status: "archived" })
    .eq("id", id);

  if (error) {
    throw new RecipeRepoError("update_failed", error.message);
  }
}
