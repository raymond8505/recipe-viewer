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
>()(["fdc_id", "fdc_data_type", "food_portions", "source", "created_at", "updated_at"]);

export const INGREDIENT_DETAIL_ONLY_LIST = INGREDIENT_DETAIL_ONLY_FIELDS.join(", ");
