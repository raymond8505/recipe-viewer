import { getSupabaseAdminClient, selectColumns, toVectorLiteral } from "./supabase";
import { computeRecipeNutrition, type RecipeNutritionResult } from "./nutritionMath";
import type { RecipeIngredient } from "@/types/recipe";
import type {
  GramsSource,
  IngredientKeywordMatch,
  IngredientMatch,
  IngredientNutrition,
  IngredientRow,
  IngredientSource,
  IngredientsResult,
  NormalizationStatus,
  RecipeIngredientRow,
  UsdaFoodPortion,
} from "@/types/ingredient";

// Discriminated error type for the ingredient repo, mirroring RecipeRepoError.
// `conflict` is a case-insensitive name collision (unique index on
// lower(name)); `match_failed` is an RPC failure — callers must NOT treat it
// as "no matches" (that would misclassify every line as novel and mint
// duplicate ingredients).
export class IngredientRepoError extends Error {
  constructor(
    public kind:
      | "not_found"
      | "insert_failed"
      | "update_failed"
      | "delete_failed"
      | "conflict"
      | "match_failed",
    public detail: string,
  ) {
    super(`${kind}: ${detail}`);
    this.name = "IngredientRepoError";
  }
}

// Postgres unique-violation SQLSTATE, surfaced by PostgREST as error.code.
const PG_UNIQUE_VIOLATION = "23505";
// Postgres foreign-key-violation SQLSTATE — an association write pointing at
// an ingredient deleted mid-flight.
const PG_FOREIGN_KEY_VIOLATION = "23503";

// `embedding` is write-only (queried via the match_ingredients RPC), so it is
// not on IngredientRow — which means selectColumns rejects it here at compile
// time, same as any other column drift.
const INGREDIENT_COLUMNS = selectColumns<IngredientRow>()([
  "id",
  "name",
  "aliases",
  "fdc_id",
  "fdc_data_type",
  "nutrition",
  "density_g_per_ml",
  "food_portions",
  "source",
  "created_at",
  "updated_at",
]);

const RECIPE_INGREDIENT_COLUMNS = selectColumns<RecipeIngredientRow>()([
  "id",
  "recipe_id",
  "line_id",
  "ingredient_id",
  "raw_text",
  "quantity",
  "unit",
  "name_text",
  "note",
  "match_status",
  "confidence",
  "position",
  "estimated_grams",
  "grams_source",
]);

const PAGE_SIZE = 50;

// All access uses the service-role client: ingredients, recipe_ingredients,
// and match_ingredients() are RLS-locked with no policies (db/migrations/0002+),
// so the anon client cannot see them at all.

export interface CreateIngredientInput {
  name: string;
  aliases?: string[];
  fdc_id?: number | null;
  fdc_data_type?: string | null;
  nutrition?: IngredientNutrition | null;
  density_g_per_ml?: number | null;
  food_portions?: UsdaFoodPortion[] | null;
  source?: IngredientSource;
  // Required: the embedding is what makes an ingredient matchable via
  // match_ingredients() — an embedding-less row would be invisible to
  // matching. The column is NOT NULL (db/migrations/0006).
  embedding: number[];
}

export interface UpdateIngredientPatch {
  name?: string;
  aliases?: string[];
  fdc_id?: number | null;
  fdc_data_type?: string | null;
  nutrition?: IngredientNutrition | null;
  density_g_per_ml?: number | null;
  food_portions?: UsdaFoodPortion[] | null;
  source?: IngredientSource;
  // No `| null`: the column is NOT NULL — an embedding can be replaced but
  // never cleared.
  embedding?: number[];
}

export async function getIngredients(opts?: {
  query?: string;
  page?: number;
  limit?: number;
}): Promise<IngredientsResult> {
  const supabase = getSupabaseAdminClient();
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? PAGE_SIZE;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let queryBuilder = supabase
    .from("ingredients")
    .select(INGREDIENT_COLUMNS, { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);

  if (opts?.query) {
    const q = opts.query.slice(0, 200);
    queryBuilder = queryBuilder.ilike("name", `%${q}%`);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error("Supabase error fetching ingredients:", error);
    return { data: [], count: 0 };
  }

  return {
    data: (data as unknown as IngredientRow[]) ?? [],
    count: count ?? 0,
  };
}

// Batch fetch for joining recipe_ingredients rows to their catalog rows.
// Two queries instead of a PostgREST embed on purpose: selectColumns returns
// a flat literal-typed column list, and an embedded-resource select string
// would break its compile-time checking.
export async function getIngredientsByIds(ids: string[]): Promise<IngredientRow[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_COLUMNS)
    .in("id", ids);

  if (error) {
    console.error("Supabase error fetching ingredients by ids:", error);
    return [];
  }
  return (data as unknown as IngredientRow[]) ?? [];
}

export async function getIngredientById(id: string): Promise<IngredientRow | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as unknown as IngredientRow;
}

// Look up a catalog row by its USDA record id — "is this exact food already
// imported?" for the manual-import fork path. fdc_id has no unique index, so
// take the first row if several exist. Returns null when none does.
export async function getIngredientByFdcId(
  fdcId: number,
): Promise<IngredientRow | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_COLUMNS)
    .eq("fdc_id", fdcId)
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0] as unknown as IngredientRow;
}

// Insert a new catalog ingredient. Throws IngredientRepoError("conflict") when
// the case-insensitive name already exists (callers re-match instead of
// duplicating), or ("insert_failed") on any other Supabase failure.
export async function createIngredientRow(
  input: CreateIngredientInput,
): Promise<IngredientRow> {
  const supabase = getSupabaseAdminClient();

  const { embedding, ...fields } = input;
  const { data, error } = await supabase
    .from("ingredients")
    .insert({
      ...fields,
      source: input.source ?? "usda",
      embedding: toVectorLiteral(embedding),
    })
    .select(INGREDIENT_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.code === PG_UNIQUE_VIOLATION) {
      throw new IngredientRepoError("conflict", `Ingredient "${input.name}" already exists`);
    }
    throw new IngredientRepoError("insert_failed", error?.message ?? "Insert returned no row");
  }
  return data as unknown as IngredientRow;
}

// Patch fields on an existing ingredient. Throws ("not_found") if the row
// doesn't exist, ("conflict") on a name collision, or ("update_failed").
export async function updateIngredientRow(
  id: string,
  patch: UpdateIngredientPatch,
): Promise<IngredientRow> {
  const supabase = getSupabaseAdminClient();

  const { data: existing, error: fetchError } = await supabase
    .from("ingredients")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    throw new IngredientRepoError("not_found", `Ingredient ${id} not found`);
  }

  const { embedding, ...fields } = patch;
  const writePatch: Record<string, unknown> = { ...fields };
  if (embedding) writePatch.embedding = toVectorLiteral(embedding);

  if (Object.keys(writePatch).length === 0) {
    const current = await getIngredientById(id);
    if (!current) throw new IngredientRepoError("not_found", `Ingredient ${id} not found`);
    return current;
  }

  writePatch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("ingredients")
    .update(writePatch)
    .eq("id", id)
    .select(INGREDIENT_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.code === PG_UNIQUE_VIOLATION) {
      throw new IngredientRepoError("conflict", `Ingredient "${patch.name}" already exists`);
    }
    throw new IngredientRepoError("update_failed", error?.message ?? "Update returned no row");
  }
  return data as unknown as IngredientRow;
}

// Hard delete. Referencing recipe_ingredients rows null their ingredient_id
// (FK on delete set null) rather than disappearing. Throws ("not_found") or
// ("delete_failed").
export async function deleteIngredientRow(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { data: existing, error: fetchError } = await supabase
    .from("ingredients")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    throw new IngredientRepoError("not_found", `Ingredient ${id} not found`);
  }

  const { error } = await supabase.from("ingredients").delete().eq("id", id);

  if (error) {
    throw new IngredientRepoError("delete_failed", error.message);
  }
}

// Hybrid keyword + semantic search over the catalog via the match_ingredients
// RPC (db/migrations/0007): pg_trgm trigram similarity on name/aliases fused
// with pgvector cosine similarity by reciprocal rank. queryText is the parsed
// ingredient name (e.g. "unsalted butter"), embedding its vector. rrf_k and
// the signal weights stay at the SQL defaults until a caller needs knobs.
// Throws ("match_failed") on RPC failure — callers must treat that as
// "matching unavailable", never as "no matches".
export async function matchIngredients(
  queryText: string,
  embedding: number[],
  count = 5,
): Promise<IngredientMatch[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.rpc("match_ingredients", {
    query_text: queryText,
    query_embedding: toVectorLiteral(embedding),
    match_count: count,
  });

  if (error) {
    throw new IngredientRepoError("match_failed", error.message);
  }
  return (data as IngredientMatch[]) ?? [];
}

// Keyword-only trigram search via the search_ingredients_keyword RPC
// (db/migrations/0008) — the NutritionDetail autocomplete path. No embedding
// call, so it's cheap enough for per-keystroke use. Throws ("match_failed")
// on RPC failure — callers must treat that as "search unavailable", never as
// "no matches".
export async function searchIngredientsKeyword(
  queryText: string,
  count = 8,
): Promise<IngredientKeywordMatch[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.rpc("search_ingredients_keyword", {
    query_text: queryText,
    match_count: count,
  });

  if (error) {
    throw new IngredientRepoError("match_failed", error.message);
  }
  return (data as IngredientKeywordMatch[]) ?? [];
}

// Result of an alias mutation RPC (db/migrations/0010). `changed` is the
// caller's signal to spend a Gemini embedding call: the embedding encodes
// name + aliases, so it only needs regenerating when the array actually moved.
export interface AliasMutationResult {
  id: string;
  name: string;
  aliases: string[];
  changed: boolean;
}

// Atomically append aliases to a catalog ingredient, case-insensitively
// deduped against both the canonical name and the existing array — but stored
// with the CALLER'S casing (aliases are display data; the fold is only a
// comparison). An RPC rather than a read-modify-write here because many recipe
// lines resolve to one ingredient and normalization runs concurrently with the
// manual re-point route: a read-modify-write would silently drop one append.
//
// Returns null when the ingredient no longer exists (deleted mid-flight) —
// not an error. Throws ("update_failed") on RPC failure.
export async function addIngredientAliases(
  id: string,
  aliases: string[],
): Promise<AliasMutationResult | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.rpc("ingredient_add_aliases", {
    p_id: id,
    p_aliases: aliases,
  });

  if (error) {
    throw new IngredientRepoError("update_failed", error.message);
  }
  const rows = (data as AliasMutationResult[]) ?? [];
  return rows[0] ?? null;
}

// Drop one alias, whatever its stored casing. Unconditional by design: the
// only caller is an explicit user re-point/un-link, which is a statement that
// this recipe wording does not mean this ingredient. Same null/throw contract
// as addIngredientAliases.
export async function removeIngredientAlias(
  id: string,
  alias: string,
): Promise<AliasMutationResult | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.rpc("ingredient_remove_alias", {
    p_id: id,
    p_alias: alias,
  });

  if (error) {
    throw new IngredientRepoError("update_failed", error.message);
  }
  const rows = (data as AliasMutationResult[]) ?? [];
  return rows[0] ?? null;
}

export async function getRecipeIngredients(
  recipeId: string,
): Promise<RecipeIngredientRow[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .select(RECIPE_INGREDIENT_COLUMNS)
    .eq("recipe_id", recipeId)
    .order("position", { ascending: true });

  if (error) {
    console.error("Supabase error fetching recipe ingredients:", error);
    return [];
  }
  return (data as unknown as RecipeIngredientRow[]) ?? [];
}

/**
 * Aggregate a recipe's normalized ingredient nutrition into a whole-recipe
 * total, or null when the recipe has no normalized rows (never normalized).
 * Fetches the recipe_ingredients rows + their matched catalog ingredients, then
 * defers to the pure `computeRecipeNutrition`. Single server entry point for the
 * recipe page and the MCP `get_recipe` tool. `fullyCovered` on the result gates
 * whether callers should prefer the total over the recipe's own nutrition.
 */
export async function getRecipeNormalizedNutrition(
  recipeId: string,
  schemaIngredients: Array<string | RecipeIngredient>,
): Promise<RecipeNutritionResult | null> {
  const rows = await getRecipeIngredients(recipeId);
  if (rows.length === 0) return null;

  const ingredientIds = [
    ...new Set(
      rows.map((r) => r.ingredient_id).filter((x): x is string => x != null),
    ),
  ];
  const ingredients = await getIngredientsByIds(ingredientIds);
  const ingredientsById = new Map(ingredients.map((ing) => [ing.id, ing]));

  return computeRecipeNutrition(schemaIngredients, rows, ingredientsById);
}

// Manually re-point one parsed line at a catalog ingredient (the
// NutritionDetail curation path). Setting an ingredient marks the line
// "manual"; clearing it (null) marks it "unmatched". Confidence is nulled
// either way — it described the automated match that's being overridden.
// Scoped on id AND recipe_id so a route can't move another recipe's row.
// Throws ("not_found") when the row doesn't exist under that recipe or the
// target ingredient vanished mid-flight (FK 23503), or ("update_failed").
export async function updateRecipeIngredientAssociation(
  recipeId: string,
  rowId: string,
  ingredientId: string | null,
): Promise<RecipeIngredientRow> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .update({
      ingredient_id: ingredientId,
      match_status: ingredientId == null ? "unmatched" : "manual",
      confidence: null,
    })
    .eq("id", rowId)
    .eq("recipe_id", recipeId)
    .select(RECIPE_INGREDIENT_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.code === PG_FOREIGN_KEY_VIOLATION) {
      throw new IngredientRepoError(
        "not_found",
        `Ingredient ${ingredientId} not found`,
      );
    }
    // PostgREST .single() on zero updated rows errors with PGRST116, so a
    // missing/mis-scoped row lands here rather than in a pre-check query.
    if (error?.code === "PGRST116" || !error) {
      throw new IngredientRepoError(
        "not_found",
        `Recipe ingredient ${rowId} not found for recipe ${recipeId}`,
      );
    }
    throw new IngredientRepoError("update_failed", error.message);
  }
  return data as unknown as RecipeIngredientRow;
}

// Fetch one parsed line scoped to its recipe (the manual grams endpoint needs
// the line's raw_text/quantity/unit to feed the estimator). Scoped on id AND
// recipe_id so a route can't read another recipe's row. Returns null when the
// row doesn't exist under that recipe.
export async function getRecipeIngredientById(
  recipeId: string,
  rowId: string,
): Promise<RecipeIngredientRow | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .select(RECIPE_INGREDIENT_COLUMNS)
    .eq("id", rowId)
    .eq("recipe_id", recipeId)
    .single();

  if (error || !data) return null;
  return data as unknown as RecipeIngredientRow;
}

// Set (or clear, with null) the per-line gram estimate — the NutritionDetail
// grams field and "Estimate" button path. `grams_source` records provenance
// and must be null exactly when grams is null; callers pass "llm" for an
// estimate and "manual" for a user-typed value. Scoped on id AND recipe_id.
// Throws ("not_found") when the row doesn't exist under that recipe, or
// ("update_failed").
export async function setRecipeIngredientGrams(
  recipeId: string,
  rowId: string,
  grams: number | null,
  source: GramsSource | null,
): Promise<RecipeIngredientRow> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .update({
      estimated_grams: grams,
      grams_source: grams == null ? null : source,
    })
    .eq("id", rowId)
    .eq("recipe_id", recipeId)
    .select(RECIPE_INGREDIENT_COLUMNS)
    .single();

  if (error || !data) {
    // PostgREST .single() on zero updated rows errors with PGRST116, so a
    // missing/mis-scoped row lands here rather than in a pre-check query.
    if (error?.code === "PGRST116" || !error) {
      throw new IngredientRepoError(
        "not_found",
        `Recipe ingredient ${rowId} not found for recipe ${recipeId}`,
      );
    }
    throw new IngredientRepoError("update_failed", error.message);
  }
  return data as unknown as RecipeIngredientRow;
}

export type RecipeIngredientInsert = Omit<RecipeIngredientRow, "id" | "recipe_id">;

// The parse-derived half of a row: everything that follows from the line's
// TEXT. Deliberately excludes ingredient_id / match_status / estimated_grams —
// re-reading a reworded line must never disturb the association on it.
export type RecipeIngredientParsePatch = Partial<
  Pick<
    RecipeIngredientRow,
    | "raw_text"
    | "quantity"
    | "unit"
    | "name_text"
    | "position"
    | "estimated_grams"
    | "grams_source"
  >
>;

/**
 * Re-point one row's parse fields at edited line text. Scoped on recipe_id as
 * well as row id so a row can't be moved through another recipe's request.
 * Throws ("update_failed"); a missing row is not an error — the line simply
 * has no derived row yet.
 */
export async function updateRecipeIngredientParse(
  recipeId: string,
  rowId: string,
  patch: RecipeIngredientParsePatch,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("recipe_ingredients")
    .update(patch)
    .eq("id", rowId)
    .eq("recipe_id", recipeId);

  if (error) {
    throw new IngredientRepoError("update_failed", error.message);
  }
}

/**
 * Write a recipe's parsed-ingredient rows.
 *
 * When every incoming row carries a `line_id` this is an UPSERT on
 * (recipe_id, line_id) plus a prune of the lines that no longer exist. That
 * keeps a surviving line's row — and therefore its `id` — stable across runs,
 * which matters because the UI PATCHes associations by row id: under the old
 * delete-then-insert, a run completing between page load and a click left the
 * client holding an id that no longer existed.
 *
 * Rows without a line_id (recipes not yet backfilled) can't key on that index,
 * so they take the original delete-then-insert path. Neither path is
 * transactional — a known PostgREST limitation, acceptable while writes come
 * from one normalization run at a time; a SQL function is the upgrade path.
 */
export async function replaceRecipeIngredients(
  recipeId: string,
  rows: RecipeIngredientInsert[],
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const lineIds = rows.map((row) => row.line_id).filter((id): id is string => id != null);
  if (rows.length > 0 && lineIds.length === rows.length) {
    // Drop rows whose line is gone. `not.in` with an empty list is invalid
    // PostgREST, but lineIds is non-empty here by construction.
    const { error: pruneError } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", recipeId)
      .not("line_id", "in", `(${lineIds.map((id) => `"${id}"`).join(",")})`);

    if (pruneError) {
      throw new IngredientRepoError("delete_failed", pruneError.message);
    }

    const { error: upsertError } = await supabase
      .from("recipe_ingredients")
      .upsert(
        rows.map((row) => ({ ...row, recipe_id: recipeId })),
        { onConflict: "recipe_id,line_id" },
      );

    if (upsertError) {
      throw new IngredientRepoError("insert_failed", upsertError.message);
    }
    return;
  }

  const { error: deleteError } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", recipeId);

  if (deleteError) {
    throw new IngredientRepoError("delete_failed", deleteError.message);
  }

  if (rows.length === 0) return;

  const { error: insertError } = await supabase
    .from("recipe_ingredients")
    .insert(rows.map((row) => ({ ...row, recipe_id: recipeId })));

  if (insertError) {
    throw new IngredientRepoError("insert_failed", insertError.message);
  }
}

export interface NormalizationPatch {
  status: NormalizationStatus;
  error?: string | null;
  normalizedAt?: string | null;
  fingerprint?: string | null;
}

// Write normalization run state onto the recipe row (columns from
// db/migrations/0004). Uses the admin client like the rest of this module so
// status writes can't be blocked by any future recipes RLS tightening.
export async function setRecipeNormalization(
  recipeId: string,
  patch: NormalizationPatch,
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const writePatch: Record<string, unknown> = {
    normalization_status: patch.status,
  };
  if (patch.error !== undefined) writePatch.normalization_error = patch.error;
  if (patch.normalizedAt !== undefined) {
    writePatch.ingredients_normalized_at = patch.normalizedAt;
  }
  if (patch.fingerprint !== undefined) {
    writePatch.normalized_fingerprint = patch.fingerprint;
  }

  const { error } = await supabase
    .from("recipes")
    .update(writePatch)
    .eq("id", recipeId);

  if (error) {
    throw new IngredientRepoError("update_failed", error.message);
  }
}
