"use client";

import { PortionStepperButton } from "@/components/buttons";
import type { ScalableRecipe } from "@/lib/ScalableRecipe";

export { scaleNutrientValue } from "@/lib/ScalableRecipe";

interface NutritionPanelProps {
  recipe: ScalableRecipe;
  onSplitPortions: (n: number) => void;
}

export default function NutritionPanel({ recipe, onSplitPortions }: NutritionPanelProps) {
  if (!recipe.hasNutrition) return null;
  const nutrition = recipe.nutrition!;
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
        </div>
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

function NutritionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  );
}
