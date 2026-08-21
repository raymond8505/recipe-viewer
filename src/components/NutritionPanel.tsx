"use client";

import Link from "next/link";
import { PortionStepperButton } from "@/components/buttons";
import { Button } from "@/components/ui/button";
import NutritionSourceBadge from "@/components/ingredients/NutritionSourceBadge";
import { formatNutrientDisplay } from "@/lib/format";
import type { NutrientValue } from "@/lib/nutritionMath";
import type { ScalableRecipe } from "@/lib/ScalableRecipe";

interface NutritionPanelProps {
  recipe: ScalableRecipe;
  onSplitPortions: (n: number) => void;
  /**
   * Link target for the NutritionDetail screen (/recipes/[id]/ingredients).
   * The panel receives a ScalableRecipe (no id), so the caller builds the
   * href — and only passes it for callers that may curate nutrition.
   */
  ingredientsHref?: string;
  /**
   * Whether to show the source badge (ingredients vs recipe) in the header.
   * The provenance distinction is an editor concern, not something to surface
   * to anonymous visitors in production — so callers pass their
   * `canCurateNutrition` value here, not `isLoggedIn`.
   */
  showSources?: boolean;
}

export default function NutritionPanel({
  recipe,
  onSplitPortions,
  ingredientsHref,
  showSources = false,
}: NutritionPanelProps) {
  // Without schema nutrition the panel normally disappears entirely — but the
  // breakdown link must stay reachable, so a minimal shell renders instead
  // when there is somewhere to link to.
  if (!recipe.hasNutrition && !ingredientsHref) return null;

  const breakdownLink = ingredientsHref ? (
    <Button asChild size="sm" variant="secondary">
      <Link href={ingredientsHref}>Ingredient breakdown</Link>
    </Button>
  ) : null;

  if (!recipe.hasNutrition) {
    // Partial normalization coverage: nutrition() rejects the incomplete total
    // (all-or-nothing) — say why instead of the generic empty message.
    const excluded = recipe.excludedNutritionLineCount;
    return (
      <div className="mt-8 p-4 border border-gray-200 rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-gray-900">Nutrition</h2>
          {breakdownLink}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {excluded > 0
            ? `${excluded} ingredient ${excluded === 1 ? "line doesn't" : "lines don't"} have a usable amount, so a total can't be computed — set grams in the ingredient breakdown.`
            : "No nutrition data on this recipe yet."}
        </p>
      </div>
    );
  }

  const resolved = recipe.nutrition()!;
  const nutrition = resolved.values;
  const portions = recipe.displayPortions;
  const canStep = recipe.baseServings != null;

  return (
    <div className="mt-8 p-4 border border-gray-200 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl text-gray-900">Nutrition</h2>
          <span className="text-sm text-gray-500">
            {recipe.nutritionUnitLabel}
          </span>
          {showSources && <NutritionSourceBadge source={resolved.source} />}
        </div>
        <div className="flex items-center gap-3">
          {breakdownLink}
          {canStep && (
            <div className="flex items-center gap-1">
              <PortionStepperButton
                direction="decrease"
                onClick={() => onSplitPortions(Math.max(1, portions - 1))}
                disabled={portions <= 1}
                aria-label="Larger portion size"
              />
              <span className="font-semibold text-gray-900 min-w-12 text-center tabular-nums text-sm">
                1/{portions}
              </span>
              <PortionStepperButton
                direction="increase"
                onClick={() => onSplitPortions(portions + 1)}
                aria-label="Smaller portion size"
              />
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        {nutrition.calories && <NutritionStat label="Calories" value={nutrition.calories} />}
        {nutrition.proteinContent && <NutritionStat label="Protein" value={nutrition.proteinContent} />}
        {nutrition.carbohydrateContent && <NutritionStat label="Carbs" value={nutrition.carbohydrateContent} />}
        {nutrition.fatContent && <NutritionStat label="Fat" value={nutrition.fatContent} />}
        {nutrition.fiberContent && <NutritionStat label="Fiber" value={nutrition.fiberContent} />}
        {nutrition.sodiumContent && <NutritionStat label="Sodium" value={nutrition.sodiumContent} />}
      </div>
    </div>
  );
}

function NutritionStat({ label, value }: { label: string; value: NutrientValue }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="font-medium text-gray-900">{formatNutrientDisplay(value)}</p>
    </div>
  );
}
