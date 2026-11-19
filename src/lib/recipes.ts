import {
  getSupabaseClient,
  orFilterValue,
  selectColumns,
  toVectorLiteral,
} from "./supabase";
import { getFeatures } from "./features";
import {
  getFirstImage,
  parseDurationToSeconds,
  recipeToMarkdown,
  SCHEMA_ORG_ONLY_KEYS,
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
  "name",
  "image",
  "description",
  "notes",
  "cooking_notes",
  "created_at",
  "updated_at",
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
// The blob's dead regions, and the seams that keep them dead.
//
// Each promotion left a frozen copy behind: 0016 the `recipeIngredient` array,
// 0019 the three time keys, 0021 the `recipeInstructions` array, 0022 the
// `recipeYield` and the whole `nutrition` block, and 0028 the name, image,
// description and both sets of notes. No migration strips any of them. This
// module is the ONLY code that knows that — `hydrate` runs at every read exit
// below and the strip functions at every write — so everything above it
// (JSON-LD, the markdown, the MCP tools, RecipeCard, RecipeDetail, CookingMode)
// never observes a stale value or a dead key.
//
// NOTHING HYDRATES BACK, and nothing may start to. Every promoted field is
// read off its column and its blob key merely deleted — the times included,
// which is why `hydrate` does not touch `prep_time` / `cook_time` /
// `total_time` and why nothing below writes anything at all into the blob it
// strips. Rewriting a dead key from its column would hand the next reader a
// reason to consult the blob, and the blob is what this module exists to hide.
//
// The corollary is the thing to protect: a reader that queries `recipes`
// without coming through here gets a pre-0019 answer, no ingredients, the
// frozen steps and a name that may never have existed, silently.
// ---------------------------------------------------------------------------

/**
 * A text column's value from whatever a writer sent. Blank collapses to NULL so
 * "" and "   " and absent all mean the one thing every reader branches on —
 * this recipe has no description / no notes — rather than three spellings of it.
 */
function textOrNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
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
  const blob = schema as unknown as Record<string, unknown>;
  for (const key of SCHEMA_ORG_ONLY_KEYS) delete blob[key];
}

/**
 * The one read exit. `ingredients` comes from the column's id groups joined to
 * the `recipe_ingredients` rows the caller fetched; `instructions` is the
 * column as stored (already the app's shape);
 * the blob's dead keys are deleted so they can't leak through a spread (the
 * MCP server JSON-stringifies whole rows). With a `catalog` map every line
 * carries its catalog ingredient (`null` when unmatched); without one the key
 * is left off, and nutrition math treats "not loaded" as "no data" — so a
 * caller that skips that round trip gets rows that report no nutrition rather
 * than an undercounted total.
 *
 * It is also where `metadata` is made to match its type. The column is nullable
 * and holds whatever was written: a failed scrape stores its diagnosis there
 * (`{ error, is_complete, ... }`) and no `schema` at all. `RecipeRow` promises
 * consumers a `metadata.schema` they may read without a guard, and this is the
 * one place that promise can be kept — so an absent blob becomes an empty one
 * rather than a crash several components downstream.
 */
function hydrate(
  row: RecipeRowColumns,
  rows: readonly RecipeIngredientRow[],
  catalog?: ReadonlyMap<string, IngredientRow>,
): RecipeRow {
  const schema = row.metadata?.schema;
  if (schema) deleteDeadKeys(schema);
  return {
    ...row,
    metadata: { ...row.metadata, schema: schema ?? {} },
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
  /**
   * The column-backed scalars (0028), each three-way like the times: the key
   * absent leaves the column alone, a blank string or null clears it, a value
   * sets it. `name` has no clear — a recipe without one is not a state the
   * column allows.
   *
   * `image` takes the single URL the column holds; the Schema.org array form is
   * reduced at the inbound edges, never here.
   */
  name?: string;
  image?: string | null;
  description?: string | null;
  notes?: string | null;
  cookingNotes?: string | null;
  /**
   * The three time columns, in SECONDS — the column's own unit, so nothing
   * here parses. Each key is three-way like the servings: absent leaves the
   * column alone, `null` clears it, a number sets it.
   *
   * No `prepTime` / `cookTime` / `totalTime` inside `schema` any more. ISO 8601
   * is a wire spelling and lives at the edges: `createRecipeRow` and
   * `draftRecipeDocument` reduce it on the way in, and the MCP tool parses its
   * ISO argument before calling this.
   */
  times?: { prep?: number | null; cook?: number | null; total?: number | null };
  /**
   * Merged into the stored schema — only the keys given change. Down to
   * `recipeCuisine` and `recipeCategory`, the two fields awaiting the tagging
   * system; nothing else may be sent through it.
   */
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
 * The three arms a search query matches on: the recipe's own name, the catalog
 * names and aliases of the ingredients its lines resolve to
 * (`ingredient_catalog_text`, db/migrations/0023), and the parsed names of its
 * own ingredient lines (`ingredient_line_text`, db/migrations/0027).
 *
 * Aliases are the reason the catalog arm exists — they are what lets
 * "cilantro" find a recipe whose line reads "fresh coriander". The line arm is
 * what reaches a line the catalog has no answer for yet: an unmatched line is
 * invisible to the catalog arm by construction, and those are the recipes a
 * reader is least likely to find any other way.
 *
 * This filter only decides WHICH recipes match. Which arm matched decides the
 * order, and only on the relevance sort: `search_recipes_ranked` tiers a name
 * hit over a catalog hit over a line-label hit (0027). The two cannot be one
 * expression — PostgREST orders by columns the row already holds, and the tier
 * depends on the query.
 *
 * `getRecipes` and `getStatusCounts` must both filter through this. They run the
 * same search against the same corpus, so a predicate that lived in only one of
 * them would show status-filter counts that disagree with the results beside
 * them.
 */
function recipeSearchFilter(query: string): string {
  const value = orFilterValue(`%${query.slice(0, MAX_QUERY_LENGTH)}%`);
  return (
    `name.ilike.${value}` +
    `,ingredient_catalog_text.ilike.${value}` +
    `,ingredient_line_text.ilike.${value}`
  );
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
    .not("name", "ilike", "%(NEEDS RE-SCRAPE)%")
    .not("name", "ilike", "%null%");

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

/** The four sorts that are a property of the recipe row, so PostgREST can order by them. */
type ColumnSort = Exclude<SortOption, "relevance">;

/**
 * How equally-relevant recipes order among themselves. Every recipe that
 * matched only on a name, and every one whose match has no weight, scores the
 * same, so without this their order would be whatever the planner happened to
 * produce — and would shift between pages of one result set.
 */
const RELEVANCE_TIEBREAK: ColumnSort = "newest";

/** One row of `search_recipes_ranked` (db/migrations/0027). */
interface RankedId {
  id: string;
  /** 3 = name hit, 2 = catalog hit, 1 = line label only. Ordering only. */
  tier: number;
  score: number;
  total_count: number;
}

/**
 * The relevance-ranked page: which recipes matched, in what order, and how
 * many there are — answered by SQL, because the ranking depends on the query
 * and PostgREST can only order by something the row already holds.
 *
 * Two round trips on purpose. The RPC returns **ids**, and the rows are then
 * read back through the same `RECIPE_COLUMNS` select every other read uses, so
 * the typed column list stays the single description of a recipe row and the
 * function never needs editing when a column is added. The `.in()` carries one
 * page of ids — two dozen — nowhere near the URL limit an unpaged id list
 * would hit.
 *
 * The RPC filters on the same three arms `recipeSearchFilter` builds, so the
 * ranked page and the status chips beside it always describe the same set of
 * recipes. It adds the tier and the weight share on top, which only order that
 * set and never widen or narrow it.
 */
async function rankedRecipes(
  opts: { query?: string; source?: string; status?: string; catalog?: boolean },
  ctx: {
    features: ReturnType<typeof getFeatures>;
    limit: number;
    offset: number;
  },
): Promise<RecipesResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc("search_recipes_ranked", {
    p_query: (opts.query ?? "").slice(0, MAX_QUERY_LENGTH),
    p_source: opts.source ?? null,
    // The logged-out gate wins outright, exactly as the column query's status
    // branch does: a status filter never widens what a reader may see.
    p_status: ctx.features.filterByStatus ? null : (opts.status ?? null),
    p_published_only: ctx.features.filterByStatus,
    p_sort: RELEVANCE_TIEBREAK,
    p_limit: ctx.limit,
    p_offset: ctx.offset,
  });

  if (error) {
    console.error("Supabase error ranking recipes:", error);
    return { data: [], count: 0 };
  }

  const ranked = (data as RankedId[]) ?? [];
  // No rows means no matches, so there is no window count to read off one.
  if (ranked.length === 0) return { data: [], count: 0 };

  const ids = ranked.map((row) => row.id);
  const { data: rows, error: rowsError } = await supabase
    .from("recipes")
    .select(RECIPE_COLUMNS)
    .in("id", ids);

  if (rowsError) {
    console.error("Supabase error fetching ranked recipes:", rowsError);
    return { data: [], count: 0 };
  }

  // `.in()` answers in no particular order, so the ranking is re-applied here
  // from the ids. A row the second read cannot find is dropped rather than
  // rendered as a hole — it means the recipe was deleted between the two.
  const byId = new Map(
    ((rows as RecipeRowColumns[]) ?? []).map((row) => [row.id, row]),
  );
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((row): row is RecipeRowColumns => row != null);

  return {
    data: await hydratePage(ordered, opts.catalog),
    count: Number(ranked[0].total_count),
  };
}

/**
 * Join a page of recipe rows to their ingredient rows, and optionally to the
 * catalog. One round trip each for the whole page rather than one per recipe.
 *
 * The ingredient rows are not optional: `/api/recipes` feeds MealSearch, whose
 * rows go straight into a `ScalableRecipe` when a recipe joins a meal, and that
 * needs the line text.
 */
async function hydratePage(
  rows: RecipeRowColumns[],
  catalog?: boolean,
): Promise<RecipeRow[]> {
  const rowsByRecipe = await getRecipeIngredientsByRecipeIds(
    rows.map((row) => row.id),
  );
  // Likewise one round trip for the page, not one per recipe: the whole page's
  // lines resolve against a single catalog fetch, deduped by ingredient id.
  const catalogRows = catalog
    ? await getCatalogForRows([...rowsByRecipe.values()].flat())
    : undefined;

  return rows.map((row) =>
    hydrate(row, rowsByRecipe.get(row.id) ?? [], catalogRows),
  );
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

  // Relevance is ranked in SQL and needs a query to rank against, so it is the
  // one sort this query cannot express (see rankedRecipeIds).
  if (opts?.sort === "relevance" && opts.query?.trim()) {
    return rankedRecipes(opts, { features, limit, offset: from });
  }

  const sortMap: Record<ColumnSort, { column: string; ascending: boolean }> = {
    newest:    { column: "created_at", ascending: false },
    oldest:    { column: "created_at", ascending: true },
    "name-asc":  { column: "name", ascending: true },
    "name-desc": { column: "name", ascending: false },
  };
  const sort = opts?.sort ?? "newest";
  const { column, ascending } =
    sortMap[sort === "relevance" ? RELEVANCE_TIEBREAK : sort];

  let queryBuilder = supabase
    .from("recipes")
    .select(RECIPE_COLUMNS, { count: "exact" })
    .not("name", "ilike", "%(NEEDS RE-SCRAPE)%")
    .not("name", "ilike", "%null%")
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

  return {
    data: await hydratePage((data as RecipeRowColumns[]) ?? [], opts?.catalog),
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
  // Same rule as the yield, and for the same reason: every promoted scalar is
  // read from the payload BEFORE the strip removes it. `image` arrives in the
  // Schema.org `string | string[]` form and is reduced to the one URL the
  // column holds. `cookingNotes` is absent on purpose — it is authored in
  // cooking mode, never by whatever is creating the recipe.
  //
  // The three times obey the rule too, and the compiler cannot enforce it:
  // `stripSchemaOrgKeys` returns its argument's type, so reading `.prepTime`
  // off the stripped copy typechecks and quietly yields undefined. ISO is
  // reduced to the column's seconds here, once, for the same reason the yield is.
  const columns = {
    name: input.schema.name,
    image: getFirstImage(input.schema.image),
    description: textOrNull(input.schema.description),
    notes: textOrNull(input.schema.notes),
    prep_time: parseDurationToSeconds(input.schema.prepTime),
    cook_time: parseDurationToSeconds(input.schema.cookTime),
    total_time: parseDurationToSeconds(input.schema.totalTime),
  };
  const schema = stripSchemaOrgKeys(input.schema);
  // Every line becomes a row, and the row's id is its identity from the moment
  // it exists. The recipe id is minted here when the caller didn't, because
  // the rows have to carry it and the column default would decide it too late.
  const recipeId = input.id ?? crypto.randomUUID();
  const reconcile = reconcileRecipeIngredients(recipeId, input.ingredients ?? [], []);
  const ingredients = hydrateIngredientGroups(reconcile.stored, reconcile.rows);
  const instructions = canonicalizeInstructions(input.instructions ?? []);

  // Markdown (and therefore the embedding) is built from the columns, the
  // lines, the steps and the servings — the columns are where those LAND, not a
  // reason for the searchable text to stop mentioning them.
  const content = recipeToMarkdown({
    schema,
    ...columns,
    cooking_notes: null,
    ingredients,
    instructions,
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
      ...columns,
      content,
      ...(embedding ? { embedding: toVectorLiteral(embedding) } : {}),
      url: input.url,
      source: input.source,
      status: input.status ?? DEFAULT_RECIPE_STATUS,
      servings_amount: yld?.amount ?? null,
      servings_unit: yld?.unit ?? null,
      total_weight_amount: yld?.weight?.amount ?? null,
      total_weight_unit: yld?.weight?.unit ?? null,
      ingredients: reconcile.stored,
      instructions,
      metadata: { schema },
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
    image: string | null;
    description: string | null;
    notes: string | null;
    cooking_notes: string | null;
    updated_at: string;
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
  // The promoted scalars, keyed on presence so they keep the three-way
  // semantics the times have. A blank name is dropped rather than written:
  // the column is NOT NULL, and an edit that submits an empty title is a
  // mistake to ignore, not an instruction to break the row.
  if (textOrNull(patch.name)) writePatch.name = patch.name!.trim();
  if (patch.image !== undefined) writePatch.image = textOrNull(patch.image);
  if (patch.description !== undefined) {
    writePatch.description = textOrNull(patch.description);
  }
  if (patch.notes !== undefined) writePatch.notes = textOrNull(patch.notes);
  if (patch.cookingNotes !== undefined) {
    writePatch.cooking_notes = textOrNull(patch.cookingNotes);
  }
  if (patch.instructions !== undefined) {
    writePatch.instructions = canonicalizeInstructions(patch.instructions);
  }
  // Each time is independently three-way: the key absent leaves the column
  // alone, null clears it, a number sets it. Grouped rather than three loose
  // scalars for the reason `servings` is grouped — but each member keyed
  // separately, because unlike a serving unit without a count, one time is a
  // perfectly good state without the other two.
  if (patch.times !== undefined) {
    if (patch.times.prep !== undefined) writePatch.prep_time = patch.times.prep;
    if (patch.times.cook !== undefined) writePatch.cook_time = patch.times.cook;
    if (patch.times.total !== undefined) writePatch.total_time = patch.times.total;
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
  // Same rule for the times: the markdown prints a Prep / Cook / Total line,
  // so it needs what the row will hold, and a cleared time writes null.
  const prepTime =
    "prep_time" in writePatch ? (writePatch.prep_time ?? null) : current.prep_time;
  const cookTime =
    "cook_time" in writePatch ? (writePatch.cook_time ?? null) : current.cook_time;
  const totalTime =
    "total_time" in writePatch ? (writePatch.total_time ?? null) : current.total_time;

  // Normalization has work when the SET of lines changes — something added or
  // removed — and when a line is REWORDED, because an association names which
  // food a line means and a reworded line names it in different words. The
  // reworded rows go to the run as `rematchIds`, the only rows it may
  // re-answer.
  // Reordering and regrouping carry the same words, so they are neither. The
  // reconcile draws both distinctions; the deterministic re-parse it produces
  // is not a matcher run.
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
    patch.servings !== undefined ||
    // A time change moves the markdown's meta line exactly as a servings
    // change does, so it earns a re-render too.
    patch.times !== undefined ||
    // The title and the blurb are the markdown's first two blocks, so a change
    // to either has to re-render it for the same reason a servings change does.
    "name" in writePatch ||
    "description" in writePatch
  ) {
    const mergedSchema = stripSchemaOrgKeys({
      ...current.metadata.schema,
      ...(patch.schema ?? {}),
    }) as SchemaRecipe;
    writePatch.metadata = { ...current.metadata, schema: mergedSchema };
    // `content` (markdown) and `embedding` are always recomputed from the
    // merged schema on any schema, ingredient or instruction change. Embedding
    // is best-effort: on failure we leave the existing embedding untouched
    // rather than nulling it.
    const content = recipeToMarkdown({
      schema: mergedSchema,
      // Keyed on presence for the same reason the servings are: the markdown
      // has to describe the row this write leaves behind, and a cleared
      // description writes null, which `??` would read as "nothing given".
      name: "name" in writePatch ? writePatch.name! : current.name,
      description:
        "description" in writePatch
          ? (writePatch.description ?? null)
          : current.description,
      image: current.image,
      notes: current.notes,
      cooking_notes: current.cooking_notes,
      ingredients: hydrateIngredientGroups(
        reconcile?.stored ?? existingStored,
        finalRows,
      ),
      instructions: writePatch.instructions ?? current.instructions,
      prep_time: prepTime,
      cook_time: cookTime,
      total_time: totalTime,
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

  // The column has a now() DEFAULT but no trigger, so without this it records
  // when the row was created and never moves again. Stamped after the empty
  // check so a patch that changes nothing does not claim the recipe changed.
  writePatch.updated_at = new Date().toISOString();

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
    // `updates` IS the reworded set — a row lands there only on a text change.
    const rematchIds = reconcile.updates.map((row) => row.id);
    if (reconcile.lineSetChanged || rematchIds.length > 0) {
      scheduleNormalization(id, rematchIds);
    }
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
    .update({
      status: ARCHIVED_RECIPE_STATUS,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new RecipeRepoError("update_failed", error.message);
  }
}
