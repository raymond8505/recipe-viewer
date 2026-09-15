// Volume base unit: ml
// Weight base unit: g

import type { QuantitativeValue } from "@/types/recipe";

export type UnitGroup = "volume" | "weight";

interface UnitDef {
  group: UnitGroup;
  display: string;
  toBase: number; // multiply amount by this to get base unit value
  aliases: string[]; // input aliases for parsing
}

const UNIT_DEFS: Record<string, UnitDef> = {
  tsp:     { group: "volume", display: "tsp",   toBase: 4.92892,  aliases: ["teaspoons", "teaspoon", "tsp"] },
  tbsp:    { group: "volume", display: "tbsp",  toBase: 14.7868,  aliases: ["tablespoons", "tablespoon", "tbsp"] },
  "fl oz": { group: "volume", display: "fl oz", toBase: 29.5735,  aliases: ["fluid ounces", "fluid ounce", "fl. oz.", "fl oz", "floz"] },
  cup:     { group: "volume", display: "cup",   toBase: 236.588,  aliases: ["cups", "cup"] },
  pt:      { group: "volume", display: "pt",    toBase: 473.176,  aliases: ["pints", "pint", "pt"] },
  qt:      { group: "volume", display: "qt",    toBase: 946.353,  aliases: ["quarts", "quart", "qt"] },
  gal:     { group: "volume", display: "gal",   toBase: 3785.41,  aliases: ["gallons", "gallon", "gal"] },
  ml:      { group: "volume", display: "ml",    toBase: 1,        aliases: ["milliliters", "milliliter", "millilitres", "millilitre", "mL", "ml"] },
  l:       { group: "volume", display: "L",     toBase: 1000,     aliases: ["liters", "liter", "litres", "litre", "L"] },
  oz:      { group: "weight", display: "oz",    toBase: 28.3495,  aliases: ["ounces", "ounce", "oz"] },
  lb:      { group: "weight", display: "lb",    toBase: 453.592,  aliases: ["pounds", "pound", "lbs", "lb"] },
  g:       { group: "weight", display: "g",     toBase: 1,        aliases: ["grams", "gram", "g"] },
  kg:      { group: "weight", display: "kg",    toBase: 1000,     aliases: ["kilograms", "kilogram", "kg"] },
};

/**
 * Metric weight/volume units accepted for a recipeYield `valueReference` — the
 * metric subset of UNIT_DEFS keys (weight: g/kg, volume: ml/l). Canonical
 * symbols, rendered verbatim in the nutrition per-serving label. Consumed by the
 * zod validator and the MCP JSON schema so both agree on the allowed set.
 */
export const METRIC_YIELD_UNITS = ["g", "kg", "ml", "l"] as const;

const VOLUME_ORDER = ["tsp", "tbsp", "cup", "fl oz", "pt", "qt", "gal", "ml", "l"];
const WEIGHT_ORDER = ["oz", "lb", "g", "kg"];

// Build alias lookup sorted by length descending (longest alias tried first)
const ALIAS_ENTRIES: [string, string][] = Object.entries(UNIT_DEFS)
  .flatMap(([key, def]) =>
    def.aliases.map((alias): [string, string] => [alias.toLowerCase(), key])
  )
  .sort(([a], [b]) => b.length - a.length);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ALIAS_TO_KEY = new Map(ALIAS_ENTRIES);

/**
 * Exact alias → unit key lookup (case-insensitive, trimmed). Unlike
 * parseIngredient's prefix matching this takes the whole token — used by the
 * USDA client to recognize household-measure text like "tbsp" or "Cup" in
 * foodPortions. Returns null for unknown text (e.g. "undetermined").
 */
export function unitKeyForAlias(text: string): string | null {
  return ALIAS_TO_KEY.get(text.trim().toLowerCase()) ?? null;
}

export function convert(amount: number, fromUnit: string | null, toUnit: string | null): number {
  if (!fromUnit || !toUnit) return amount;
  const from = UNIT_DEFS[fromUnit];
  const to = UNIT_DEFS[toUnit];
  if (!from || !to || from.group !== to.group) return amount;
  return (amount * from.toBase) / to.toBase;
}

export function getUnitGroup(unit: string | null): string[] {
  if (!unit) return [];
  const def = UNIT_DEFS[unit];
  if (!def) return [unit];
  return def.group === "volume" ? VOLUME_ORDER : WEIGHT_ORDER;
}

export function getUnitDisplay(unit: string): string {
  return UNIT_DEFS[unit]?.display ?? unit;
}

export function isVolumeUnit(unit: string | null): boolean {
  if (!unit) return false;
  return UNIT_DEFS[unit]?.group === "volume";
}

export function roundDecimal(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function formatAmount(n: number): string {
  // 2 dp so quarter-amounts survive (¼ → 0.25, not 0.3). String() trims
  // trailing zeros: 0.25 → "0.25", 0.5 → "0.5", 2 → "2" (never "2.00").
  return String(roundDecimal(n, 2));
}

// Volume threshold rule: a single value's ml-equivalent picks the default unit.
// Ranges in ScalableRecipe pass through their midpoint; see callers in IngredientItem.
export function getDefaultVolumeUnit(amountInMl: number): "tsp" | "tbsp" | "cup" {
  if (amountInMl < 7) return "tsp";
  if (amountInMl <= 60) return "tbsp";
  return "cup";
}

// Per-unit "common cooking fractions" used for hint snapping.
// Mass/ml/fl-oz/pt/qt/gal/L/oz/lb/g/kg deliberately omitted — no hint for those.
const COMMON_FRACTIONS_PER_UNIT: Record<string, [number, string][]> = {
  cup:  [[1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"]],
  tbsp: [[1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"]],
  tsp:  [[1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"]],
};

export interface FractionHint {
  /** Snapped value in the hint unit (used by caller for redundancy suppression). */
  value: number;
  /** Human-readable label, including the unit display name. */
  label: string;
}

/**
 * Find the closest common-fraction snap for `value` expressed in `unit`.
 * Returns null when the unit has no defined fraction set (mass, ml, etc.).
 * Callers handle redundancy suppression (hide when label and displayed value agree).
 */
export function closestCommonFraction(value: number, unit: string): FractionHint | null {
  const fractions = COMMON_FRACTIONS_PER_UNIT[unit];
  if (!fractions) return null;

  const display = getUnitDisplay(unit);
  const wholePart = Math.floor(value);
  const candidates: FractionHint[] = [];

  // Consider the floor and floor+1 wholes; snap targets are W, W+frac, (W+1), (W+1)+frac.
  for (const w of [wholePart, wholePart + 1]) {
    if (w < 0) continue;
    if (w > 0) {
      candidates.push({ value: w, label: `${w} ${display}` });
    }
    for (const [fracVal, fracStr] of fractions) {
      candidates.push({
        value: w + fracVal,
        label: w === 0 ? `${fracStr} ${display}` : `${w}${fracStr} ${display}`,
      });
    }
  }

  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDelta = Math.abs(best.value - value);
  for (const c of candidates) {
    const d = Math.abs(c.value - value);
    if (d < bestDelta) {
      best = c;
      bestDelta = d;
    }
  }
  return best;
}

// Amount parsing: integers, decimals, ASCII and unicode fractions, mixed numbers,
// and ranges. Consumed by ScalableRecipe and IngredientItem.

export type ParsedAmount =
  | { kind: "single"; value: number }
  | { kind: "range"; min: number; max: number };

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4,
  "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8,
  "⅙": 1 / 6, "⅚": 5 / 6,
};

const FRAC_CHARS = "½⅓⅔¼¾⅛⅜⅝⅞⅙⅚";
// Order matters: longest/most-specific alternatives first so they win the leftmost match.
const SINGLE_TOKEN =
  `(?:\\d+\\s+\\d+\\/\\d+` +              // ascii mixed: "1 1/2"
  `|\\d+\\s*[${FRAC_CHARS}]` +            // unicode mixed: "1½" or "1 ½"
  `|\\d+\\/\\d+` +                        // ascii fraction: "3/4"
  `|[${FRAC_CHARS}]` +                    // unicode fraction: "½"
  `|\\d+(?:\\.\\d+)?)`;                   // decimal or integer
const RANGE_SEP = `(?:\\s*[-–—]\\s*|\\s+to\\s+)`;
const AMOUNT_RANGE_RE = new RegExp(`^(${SINGLE_TOKEN}(?:${RANGE_SEP}${SINGLE_TOKEN})?)\\s*`);

function parseSingleToken(raw: string): number | null {
  const s = raw.trim();
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
  m = s.match(new RegExp(`^(\\d+)\\s*([${FRAC_CHARS}])$`));
  if (m) {
    const fracVal = UNICODE_FRACTIONS[m[2]];
    return fracVal != null ? parseInt(m[1], 10) + fracVal : null;
  }
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
  if (s.length === 1 && UNICODE_FRACTIONS[s] != null) return UNICODE_FRACTIONS[s];
  if (/^\d+(?:\.\d+)?$/.test(s)) return parseFloat(s);
  return null;
}

export function parseAmountToken(s: string): ParsedAmount | null {
  if (!s) return null;
  const trimmed = s.trim();
  const rangeMatch = trimmed.match(
    new RegExp(`^(${SINGLE_TOKEN})${RANGE_SEP}(${SINGLE_TOKEN})$`)
  );
  if (rangeMatch) {
    const min = parseSingleToken(rangeMatch[1]);
    const max = parseSingleToken(rangeMatch[2]);
    if (min != null && max != null) return { kind: "range", min, max };
  }
  const value = parseSingleToken(trimmed);
  return value != null ? { kind: "single", value } : null;
}

export function formatParsedAmount(a: ParsedAmount): string {
  if (a.kind === "single") return formatAmount(a.value);
  return `${formatAmount(a.min)}-${formatAmount(a.max)}`;
}

/** Apply a unit conversion to both ends of a range, or the value of a single. */
export function convertParsedAmount(
  a: ParsedAmount,
  from: string | null,
  to: string | null,
): ParsedAmount {
  if (a.kind === "single") return { kind: "single", value: convert(a.value, from, to) };
  return {
    kind: "range",
    min: convert(a.min, from, to),
    max: convert(a.max, from, to),
  };
}

/** Apply roundDecimal to both ends of a range, or the value of a single. */
export function roundParsedAmount(a: ParsedAmount): ParsedAmount {
  return a.kind === "single"
    ? { kind: "single", value: roundDecimal(a.value) }
    : { kind: "range", min: roundDecimal(a.min), max: roundDecimal(a.max) };
}

export interface ParsedIngredient {
  amount: ParsedAmount;
  unit: string | null;
  /**
   * The unit exactly as the source wrote it ("cups", "Tablespoon"), or null
   * when no unit matched. `unit` is the canonical key, whose `display` is
   * singular ("cup") — reconstructing a line from that turns "2 cups flour"
   * into "2 cup flour", so anything rebuilding source-shaped text uses this.
   */
  unitText: string | null;
  rest: string;
  original: string;
}

export function parseIngredient(str: string): ParsedIngredient | null {
  const m = str.match(AMOUNT_RANGE_RE);
  if (!m) return null;
  const amount = parseAmountToken(m[1]);
  if (!amount) return null;
  const afterAmount = str.slice(m[0].length);
  for (const [alias, unitKey] of ALIAS_ENTRIES) {
    const pattern = new RegExp(`^(${escapeRe(alias)})(?=\\s|$)`, "i");
    const um = afterAmount.match(pattern);
    if (um) {
      return {
        amount,
        unit: unitKey,
        unitText: um[0],
        rest: afterAmount.slice(um[0].length).trim(),
        original: str,
      };
    }
  }
  return {
    amount,
    unit: null,
    unitText: null,
    rest: afterAmount.trim(),
    original: str,
  };
}

export type MetricYieldUnit = (typeof METRIC_YIELD_UNITS)[number];

/**
 * A recipe's yield reduced to the four columns that store it: how many, of
 * what, and what the whole recipe weighs.
 */
export interface ParsedYield {
  amount: number;
  /** null when the source named no unit — callers apply SERVINGS_UNIT_FALLBACK. */
  unit: string | null;
  /** null when there is no whole-recipe weight, or its unit isn't metric. */
  weight: { amount: number; unit: MetricYieldUnit } | null;
}

function isMetricYieldUnit(u: string | undefined): u is MetricYieldUnit {
  return (METRIC_YIELD_UNITS as readonly string[]).includes(u?.trim() ?? "");
}

/**
 * The tail of a yield string after its amount, reduced to a unit. Cut at the
 * first bracket or clause break so a parenthetical stays out of the unit
 * ("wraps (about 9 inches each)" → "wraps", "meatballs, serves 3-4" →
 * "meatballs"), then accepted only as 1-3 digit-free words — anything longer or
 * numeric is prose, not a unit, and becomes null rather than a guess.
 */
function unitFromTail(tail: string): string | null {
  const clause = tail.split(/[(,;–—]/)[0].trim();
  if (!clause) return null;
  const words = clause.split(/\s+/);
  if (words.length > 3) return null;
  if (words.some((w) => /\d/.test(w))) return null;
  return clause;
}

// A yield string's amount must sit at the FRONT, after at most a lead-in word.
// Scanning the whole string instead would take the first number anywhere in it:
// "Enough for one 350g brick of tofu" reads as 350 servings, and every amount
// and nutrient on that recipe is then divided by it, with nothing to flag.
const YIELD_LEAD_IN = `(?:(?:makes|serves|yields?|about|approx\\.?|approximately|~)\\s*)*`;
const YIELD_HEAD_RE = new RegExp(
  `^\\s*${YIELD_LEAD_IN}(${SINGLE_TOKEN}(?:${RANGE_SEP}${SINGLE_TOKEN})?)`,
  "i",
);

/**
 * Reduce any inbound `recipeYield` to the stored columns. This is the ONLY
 * yield parse in the app: it runs at the two inbound Schema.org edges
 * (`draftRecipeDocument`, `createRecipeRow`) and in the backfill, and every
 * reader downstream takes the columns instead.
 *
 * - QuantitativeValue → `value` verbatim (authoritative, no rounding), its
 *   `unitText`, and its `valueReference` when that names a metric unit.
 * - Array → its first element.
 * - String → the amount must be anchored at the front; ranges collapse to their
 *   rounded midpoint ("6-8 servings" → 7), which is what every consumer already
 *   computed.
 *
 * Returns null when there is no amount to be had. Null means UNPARSEABLE, and
 * callers must leave the columns alone and report it — never substitute a
 * default, because a wrong serving count silently rescales a whole recipe.
 */
export function parseYield(
  yld: string | string[] | QuantitativeValue | undefined | null,
): ParsedYield | null {
  if (yld && typeof yld === "object" && !Array.isArray(yld)) {
    if (typeof yld.value !== "number" || !Number.isFinite(yld.value)) return null;
    const vr = yld.valueReference;
    return {
      amount: yld.value,
      unit: yld.unitText?.trim() || null,
      weight:
        vr && typeof vr.value === "number" && vr.value > 0 && isMetricYieldUnit(vr.unitText)
          ? { amount: vr.value, unit: vr.unitText.trim() as MetricYieldUnit }
          : null,
    };
  }
  const raw = Array.isArray(yld) ? yld[0] : yld;
  if (!raw) return null;
  const m = raw.match(YIELD_HEAD_RE);
  if (!m) return null;
  const parsed = parseAmountToken(m[1]);
  if (!parsed) return null;
  const amount =
    parsed.kind === "single"
      ? Math.round(parsed.value)
      : Math.round((parsed.min + parsed.max) / 2);
  if (amount <= 0) return null;
  return { amount, unit: unitFromTail(raw.slice(m[0].length)), weight: null };
}
