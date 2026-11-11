import {
  archiveRecipe,
  createRecipeRow,
  getRecipeById,
  getRecipes,
  RecipeRepoError,
  updateRecipeRow,
} from "@/lib/recipes";
import {
  createIngredientRow,
  deleteIngredientRow,
  getIngredientById,
  IngredientRepoError,
  matchIngredients,
  updateIngredientRow,
  type UpdateIngredientPatch,
} from "@/lib/ingredients";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import { recipeDocument } from "@/lib/recipeDocument";
import {
  nutrientValuesToSchema,
  recipeNormalizedNutrition,
  scalePortionNutritionToPer100g,
} from "@/lib/nutritionMath";
import { fromSchemaOrgIngredients } from "@/lib/recipeIngredients";
import { generateEmbedding } from "@/lib/embedding";
import { exhaustiveKeys } from "@/lib/exhaustive";
import { ingredientEmbeddingText, ingredientQueryText } from "@/lib/ingredientAliases";
import {
  CUSTOM_RECIPE_SOURCE,
  fromSchemaOrgInstructions,
  parseDurationToSeconds,
  recipePageUrl,
  recipeSourceForUrl,
} from "@/lib/format";
import {
  RECIPE_INGREDIENT_ON_UPDATE_ERROR,
  RECIPE_INSTRUCTIONS_ON_UPDATE_ERROR,
  RECIPE_SCALARS_ON_UPDATE_ERROR,
  RECIPE_TIMES_ON_UPDATE_ERROR,
  RECIPE_YIELD_ON_UPDATE_ERROR,
  PROMOTED_UPDATE_ARGS,
  TIME_UPDATE_ARGS,
  URL_ON_UPDATE_ERROR,
} from "./copy";
import { TOOL } from "./toolNames";
import { ARCHIVED_RECIPE_STATUS, recipeUpdateInputSchema } from "@/lib/schemas/recipe";
import { RECIPE_TOKEN_TTL_SECONDS, signRecipeToken } from "./recipeToken";
import { env } from "@/env";
import {
  fetchImageBytes,
  StorageUploadError,
  uploadRecipeImage as uploadImageToStorage,
} from "@/lib/storage";
import type {
  RecipeIngredient,
  RecipeIngredientGroup,
  RecipeRow,
  SchemaOrgNutrition,
  SchemaRecipe,
} from "@/types/recipe";
import type {
  RecipeCreateSimpleInput,
  RecipeCreateDetailedInput,
  RecipeIdInput,
  RecipeImageUploadInput,
  RecipeSearchInput,
  RecipeUpdateInput,
} from "@/lib/schemas/recipe";
import type {
  IngredientCreateToolInput,
  IngredientIdInput,
  IngredientSearchInput,
  IngredientUpdateToolInput,
} from "@/lib/schemas/ingredient";
import type { IngredientMatch, IngredientRow } from "@/types/ingredient";

// Every tool here is a thin wrapper over a repo helper (`@/lib/recipes`,
// `@/lib/ingredients`). They handle argument typing + translate repo errors
// into ToolError so the MCP dispatcher can render a uniform isError content
// envelope. Supabase calls live in the repo modules — see CR feedback on PR #13.

/**
 * A recipe's two urls, named apart.
 *
 * `sourceUrl` is the stored column: the page `/rescrape` re-fetches and the
 * one `source` is derived from. `pageUrl` is the recipe's own page on this
 * instance, derived from its id and settable by nobody. They hold the same
 * value for a recipe authored here, which has no upstream page — which is
 * exactly why one field called `url` cannot say which of the two is meant.
 */
export interface RecipeUrlFields {
  pageUrl: string;
  sourceUrl: string;
}

export type WithNamedUrls<T> = Omit<T, "url"> & RecipeUrlFields;

// Every tool that answers with a recipe answers with both urls, so an agent
// reads one name for one concept whichever tool it called.
function withNamedUrls<T extends { id: string; url: string }>(
  row: T,
): WithNamedUrls<T> {
  const { url, ...rest } = row;
  return {
    ...rest,
    pageUrl: recipePageUrl(row.id, env.MCP_PUBLIC_URL),
    sourceUrl: url,
  };
}

// Trimmed search hit. Search returns enough to identify/disambiguate a recipe
// without shipping the full schema (ingredients, instructions, nutrition, …) for
// every row — agents call get_recipe for the full document once they pick one.
export interface RecipeSearchResultItem extends RecipeUrlFields {
  id: string;
  name: string;
  description?: string;
}

// The trimmed shape rendered into search_recipes' tool description, so the
// documented keys can't drift from the interface above.
export const RECIPE_SEARCH_RESULT_FIELDS = exhaustiveKeys<RecipeSearchResultItem>()([
  "id",
  "pageUrl",
  "sourceUrl",
  "name",
  "description",
]);

export async function searchRecipes(
  args: RecipeSearchInput,
): Promise<{ data: RecipeSearchResultItem[]; count: number }> {
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
  return {
    data: data.map((row) => ({
      id: row.id,
      pageUrl: recipePageUrl(row.id, env.MCP_PUBLIC_URL),
      sourceUrl: row.url,
      name: row.name,
      // The column says null; the wire omits the key, which is what the
      // documented result shape promises and what an agent reads as "none".
      description: row.description ?? undefined,
    })),
    count,
  };
}

// Semantic search over the ingredient catalog: embed the query with the same
// model that embedded the catalog names, then cosine-match via the
// match_ingredients RPC. IngredientMatch already carries everything an agent
// needs (per-100g nutrition + density) — no follow-up fetch tool required.
export async function searchIngredients(
  args: IngredientSearchInput,
): Promise<{ data: IngredientMatch[] }> {
  // ingredientQueryText, not the raw query: catalog vectors are built from
  // lowercased name + aliases, so the query side has to fold case identically
  // or the normalization works against the match instead of for it.
  const embedding = await generateEmbedding(ingredientQueryText(args.query));
  if (!embedding) {
    throw new ToolError(
      "embedding_unavailable",
      "Semantic ingredient search is temporarily unavailable (embedding generation failed) — retry shortly.",
    );
  }

  try {
    return { data: await matchIngredients(args.query, embedding, args.limit) };
  } catch (err) {
    if (err instanceof IngredientRepoError) {
      throw new ToolError("search_failed", err.detail);
    }
    throw err;
  }
}

// Ingredient CRUD — mirrors the session-gated HTTP routes (/api/ingredients,
// /api/ingredients/[id]) so OAuth-authenticated agents can maintain the
// catalog. The embedding is never client-settable: it is derived here from
// name + aliases via ingredientEmbeddingText, exactly like those routes do.
// Deriving it from the bare name instead would still compile and still write a
// row — it would just be embedded differently from every other write path
// (manager UI, USDA import, normalization accretion), so agent-created rows
// would match worse than identical rows made anywhere else.
//
// Nutrition arrives AS MEASURED against `nutrition_basis_g` (agents think in
// "120 kcal per 30 g", not storage units) and is scaled to the per-100g storage
// form here — the same deterministic conversion the manager UI's create form
// does client-side (IngredientCreateForm → scalePortionNutritionToPer100g).
// The basis writes nothing: `food_portions` is the only field that reaches
// that column, on create exactly as on update.

export async function getIngredient(args: IngredientIdInput): Promise<IngredientRow> {
  const row = await getIngredientById(args.id);
  if (!row) throw new ToolError("not_found", `Ingredient ${args.id} not found`);
  return row;
}

export async function createIngredient(
  args: IngredientCreateToolInput,
): Promise<IngredientRow> {
  // The column is NOT NULL (db/migrations/0006) — an embedding-less row can't
  // exist (it would be invisible to matching), so a failed embedding is a
  // retryable error rather than a partial create.
  //
  // A tool-supplied name is canonical as given (unlike a USDA import, which is
  // named by the food's description), but the vector still spans name +
  // aliases — any aliases passed here have to be in the embedded text.
  const embedding = await generateEmbedding(
    ingredientEmbeddingText(args.name, args.aliases ?? []),
  );
  if (!embedding) {
    throw new ToolError(
      "embedding_unavailable",
      "Could not generate an embedding for this ingredient — retry shortly.",
    );
  }

  const { nutrition_basis_g: basis, ...fields } = args;
  const input = { ...fields, embedding };
  if (fields.nutrition && basis) {
    input.nutrition = scalePortionNutritionToPer100g(fields.nutrition, basis);
  }

  try {
    return await createIngredientRow(input);
  } catch (err) {
    throw toIngredientToolError(err, "create_failed");
  }
}

export async function updateIngredient(
  args: IngredientUpdateToolInput,
): Promise<IngredientRow> {
  const { id, nutrition_basis_g: basis, ...fields } = args;
  const patch: UpdateIngredientPatch = { ...fields };
  if (fields.nutrition && basis) {
    patch.nutrition = scalePortionNutritionToPer100g(fields.nutrition, basis);
  }
  // The embedding spans name + aliases (that's what matching searches), so
  // EITHER field moving invalidates it. A one-sided patch needs the other
  // side's current value, hence the read. Best-effort: on null the repo keeps
  // the old vector, which still describes the previous text — re-saving retries.
  if (fields.name !== undefined || fields.aliases !== undefined) {
    const current = await getIngredientById(id);
    if (current) {
      // null (embedding failed) → omit, so the repo keeps the old vector; the
      // column is NOT NULL and can never be cleared. UpdateIngredientPatch's
      // embedding is `number[] | undefined`, so coalesce null away.
      patch.embedding =
        (await generateEmbedding(
          ingredientEmbeddingText(
            fields.name ?? current.name,
            fields.aliases ?? current.aliases,
          ),
        )) ?? undefined;
    }
  }

  try {
    return await updateIngredientRow(id, patch);
  } catch (err) {
    throw toIngredientToolError(err, "update_failed");
  }
}

export async function deleteIngredient(
  args: IngredientIdInput,
): Promise<{ id: string; deleted: true }> {
  try {
    await deleteIngredientRow(args.id);
    // Referencing recipe_ingredients rows keep their parsed data; their
    // ingredient_id nulls out via the FK (see db/migrations/0003).
    return { id: args.id, deleted: true };
  } catch (err) {
    throw toIngredientToolError(err, "delete_failed");
  }
}

/**
 * A row as `get_recipe` publishes it: the stored row, plus the nutrition block
 * in its WIRE form. That block is the one part of the response that is derived
 * rather than stored — resolved nutrients and the `servingSize` denominator
 * they are counted against — so it is the one part typed as Schema.org rather
 * than as the app's own shape.
 */
export type PublishedRecipeRow = Omit<RecipeRow, "metadata"> & {
  metadata: { schema: SchemaRecipe & { nutrition?: SchemaOrgNutrition } };
};

export async function getRecipe(
  args: RecipeIdInput,
): Promise<WithNamedUrls<PublishedRecipeRow>> {
  const row = await getRecipeById(args.id);
  if (!row) throw new ToolError("not_found", `Recipe ${args.id} not found`);

  // Overlay the catalog-derived nutrition — the same ScalableRecipe.nutrition()
  // decision as the UI panel and JSON-LD, so all three agree. When it resolves
  // to nothing (the list isn't fully covered) the row passes through untouched,
  // which means any hand-entered schema.nutrition still on the document is what
  // the agent sees. That is deliberate: get_recipe reports what is STORED, and
  // we kept storing those fields even though nothing reads them back as
  // nutrition any more.
  const schema = row.metadata.schema;
  const scalable = new ScalableRecipe(
    recipeDocument(row),
    undefined,
    recipeNormalizedNutrition(row),
  );
  const resolved = scalable.nutrition();
  if (!resolved) return withNamedUrls(row);

  return withNamedUrls<PublishedRecipeRow>({
    ...row,
    metadata: {
      ...row.metadata,
      schema: {
        ...schema,
        nutrition: {
          "@type": "NutritionInformation",
          // The denominator for the numbers below, derived from the servings
          // columns by the same instance that produced them.
          servingSize: scalable.servingSizeLabel,
          ...nutrientValuesToSchema(resolved),
        },
      },
    },
  });
}

export async function getToken(
  args: RecipeIdInput,
): Promise<{ token: string; recipeId: string; expiresInSeconds: number }> {
  // Mint only for recipes that exist, so the agent gets a clear not_found
  // rather than a token that will 404 at upload time.
  const row = await getRecipeById(args.id);
  if (!row) throw new ToolError("not_found", `Recipe ${args.id} not found`);
  const token = await signRecipeToken(args.id);
  return { token, recipeId: args.id, expiresInSeconds: RECIPE_TOKEN_TTL_SECONDS };
}

// cookingNotes is user-authored in cooking mode and read-only to agents: the
// create/update tools strip it rather than fail, and surface why in the
// response. The dedicated clear_cooking_notes tool is the only agent-writable
// path. See .claude/docs/cooking-mode.md "Cooking Notes".
const COOKING_NOTES_IGNORED_WARNING =
  `cookingNotes is read-only for agents and was ignored — it is authored by users in cooking mode. Use the ${TOOL.clear_cooking_notes} tool when explicitly asked to clear it.`;

export type RecipeRowWithWarnings = RecipeRow & { warnings?: string[] };

export type CreatedRecipeRow = WithNamedUrls<RecipeRowWithWarnings>;

export async function createRecipeDetailed(
  args: RecipeCreateDetailedInput,
): Promise<CreatedRecipeRow> {
  // The inbound Schema.org edge: scrapes arrive with `recipeIngredient` and
  // `recipeInstructions`, which become groups here and never reach the stored
  // schema.
  const { cookingNotes, recipeIngredient, recipeInstructions, ...schema } = args.schema;
  const id = crypto.randomUUID();
  // Default to the recipe's own canonical page on this instance.
  // MCP_PUBLIC_URL is the app's base-URL source of truth (also the OAuth /
  // recipe-token issuer), and is overridden per-PR on staging.
  const url = args.url ?? recipePageUrl(id, env.MCP_PUBLIC_URL);
  // Same condition, second half: a recipe with no url of its own is authored
  // here, which is what CUSTOM_RECIPE_SOURCE means. (The input schema requires
  // an explicit source whenever a url IS given, so this only fires for the
  // authored-here case.) `source` is how the UI knows there is no upstream page
  // to re-scrape — see isOwnRecipe.
  const source = args.source ?? CUSTOM_RECIPE_SOURCE;
  try {
    const row = await createRecipeRow({
      id,
      url,
      source,
      status: args.status,
      schema,
      ingredients: fromSchemaOrgIngredients(recipeIngredient ?? []),
      instructions: fromSchemaOrgInstructions(recipeInstructions),
    });
    const answer = withNamedUrls(row);
    return cookingNotes !== undefined
      ? { ...answer, warnings: [COOKING_NOTES_IGNORED_WARNING] }
      : answer;
  } catch (err) {
    throw toToolError(err, "create_failed");
  }
}

/**
 * The `url` answered is the recipe's page on this instance, not the `url`
 * stored on the row: an upstream page given here stays in the column, because
 * that column is the page `/rescrape` re-fetches and the one `source` is
 * derived from.
 *
 * `createRecipeRow` schedules the normalization run that matches the lines to
 * the catalog, and nothing here awaits it, so the response cannot report what
 * matched.
 */
export async function createRecipeSimple(
  args: RecipeCreateSimpleInput,
): Promise<{ created: true; id: string; url: string }> {
  const { url: upstreamUrl, recipeIngredient, recipeInstructions, ...schema } = args;
  const id = crypto.randomUUID();
  const url = upstreamUrl ?? recipePageUrl(id, env.MCP_PUBLIC_URL);
  try {
    const row = await createRecipeRow({
      id,
      url,
      // The url's host, or CUSTOM_RECIPE_SOURCE when there is no upstream page.
      source: recipeSourceForUrl(upstreamUrl, env.MCP_PUBLIC_URL),
      // No status, so the repo's default applies: nothing arriving this way has
      // had a human eye on it yet.
      schema,
      ingredients: fromSchemaOrgIngredients(recipeIngredient ?? []),
      instructions: fromSchemaOrgInstructions(recipeInstructions),
    });
    return { created: true, id: row.id, url: recipePageUrl(row.id, env.MCP_PUBLIC_URL) };
  } catch (err) {
    throw toToolError(err, "create_failed");
  }
}

/**
 * One ingredient line as an update answers with it: the line and its parse,
 * and nothing about which catalog ingredient it resolves to.
 *
 * `Omit` rather than a hand-written field list so that adding a column to
 * `RecipeIngredientRow` is a compile error in `withoutMatches` below, where
 * someone has to decide whether an update may report it.
 */
export type UnmatchedRecipeLine = Omit<
  RecipeIngredient,
  "ingredient_id" | "match_status" | "confidence" | "ingredient"
>;

export type UnmatchedIngredientGroup = Omit<RecipeIngredientGroup, "ingredients"> & {
  ingredients: UnmatchedRecipeLine[];
};

export type UpdatedRecipeRow = WithNamedUrls<
  Omit<RecipeRowWithWarnings, "ingredients"> & {
    ingredients: UnmatchedIngredientGroup[];
  }
>;

/**
 * Strip every line's catalog match out of an ingredient list.
 *
 * An update that reworded a line hands that row to the matcher, so the match
 * on it answers for different words and a run is already on its way to
 * replace it. Reporting it would hand an agent a value that is wrong by the
 * time it reads it, and the agent cannot tell which lines those are. A match
 * is read from `get_recipe`, once it has settled.
 */
function withoutMatches(
  groups: readonly RecipeIngredientGroup[],
): UnmatchedIngredientGroup[] {
  return groups.map((group) => ({
    ...group,
    ingredients: group.ingredients.map((line) => ({
      id: line.id,
      raw_text: line.raw_text,
      quantity: line.quantity,
      unit: line.unit,
      name_text: line.name_text,
      note: line.note,
      estimated_grams: line.estimated_grams,
      grams_source: line.grams_source,
    })),
  }));
}

/**
 * Parse an update's arguments, failing loudly on a bare `url`.
 *
 * Separate from the zod schema because the schema is a plain object: it
 * strips keys it does not declare, so the only place a stray `url` is still
 * visible is before the parse.
 */
export function parseRecipeUpdateArgs(args: unknown): RecipeUpdateInput {
  if (typeof args === "object" && args !== null && "url" in args) {
    throw new ToolError("invalid_input", URL_ON_UPDATE_ERROR);
  }
  return recipeUpdateInputSchema.parse(args);
}

export async function updateRecipe(
  args: RecipeUpdateInput,
): Promise<UpdatedRecipeRow> {
  const { cookingNotes, ...schema } = args.schema ?? {};
  // The zod schema is passthrough, so without these checks a dead key sails
  // into the merge and is silently stripped — a loud failure teaches the agent
  // the shape to use.
  if ("recipeIngredient" in schema) {
    throw new ToolError("invalid_input", RECIPE_INGREDIENT_ON_UPDATE_ERROR);
  }
  if ("recipeInstructions" in schema) {
    throw new ToolError("invalid_input", RECIPE_INSTRUCTIONS_ON_UPDATE_ERROR);
  }
  if ("recipeYield" in schema) {
    throw new ToolError("invalid_input", RECIPE_YIELD_ON_UPDATE_ERROR);
  }
  // Same rule for the scalars 0028 promoted: rejected rather than stripped,
  // because a silently dropped rename looks to the agent like a rename.
  for (const key of Object.keys(PROMOTED_UPDATE_ARGS)) {
    if (key in schema) {
      throw new ToolError("invalid_input", RECIPE_SCALARS_ON_UPDATE_ERROR);
    }
  }
  // And for the times, which left the blob last. A `schema.cookTime` that was
  // quietly stripped would read to the agent as a cook time it had set.
  for (const key of Object.keys(TIME_UPDATE_ARGS)) {
    if (key in schema) {
      throw new ToolError("invalid_input", RECIPE_TIMES_ON_UPDATE_ERROR);
    }
  }
  // ISO 8601 in, seconds out — reduced once, here, because the columns hold
  // seconds and `RecipeUpdateInput` is the agent-facing contract, which reads
  // in the units its JSON Schema advertises. `undefined` has to survive as
  // absent: it means "leave this time alone", where null is a clear. zod has
  // already refused anything `parseDurationToSeconds` would answer null to for
  // a reason other than being a well-formed zero.
  const times =
    args.times &&
    Object.fromEntries(
      Object.entries(args.times).map(([arg, iso]) => [
        arg,
        iso === undefined ? undefined : parseDurationToSeconds(iso),
      ]),
    );
  try {
    const row = await updateRecipeRow(args.id, {
      url: args.sourceUrl,
      source: args.source,
      status: args.status,
      name: args.name,
      description: args.description,
      notes: args.notes,
      image: args.image,
      schema: args.schema !== undefined ? schema : undefined,
      ingredients: args.ingredients,
      instructions: args.instructions,
      servings: args.servings,
      totalWeight: args.total_weight,
      times,
    });
    const answer = withNamedUrls({
      ...row,
      ingredients: withoutMatches(row.ingredients),
    });
    return cookingNotes !== undefined
      ? { ...answer, warnings: [COOKING_NOTES_IGNORED_WARNING] }
      : answer;
  } catch (err) {
    throw toToolError(err, "update_failed");
  }
}

// The only agent-writable path for cookingNotes. Sets it to empty string;
// used when the user explicitly asks to clear notes (e.g. after applying them).
export async function clearCookingNotes(args: RecipeIdInput): Promise<RecipeRow> {
  try {
    return await updateRecipeRow(args.id, { cookingNotes: null });
  } catch (err) {
    throw toToolError(err, "update_failed");
  }
}

export async function deleteRecipe(
  args: RecipeIdInput,
): Promise<{ id: string; status: typeof ARCHIVED_RECIPE_STATUS }> {
  try {
    await archiveRecipe(args.id);
    return { id: args.id, status: ARCHIVED_RECIPE_STATUS };
  } catch (err) {
    throw toToolError(err, "delete_failed");
  }
}

export async function uploadRecipeImage(
  args: RecipeImageUploadInput,
): Promise<RecipeRow> {
  let bytes: Buffer;
  let contentType: string;

  try {
    const fetched = await fetchImageBytes(args.imageUrl);
    bytes = fetched.bytes;
    contentType = fetched.contentType;
  } catch (err) {
    if (err instanceof StorageUploadError) {
      throw new ToolError(err.kind, err.detail);
    }
    throw new ToolError(
      "fetch_failed",
      err instanceof Error ? err.message : "Failed to fetch image",
    );
  }

  let imageUrl: string;
  try {
    imageUrl = await uploadImageToStorage(args.id, bytes, contentType);
  } catch (err) {
    if (err instanceof StorageUploadError) {
      throw new ToolError(err.kind, err.detail);
    }
    throw new ToolError("upload_failed", err instanceof Error ? err.message : "Upload failed");
  }
  try {
    return await updateRecipeRow(args.id, { image: imageUrl });
  } catch (err) {
    throw toToolError(err, "update_failed");
  }
}

function toIngredientToolError(err: unknown, fallbackCode: string): ToolError {
  if (err instanceof IngredientRepoError) {
    if (err.kind === "not_found") return new ToolError("not_found", err.detail);
    if (err.kind === "conflict") {
      // Two unique indexes raise this: lower(name), and fdc_id
      // (db/migrations/0011). Naming only the first sends an agent into a
      // rename loop against what is really an already-imported USDA record —
      // so state both causes and the move that resolves either.
      return new ToolError(
        "conflict",
        `${err.detail} — a row already exists with that name (unique case-insensitively) or that fdc_id. Do NOT retry with a varied name: search_ingredients to find the existing row, then update_ingredient it.`,
      );
    }
    return new ToolError(fallbackCode, err.detail);
  }
  if (err instanceof Error) return new ToolError(fallbackCode, err.message);
  return new ToolError(fallbackCode, "Unknown error");
}

function toToolError(err: unknown, fallbackCode: string): ToolError {
  if (err instanceof RecipeRepoError) {
    // `not_found` from the repo always maps cleanly; insert/update_failed
    // surface with the caller's fallback code so the MCP response makes sense.
    const code = err.kind === "not_found" ? "not_found" : fallbackCode;
    return new ToolError(code, err.detail);
  }
  if (err instanceof Error) return new ToolError(fallbackCode, err.message);
  return new ToolError(fallbackCode, "Unknown error");
}

export class ToolError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ToolError";
  }
}
