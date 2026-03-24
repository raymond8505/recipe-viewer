"use client";

import { useState } from "react";
import type { RecipeRow } from "@/types/recipe";

type NutritionData = NonNullable<RecipeRow["metadata"]["schema"]["nutrition"]>;

interface NutritionPanelProps {
  nutrition: NutritionData;
  /** Parsed recipe yield (e.g. 4 for "4 servings"). Required to enable the portions scaler. */
  totalServings: number | null;
}

export function scaleNutrientValue(raw: string, multiplier: number): string {
  const match = raw.match(/^([\d.]+)(\s*.*)$/);
  if (!match) return raw;
  const scaled = parseFloat(match[1]) * multiplier;
  const unit = match[2];
  const rounded = Math.round(scaled * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
  return formatted + unit;
}

function hasNutritionData(n: NutritionData): boolean {
  return !!(
    n.calories ||
    n.proteinContent ||
    n.carbohydrateContent ||
    n.fatContent ||
    n.fiberContent ||
    n.sodiumContent
  );
}

export default function NutritionPanel({ nutrition, totalServings }: NutritionPanelProps) {
  const [portions, setPortions] = useState<number>(() => totalServings ?? 1);

  if (!hasNutritionData(nutrition)) return null;

  // scale = total recipe nutrition / portions
  // total recipe nutrition = per-serving × totalServings
  // → per-portion = per-serving × (totalServings / portions)
  const multiplier = totalServings != null ? totalServings / portions : 1;
  const isDefault = totalServings == null || portions === totalServings;

  const scale = (raw: string) =>
    isDefault ? raw : scaleNutrientValue(raw, multiplier);

  const portionLabel = isDefault ? "per serving" : "per portion";

  return (
    <div className="mt-8 p-4 border border-gray-200 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-semibold text-gray-900">Nutrition</h2>
          <span className="text-sm text-gray-500">{portionLabel}</span>
        </div>
        {totalServings != null && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPortions((p) => Math.max(1, p - 1))}
              disabled={portions <= 1}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:bg-orange-100 hover:text-orange-600 active:bg-orange-200 transition-colors text-xl disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Fewer portions"
            >
              −
            </button>
            <span className="font-semibold text-gray-900 min-w-[2.5rem] text-center tabular-nums text-sm">
              {portions}
            </span>
            <button
              onClick={() => setPortions((p) => p + 1)}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:bg-orange-100 hover:text-orange-600 active:bg-orange-200 transition-colors text-xl"
              aria-label="More portions"
            >
              +
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        {nutrition.calories && (
          <NutritionStat label="Calories" value={scale(nutrition.calories)} />
        )}
        {nutrition.proteinContent && (
          <NutritionStat label="Protein" value={scale(nutrition.proteinContent)} />
        )}
        {nutrition.carbohydrateContent && (
          <NutritionStat label="Carbs" value={scale(nutrition.carbohydrateContent)} />
        )}
        {nutrition.fatContent && (
          <NutritionStat label="Fat" value={scale(nutrition.fatContent)} />
        )}
        {nutrition.fiberContent && (
          <NutritionStat label="Fiber" value={scale(nutrition.fiberContent)} />
        )}
        {nutrition.sodiumContent && (
          <NutritionStat label="Sodium" value={scale(nutrition.sodiumContent)} />
        )}
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
