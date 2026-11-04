import { isLengthUnit, parseIngredient } from "@/lib/units";

// The shape a recipe line reduces to once amount, unit and name are split out.
// Lives here rather than in graph.ts so callers can reach the deterministic
// parser without pulling @langchain/langgraph — route modules must not import
// that statically (the route-auth-policy gate test cold-loads every route).
export interface ParsedLine {
  position: number;
  rawText: string;
  quantity: number | null;
  // Canonical UNIT_DEFS key or null (count/unitless).
  unit: string | null;
  name: string;
  note: string | null;
}

/**
 * Deterministic line parse: src/lib/units.ts `parseIngredient` handles the
 * amount + unit prefix; whatever remains is the name (it can't split out
 * preparation notes — that's the LLM's added value, so `note` is always null).
 *
 * Two callers, for different reasons: the normalization graph falls back to
 * this when Gemini is unavailable, and the inline line-text edit uses it as
 * the ONLY parse — that path is deliberately round-trip-free, so an LLM call
 * is not on the table there.
 */
// What a dimension sizes, when the line names it: "2-inch piece ginger",
// "1-inch knob of ginger", "3-inch cinnamon stick". The catalog holds foods,
// not objects, so the word sits between the line and its match. Only stripped
// beside a length unit — in "2 sticks butter" the same word IS the amount.
const DIMENSION_OBJECT_RE =
  /^(?:(?:pieces?|knobs?|chunks?|strips?|sticks?|segments?|lengths?|rounds?|slices?)\s+)?(?:of\s+)?/i;

export function parseLineDeterministic(
  rawText: string,
  position: number,
): ParsedLine {
  const parsed = parseIngredient(rawText);
  if (!parsed) {
    return {
      position,
      rawText,
      quantity: null,
      unit: null,
      name: rawText.trim().toLowerCase(),
      note: null,
    };
  }
  const quantity =
    parsed.amount.kind === "single"
      ? parsed.amount.value
      : (parsed.amount.min + parsed.amount.max) / 2;
  const rest = isLengthUnit(parsed.unit)
    ? parsed.rest.replace(DIMENSION_OBJECT_RE, "")
    : parsed.rest;
  return {
    position,
    rawText,
    quantity,
    unit: parsed.unit,
    name: (rest.trim() || rawText.trim()).toLowerCase(),
    note: null,
  };
}
