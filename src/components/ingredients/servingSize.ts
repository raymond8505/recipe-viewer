import { portionLabel } from "@/lib/foodPortions";
import type { UsdaFoodPortion } from "@/types/ingredient";

// Ingredients store nutrition per 100 g and have no serving-size column; this
// derives a human-readable representative portion from the USDA food_portions
// audit trail instead, e.g. "1 tsp ≈ 2 g". The label comes from
// `portionLabel`, the same one `food_portions` uniqueness keys on, so the name
// a portion is read under and the name it is deduped under are one thing.

// The basis an ingredient with no usable portion falls back to: a plain 100 g
// weight (matches DEFAULT_PORTION_DRAFT, the create-form seed). Scaling
// nutrition to it is an identity transform, so a portionless row keeps showing
// its stored per-100 g values while still reading as "per the serving shown".
const DEFAULT_PORTION: UsdaFoodPortion = { gramWeight: 100 };

// The portion the manager row treats as "the serving": the first one with a
// positive weight, or the 100 g default. Shared by formatServingSize (the label)
// and the row's nutrition scaling (the numbers) so the two can never pick
// different portions.
export function representativePortion(
  portions: UsdaFoodPortion[] | null,
): UsdaFoodPortion {
  return portions?.find((p) => p.gramWeight > 0) ?? DEFAULT_PORTION;
}

function formatGrams(grams: number): string {
  // Small portions (a teaspoon of a spice is a few grams) lose too much to
  // whole-number rounding, so keep one decimal below 10 g; larger weights round
  // whole since the fraction is noise. Trailing ".0" is dropped by Number().
  const rounded =
    grams < 10 ? Math.round(grams * 10) / 10 : Math.round(grams);
  return `${rounded} g`;
}

export function formatServingSize(
  portions: UsdaFoodPortion[] | null,
): string {
  const portion = representativePortion(portions);

  const amount = portion.amount ?? 1;
  const unit = portionLabel(portion);
  const measure = unit ? `${amount} ${unit}` : null;

  return measure
    ? `${measure} ≈ ${formatGrams(portion.gramWeight)}`
    : formatGrams(portion.gramWeight);
}
