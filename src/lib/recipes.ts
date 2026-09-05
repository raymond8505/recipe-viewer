import { getSupabaseClient, selectColumns, toVectorLiteral } from "./supabase";
import { getFeatures } from "./features";
import {
  isoToMinutes,
  minutesToIso,
  normalizeRecipeInstructions,
  schemaToMarkdown,
} from "./format";
import { generateEmbedding } from "./embedding";
import { lineId, lineSetChanged, withLineIds } from "./ingredientLines";
import { ingredientFingerprint } from "./normalization/fingerprint";
import { syncRecipeIngredientText } from "./normalization/syncLines";
import { scheduleNormalization } from "./normalization/trigger";
import {
  ARCHIVED_RECIPE_STATUS,
  DEFAULT_RECIPE_STATUS,
  PUBLISHED_RECIPE_STATUS,
  RECIPE_STATUSES,
} from "./schemas/recipe";
import type {
  RecipeIngredient,
  RecipeRow,
  RecipesResult,
  SchemaRecipe,
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
// are not on RecipeRow — selectColumns rejects them here at compile time.
const RECIPE_COLUMNS = selectColumns<RecipeRow>()([
  "id",
  "url",
  "source",
  "status",
  "prep_time",
  "cook_time",
  "total_time",
  "metadata",
]);

// ---------------------------------------------------------------------------
// The time hydrate/extract seam.
//
// 0019 made `prep_time`/`cook_time`/`total_time` the source of truth for a
// recipe's times; the copies still sitting in `metadata.schema` are dead
// artifacts of the old shape. This pair is the ONLY code that knows that —
// hydrateTimes runs at every read exit below and stripTimes at every write, so
// everything above this module (JSON-LD, schemaToMarkdown, the MCP tools,
// RecipeCard, RecipeDetail, CookingMode) goes on speaking SchemaRecipe and
// never observes the stale value.
//
// The corollary is the thing to protect: a reader that queries `recipes`
// without coming through here gets a pre-0019 answer, silently.
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
function hydrateTimes(row: RecipeRow): RecipeRow {
  const schema = row.metadata?.schema;
  if (!schema) return row;
  for (const [key, column] of TIME_FIELDS) {
    const iso = minutesToIso(row[column]);
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

  return {
    data: ((data as RecipeRow[]) ?? []).map(hydrateTimes),
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

  const row = hydrateTimes(data as RecipeRow);
  const raw = row.metadata?.schema?.recipeInstructions;
  if (raw !== undefined && !Array.isArray(raw)) {
    row.metadata.schema.recipeInstructions = normalizeRecipeInstructions(raw as unknown);
  }
  return row;
}

// Insert a new recipe row. Defaults status to DEFAULT_RECIPE_STATUS if not
// provided.
// Throws RecipeRepoError("insert_failed") on Supabase failure. Derives the
// `content` and `embedding` columns from the schema — see the "Derived content
// + embedding columns" note in .claude/docs/supabase-data-layer.md.
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
  // Markdown (and therefore the embedding) is built from the times-bearing
  // schema — the columns are where they LAND, not a reason for the searchable
  // text to stop mentioning them.
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
      status: input.status ?? DEFAULT_RECIPE_STATUS,
      prep_time: isoToMinutes(schema.prepTime),
      cook_time: isoToMinutes(schema.cookTime),
      total_time: isoToMinutes(schema.totalTime),
      metadata: { schema: stripTimes(schema) },
    })
    .select(RECIPE_COLUMNS)
    .single();

  if (error || !data) {
    throw new RecipeRepoError("insert_failed", error?.message ?? "Insert returned no row");
  }
  const row = hydrateTimes(data as RecipeRow);
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

  // Hydrated before the merge below, so `current.metadata.schema` carries the
  // times the COLUMNS hold. That is what makes the three-way patch semantics
  // fall out of the plain schema spread: an absent key inherits the column's
  // current value, an explicit null clears it, an ISO string sets it.
  const current = hydrateTimes(existing as RecipeRow);
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
      const before = current.metadata.schema.recipeIngredient ?? [];
      const after = mergedSchema.recipeIngredient ?? [];
      shouldNormalize = lineSetChanged(before, after);
      // Text moved but the line set didn't: re-parse the surviving rows in
      // place so quantities and totals track the edit, association untouched.
      //
      // The second half is the legacy case. `withLineIds` just minted ids for
      // lines that had none, and those ids have to reach the rows or the next
      // read joins by an id nothing carries. Sync stamps them, and it has to
      // run whether or not the text also moved.
      const minted = before.some((line) => lineId(line) == null);
      if (
        !shouldNormalize &&
        (minted ||
          ingredientFingerprint(current.metadata.schema) !==
            ingredientFingerprint(mergedSchema))
      ) {
        syncLines = after;
      }
    }
    // The blob is written WITHOUT times; the columns carry them. `mergedSchema`
    // itself keeps them, because schemaToMarkdown below still has to see them.
    writePatch.metadata = { ...current.metadata, schema: stripTimes(mergedSchema) };
    writePatch.prep_time = isoToMinutes(mergedSchema.prepTime);
    writePatch.cook_time = isoToMinutes(mergedSchema.cookTime);
    writePatch.total_time = isoToMinutes(mergedSchema.totalTime);
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
  return hydrateTimes(data as RecipeRow);
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
