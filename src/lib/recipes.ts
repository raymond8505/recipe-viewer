import { getSupabaseClient, selectColumns, toVectorLiteral } from "./supabase";
import { getFeatures } from "./features";
import { schemaToMarkdown } from "./format";
import { generateEmbedding } from "./embedding";
import {
  deleteRecipeIngredientRows,
  getRecipeIngredients,
  getRecipeIngredientsByRecipeIds,
  insertRecipeIngredientRows,
  updateRecipeIngredientRows,
} from "./ingredients";
import { insertedRow, reconcileRecipeIngredients } from "./recipeIngredientReconcile";
import { composeRecipeSchema } from "./recipeSchema";
import { scheduleNormalization } from "./normalization/trigger";
import {
  ARCHIVED_RECIPE_STATUS,
  DEFAULT_RECIPE_STATUS,
  PUBLISHED_RECIPE_STATUS,
  RECIPE_STATUSES,
} from "./schemas/recipe";
import type { RecipeIngredientRow } from "@/types/ingredient";
import type {
  RecipeIngredientGroup,
  RecipeRow,
  RecipeRowColumns,
  RecipesResult,
  SchemaRecipe,
  StoredRecipeSchema,
} from "@/types/recipe";

// Derived from the zod enum in ./schemas/recipe rather than restated, so the
// column's valid values live in exactly one place.
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

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
// are not on RecipeRowColumns — selectColumns rejects them here at compile time.
// Checked against RecipeRowColumns rather than RecipeRow because `ingredientRows`
// is hydrated from a second table, not selected.
const RECIPE_COLUMNS = selectColumns<RecipeRowColumns>()([
  "id",
  "url",
  "source",
  "status",
  "ingredients",
  "instructions",
  "metadata",
]);

// Split an inbound SchemaRecipe into the two places it now lives: the ingredient
// lines and instruction steps become columns, everything else stays in
// metadata.schema. The lines are handed back rather than stored, because turning
// them into `ingredients` needs the recipe_ingredients ids the reconcile mints.
function splitSchema(schema: SchemaRecipe): {
  stored: StoredRecipeSchema;
  instructions: SchemaRecipe["recipeInstructions"];
  lines: SchemaRecipe["recipeIngredient"];
} {
  const { recipeIngredient, recipeInstructions, ...stored } = schema;
  return { stored, instructions: recipeInstructions, lines: recipeIngredient };
}

// Attach the recipe_ingredients rows a row's `ingredients` groups point at.
function hydrate(
  row: RecipeRowColumns,
  ingredientRows: RecipeIngredientRow[],
): RecipeRow {
  return { ...row, ingredientRows };
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
  // One extra round trip for the whole page rather than one per recipe. It is
  // not optional: /api/recipes feeds MealSearch, whose rows go straight into a
  // ScalableRecipe when a recipe is added to a meal, and that needs the line
  // text these rows carry.
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

  return hydrate(data as RecipeRowColumns, await getRecipeIngredients(id));
}

// Insert a new recipe row. Defaults status to DEFAULT_RECIPE_STATUS if not
// provided.
// Throws RecipeRepoError("insert_failed") on Supabase failure. Derives the
// `content` and `embedding` columns from the schema — see the "Derived content
// + embedding columns" note in .claude/docs/supabase-data-layer.md.
export async function createRecipeRow(input: CreateRecipeInput): Promise<RecipeRow> {
  const supabase = getSupabaseClient();
  const { stored, instructions, lines } = splitSchema(input.schema);

  // Every ingredient line becomes a recipe_ingredients row, and the row's id is
  // its identity from the moment it exists. Ids are minted here, before the
  // insert, because `ingredients` has to reference them — letting the column
  // default assign them would mean trusting PostgREST to return bulk-inserted
  // rows in the order they were sent, which it does not promise.
  const { inserts, groups } = reconcileRecipeIngredients(lines ?? [], []);

  // Derived from the schema as given: it still carries the line text, and the
  // rows about to be written say exactly the same thing.
  const content = schemaToMarkdown(input.schema);
  const embedding = await generateEmbedding(content);
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      ...(input.id !== undefined ? { id: input.id } : {}),
      name: stored.name,
      content,
      ...(embedding ? { embedding: toVectorLiteral(embedding) } : {}),
      url: input.url,
      source: input.source,
      status: input.status ?? DEFAULT_RECIPE_STATUS,
      ingredients: groups,
      instructions: instructions ?? [],
      metadata: { schema: stored },
    })
    .select(RECIPE_COLUMNS)
    .single();

  if (error || !data) {
    throw new RecipeRepoError("insert_failed", error?.message ?? "Insert returned no row");
  }
  const row = data as RecipeRowColumns;

  // The recipe row lands first and the ingredient rows follow, so a failure
  // here leaves ids that resolve to nothing — the recipe renders short a few
  // lines rather than not at all, and the next save repairs it. The reverse
  // order would orphan rows nothing can ever reach.
  await insertRecipeIngredientRows(row.id, inserts);

  // Post-response ingredient normalization (see src/lib/normalization/).
  // scheduleNormalization never throws — a normalization problem must not
  // fail the insert that just succeeded.
  if (inserts.length > 0) {
    scheduleNormalization(row.id);
  }
  return hydrate(row, inserts.map((r) => insertedRow(r, row.id)));
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

  const current = hydrate(existing as RecipeRowColumns, await getRecipeIngredients(id));
  const writePatch: Partial<{
    name: string;
    content: string;
    embedding: string;
    url: string;
    source: string;
    status: RecipeStatus;
    ingredients: RecipeIngredientGroup[];
    instructions: SchemaRecipe["recipeInstructions"];
    metadata: { schema: StoredRecipeSchema };
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
  let reconcile: ReturnType<typeof reconcileRecipeIngredients> | null = null;

  if (patch.schema !== undefined) {
    const { stored, instructions, lines } = splitSchema(patch.schema as SchemaRecipe);
    const mergedStored = { ...current.metadata.schema, ...stored };

    if (lines !== undefined) {
      reconcile = reconcileRecipeIngredients(lines, current.ingredientRows);
      writePatch.ingredients = reconcile.groups;
    }
    if (instructions !== undefined) writePatch.instructions = instructions;

    writePatch.metadata = { ...current.metadata, schema: mergedStored };
    // Keep the top-level name in sync when the schema patch touches it —
    // otherwise list/search views keep showing the old value.
    if (stored.name !== undefined) writePatch.name = stored.name;

    // `content` (markdown) and `embedding` are always recomputed from the
    // merged schema on any schema change. Embedding is best-effort: on failure
    // we leave the existing embedding untouched rather than nulling it.
    const content = schemaToMarkdown({
      ...mergedStored,
      recipeIngredient: lines ?? composeRecipeSchema(current).recipeIngredient,
      recipeInstructions: instructions ?? current.instructions,
    });
    writePatch.content = content;
    const embedding = await generateEmbedding(content);
    if (embedding) writePatch.embedding = toVectorLiteral(embedding);
  }

  if (Object.keys(writePatch).length === 0) return current;

  // Ingredient rows are written across four statements, in this order, because
  // PostgREST gives each request exactly one transaction and there is no way to
  // make them atomic. The order is chosen so every partial failure is invisible
  // to readers rather than lossy:
  //
  //   1. insert new rows      — unreferenced until step 3 names them
  //   2. update reworded rows — same rows, new text
  //   3. update the recipe    — THE COMMIT POINT: the group array is the index
  //   4. delete dropped rows  — already unreferenced by step 3
  //
  // Fail before 3 and the extra rows are unreachable; fail after 3 and the
  // dropped rows are orphans. Both are invisible and prunable, and neither
  // loses anything a reader could see. A SQL function taking the whole
  // reconcile is the upgrade path if this ever needs to be atomic.
  if (reconcile) {
    await insertRecipeIngredientRows(id, reconcile.inserts);
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

  if (!reconcile) return hydrate(data as RecipeRowColumns, current.ingredientRows);

  // Step 4. Best-effort like the alias upkeep: the recipe save has already
  // landed and these rows are unreferenced either way, so failing to prune them
  // must not fail the save.
  await deleteRecipeIngredientRows(id, reconcile.deleteIds).catch((err) => {
    console.error(`Failed to prune ingredient rows for ${id}:`, err);
  });

  if (reconcile.lineSetChanged) {
    scheduleNormalization(id);
  }

  const kept = new Set(reconcile.groups.flatMap((group) => group.ingredients));
  const updatedById = new Map(reconcile.updates.map((row) => [row.id, row]));
  return hydrate(data as RecipeRowColumns, [
    ...current.ingredientRows
      .filter((row) => kept.has(row.id))
      .map((row) => updatedById.get(row.id) ?? row),
    ...reconcile.inserts.map((row) => insertedRow(row, id)),
  ]);
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
