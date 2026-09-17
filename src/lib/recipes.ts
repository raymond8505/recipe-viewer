import {
  getSupabaseClient,
  orFilterValue,
  selectColumns,
  toVectorLiteral,
} from "./supabase";
import { getFeatures } from "./features";
import {
  parseDurationToSeconds,
  recipeToMarkdown,
  SCHEMA_ORG_ONLY_KEYS,
  secondsToIso,
  stripSchemaOrgKeys,
} from "./format";
import { parseYield } from "./units";
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
import { canonicalizeInstructions } from "./recipeInstructions";
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
  RecipeInstructionGroup,
  RecipeRow,
  RecipeRowColumns,
  RecipesResult,
  SchemaOrgRecipe,
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
// `instructions` is selected on the list query too: MealSearch feeds a
// secondary recipe straight into cooking mode, which renders its steps and
// seeds its timers.
const RECIPE_COLUMNS = selectColumns<RecipeRowColumns>()([
  "id",
  "url",
  "source",
  "status",
  "prep_time",
  "cook_time",
  "total_time",
  "servings_amount",
  "servings_unit",
  "total_weight_amount",
  "total_weight_unit",
  "ingredients",
  "instructions",
  "metadata",
]);

// ---------------------------------------------------------------------------
// The blob's three dead regions, and the seams that keep them dead.
//
// 0019 made `prep_time`/`cook_time`/`total_time` the source of truth for a
// recipe's times, 0016 made `recipes.ingredients` + `recipe_ingredients` the
// source of truth for its ingredient list, and 0021 made
// `recipes.instructions` the source of truth for its steps. The copies still
// sitting in `metadata.schema` — three time keys, a `recipeIngredient` array
// and a `recipeInstructions` array, both frozen at backfill time — are
// artifacts of the blob-only shape. This module is the ONLY code that knows
// that: `hydrate` runs at every read exit below and the strip functions at
// every write, so everything above (JSON-LD, the markdown, the MCP tools,
// RecipeCard, RecipeDetail, CookingMode) never observes a stale value or a
// dead key.
//
// The corollary is the thing to protect: a reader that queries `recipes`
// without coming through here gets a pre-0019 answer, no ingredients and the
// frozen steps, silently.
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

// None of these keys is on SchemaRecipe any more, but all are still in older
// rows' blobs, and the zod schema is `.passthrough()` — an agent or a stale
// client can still send them. None may reach a consumer or a write.
// `SCHEMA_ORG_ONLY_KEYS` (src/lib/format.ts) is the list, and `stripSchemaOrgKeys`
// the copying half, shared with the client-side inbound edge so the two can
// never disagree about what counts as stored.

/** The mutating half, for the read exit: the MCP server stringifies whole rows,
 *  so a dead key has to be gone from the object itself, not from a copy. */
function deleteDeadKeys(schema: SchemaRecipe): void {
  const blob = schema as unknown as Record<string, unknown> & {
    nutrition?: Record<string, unknown>;
  };
  for (const key of SCHEMA_ORG_ONLY_KEYS) delete blob[key];
  if (blob.nutrition) delete blob.nutrition.servingSize;
}

/**
 * The one read exit. Times come from their columns; `ingredients` comes from
 * the column's id groups joined to the `recipe_ingredients` rows the caller
 * fetched; `instructions` is the column as stored (already the app's shape);
 * the blob's dead keys are deleted so they can't leak through a spread (the
 * MCP server JSON-stringifies whole rows). With a `catalog` map every line
 * carries its catalog ingredient (`null` when unmatched); without one the key
 * is left off, and nutrition math treats "not loaded" as "no data" — so a
 * caller that skips that round trip gets rows that report no nutrition rather
 * than an undercounted total.
 */
function hydrate(
  row: RecipeRowColumns,
  rows: readonly RecipeIngredientRow[],
  catalog?: ReadonlyMap<string, IngredientRow>,
): RecipeRow {
  if (row.metadata?.schema) deleteDeadKeys(row.metadata.schema);
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
  /**
   * The Schema.org form, because create IS an inbound edge — a scrape and an
   * MCP payload both speak `recipeYield`. It is parsed into the columns here
   * and stripped from the blob; `updateRecipeRow` takes `SchemaRecipe` and
   * rejects the wire-only keys instead.
   */
  schema: SchemaOrgRecipe;
  ingredients?: RecipeIngredientGroupInput[];
  instructions?: RecipeInstructionGroup[];
}

export interface UpdateRecipePatch {
  url?: string;
  source?: string;
  status?: RecipeStatus;
  /** Merged into the stored schema — only the keys given change. */
  schema?: Partial<SchemaRecipe>;
  /** Replaces the whole ingredient list; a line keeps its row by naming its id. */
  ingredients?: RecipeIngredientGroupInput[];
  /** Replaces the whole step list; stored in canonical form. */
  instructions?: RecipeInstructionGroup[];
  /**
   * The servings columns, three-way like the times: the key absent leaves both
   * alone, `amount: null` clears the count, a number sets it; `unit` absent
   * leaves the unit alone and `null` clears it. Grouped rather than two loose
   * scalars so a caller cannot pass them in the wrong order.
   *
   * No `recipeYield` here on purpose — update speaks the app's shape, and the
   * MCP tool rejects a Schema.org yield outright rather than parsing one.
   */
  servings?: { amount: number | null; unit?: string | null };
  /** The whole-recipe raw weight, same three-way semantics. */
  totalWeight?: { amount: number | null; unit?: string | null };
}

const PAGE_SIZE = 24;

// A search query is capped before it reaches the filter — a recipe name is a
// title, not a document, so anything past this is a pathological URL rather
// than a search.
const MAX_QUERY_LENGTH = 200;

/**
 * The two arms a search query matches on: the recipe's own name, and the
 * catalog names and aliases of the ingredients its lines resolve to (the
 * `ingredient_catalog_text` computed field, db/migrations/0023).
 *
 * Aliases are the reason the second arm exists — they are what lets "cilantro"
 * find a recipe whose line reads "fresh coriander".
 *
 * Deliberately NOT the line text (`recipe_ingredients.raw_text` / `name_text`):
 * matching the catalog and walking back to the recipes skips unmatched lines by
 * construction, so search speaks the one vocabulary a person can also browse in
 * the ingredient manager. The cost is that a line normalization hasn't matched
 * yet is unsearchable; that shrinks on its own as the catalog fills, and no code
 * changes when it does.
 *
 * `getRecipes` and `getStatusCounts` must both filter through this. They run the
 * same search against the same corpus, so a predicate that lived in only one of
 * them would show status-filter counts that disagree with the results beside
 * them.
 */
function recipeSearchFilter(query: string): string {
  const value = orFilterValue(`%${query.slice(0, MAX_QUERY_LENGTH)}%`);
  return `metadata->schema->>name.ilike.${value},ingredient_catalog_text.ilike.${value}`;
}

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
    queryBuilder = queryBuilder.or(recipeSearchFilter(opts.query));
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
  /**
   * Join every line to its catalog ingredient, so the rows can compute
   * nutrition. Costs one more query for the whole page. Off by default: a
   * caller that only renders recipe text pays nothing, and a row without it
   * reports no nutrition rather than a wrong one.
   */
  catalog?: boolean;
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
    queryBuilder = queryBuilder.or(recipeSearchFilter(opts.query));
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
  const rowsByRecipe = await getRecipeIngredientsByRecipeIds(rows.map((r) => r.id));
  // Likewise one round trip for the page, not one per recipe: the whole page's
  // lines resolve against a single catalog fetch, deduped by ingredient id.
  const catalog = opts?.catalog
    ? await getCatalogForRows([...rowsByRecipe.values()].flat())
    : undefined;

  return {
    data: rows.map((row) => hydrate(row, rowsByRecipe.get(row.id) ?? [], catalog)),
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
  return hydrate(
    data as RecipeRowColumns,
    ingredientRows,
    await getCatalogForRows(ingredientRows),
  );
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
  // Create is an inbound Schema.org edge: a scrape speaks `recipeYield`, so it
  // is read here and ONLY here. Before the strip, which deletes the key — parse
  // after it and every scraped recipe lands with null servings and no error.
  const yld = parseYield(input.schema.recipeYield);
  const schema = stripSchemaOrgKeys(input.schema);
  // Every line becomes a row, and the row's id is its identity from the moment
  // it exists. The recipe id is minted here when the caller didn't, because
  // the rows have to carry it and the column default would decide it too late.
  const recipeId = input.id ?? crypto.randomUUID();
  const reconcile = reconcileRecipeIngredients(recipeId, input.ingredients ?? [], []);
  const ingredients = hydrateIngredientGroups(reconcile.stored, reconcile.rows);
  const instructions = canonicalizeInstructions(input.instructions ?? []);

  // Markdown (and therefore the embedding) is built from the times-bearing
  // schema, the lines, the steps and the servings — the columns are where those
  // LAND, not a reason for the searchable text to stop mentioning them.
  const content = recipeToMarkdown({
    schema,
    ingredients,
    instructions,
    prep_time: parseDurationToSeconds(schema.prepTime),
    cook_time: parseDurationToSeconds(schema.cookTime),
    total_time: parseDurationToSeconds(schema.totalTime),
    servings_amount: yld?.amount ?? null,
    servings_unit: yld?.unit ?? null,
    total_weight_amount: yld?.weight?.amount ?? null,
    total_weight_unit: yld?.weight?.unit ?? null,
  });
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
      servings_amount: yld?.amount ?? null,
      servings_unit: yld?.unit ?? null,
      total_weight_amount: yld?.weight?.amount ?? null,
      total_weight_unit: yld?.weight?.unit ?? null,
      ingredients: reconcile.stored,
      instructions,
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
 * row's id (see reconcileRecipeIngredients); `instructions` replaces the whole
 * step list. Throws RecipeRepoError ("not_found") if the row doesn't exist,
 * or ("update_failed") on Supabase failure.
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
    servings_amount: number | null;
    servings_unit: string | null;
    total_weight_amount: number | null;
    total_weight_unit: string | null;
    ingredients: StoredIngredientGroup[];
    instructions: RecipeInstructionGroup[];
    metadata: { schema: SchemaRecipe };
  }> = {};

  if (patch.url !== undefined) writePatch.url = patch.url;
  if (patch.source !== undefined) writePatch.source = patch.source;
  if (patch.status !== undefined) writePatch.status = patch.status;
  if (patch.instructions !== undefined) {
    writePatch.instructions = canonicalizeInstructions(patch.instructions);
  }
  if (patch.servings !== undefined) {
    writePatch.servings_amount = patch.servings.amount;
    if (patch.servings.unit !== undefined) {
      writePatch.servings_unit = patch.servings.unit;
    }
  }
  if (patch.totalWeight !== undefined) {
    writePatch.total_weight_amount = patch.totalWeight.amount;
    if (patch.totalWeight.unit !== undefined) {
      writePatch.total_weight_unit = patch.totalWeight.unit;
    }
  }
  // The values the row will HOLD once this write lands — patch where given,
  // current otherwise. The markdown below has to describe the saved recipe, not
  // the one being replaced. Keyed on PRESENCE, not on `??`, because clearing the
  // count writes null — which `??` would read as "no value given" and replace
  // with the very count the write is removing.
  const servingsAmount =
    "servings_amount" in writePatch
      ? (writePatch.servings_amount ?? null)
      : current.servings_amount;
  const servingsUnit =
    "servings_unit" in writePatch
      ? (writePatch.servings_unit ?? null)
      : current.servings_unit;

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

  // A servings change counts too: the markdown's Yield line reads the columns,
  // so leaving `content` alone would leave the embedded text describing the old
  // serving count.
  if (
    patch.schema !== undefined ||
    reconcile ||
    writePatch.instructions ||
    patch.servings !== undefined
  ) {
    const mergedSchema = stripSchemaOrgKeys({
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
    // merged schema on any schema, ingredient or instruction change. Embedding
    // is best-effort: on failure we leave the existing embedding untouched
    // rather than nulling it.
    const content = recipeToMarkdown({
      schema: mergedSchema,
      ingredients: hydrateIngredientGroups(
        reconcile?.stored ?? existingStored,
        finalRows,
      ),
      instructions: writePatch.instructions ?? current.instructions,
      prep_time: writePatch.prep_time,
      cook_time: writePatch.cook_time,
      total_time: writePatch.total_time,
      servings_amount: servingsAmount,
      servings_unit: servingsUnit,
      total_weight_amount: current.total_weight_amount,
      total_weight_unit: current.total_weight_unit,
    });
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
