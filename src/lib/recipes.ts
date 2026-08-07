import { getSupabaseClient, selectColumns, toVectorLiteral } from "./supabase";
import { getFeatures } from "./features";
import { normalizeRecipeInstructions, schemaToMarkdown } from "./format";
import { generateEmbedding } from "./embedding";
import { lineIdSetKey, withLineIds } from "./ingredientLines";
import { ingredientFingerprint } from "./normalization/fingerprint";
import { syncRecipeIngredientText } from "./normalization/syncLines";
import { scheduleNormalization } from "./normalization/trigger";
import type {
  RecipeIngredient,
  RecipeRow,
  RecipesResult,
  SchemaRecipe,
} from "@/types/recipe";

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

// `content` and `embedding` are write-only (derived on create/update), so they
// are not on RecipeRow — selectColumns rejects them here at compile time.
const RECIPE_COLUMNS = selectColumns<RecipeRow>()([
  "id",
  "url",
  "source",
  "status",
  "metadata",
]);

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
// Throws RecipeRepoError("insert_failed") on Supabase failure. Derives the
// `content` and `embedding` columns from the schema — see the "Derived content
// + embedding columns" note in .claude/CLAUDE.md.
export async function createRecipeRow(input: CreateRecipeInput): Promise<RecipeRow> {
  const supabase = getSupabaseClient();
  // Every persisted ingredient line carries a stable id from the moment it
  // exists — that id, not the text or the index, is what recipe_ingredients
  // keys on. Minting here (rather than at first normalization) means no row
  // is ever written without one.
  const schema =
    input.schema.recipeIngredient !== undefined
      ? { ...input.schema, recipeIngredient: withLineIds(input.schema.recipeIngredient) }
      : input.schema;
  const content = schemaToMarkdown(schema);
  const embedding = await generateEmbedding(content);
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      ...(input.id !== undefined ? { id: input.id } : {}),
      name: schema.name,
      content,
      ...(embedding ? { embedding: toVectorLiteral(embedding) } : {}),
      url: input.url,
      source: input.source,
      status: input.status ?? "draft",
      metadata: { schema },
    })
    .select(RECIPE_COLUMNS)
    .single();

  if (error || !data) {
    throw new RecipeRepoError("insert_failed", error?.message ?? "Insert returned no row");
  }
  const row = data as RecipeRow;
  // Post-response ingredient normalization (see src/lib/normalization/).
  // scheduleNormalization never throws — a normalization problem must not
  // fail the insert that just succeeded.
  if ((schema.recipeIngredient ?? []).length > 0) {
    scheduleNormalization(row.id);
  }
  return row;
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
    embedding: string;
    url: string;
    source: string;
    status: RecipeStatus;
    metadata: { schema: SchemaRecipe };
  }> = {};

  if (patch.url !== undefined) writePatch.url = patch.url;
  if (patch.source !== undefined) writePatch.source = patch.source;
  if (patch.status !== undefined) writePatch.status = patch.status;
  // Normalization exists to GUESS an association for a line that has none, so
  // it only has work when the set of line ids changes — a line was added or
  // removed. Rewording or reordering leaves every id (and therefore every
  // derived row and every curated association) exactly where it was, so it
  // must not re-run: re-guessing there would overwrite the user's own
  // corrections with the matcher's opinion, which is precisely backwards.
  //
  // Line text still has to reach the rows, but that's a deterministic re-parse
  // (syncRecipeIngredientText below), not a matcher run.
  let shouldNormalize = false;
  let syncLines: Array<string | RecipeIngredient> | null = null;
  if (patch.schema !== undefined) {
    // Ids on the incoming lines win; id-less lines inherit from the current
    // array by text where possible. Skipping this would re-key every row on
    // any save that round-trips lines as bare strings.
    const patchSchema =
      patch.schema.recipeIngredient !== undefined
        ? {
            ...patch.schema,
            recipeIngredient: withLineIds(
              patch.schema.recipeIngredient,
              current.metadata.schema.recipeIngredient ?? [],
            ),
          }
        : patch.schema;
    const mergedSchema = {
      ...current.metadata.schema,
      ...patchSchema,
    } as SchemaRecipe;
    if (patchSchema.recipeIngredient !== undefined) {
      shouldNormalize =
        lineIdSetKey(current.metadata.schema.recipeIngredient ?? []) !==
        lineIdSetKey(mergedSchema.recipeIngredient ?? []);
      // Text moved but the line set didn't: re-parse the surviving rows in
      // place so quantities and totals track the edit, association untouched.
      if (
        !shouldNormalize &&
        ingredientFingerprint(current.metadata.schema) !==
          ingredientFingerprint(mergedSchema)
      ) {
        syncLines = mergedSchema.recipeIngredient ?? [];
      }
    }
    writePatch.metadata = { ...current.metadata, schema: mergedSchema };
    // Keep the top-level name in sync when the schema patch touches it —
    // otherwise list/search views keep showing the old value.
    if (patch.schema.name !== undefined) writePatch.name = patch.schema.name;
    // `content` (markdown) and `embedding` are always recomputed from the
    // merged schema on any schema change. Embedding is best-effort: on failure
    // we leave the existing embedding untouched rather than nulling it.
    const content = schemaToMarkdown(mergedSchema);
    writePatch.content = content;
    const embedding = await generateEmbedding(content);
    if (embedding) writePatch.embedding = toVectorLiteral(embedding);
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
  if (shouldNormalize) {
    scheduleNormalization(id);
  } else if (syncLines) {
    // Deterministic and local: no model, no catalog lookup, no association
    // change. Best-effort like the alias upkeep — a re-parse failing must not
    // fail the recipe save that already succeeded.
    await syncRecipeIngredientText(id, syncLines).catch((err) => {
      console.error(`Failed to re-sync ingredient lines for ${id}:`, err);
    });
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
