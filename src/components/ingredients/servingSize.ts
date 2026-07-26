import type { UsdaFoodPortion } from "@/types/ingredient";

// Ingredients store nutrition per 100 g and have no serving-size column; this
// derives a human-readable representative portion from the USDA food_portions
// audit trail instead, e.g. "1 tsp ≈ 2 g". SR Legacy foods hide the unit in
// `modifier` (e.g. "tsp, whole") with measureUnit.name === "undetermined";
// Foundation foods populate measureUnit.name.

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

function unitLabel(portion: UsdaFoodPortion): string | null {
  const name = portion.measureUnit?.name;
  if (name && name !== "undetermined") return name;
  if (portion.modifier) return portion.modifier;
  return null;
}

export function formatServingSize(
  portions: UsdaFoodPortion[] | null,
): string {
  const portion = representativePortion(portions);

  const amount = portion.amount ?? 1;
  const unit = unitLabel(portion);
  const measure = unit ? `${amount} ${unit}` : null;

  return measure
    ? `${measure} ≈ ${formatGrams(portion.gramWeight)}`
    : formatGrams(portion.gramWeight);
}
