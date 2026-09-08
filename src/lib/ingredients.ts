import { getSupabaseAdminClient, selectColumns, toVectorLiteral } from "./supabase";
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

// `line_id` and `position` are dead columns (db/migrations/0016) and absent
// from RecipeIngredientRow, so selectColumns keeps them unreachable here.
const RECIPE_INGREDIENT_COLUMNS = selectColumns<RecipeIngredientRow>()([
  "id",
  "recipe_id",
  "ingredient_id",
  "raw_text",
  "quantity",
  "unit",
  "name_text",
  "note",
  "match_status",
  "confidence",
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
    .eq("recipe_id", recipeId);

  if (error) {
    console.error("Supabase error fetching recipe ingredients:", error);
    return [];
  }
  return (data as unknown as RecipeIngredientRow[]) ?? [];
}

// A `.in()` list travels in the URL, and the gateway drops the connection
// above ~16 KB without a status code (see the supabase skill). 100 uuids is
// ~4 KB, well clear of it.
const RECIPE_ID_CHUNK = 100;

/**
 * Rows for several recipes in one round trip per chunk, keyed by recipe id —
 * for list pages, so a page of recipes costs one query rather than one per
 * recipe. Order within a recipe is not this function's business:
 * `recipes.ingredients` says where each row goes.
 */
export async function getRecipeIngredientsByRecipeIds(
  recipeIds: string[],
): Promise<Map<string, RecipeIngredientRow[]>> {
  const byRecipe = new Map<string, RecipeIngredientRow[]>();
  if (recipeIds.length === 0) return byRecipe;
  const supabase = getSupabaseAdminClient();

  for (let i = 0; i < recipeIds.length; i += RECIPE_ID_CHUNK) {
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select(RECIPE_INGREDIENT_COLUMNS)
      .in("recipe_id", recipeIds.slice(i, i + RECIPE_ID_CHUNK));

    if (error) {
      console.error("Supabase error fetching recipe ingredients:", error);
      return byRecipe;
    }
    for (const row of (data as unknown as RecipeIngredientRow[]) ?? []) {
      const bucket = byRecipe.get(row.recipe_id);
      if (bucket) bucket.push(row);
      else byRecipe.set(row.recipe_id, [row]);
    }
  }
  return byRecipe;
}

/** The catalog rows a set of recipe rows point at, keyed by id. */
export async function getCatalogForRows(
  rows: readonly RecipeIngredientRow[],
): Promise<Map<string, IngredientRow>> {
  const ids = [
    ...new Set(rows.map((r) => r.ingredient_id).filter((x): x is string => x != null)),
  ];
  const ingredients = await getIngredientsByIds(ids);
  return new Map(ingredients.map((ing) => [ing.id, ing]));
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

/**
 * Write whole rows back, in ONE statement — an upsert on the primary key, so
 * callers pass complete rows with their changes already merged. Both writers
 * of parsed data go through here: the reconcile's reworded rows on a recipe
 * save, and normalization's persist (which re-points ingredient_id /
 * match_status / confidence / estimated_grams on rows the reconcile created).
 * Keying on the row's own id is what keeps a curated association attached to
 * its line across both. Throws ("update_failed").
 */
export async function updateRecipeIngredientRows(
  recipeId: string,
  rows: RecipeIngredientRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("recipe_ingredients")
    .upsert(rows.map((row) => ({ ...row, recipe_id: recipeId })));

  if (error) {
    throw new IngredientRepoError("update_failed", error.message);
  }
}

/**
 * Create the rows a reconcile minted ids for. The ids come from the caller,
 * not the column default, because `recipes.ingredients` names them — and
 * PostgREST does not promise to return bulk-inserted rows in the order they
 * were sent. Throws ("insert_failed").
 */
export async function insertRecipeIngredientRows(
  rows: RecipeIngredientRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.from("recipe_ingredients").insert(rows);

  if (error) {
    throw new IngredientRepoError("insert_failed", error.message);
  }
}

/**
 * Drop rows the recipe's group array does not name. Scoped on recipe_id as
 * well as id so a bad call can't reach another recipe's rows. Throws
 * ("delete_failed").
 */
export async function deleteRecipeIngredientRows(
  recipeId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", recipeId)
    .in("id", ids);

  if (error) {
    throw new IngredientRepoError("delete_failed", error.message);
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
