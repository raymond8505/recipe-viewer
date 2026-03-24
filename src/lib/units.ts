// Volume base unit: ml
// Weight base unit: g

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

const VOLUME_ORDER = ["tsp", "tbsp", "cup", "fl oz", "pt", "qt", "gal", "ml", "l"];
const WEIGHT_ORDER = ["oz", "lb", "g", "kg"];

// Build alias lookup sorted by length descending (longest alias tried first)
const ALIAS_ENTRIES: [string, string][] = Object.entries(UNIT_DEFS)
  .flatMap(([key, def]) =>
    def.aliases.map((alias): [string, string] => [alias.toLowerCase(), key])
  )
  .sort(([a], [b]) => b.length - a.length);

export interface ParsedIngredient {
  amount: number;
  unit: string | null;
  rest: string;
  original: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseAmount(s: string): number {
  s = s.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  return parseFloat(s);
}

// Matches: mixed "1 1/2", fraction "1/2", decimal/integer "2.5" or "2"
const AMOUNT_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*/;

export function parseIngredient(str: string): ParsedIngredient | null {
  const amountMatch = str.match(AMOUNT_RE);
  if (!amountMatch) return null;

  const amountStr = amountMatch[1];
  const afterAmount = str.slice(amountMatch[0].length);

  for (const [alias, unitKey] of ALIAS_ENTRIES) {
    const pattern = new RegExp(`^(${escapeRe(alias)})(?=\\s|$)`, "i");
    const m = afterAmount.match(pattern);
    if (m) {
      return {
        amount: parseAmount(amountStr),
        unit: unitKey,
        rest: afterAmount.slice(m[0].length).trim(),
        original: str,
      };
    }
  }

  // Number found but no recognized unit — rest is everything after the amount
  return {
    amount: parseAmount(amountStr),
    unit: null,
    rest: afterAmount.trim(),
    original: str,
  };
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

/**
 * Extract the first numeric value from a recipeYield string.
 * e.g. "4 servings" → 4, "Makes 6-8" → 6, "4" → 4
 */
export function parseServings(yld: string | string[] | undefined | null): number | null {
  const raw = Array.isArray(yld) ? yld[0] : yld;
  if (!raw) return null;
  const m = raw.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

export function roundToQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"],
  [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"],
];

export function formatAmount(n: number): string {
  const whole = Math.floor(n);
  const frac = n - whole;

  for (const [val, str] of FRACTIONS) {
    if (Math.abs(frac - val) < 0.02) {
      return whole > 0 ? `${whole}${str}` : str;
    }
  }

  if (frac < 0.01) return String(whole);

  // Round to at most 2 decimal places, trim trailing zeros
  return String(parseFloat((Math.round(n * 100) / 100).toFixed(2)));
}
