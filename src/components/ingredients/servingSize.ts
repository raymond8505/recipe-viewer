import type { UsdaFoodPortion } from "@/types/ingredient";

// Ingredients store nutrition per 100 g and have no serving-size column; this
// derives a human-readable representative portion from the USDA food_portions
// audit trail instead, e.g. "1 tsp ≈ 2 g". SR Legacy foods hide the unit in
// `modifier` (e.g. "tsp, whole") with measureUnit.name === "undetermined";
// Foundation foods populate measureUnit.name. Returns null when there is no
// usable portion so the caller can render an em dash.

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
): string | null {
  if (!portions || portions.length === 0) return null;

  const portion = portions.find((p) => p.gramWeight > 0);
  if (!portion) return null;

  const amount = portion.amount ?? 1;
  const unit = unitLabel(portion);
  const measure = unit ? `${amount} ${unit}` : null;

  return measure
    ? `${measure} ≈ ${formatGrams(portion.gramWeight)}`
    : formatGrams(portion.gramWeight);
}
