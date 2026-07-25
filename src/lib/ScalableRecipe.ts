import type { SchemaRecipe, RecipeIngredient } from "@/types/recipe";
import type { IngredientNutrition } from "@/types/ingredient";
import {
  parseIngredient,
  parseServings,
  type ParsedAmount,
  type ParsedIngredient,
} from "./units";
import { getYieldValueReference } from "./format";
import { normalizedTotalToPerServingSchema } from "./nutritionMath";

/**
 * Normalized ingredient nutrition for a recipe, supplied to the ScalableRecipe
 * constructor (its only consumer). `total` is the whole-recipe sum;
 * `fullyCovered` gates whether `nutrition()` trusts it over the recipe's own
 * fields.
 */
export interface NormalizedNutrition {
  total: IngredientNutrition;
  fullyCovered: boolean;
}

/** Which of the two nutrition views `nutrition()` is serving. */
export type NutritionSource = "ingredients" | "recipe";

export interface ResolvedNutrition {
  values: ScaledNutrition;
  source: NutritionSource;
}

export interface ScalableRecipeState {
  /** Multiplier on every ingredient amount. 1 = base. */
  ingredientScale: number;
  /**
   * When set, nutrition is shown per this many portions instead of per scaled serving.
   * null = nutrition shows as "per serving" at the current scale.
   */
  nutritionPortions: number | null;
  /**
   * Per-ingredient overrides for range sources that have been directly edited.
   * Key = ingredient index. Value = the original midpoint, used as the new
   * single-value base. Editing a range collapses it to single; subsequent
   * portion changes or other anchors still scale this base normally.
   * Invariant: a key exists iff the source ingredient is a range AND it has
   * been anchored by the user.
   */
  rangeAnchors: Record<number, number>;
}

export interface ScaledIngredient {
  index: number;
  group?: string;
  /** Raw schema string (or .name when the source was a RecipeIngredient object). */
  original: string;
  /** Pre-scale parse, or null for unparseable strings like "salt to taste". */
  parsed: ParsedIngredient | null;
  /** Post-scale amount, or null when parsed is null. */
  scaledAmount: ParsedAmount | null;
  unit: string | null;
  /** Pass-through from parsed.rest; falls back to the raw string when unparseable. */
  rest: string;
}

export type IngredientRef = number | { index: number };

export interface ScaledNutrition {
  servingSize?: string;
  calories?: string;
  proteinContent?: string;
  carbohydrateContent?: string;
  fatContent?: string;
  fiberContent?: string;
  sodiumContent?: string;
  sugarContent?: string;
  saturatedFatContent?: string;
  unsaturatedFatContent?: string;
  cholesterolContent?: string;
}

/**
 * Multiply the numeric prefix of a Schema.org nutrition string by `multiplier`,
 * preserving any trailing unit text ("350 kcal", "20g", "0.5 mg"). The output
 * keeps one decimal place when the result is fractional, integer otherwise.
 * Returns the input unchanged for strings without a leading number.
 */
export function scaleNutrientValue(raw: string, multiplier: number): string {
  const match = raw.match(/^([\d.]+)(\s*.*)$/);
  if (!match) return raw;
  const scaled = parseFloat(match[1]) * multiplier;
  const rounded = Math.round(scaled * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
  return formatted + match[2];
}

// ─── Private helpers (used by ScalableRecipe below) ───────────────────────

const NUTRIENT_KEYS = [
  "calories",
  "proteinContent",
  "carbohydrateContent",
  "fatContent",
  "fiberContent",
  "sodiumContent",
  "sugarContent",
  "saturatedFatContent",
  "unsaturatedFatContent",
  "cholesterolContent",
] as const;

type NutrientKey = (typeof NUTRIENT_KEYS)[number];

function scaleParsedAmount(a: ParsedAmount, scale: number): ParsedAmount {
  return a.kind === "single"
    ? { kind: "single", value: a.value * scale }
    : { kind: "range", min: a.min * scale, max: a.max * scale };
}

function midpoint(a: ParsedAmount): number {
  return a.kind === "single" ? a.value : (a.min + a.max) / 2;
}

function refIndex(ref: IngredientRef): number {
  return typeof ref === "number" ? ref : ref.index;
}

interface InternalEntry {
  index: number;
  group?: string;
  text: string;
  parsed: ParsedIngredient | null;
}

function parseEntry(
  entry: string | RecipeIngredient,
  index: number,
): InternalEntry {
  const text = typeof entry === "string" ? entry : entry.name;
  const group = typeof entry === "string" ? undefined : entry.group;
  return { index, group, text, parsed: parseIngredient(text) };
}

/**
 * Immutable wrapper around SchemaRecipe owning three scaling dimensions:
 *   - ingredientScale: multiplier applied to every ingredient amount
 *   - nutritionPortions: divisor for nutrition; null = per scaled serving
 *
 * Anchor operations resolve to changes in these fields; they do not introduce
 * new state. Every mutation method returns a new instance; the schema itself
 * is never modified.
 */
export class ScalableRecipe {
  readonly schema: SchemaRecipe;
  readonly state: ScalableRecipeState;
  readonly baseServings: number | null;
  /**
   * Normalized ingredient nutrition, or null when the recipe isn't normalized.
   * Internal input to `ingredientsNutrition()`/`nutrition()` — consumers read
   * those instead of this.
   */
  readonly normalized: NormalizedNutrition | null;
  private readonly _entries: ReadonlyArray<InternalEntry>;

  constructor(
    schema: SchemaRecipe,
    state?: Partial<ScalableRecipeState>,
    normalized?: NormalizedNutrition | null,
  ) {
    this.schema = schema;
    this.baseServings = parseServings(schema.recipeYield);
    this.normalized = normalized ?? null;
    this.state = Object.freeze({
      ingredientScale: state?.ingredientScale ?? 1,
      nutritionPortions: state?.nutritionPortions ?? null,
      rangeAnchors: state?.rangeAnchors ?? {},
    });
    this._entries = Object.freeze(
      (schema.recipeIngredient ?? []).map(parseEntry),
    );
  }

  scalePortionsTo(targetServings: number): ScalableRecipe {
    if (this.baseServings == null) return this;
    if (!Number.isFinite(targetServings)) return this;
    const clamped = Math.max(1, targetServings);
    const newScale = clamped / this.baseServings;
    if (newScale === this.state.ingredientScale) return this;
    return new ScalableRecipe(
      this.schema,
      { ...this.state, ingredientScale: newScale },
      this.normalized,
    );
  }

  splitPortions(portions: number): ScalableRecipe {
    if (!Number.isFinite(portions)) return this;
    const clamped = Math.max(1, Math.round(portions));
    if (clamped === this.state.nutritionPortions) return this;
    return new ScalableRecipe(
      this.schema,
      { ...this.state, nutritionPortions: clamped },
      this.normalized,
    );
  }

  anchorIngredientAmount(ref: IngredientRef, amount: number): ScalableRecipe {
    if (!Number.isFinite(amount) || amount <= 0) return this;
    const idx = refIndex(ref);
    const entry = this._entries[idx];
    if (!entry || !entry.parsed) return this;
    const sourceAmount = entry.parsed.amount;
    const base = midpoint(sourceAmount);
    if (base <= 0) return this;
    const newScale = amount / base;
    const wasRange = sourceAmount.kind === "range";
    const alreadyAnchored = this.state.rangeAnchors[idx] != null;
    if (
      newScale === this.state.ingredientScale &&
      (!wasRange || alreadyAnchored)
    ) {
      return this;
    }
    const rangeAnchors = wasRange
      ? { ...this.state.rangeAnchors, [idx]: base }
      : this.state.rangeAnchors;
    return new ScalableRecipe(
      this.schema,
      { ...this.state, ingredientScale: newScale, rangeAnchors },
      this.normalized,
    );
  }

  reset(): ScalableRecipe {
    if (
      this.state.ingredientScale === 1 &&
      this.state.nutritionPortions == null &&
      Object.keys(this.state.rangeAnchors).length === 0
    ) {
      return this;
    }
    return new ScalableRecipe(this.schema, undefined, this.normalized);
  }

  get ingredients(): ScaledIngredient[] {
    const scale = this.state.ingredientScale;
    const anchors = this.state.rangeAnchors;
    return this._entries.map((entry) => {
      const overrideBase = anchors[entry.index];
      const baseAmount: ParsedAmount | null =
        entry.parsed == null
          ? null
          : overrideBase != null && entry.parsed.amount.kind === "range"
            ? { kind: "single", value: overrideBase }
            : entry.parsed.amount;
      return {
        index: entry.index,
        group: entry.group,
        original: entry.text,
        parsed: entry.parsed,
        scaledAmount: baseAmount ? scaleParsedAmount(baseAmount, scale) : null,
        unit: entry.parsed?.unit ?? null,
        rest: entry.parsed?.rest ?? entry.text,
      };
    });
  }

  /**
   * Same partitioning rule as format.ts/groupIngredients: returns one
   * unlabeled group when no ingredient has `group`; otherwise partitions by
   * group in insertion order, with ungrouped items collected under a null heading.
   */
  get groupedIngredients(): Array<{ heading: string | null; items: ScaledIngredient[] }> {
    const items = this.ingredients;
    const hasGroups = items.some((i) => i.group != null);
    if (!hasGroups) return [{ heading: null, items }];
    const order: Array<string | null> = [];
    const map = new Map<string | null, ScaledIngredient[]>();
    for (const ing of items) {
      const g = ing.group ?? null;
      if (!map.has(g)) {
        order.push(g);
        map.set(g, []);
      }
      map.get(g)!.push(ing);
    }
    return order.map((heading) => ({ heading, items: map.get(heading)! }));
  }

  get currentServings(): number | null {
    if (this.baseServings == null) return null;
    return Math.max(1, Math.round(this.baseServings * this.state.ingredientScale));
  }

  /** The portion count that the nutrition panel is currently displaying. */
  get displayPortions(): number {
    return this.state.nutritionPortions ?? this.currentServings ?? 1;
  }

  get nutritionLabel(): "per serving" | "per portion" {
    if (this.state.nutritionPortions == null) return "per serving";
    if (this.state.nutritionPortions === this.currentServings) return "per serving";
    return "per portion";
  }

  /**
   * The factor applied to each nutrition value at the current scale/split.
   * = currentServings / displayPortions (i.e. total food / portion count).
   */
  get nutritionMultiplier(): number {
    if (this.baseServings == null) return 1;
    const cur = this.currentServings ?? this.baseServings;
    const dp = this.displayPortions;
    if (dp <= 0) return 1;
    return cur / dp;
  }

  /**
   * Raw weight/volume of one displayed portion, from the yield's
   * `valueReference` (the whole-recipe weight at base). Scales with
   * `ingredientScale` and divides by `displayPortions`, so at rest it equals
   * valueReference.value / baseServings (e.g. 454 g / 4 = 113.5). null when the
   * yield carries no valueReference (legacy/string yields) or the numbers can't
   * support the division.
   */
  get servingWeight(): { value: number; unitText: string } | null {
    const vr = getYieldValueReference(this.schema.recipeYield);
    if (!vr || typeof vr.value !== "number" || vr.value <= 0) return null;
    if (this.baseServings == null || this.baseServings <= 0) return null;
    const dp = this.displayPortions;
    if (dp <= 0) return null;
    return {
      value: (vr.value * this.state.ingredientScale) / dp,
      unitText: vr.unitText ?? "",
    };
  }

  /**
   * The nutrition panel's unit label. With a yield valueReference present it
   * reads e.g. "per 114 g serving" (weight rounded to a whole unit); otherwise
   * it falls back to the plain "per serving" / "per portion" from
   * `nutritionLabel`. The noun follows the split state.
   */
  get nutritionUnitLabel(): string {
    const w = this.servingWeight;
    if (!w) return this.nutritionLabel;
    const noun = this.nutritionLabel === "per portion" ? "portion" : "serving";
    return ["per", String(Math.round(w.value)), w.unitText, noun]
      .filter(Boolean)
      .join(" ");
  }

  /**
   * Apply `nutritionMultiplier` to a per-serving nutrition base. Returns null
   * when the base is absent or carries no nutrient value (a bare servingSize
   * doesn't count).
   */
  private scaleNutrition(base: ScaledNutrition | undefined): ScaledNutrition | null {
    if (!base || !NUTRIENT_KEYS.some((k) => !!base[k])) return null;
    const mult = this.nutritionMultiplier;
    const result: ScaledNutrition = {};
    if (base.servingSize != null) result.servingSize = base.servingSize;
    for (const k of NUTRIENT_KEYS) {
      const v = base[k];
      if (v == null) continue;
      result[k] = mult === 1 ? v : scaleNutrientValue(v, mult);
    }
    return result;
  }

  /**
   * The recipe's own (manually set) `schema.nutrition` fields at the current
   * scale/split, or null when the schema has none.
   */
  recipeNutrition(): ScaledNutrition | null {
    return this.scaleNutrition(this.schema.nutrition);
  }

  /**
   * The nutrition computed from the normalized ingredient list (per serving,
   * at the current scale/split), or null when the recipe isn't normalized or
   * has no parseable serving count. Deliberately NOT gated on `fullyCovered` —
   * this is the explicit ingredients view; `nutrition()` applies the trust gate.
   */
  ingredientsNutrition(): ScaledNutrition | null {
    if (!this.normalized) return null;
    if (this.baseServings == null || this.baseServings <= 0) return null;
    return this.scaleNutrition(
      normalizedTotalToPerServingSchema(this.normalized.total, this.baseServings),
    );
  }

  /**
   * The single nutrition view to display/serialize: the ingredients-derived
   * values when they're trusted (every line covered and servings known), else
   * the recipe's own fields — all-or-nothing, never a per-field mix. `source`
   * says which side won; `servingSize` always rides along from the schema.
   */
  nutrition(): ResolvedNutrition | null {
    const fromIngredients = this.normalized?.fullyCovered
      ? this.ingredientsNutrition()
      : null;
    if (fromIngredients) {
      const servingSize = this.schema.nutrition?.servingSize;
      return {
        values:
          servingSize != null
            ? { servingSize, ...fromIngredients }
            : fromIngredients,
        source: "ingredients",
      };
    }
    const fromRecipe = this.recipeNutrition();
    return fromRecipe ? { values: fromRecipe, source: "recipe" } : null;
  }

  get hasNutrition(): boolean {
    return this.nutrition() != null;
  }
}

export type { ParsedAmount, ParsedIngredient };
