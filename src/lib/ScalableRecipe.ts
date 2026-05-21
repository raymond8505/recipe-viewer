import type { SchemaRecipe, RecipeIngredient } from "@/types/recipe";
import {
  parseIngredientRanged,
  parseServings,
  type ParsedAmount,
  type ParsedIngredientRanged,
} from "./units";

export interface ScalableRecipeState {
  /** Multiplier on every ingredient amount. 1 = base. */
  ingredientScale: number;
  /**
   * When set, nutrition is shown per this many portions instead of per scaled serving.
   * null = nutrition shows as "per serving" at the current scale.
   */
  nutritionPortions: number | null;
}

export interface ScaledIngredient {
  index: number;
  group?: string;
  /** Raw schema string (or .name when the source was a RecipeIngredient object). */
  original: string;
  /** Pre-scale parse, or null for unparseable strings like "salt to taste". */
  parsed: ParsedIngredientRanged | null;
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

function scaleNutrientValue(raw: string, multiplier: number): string {
  const match = raw.match(/^([\d.]+)(\s*.*)$/);
  if (!match) return raw;
  const scaled = parseFloat(match[1]) * multiplier;
  const rounded = Math.round(scaled * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
  return formatted + match[2];
}

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
  parsed: ParsedIngredientRanged | null;
}

function parseEntry(
  entry: string | RecipeIngredient,
  index: number,
): InternalEntry {
  const text = typeof entry === "string" ? entry : entry.name;
  const group = typeof entry === "string" ? undefined : entry.group;
  return { index, group, text, parsed: parseIngredientRanged(text) };
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
  private readonly _entries: ReadonlyArray<InternalEntry>;

  constructor(schema: SchemaRecipe, state?: Partial<ScalableRecipeState>) {
    this.schema = schema;
    this.baseServings = parseServings(schema.recipeYield);
    this.state = Object.freeze({
      ingredientScale: state?.ingredientScale ?? 1,
      nutritionPortions: state?.nutritionPortions ?? null,
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
    return new ScalableRecipe(this.schema, {
      ...this.state,
      ingredientScale: newScale,
    });
  }

  splitPortions(portions: number): ScalableRecipe {
    if (!Number.isFinite(portions)) return this;
    const clamped = Math.max(1, Math.round(portions));
    if (clamped === this.state.nutritionPortions) return this;
    return new ScalableRecipe(this.schema, {
      ...this.state,
      nutritionPortions: clamped,
    });
  }

  anchorIngredientAmount(ref: IngredientRef, amount: number): ScalableRecipe {
    if (!Number.isFinite(amount) || amount <= 0) return this;
    const idx = refIndex(ref);
    const entry = this._entries[idx];
    if (!entry || !entry.parsed) return this;
    const base = midpoint(entry.parsed.amount);
    if (base <= 0) return this;
    const newScale = amount / base;
    if (newScale === this.state.ingredientScale) return this;
    return new ScalableRecipe(this.schema, {
      ...this.state,
      ingredientScale: newScale,
    });
  }

  reset(): ScalableRecipe {
    if (this.state.ingredientScale === 1 && this.state.nutritionPortions == null) {
      return this;
    }
    return new ScalableRecipe(this.schema);
  }

  get ingredients(): ScaledIngredient[] {
    const scale = this.state.ingredientScale;
    return this._entries.map((entry) => ({
      index: entry.index,
      group: entry.group,
      original: entry.text,
      parsed: entry.parsed,
      scaledAmount: entry.parsed
        ? scaleParsedAmount(entry.parsed.amount, scale)
        : null,
      unit: entry.parsed?.unit ?? null,
      rest: entry.parsed?.rest ?? entry.text,
    }));
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

  get hasNutrition(): boolean {
    const n = this.schema.nutrition;
    if (!n) return false;
    return NUTRIENT_KEYS.some((k) => !!n[k]);
  }

  get nutrition(): ScaledNutrition | null {
    const n = this.schema.nutrition;
    if (!n) return null;
    const mult = this.nutritionMultiplier;
    const result: ScaledNutrition = {};
    if (n.servingSize != null) result.servingSize = n.servingSize;
    for (const k of NUTRIENT_KEYS) {
      const v = n[k];
      if (v == null) continue;
      result[k] = mult === 1 ? v : scaleNutrientValue(v, mult);
    }
    return result;
  }
}

export type { ParsedAmount, ParsedIngredientRanged };
