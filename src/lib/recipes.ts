import { getSupabaseClient, selectColumns, toVectorLiteral } from "./supabase";
import { getFeatures } from "./features";
import {
  normalizeRecipeInstructions,
  parseDurationToSeconds,
  recipeToMarkdown,
  secondsToIso,
} from "./format";
import { generateEmbedding } from "./embedding";
import {
  deleteRecipeIngredientRows,
  getCatalogForRows,
  getRecipeIngredients,
  getRecipeIngredientsByRecipeIds,
  insertRecipeIngredientRows,
  updateRecipeIngredientRows,
} from "./ingredients";
import { scheduleNormalization } from "./normalization/trigger";
import { reconcileRecipeIngredients } from "./recipeIngredientReconcile";
import { hydrateIngredientGroups } from "./recipeIngredients";
import {
  ARCHIVED_RECIPE_STATUS,
  DEFAULT_RECIPE_STATUS,
  PUBLISHED_RECIPE_STATUS,
  RECIPE_STATUSES,
  type RecipeStatus,
} from "./schemas/recipe";
import type { IngredientRow, RecipeIngredientRow } from "@/types/ingredient";
import type {
  RecipeIngredientGroupInput,
  RecipeRow,
  RecipeRowColumns,
  RecipesResult,
  SchemaRecipe,
  SortOption,
  StoredIngredientGroup,
} from "@/types/recipe";

// Re-exported for the server-side callers that read these off the repo module.
// Both are DECLARED somewhere a client bundle can safely reach — RecipeStatus
// beside its zod enum, SortOption in @/types/recipe — because this module pulls
// @/env in through Supabase and the embedding client. A client module must
// import them from those homes, never from here.
export type { RecipeStatus } from "./schemas/recipe";
export type { SortOption } from "@/types/recipe";

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
// are not on RecipeRowColumns — selectColumns rejects them here at compile
// time. Checked against RecipeRowColumns rather than RecipeRow because the
// latter's `ingredients` is hydrated from a second table, not selected.
const RECIPE_COLUMNS = selectColumns<RecipeRowColumns>()([
  "id",
  "url",
  "source",
  "status",
  "prep_time",
  "cook_time",
  "total_time",
  "ingredients",
  "metadata",
]);

// ---------------------------------------------------------------------------
// The blob's two dead regions, and the seams that keep them dead.
//
// 0019 made `prep_time`/`cook_time`/`total_time` the source of truth for a
// recipe's times, and 0016 made `recipes.ingredients` + `recipe_ingredients`
// the source of truth for its ingredient list. The copies still sitting in
// `metadata.schema` — three time keys, and a `recipeIngredient` array frozen
// at backfill time — are artifacts of the blob-only shape. This module is the ONLY
// code that knows that: `hydrate` runs at every read exit below and the strip
// functions at every write, so everything above (JSON-LD, the markdown, the
// MCP tools, RecipeCard, RecipeDetail, CookingMode) never observes a stale
// value or the dead key.
//
// The corollary is the thing to protect: a reader that queries `recipes`
// without coming through here gets a pre-0019 answer and no ingredients,
// silently.
// ---------------------------------------------------------------------------

const TIME_FIELDS = [
  ["prepTime", "prep_time"],
  ["cookTime", "cook_time"],
  ["totalTime", "total_time"],
] as const;

/**
 * Overwrite a row's schema time keys from its columns, in place. A null column
 * DELETES the key rather than writing null, so a hydrated schema is
 * indistinguishable from one that never had the time — which is what every
 * downstream `if (schema.prepTime)` already expects.
 */
function hydrateTimes(row: RecipeRowColumns): RecipeRowColumns {
  const schema = row.metadata?.schema;
  if (!schema) return row;
  for (const [key, column] of TIME_FIELDS) {
    const iso = secondsToIso(row[column]);
    if (iso === undefined) delete schema[key];
    else schema[key] = iso;
  }
  return row;
}

/** The blob-safe copy of a schema: times removed, so a write can never put a
 *  fresh value back into the artifact. */
function stripTimes(schema: SchemaRecipe): SchemaRecipe {
  const next = { ...schema };
  for (const [key] of TIME_FIELDS) delete next[key];
  return next;
}

// `recipeIngredient` is not on SchemaRecipe any more, but it is still in every
// pre-0016 row's blob, and the zod schema is `.passthrough()` — an agent or a
// stale client can still send it. Neither may reach a consumer or a write.
const DEAD_INGREDIENT_KEY = "recipeIngredient";

function deleteIngredientKey(schema: SchemaRecipe): void {
  delete (schema as unknown as Record<string, unknown>)[DEAD_INGREDIENT_KEY];
}

function stripIngredientKey<T extends object>(schema: T): T {
  const next = { ...schema };
  delete (next as Record<string, unknown>)[DEAD_INGREDIENT_KEY];
  return next;
}

/**
 * The one read exit. Times come from their columns; `ingredients` comes from
 * the column's id groups joined to the `recipe_ingredients` rows the caller
 * fetched; the blob's dead `recipeIngredient` key is deleted so it can't leak
 * through a spread (the MCP server JSON-stringifies whole rows). With a
 * `catalog` map every line carries its catalog ingredient (`null` when
 * unmatched); without one the key is left off — list pages skip that round
 * trip, and nutrition math treats "not loaded" as "no data".
 */
function hydrate(
  row: RecipeRowColumns,
  rows: readonly RecipeIngredientRow[],
  catalog?: ReadonlyMap<string, IngredientRow>,
): RecipeRow {
  if (row.metadata?.schema) deleteIngredientKey(row.metadata.schema);
  return {
    ...hydrateTimes(row),
    ingredients: hydrateIngredientGroups(row.ingredients, rows, catalog),
  };
}

export interface CreateRecipeInput {
  // Optional explicit primary key. When provided (e.g. so the caller can build
  // a self-referential URL before the insert), it's used verbatim; otherwise
  // the column's gen_random_uuid() default applies.
  id?: string;
  url: string;
  source: string;
  status?: RecipeStatus;
  schema: SchemaRecipe;
  ingredients?: RecipeIngredientGroupInput[];
}

export interface UpdateRecipePatch {
  url?: string;
  source?: string;
  status?: RecipeStatus;
  /** Merged into the stored schema — only the keys given change. */
  schema?: Partial<SchemaRecipe>;
  /** Replaces the whole ingredient list; a line keeps its row by naming its id. */
  ingredients?: RecipeIngredientGroupInput[];
}

const PAGE_SIZE = 24;

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
    .select(RECIPE_COLUMNS, { count: "exact" })
    .not("metadata->schema->>name", "ilike", "%(NEEDS RE-SCRAPE)%")
    .not("metadata->schema->>name", "ilike", "%null%")
    .range(from, to)
    .order(column, { ascending });

  if (features.filterByStatus) {
    queryBuilder = queryBuilder.eq("status", PUBLISHED_RECIPE_STATUS);
  } else if (opts?.status) {
    queryBuilder = queryBuilder.eq("status", opts.status);
  } else {
    queryBuilder = queryBuilder.or(
      `status.neq.${ARCHIVED_RECIPE_STATUS},status.is.null`,
    );
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

  const rows = (data as RecipeRowColumns[]) ?? [];
  // One round trip for the page rather than one per recipe, and not optional:
  // /api/recipes feeds MealSearch, whose rows go straight into a
  // ScalableRecipe when a recipe joins a meal, and that needs the line text.
  // The catalog is skipped — nothing on a list page computes nutrition.
  const rowsByRecipe = await getRecipeIngredientsByRecipeIds(rows.map((r) => r.id));

  return {
    data: rows.map((row) => hydrate(row, rowsByRecipe.get(row.id) ?? [])),
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

  const ingredientRows = await getRecipeIngredients(id);
  const row = hydrate(
    data as RecipeRowColumns,
    ingredientRows,
    await getCatalogForRows(ingredientRows),
  );
  const raw = row.metadata?.schema?.recipeInstructions;
  if (raw !== undefined && !Array.isArray(raw)) {
    row.metadata.schema.recipeInstructions = normalizeRecipeInstructions(raw as unknown);
  }
  return row;
}

/**
 * Insert a new recipe: the row, then its `recipe_ingredients` rows. Defaults
 * status to DEFAULT_RECIPE_STATUS. Throws RecipeRepoError("insert_failed") on
 * Supabase failure. Derives the `content` and `embedding` columns — see the
 * "Derived content + embedding columns" note in
 * .claude/docs/supabase-data-layer.md.
 *
 * The recipe row lands FIRST because the ingredient rows reference it (FK),
 * with the group array already naming ids the reconcile minted. A failure
 * between the two leaves ids that resolve to nothing — the recipe renders
 * short those lines rather than not at all, and the next save repairs it.
 */
export async function createRecipeRow(input: CreateRecipeInput): Promise<RecipeRow> {
  const supabase = getSupabaseClient();
  const schema = stripIngredientKey(input.schema);
  // Every line becomes a row, and the row's id is its identity from the moment
  // it exists. The recipe id is minted here when the caller didn't, because
  // the rows have to carry it and the column default would decide it too late.
  const recipeId = input.id ?? crypto.randomUUID();
  const reconcile = reconcileRecipeIngredients(recipeId, input.ingredients ?? [], []);
  const ingredients = hydrateIngredientGroups(reconcile.stored, reconcile.rows);

  // Markdown (and therefore the embedding) is built from the times-bearing
  // schema and the lines — the columns are where those LAND, not a reason for
  // the searchable text to stop mentioning them.
  const content = recipeToMarkdown(schema, ingredients);
  const embedding = await generateEmbedding(content);
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      id: recipeId,
      name: schema.name,
      content,
      ...(embedding ? { embedding: toVectorLiteral(embedding) } : {}),
      url: input.url,
      source: input.source,
      status: input.status ?? DEFAULT_RECIPE_STATUS,
      prep_time: parseDurationToSeconds(schema.prepTime),
      cook_time: parseDurationToSeconds(schema.cookTime),
      total_time: parseDurationToSeconds(schema.totalTime),
      ingredients: reconcile.stored,
      metadata: { schema: stripTimes(schema) },
    })
    .select(RECIPE_COLUMNS)
    .single();

  if (error || !data) {
    throw new RecipeRepoError("insert_failed", error?.message ?? "Insert returned no row");
  }

  await insertRecipeIngredientRows(reconcile.inserts);

  // Post-response ingredient normalization (see src/lib/normalization/).
  // scheduleNormalization never throws — a normalization problem must not
  // fail the insert that just succeeded.
  if (reconcile.inserts.length > 0) {
    scheduleNormalization(recipeId);
  }
  return hydrate(data as RecipeRowColumns, reconcile.rows);
}

/**
 * Patch fields on an existing recipe. `schema` is merged into the stored
 * schema (not replaced); `ingredients` replaces the whole list, and a line
 * keeps its row — with the catalog association curated on it — by naming the
 * row's id (see reconcileRecipeIngredients). Throws RecipeRepoError
 * ("not_found") if the row doesn't exist, or ("update_failed") on Supabase
 * failure.
 *
 * When `patch` has no defined fields, the existing row is returned unchanged
 * without writing to Supabase.
 *
 * Ingredient rows are written across four statements, in this order, because
 * PostgREST gives each request exactly one transaction and there is no way to
 * make them atomic. The order is chosen so every partial failure is invisible
 * to readers rather than lossy:
 *
 *   1. insert new rows      — unreferenced until step 3 names them
 *   2. update reworded rows — same rows, new text
 *   3. update the recipe    — THE COMMIT POINT: the group array is the index
 *   4. delete dropped rows  — already unreferenced by step 3
 *
 * Fail before 3 and the extra rows are unreachable; fail after 3 and the
 * dropped rows are orphans. Both are invisible and prunable, and neither loses
 * anything a reader could see. A SQL function taking the whole reconcile is
 * the upgrade path if this ever needs to be atomic.
 */
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

  // Hydrated before the merge below, so `current.metadata.schema` carries the
  // times the COLUMNS hold. That is what makes the three-way patch semantics
  // fall out of the plain schema spread: an absent key inherits the column's
  // current value, an explicit null clears it, an ISO string sets it.
  const existingRow = existing as RecipeRowColumns;
  const existingStored = existingRow.ingredients;
  const existingRows = await getRecipeIngredients(id);
  const current = hydrate(existingRow, existingRows);
  const writePatch: Partial<{
    name: string;
    content: string;
    embedding: string;
    url: string;
    source: string;
    status: RecipeStatus;
    prep_time: number | null;
    cook_time: number | null;
    total_time: number | null;
    ingredients: StoredIngredientGroup[];
    metadata: { schema: SchemaRecipe };
  }> = {};

  if (patch.url !== undefined) writePatch.url = patch.url;
  if (patch.source !== undefined) writePatch.source = patch.source;
  if (patch.status !== undefined) writePatch.status = patch.status;

  // Normalization exists to GUESS an association for a line that has none, so
  // it only has work when the SET of lines changes — one was added or removed.
  // Rewording, reordering or regrouping leaves every row (and therefore every
  // curated association) exactly where it was, so it must not re-run:
  // re-guessing there would overwrite the user's own corrections with the
  // matcher's opinion, which is precisely backwards. The reconcile draws that
  // distinction; the deterministic re-parse it produces is not a matcher run.
  const reconcile =
    patch.ingredients !== undefined
      ? reconcileRecipeIngredients(id, patch.ingredients, existingRows)
      : null;
  const finalRows = reconcile ? reconcile.rows : existingRows;
  if (reconcile) writePatch.ingredients = reconcile.stored;

  if (patch.schema !== undefined || reconcile) {
    const mergedSchema = stripIngredientKey({
      ...current.metadata.schema,
      ...(patch.schema ?? {}),
    }) as SchemaRecipe;
    // The blob is written WITHOUT times; the columns carry them. `mergedSchema`
    // itself keeps them, because recipeToMarkdown below still has to see them.
    writePatch.metadata = { ...current.metadata, schema: stripTimes(mergedSchema) };
    writePatch.prep_time = parseDurationToSeconds(mergedSchema.prepTime);
    writePatch.cook_time = parseDurationToSeconds(mergedSchema.cookTime);
    writePatch.total_time = parseDurationToSeconds(mergedSchema.totalTime);
    // Keep the top-level name in sync when the schema patch touches it —
    // otherwise list/search views keep showing the old value.
    if (patch.schema?.name !== undefined) writePatch.name = patch.schema.name;
    // `content` (markdown) and `embedding` are always recomputed from the
    // merged schema on any schema or ingredient change. Embedding is
    // best-effort: on failure we leave the existing embedding untouched rather
    // than nulling it.
    const content = recipeToMarkdown(
      mergedSchema,
      hydrateIngredientGroups(reconcile?.stored ?? existingStored, finalRows),
    );
    writePatch.content = content;
    const embedding = await generateEmbedding(content);
    if (embedding) writePatch.embedding = toVectorLiteral(embedding);
  }

  if (Object.keys(writePatch).length === 0) return current;

  if (reconcile) {
    await insertRecipeIngredientRows(reconcile.inserts);
    await updateRecipeIngredientRows(id, reconcile.updates);
  }

  const { data, error } = await supabase
    .from("recipes")
    .update(writePatch)
    .eq("id", id)
    .select(RECIPE_COLUMNS)
    .single();

  if (error || !data) {
    throw new RecipeRepoError("update_failed", error?.message ?? "Update returned no row");
  }

  if (reconcile) {
    // Step 4. Best-effort like the alias upkeep: the recipe save has already
    // landed and these rows are unreferenced either way, so failing to prune
    // them must not fail the save.
    await deleteRecipeIngredientRows(id, reconcile.deleteIds).catch((err) => {
      console.error(`Failed to prune ingredient rows for ${id}:`, err);
    });
    if (reconcile.lineSetChanged) scheduleNormalization(id);
  }

  return hydrate(data as RecipeRowColumns, finalRows, await getCatalogForRows(finalRows));
}

// Soft-delete by setting status to ARCHIVED_RECIPE_STATUS. Verifies the row
// exists first so
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
    .update({ status: ARCHIVED_RECIPE_STATUS })
    .eq("id", id);

  if (error) {
    throw new RecipeRepoError("update_failed", error.message);
  }
}
