import { parseIngredient } from "@/lib/units";

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
  return {
    position,
    rawText,
    quantity,
    unit: parsed.unit,
    name: (parsed.rest.trim() || rawText.trim()).toLowerCase(),
    note: null,
  };
}
