import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { generateEmbedding } from "@/lib/embedding";
import { generateStructured } from "@/lib/gemini";
import { getIngredientText } from "@/lib/format";
import {
  IngredientRepoError,
  getIngredientsByIds,
  getRecipeIngredients,
  matchIngredients,
  replaceRecipeIngredients,
  setRecipeNormalization,
  type RecipeIngredientInsert,
} from "@/lib/ingredients";
import { importUsdaIngredient } from "@/lib/ingredientImport";
import {
  accreteAliasesFromLines,
  ingredientQueryText,
} from "@/lib/ingredientAliases";
import { explicitWeightGrams, gramsForLine } from "@/lib/nutritionMath";
import { getRecipeById } from "@/lib/recipes";
import { parseIngredient, unitKeyForAlias } from "@/lib/units";
import { UsdaError, searchFoods } from "@/lib/usda";
import type { GramsSource, IngredientMatch, MatchStatus } from "@/types/ingredient";
import { estimateLineGrams } from "./estimateGrams";
import { ingredientFingerprint } from "./fingerprint";
import { parseLineDeterministic, type ParsedLine } from "./parseLine";
import { composeRecipeSchema } from "@/lib/recipeSchema";

export type { ParsedLine };

// The ingredient-normalization workflow: parse the recipe's ingredient lines
// (Flash-Lite structured output, deterministic parseIngredient fallback),
// match each parsed name against the catalog (embedding + pgvector shortlist,
// Flash-Lite adjudicating the ambiguous band), create novel ingredients from
// USDA FoodData Central, and persist the recipe_ingredients rows.
//
// Failure philosophy (matches the trigger's never-fail-a-save contract):
// - Gemini failures degrade: parse falls back to the deterministic parser;
//   failed adjudication leaves lines unmatched.
// - USDA failures leave the affected lines unmatched (retryable via
//   POST /api/recipes/[id]/normalize) but the run still completes.
// - matchIngredients failures ABORT the run ("failed" status): treating a
//   broken RPC as "no matches" would misclassify every line as novel and mint
//   duplicate catalog rows.

// Cosine-similarity thresholds on the pgvector shortlist. Deliberately
// exported constants: they are guesses until the backfill provides real
// match-quality data — tune here, nowhere else.
export const SIM_AUTO_ACCEPT = 0.85;
export const SIM_NOVEL_FLOOR = 0.6;

export interface LineMatch {
  position: number;
  // "ambiguous" is graph-internal (persist writes it as "unmatched"): it means
  // adjudication was needed but produced no verdict.
  status: "matched" | "novel" | "unmatched" | "ambiguous";
  ingredientId?: string;
  confidence?: number;
  candidates?: IngredientMatch[];
}

// A resolved gram weight plus where it came from. Kept together because the
// two are only meaningful as a pair — grams_source is non-null exactly when
// estimated_grams is.
interface LineEstimate {
  grams: number;
  source: GramsSource;
}

const NormalizationState = Annotation.Root({
  recipeId: Annotation<string>,
  fingerprint: Annotation<string>,
  rawLines: Annotation<string[]>,
  // Stable schema-line id per position (null for legacy lines that predate
  // them). This is what a persisted row keys on, so it — not raw_text, not
  // position — decides which prior row a line inherits from.
  lineIds: Annotation<Array<string | null>>,
  parsed: Annotation<ParsedLine[]>,
  matches: Annotation<LineMatch[]>,
  // position → resolved gram weight for lines the density path can't convert
  // (see the estimate node, which always runs before persist). Persisted as
  // estimated_grams / grams_source — the source travels WITH the value so a
  // carried user-typed weight isn't written back as an LLM estimate.
  estimates: Annotation<Record<number, LineEstimate>>,
  errors: Annotation<string[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});

type State = typeof NormalizationState.State;

// ── parse ────────────────────────────────────────────────────────────────────

const PARSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      quantity: { type: "number", nullable: true },
      unit: { type: "string", nullable: true },
      name: { type: "string" },
      note: { type: "string", nullable: true },
    },
    required: ["quantity", "unit", "name", "note"],
  },
};

interface LlmParsedLine {
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
}

function parsePrompt(lines: string[]): string {
  const numbered = lines.map((line, i) => `${i + 1}. ${line}`).join("\n");
  return [
    "Parse each recipe ingredient line into structured parts.",
    "",
    "For every line extract:",
    '- quantity: the amount as a number (convert fractions: "1 1/2" → 1.5; use the midpoint of ranges: "2-3" → 2.5). null if the line has no amount.',
    '- unit: the measurement unit word as written (e.g. "tsp", "tablespoons", "cups", "g"). null when there is no unit (e.g. "2 eggs").',
    '- name: the ingredient itself in lowercase, without quantity, unit, or preparation text (e.g. "all-purpose flour", "yellow onion").',
    '- note: preparation/qualifier text (e.g. "finely chopped", "divided"). null if none.',
    "",
    `Return exactly ${lines.length} items, in the same order as the lines.`,
    "",
    "Lines:",
    numbered,
  ].join("\n");
}

async function parseLines(state: State): Promise<Partial<State>> {
  const llm = await generateStructured<LlmParsedLine[]>({
    prompt: parsePrompt(state.rawLines),
    responseSchema: PARSE_SCHEMA,
  });

  // A count mismatch would misalign lines with parses — fall back wholesale
  // rather than guess at alignment.
  if (!Array.isArray(llm) || llm.length !== state.rawLines.length) {
    return {
      parsed: state.rawLines.map(parseLineDeterministic),
      errors: llm === null ? ["LLM parse unavailable — used deterministic parser"] : ["LLM parse count mismatch — used deterministic parser"],
    };
  }

  const parsed = state.rawLines.map((rawText, i) => {
    const item = llm[i];
    const name = typeof item?.name === "string" ? item.name.trim().toLowerCase() : "";
    if (!name) return parseLineDeterministic(rawText, i);
    return {
      position: i,
      rawText,
      quantity: typeof item.quantity === "number" ? item.quantity : null,
      // Canonicalize whatever unit word the LLM returned ("tablespoons" →
      // "tbsp"); unknown units become null rather than polluting the column.
      unit: item.unit ? unitKeyForAlias(item.unit) : null,
      name,
      note: item.note ? item.note.trim() : null,
    };
  });

  return { parsed };
}

// ── match ────────────────────────────────────────────────────────────────────

async function embedAndMatch(state: State): Promise<Partial<State>> {
  const errors: string[] = [];
  const uniqueNames = [...new Set(state.parsed.map((line) => line.name))];

  // ingredientQueryText, not the bare name: catalog vectors are built from
  // lowercased name + aliases, and both sides of a cosine comparison have to
  // fold case the same way or the normalization makes matching worse.
  const embeddings = new Map<string, number[] | null>();
  await Promise.all(
    uniqueNames.map(async (name) => {
      embeddings.set(name, await generateEmbedding(ingredientQueryText(name)));
    }),
  );

  const candidatesByName = new Map<string, IngredientMatch[]>();
  for (const name of uniqueNames) {
    const embedding = embeddings.get(name);
    if (!embedding) {
      errors.push(`embedding unavailable for "${name}"`);
      continue;
    }
    // IngredientRepoError("match_failed") propagates — see failure philosophy.
    candidatesByName.set(name, await matchIngredients(name, embedding, 5));
  }

  const matches: LineMatch[] = state.parsed.map((line) => {
    if (!embeddings.get(line.name)) {
      return { position: line.position, status: "unmatched" };
    }
    const candidates = candidatesByName.get(line.name) ?? [];
    const top = candidates[0];
    if (top && top.semantic_similarity >= SIM_AUTO_ACCEPT) {
      return {
        position: line.position,
        status: "matched",
        ingredientId: top.id,
        confidence: top.semantic_similarity,
      };
    }
    if (!top || top.semantic_similarity < SIM_NOVEL_FLOOR) {
      return { position: line.position, status: "novel" };
    }
    return { position: line.position, status: "ambiguous", candidates };
  });

  return { matches, errors };
}

// ── adjudicate ───────────────────────────────────────────────────────────────

const ADJUDICATE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      position: { type: "integer" },
      choice: {
        type: "string",
        description: 'The chosen candidate id, or "novel" if none is the same ingredient.',
      },
    },
    required: ["position", "choice"],
  },
};

function adjudicatePrompt(
  items: Array<{ position: number; name: string; candidates: IngredientMatch[] }>,
): string {
  const blocks = items
    .map(
      (item) =>
        `position ${item.position}: "${item.name}"\n` +
        item.candidates
          .map((c) => `  - id: ${c.id} | name: "${c.name}" | similarity: ${c.semantic_similarity.toFixed(3)}`)
          .join("\n"),
    )
    .join("\n\n");
  return [
    "You maintain a canonical ingredient catalog. For each recipe ingredient below, decide whether it IS one of the listed catalog candidates (the same ingredient — form and preparation matter: ground cumin is not cumin seed) or a genuinely different ingredient.",
    "",
    'For each position return the matching candidate id, or "novel" if no candidate is the same ingredient.',
    "",
    blocks,
  ].join("\n");
}

async function adjudicate(state: State): Promise<Partial<State>> {
  const parsedByPosition = new Map(state.parsed.map((line) => [line.position, line]));
  const ambiguous = state.matches.filter((m) => m.status === "ambiguous");
  const items = ambiguous.map((m) => ({
    position: m.position,
    name: parsedByPosition.get(m.position)?.name ?? "",
    candidates: m.candidates ?? [],
  }));

  const verdicts = await generateStructured<Array<{ position: number; choice: string }>>({
    prompt: adjudicatePrompt(items),
    responseSchema: ADJUDICATE_SCHEMA,
  });

  const errors: string[] = [];
  if (verdicts === null) {
    // Leave the lines "ambiguous"; persist writes them as unmatched. Novel
    // creation from an unverified guess is worse than no association.
    errors.push("adjudication unavailable — ambiguous lines left unmatched");
    return { errors };
  }

  const verdictByPosition = new Map(verdicts.map((v) => [v.position, v.choice]));
  const matches: LineMatch[] = state.matches.map((match) => {
    if (match.status !== "ambiguous") return match;
    const choice = verdictByPosition.get(match.position);
    if (choice === "novel") return { position: match.position, status: "novel" };
    const candidate = match.candidates?.find((c) => c.id === choice);
    if (candidate) {
      return {
        position: match.position,
        status: "matched",
        ingredientId: candidate.id,
        confidence: candidate.semantic_similarity,
      };
    }
    errors.push(`adjudication returned no usable verdict for position ${match.position}`);
    return match; // stays ambiguous → persisted as unmatched
  });

  return { matches, errors };
}

// ── fetch novel ──────────────────────────────────────────────────────────────

const PICK_SCHEMA = {
  type: "object",
  properties: {
    fdcId: {
      type: "integer",
      nullable: true,
      description: "The best-matching food's fdcId, or null if none is the same ingredient.",
    },
  },
  required: ["fdcId"],
};

function pickPrompt(name: string, foods: Array<{ fdcId: number; description: string }>): string {
  return [
    `Which USDA food is the ingredient "${name}"? Prefer the raw/plain form over prepared or branded variants. Return null if none of them is the same ingredient.`,
    "",
    ...foods.map((f) => `- fdcId ${f.fdcId}: ${f.description}`),
  ].join("\n");
}

// Resolve one catalog ingredient from USDA. Returns the new — or, when this
// food is already cataloged, existing — ingredient id, or null when USDA has
// nothing usable (the line stays unmatched). The food → catalog-row conversion
// lives in importUsdaIngredient (shared with the NutritionDetail manual
// import); this wrapper owns the automated parts: analytical-only search +
// LLM pick.
async function createFromUsda(name: string, errors: string[]): Promise<string | null> {
  const foods = await searchFoods(name);
  if (foods.length === 0) {
    errors.push(`USDA: no results for "${name}"`);
    return null;
  }

  const pick = await generateStructured<{ fdcId: number | null }>({
    prompt: pickPrompt(name, foods),
    responseSchema: PICK_SCHEMA,
  });
  if (pick && pick.fdcId === null) {
    errors.push(`USDA: no appropriate match for "${name}"`);
    return null;
  }
  // LLM unavailable or hallucinated an id → fall back to FDC's top-scored hit.
  const fdcId =
    pick?.fdcId && foods.some((f) => f.fdcId === pick.fdcId) ? pick.fdcId : foods[0].fdcId;

  try {
    const row = await importUsdaIngredient(name, fdcId);
    if (!row) {
      // The embedding column is NOT NULL (db/migrations/0006), so a row can't
      // be created without one. Skip rather than abort the run — the line
      // persists as unmatched and re-normalizing once embedding is back picks
      // it up.
      errors.push(`embedding unavailable for new ingredient "${name}" — skipped (retry once embedding is available)`);
      return null;
    }
    return row.id;
  } catch (err) {
    if (err instanceof IngredientRepoError && err.kind === "conflict") {
      // importUsdaIngredient already tried to resolve the race to the
      // winner's row; a conflict surfacing here means no such row was found.
      errors.push(`conflict creating "${name}" but no existing row found`);
      return null;
    }
    throw err;
  }
}

async function fetchNovel(state: State): Promise<Partial<State>> {
  const errors: string[] = [];
  const parsedByPosition = new Map(state.parsed.map((line) => [line.position, line]));
  const novelNames = [
    ...new Set(
      state.matches
        .filter((m) => m.status === "novel")
        .map((m) => parsedByPosition.get(m.position)?.name ?? "")
        .filter(Boolean),
    ),
  ];

  // Sequential on purpose: novel counts are small and this is the only code
  // path that spends USDA rate budget (1,000 req/hr).
  const idByName = new Map<string, string | null>();
  for (const name of novelNames) {
    try {
      idByName.set(name, await createFromUsda(name, errors));
    } catch (err) {
      if (err instanceof UsdaError) {
        errors.push(`USDA error for "${name}": ${err.message}`);
        idByName.set(name, null);
      } else {
        throw err;
      }
    }
  }

  const matches: LineMatch[] = state.matches.map((match) => {
    if (match.status !== "novel") return match;
    const name = parsedByPosition.get(match.position)?.name ?? "";
    const ingredientId = idByName.get(name);
    if (!ingredientId) return { position: match.position, status: "unmatched" };
    return { position: match.position, status: "novel", ingredientId };
  });

  return { matches, errors };
}

// ── estimate ─────────────────────────────────────────────────────────────────

// Fill a gram weight for matched lines the density path can't convert: a volume
// unit whose ingredient has no density, or a count/can line. Prior estimates
// are carried forward by raw_text (unchanged text = unchanged amount) so
// re-normalizing never re-spends LLM budget on unchanged lines and never wipes
// a user's manual value. Only genuinely grams-less lines with no carried value
// hit the LLM. Best-effort: a failed estimate simply leaves the line excluded.
async function estimate(state: State): Promise<Partial<State>> {
  const existing = await getRecipeIngredients(state.recipeId);
  const priorById = new Map(existing.map((row) => [row.id, row]));

  // Carry a stored weight forward when the AMOUNT it was measured against
  // hasn't moved. That condition used to be approximated by "raw_text is
  // byte-identical", which was both too strict (a typo fix dropped a perfectly
  // good weight) and beside the point. quantity+unit is the thing that
  // actually invalidates a gram weight — the same rule the reconcile applies.
  //
  // The SOURCE travels with the value: a user-typed weight and an LLM guess
  // are not interchangeable (the UI marks one "est."), so re-labelling a
  // carried value would quietly destroy the distinction. `?? "llm"` only
  // covers legacy rows — grams_source is non-null exactly when
  // estimated_grams is.
  const carriedFor = (line: ParsedLine): LineEstimate | undefined => {
    const id = state.lineIds[line.position] ?? null;
    const prior = id != null ? priorById.get(id) : undefined;
    if (!prior || prior.estimated_grams == null) return undefined;
    if (prior.quantity !== line.quantity || prior.unit !== line.unit) return undefined;
    return { grams: prior.estimated_grams, source: prior.grams_source ?? "llm" };
  };

  const matchByPosition = new Map(state.matches.map((m) => [m.position, m]));
  const matchedIds = [
    ...new Set(
      state.matches
        .map((m) => m.ingredientId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const ingredients = await getIngredientsByIds(matchedIds);
  const densityById = new Map(
    ingredients.map((ing) => [ing.id, ing.density_g_per_ml]),
  );

  const estimates: Record<number, LineEstimate> = {};
  await Promise.all(
    state.parsed.map(async (line) => {
      const carried = carriedFor(line);
      if (carried != null) {
        estimates[line.position] = carried;
        return;
      }
      const match = matchByPosition.get(line.position);
      if (!match?.ingredientId) return;
      const derivable =
        gramsForLine(line.quantity, line.unit, densityById.get(match.ingredientId) ?? null) != null ||
        explicitWeightGrams(line.rawText) != null;
      if (derivable) return;
      const grams = await estimateLineGrams({
        rawText: line.rawText,
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
      });
      if (grams != null) estimates[line.position] = { grams, source: "llm" };
    }),
  );

  return { estimates };
}

// ── persist ──────────────────────────────────────────────────────────────────

async function persist(state: State): Promise<Partial<State>> {
  const recipe = await getRecipeById(state.recipeId);
  if (!recipe) return {};

  // A newer save changed the ingredient text while this run was in flight; its
  // own trigger owns the result. Writing ours would clobber it with stale data.
  if (ingredientFingerprint(composeRecipeSchema(recipe)) !== state.fingerprint) {
    console.warn(`Normalization for ${state.recipeId} superseded mid-run — skipping persist`);
    return {};
  }

  // Normalization GUESSES an association for a line that hasn't got one. A
  // line that already has one — however it got there — is not a question this
  // run is entitled to re-answer: the user may have picked it deliberately,
  // and there is no signal here that would justify overruling them. So an
  // existing association always survives, and the matcher's opinion is used
  // only to fill gaps.
  //
  // Inheritance is by the row's own id (db/migrations/0016). It used to be by
  // raw_text, which meant fixing a typo silently orphaned the row and threw
  // the curation away; then by a synthetic line_id, which 0016 made redundant
  // by pointing recipes.ingredients straight at these rows.
  const existingRows = await getRecipeIngredients(state.recipeId);
  const priorById = new Map(existingRows.map((row) => [row.id, row]));

  const matchByPosition = new Map(state.matches.map((m) => [m.position, m]));
  const rows: RecipeIngredientInsert[] = state.parsed.map((line) => {
    const id = state.lineIds[line.position] ?? null;
    const prior = id != null ? priorById.get(id) : undefined;

    // The estimate node carries prior values forward and only adds new ones
    // for grams-less lines, so this covers both. Its `source` rides along:
    // writing a flat "llm" here would re-label every carried user-entered
    // weight as a machine guess.
    const estimate = state.estimates[line.position] ?? null;
    const parseFields = {
      // The recipes.ingredients group array already names this row, so the id
      // is not ours to invent — reuse it, or let the column default mint one
      // for a line the reconcile has not seen (which cannot normally happen).
      ...(id != null ? { id } : {}),
      raw_text: line.rawText,
      quantity: line.quantity,
      unit: line.unit,
      name_text: line.name,
      note: line.note,
      estimated_grams: estimate?.grams ?? null,
      grams_source: estimate?.source ?? null,
    };

    if (prior?.ingredient_id != null) {
      return {
        ...parseFields,
        ingredient_id: prior.ingredient_id,
        match_status: prior.match_status,
        confidence: prior.confidence,
      };
    }

    const match = matchByPosition.get(line.position);
    const status: MatchStatus =
      !match || match.status === "ambiguous" ? "unmatched" : match.status;
    return {
      ...parseFields,
      ingredient_id: match?.ingredientId ?? null,
      match_status: status,
      confidence: match?.confidence ?? null,
    };
  });

  await replaceRecipeIngredients(state.recipeId, rows);

  // Teach the catalog the recipe language these lines actually used. This is
  // the single accretion point for the whole workflow — it covers auto-accepted
  // matches, LLM adjudications, novel rows just minted from USDA, and manual
  // associations carried forward — which is why fetchNovel has no hook of its
  // own. Batched per ingredient, and after the rows land: the catalog should
  // only learn from associations that were actually persisted (in particular,
  // never from a run the supersede guard above rejected).
  await accreteAliasesFromLines(rows);

  await setRecipeNormalization(state.recipeId, {
    status: "completed",
    error: state.errors.length > 0 ? state.errors.join("; ") : null,
    normalizedAt: new Date().toISOString(),
    fingerprint: state.fingerprint,
  });

  return {};
}

// ── graph ────────────────────────────────────────────────────────────────────

function routeAfterMatch(state: State): "adjudicate" | "fetchNovel" | "estimate" {
  if (state.matches.some((m) => m.status === "ambiguous")) return "adjudicate";
  if (state.matches.some((m) => m.status === "novel")) return "fetchNovel";
  return "estimate";
}

function routeAfterAdjudicate(state: State): "fetchNovel" | "estimate" {
  return state.matches.some((m) => m.status === "novel") ? "fetchNovel" : "estimate";
}

const graph = new StateGraph(NormalizationState)
  .addNode("parse", parseLines)
  .addNode("match", embedAndMatch)
  .addNode("adjudicate", adjudicate)
  .addNode("fetchNovel", fetchNovel)
  .addNode("estimate", estimate)
  .addNode("persist", persist)
  .addEdge(START, "parse")
  .addEdge("parse", "match")
  .addConditionalEdges("match", routeAfterMatch, ["adjudicate", "fetchNovel", "estimate"])
  .addConditionalEdges("adjudicate", routeAfterAdjudicate, ["fetchNovel", "estimate"])
  .addEdge("fetchNovel", "estimate")
  .addEdge("estimate", "persist")
  .addEdge("persist", END)
  .compile();

/**
 * Normalize one recipe's ingredient list. Never throws — any unhandled node
 * error lands as normalization_status "failed" with the message recorded, and
 * the recipe save that scheduled this run is long since committed.
 */
export async function runNormalization(recipeId: string): Promise<void> {
  try {
    const recipe = await getRecipeById(recipeId);
    if (!recipe) return; // deleted between schedule and run

    const schema = composeRecipeSchema(recipe);
    const schemaLines = schema.recipeIngredient ?? [];
    const rawLines = schemaLines.map(getIngredientText);
    const lineIds = schemaLines.map((line) =>
      typeof line === "string" ? null : (line.id ?? null),
    );
    const fingerprint = ingredientFingerprint(schema);

    if (rawLines.length === 0) {
      await replaceRecipeIngredients(recipeId, []);
      await setRecipeNormalization(recipeId, {
        status: "completed",
        error: null,
        normalizedAt: new Date().toISOString(),
        fingerprint,
      });
      return;
    }

    await setRecipeNormalization(recipeId, { status: "running", error: null });
    await graph.invoke({ recipeId, fingerprint, rawLines, lineIds });
  } catch (err) {
    console.error(`Normalization failed for ${recipeId}:`, err);
    try {
      await setRecipeNormalization(recipeId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch (statusErr) {
      console.error(`Could not record failed status for ${recipeId}:`, statusErr);
    }
  }
}
