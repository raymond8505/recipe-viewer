// Rendered prose for the MCP tool descriptions and JSON schemas.
//
// A tool description is a prompt that ships next to the code it describes, and
// an agent acts on it literally. Anything in it that ENUMERATES code — the
// nutrient fields, the accepted image formats, the metric units, the fields one
// tool returns that another doesn't — is rendered here from the code it names,
// so the sentence changes when the code does. Prose that merely mentions a
// single field in passing stays hand-written; interpolating those costs more
// readability than the drift risk is worth.

import { exhaustiveKeys } from "@/lib/exhaustive";
import { IMAGE_CONTENT_TYPES } from "@/lib/imageTypes";
import { NUTRITION_FIELDS } from "@/lib/nutritionFields";
import { convert, formatAmount, METRIC_YIELD_UNITS } from "@/lib/units";
import type { IngredientMatch, IngredientRow } from "@/types/ingredient";
import { TOOL } from "./toolNames";

/**
 * What `update_recipe` does with ingredients, said once. This is BOTH the
 * update_recipe description's account of the rule and the message the tool
 * throws when an agent breaks it, so an agent that reads the docs and an agent
 * that learns by failing are told the same thing in the same words — and an
 * agent that reads first never has to spend the failing call at all.
 */
export const RECIPE_INGREDIENT_ON_UPDATE_ERROR = `schema.recipeIngredient is not accepted on update — the call FAILS if you send one, it is not ignored. Ingredients go through \`ingredients\`, which REPLACES the whole list: send every line back as groups of { id?, raw_text }, keeping the id ${TOOL.get_recipe} returned for each line so it keeps its catalog match (rewording the text is fine), and leave id off only for a genuinely new line.`;

/**
 * The instructions twin of the rule above: the same words in the
 * update_recipe description, on the schema field, and in the thrown error.
 */
export const RECIPE_INSTRUCTIONS_ON_UPDATE_ERROR = `schema.recipeInstructions is not accepted on update — the call FAILS if you send one, it is not ignored. Instructions go through \`instructions\`, which REPLACES the whole list: ordered groups of { name?, steps }, each step { text, name?, seconds? } — omit a group's name for an unsectioned run of steps; a step's name is its cook-mode timer label and seconds (whole seconds) is the timer's duration, which requires the name.`;

/**
 * The yield twin of the two rules above, for the same reason: one wording in
 * the update_recipe description, on the schema field, and in the thrown error.
 * Rejected rather than stripped — a silently dropped yield looks to the agent
 * like a serving count it successfully set.
 */
export const RECIPE_YIELD_ON_UPDATE_ERROR = `schema.recipeYield is not accepted on update — the call FAILS if you send one, it is not ignored. A recipe's serving count is column-backed: send \`servings\` ({ amount, unit? }) instead, where amount is the number of servings and unit is what they are counted in ("servings", "kebabs"). Omit \`servings\` to leave the count alone; send { "amount": null } to clear it. The whole recipe's raw weight goes through \`total_weight\` ({ amount, unit }), NOT a valueReference. ${TOOL.get_recipe} returns all four as servings_amount / servings_unit / total_weight_amount / total_weight_unit.`;

/**
 * The column-backed scalars, keyed by the `schema.` spelling an agent might
 * still reach for, valued by the top-level argument that sets each one. The
 * handler looks a rejected key up here and the prose below renders it, so the
 * list an agent is told about is the list the handler checks.
 */
export const PROMOTED_UPDATE_ARGS = {
  name: "name",
  description: "description",
  notes: "notes",
  image: "image",
} as const;

export type PromotedUpdateKey = keyof typeof PROMOTED_UPDATE_ARGS;

const PROMOTED_KEY_LIST = Object.keys(PROMOTED_UPDATE_ARGS)
  .map((k) => `schema.${k}`)
  .join(", ");

/**
 * The scalars twin of the three rules above, and rejected for the same reason
 * the yield is: an agent that sends `schema.name` and gets a 200 has every
 * reason to believe it renamed the recipe. These are columns now, so the blob
 * they landed in is read by nothing.
 */
export const RECIPE_SCALARS_ON_UPDATE_ERROR = `${PROMOTED_KEY_LIST} are not accepted on update — the call FAILS if you send one, it is not ignored. Each is a top-level argument now: send \`name\`, \`description\`, \`notes\` or \`image\` beside \`id\`. Omit one to leave it alone; send null to clear \`description\`, \`notes\` or \`image\` (\`name\` cannot be cleared). ${TOOL.get_recipe} returns all four at the top level of the row.`;

/**
 * The three time keys, by the `schema.` spelling an agent might still reach
 * for, valued by the member of `times` that sets each one. Same contract as
 * `PROMOTED_UPDATE_ARGS`: the handler rejects what this names and the prose
 * below renders it, so an agent is told exactly the list that is checked.
 */
export const TIME_UPDATE_ARGS = {
  prepTime: "prep",
  cookTime: "cook",
  totalTime: "total",
} as const;

export type TimeUpdateKey = keyof typeof TIME_UPDATE_ARGS;

const TIME_KEY_LIST = Object.keys(TIME_UPDATE_ARGS)
  .map((k) => `schema.${k}`)
  .join(", ");

const TIME_ARG_LIST = Object.values(TIME_UPDATE_ARGS).join(", ");

/**
 * The times twin of the rules above, rejected for the reason every one of them
 * is: an agent that sends `schema.cookTime` and gets a 200 has every reason to
 * believe it set the cook time. The times are columns; the blob keys of those
 * names are read by nothing.
 */
export const RECIPE_TIMES_ON_UPDATE_ERROR = `${TIME_KEY_LIST} are not accepted on update — the call FAILS if you send one, it is not ignored. The times are column-backed: send \`times\` ({ ${TIME_ARG_LIST} }) instead, each an ISO 8601 duration of hours/minutes/seconds (e.g. "PT30M", "PT1H15M"). Omit a member to leave that time alone; send null to clear it. A duration this app cannot read ("20-22 min", "P4D") FAILS rather than clearing the column. ${TOOL.get_recipe} returns all three at the top level of the row as prep_time / cook_time / total_time, in SECONDS.`;

/**
 * Which of a recipe's two urls is which, said once for every tool that answers
 * with both. An agent that picks the wrong one sends a person off to the site
 * the recipe was scraped from, not to its page here.
 */
export const RECIPE_TWO_URLS =
  "Every recipe answers with two urls: `pageUrl`, its page on this instance, which is where you send a person to look at it; and `sourceUrl`, the page it came from, which is what Re-scrape re-fetches. They hold the same value for a recipe with no upstream page.";

/**
 * A recipe has two urls and this tool accepts only one of them, so a bare
 * `url` is ambiguous about which was meant. Rejected rather than stripped:
 * the input object drops keys it does not know, so a silently ignored `url`
 * looks to the agent like a source page it successfully set.
 */
export const URL_ON_UPDATE_ERROR = `url is not a field on this tool. ${RECIPE_TWO_URLS} \`sourceUrl\` is the one you set here; \`pageUrl\` is derived from the recipe's id and never set. Send \`sourceUrl\` if you meant the first.`;

/**
 * What a write does with `cookingNotes`, said once for both tools that take a
 * schema. Ignoring it is the surprise worth stating: the call succeeds, so an
 * agent that is not told reads the success as notes it wrote.
 */
export const COOKING_NOTES_READ_ONLY = `cookingNotes is read-only for agents: if present it is ignored (the call still succeeds) and the response carries a 'warnings' note explaining why. ${TOOL.clear_cooking_notes} is the only agent-writable path.`;

/**
 * "a, b, or c". Hand-rolled rather than Intl.ListFormat, whose output varies
 * with the runtime's ICU build — these strings are asserted in tests and read
 * by agents, so they must be identical everywhere.
 */
export function orList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

/** The per-100g nutrient keys a catalog row carries, in label order. */
export const NUTRITION_FIELD_LIST = NUTRITION_FIELDS.join(", ");

/**
 * The volume↔weight worked example. Derived from UNIT_DEFS so the number can't
 * drift from what `convert` actually does; `formatAmount` rounds to 2dp and
 * trims trailing zeros.
 */
export const TBSP_ML_EXAMPLE = `1 tbsp = ${formatAmount(convert(1, "tbsp", "ml"))} ml`;

/** "g/kg/ml/l" — the metric units a yield's valueReference may use. */
export const METRIC_UNIT_SLASHES = METRIC_YIELD_UNITS.join("/");

/** '"g", "kg", "ml", or "l"' — the same set, as a sentence. */
export const METRIC_UNIT_OR_LIST = orList(
  METRIC_YIELD_UNITS.map((unit) => `"${unit}"`),
);

/** "PNG, JPEG, or WebP" — the image formats the upload path accepts. */
export const IMAGE_FORMAT_LIST = orList(
  Object.values(IMAGE_CONTENT_TYPES).map((type) => type.label),
);

// What get_ingredient adds over a search_ingredients hit. Computing it as the
// set difference is the point: when a field is promoted onto IngredientMatch
// (as `aliases` was) the list here stops compiling instead of quietly telling
// agents to make a call they no longer need.
type IngredientDetailOnlyField = Exclude<keyof IngredientRow, keyof IngredientMatch>;

export const INGREDIENT_DETAIL_ONLY_FIELDS = exhaustiveKeys<
  Pick<IngredientRow, IngredientDetailOnlyField>
>()([
  "fdc_id",
  "fdc_data_type",
  "food_portions",
  "source",
  "created_at",
  "updated_at",
  "last_checked",
]);

export const INGREDIENT_DETAIL_ONLY_LIST = INGREDIENT_DETAIL_ONLY_FIELDS.join(", ");

/**
 * The two rankings `search_ingredients` can answer with. Semantic matching
 * needs a Gemini embedding of the query, which is a paid external call that
 * can fail on its own; the trigram RPC needs nothing but Postgres. So the
 * tool answers in whichever mode it could actually produce and NAMES it on
 * every response, because the two carry different score fields and an agent
 * must never have to infer which numbers it got.
 *
 * Interpolated into the tool description, so the literals an agent is told to
 * read are the literals the tool returns.
 */
export const INGREDIENT_SEARCH_MODE = {
  hybrid: "hybrid",
  keyword: "keyword",
} as const;

export type IngredientSearchMode =
  (typeof INGREDIENT_SEARCH_MODE)[keyof typeof INGREDIENT_SEARCH_MODE];
