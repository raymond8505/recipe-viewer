"use client";

import { useState } from "react";
import Link from "next/link";
import { PortionStepperButton, SegmentButton } from "@/components/buttons";
import { Button } from "@/components/ui/button";
import NutritionSourceBadge from "@/components/ingredients/NutritionSourceBadge";
import NutritionLinearLabel from "@/components/NutritionLinearLabel";
import { formatNutrientDisplay } from "@/lib/format";
import type { NutrientValue } from "@/lib/nutritionMath";
import type { ScalableRecipe } from "@/lib/ScalableRecipe";

/**
 * Which layout the resolved nutrition is rendered in. Both views show the same
 * values on the same basis — "label" is a layout swap, not another source.
 *   - "summary": the curated six-stat grid (the landing view)
 *   - "label":   every Schema.org nutrient as an FDA linear-display label
 */
type NutritionView = "summary" | "label";

const VIEW_OPTIONS: { value: NutritionView; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "label", label: "Full label" },
];

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
  // Declared above the early returns below, not next to the render that uses
  // it: hooks must run unconditionally. Don't "tidy" it downwards.
  const [view, setView] = useState<NutritionView>("summary");

  // Without schema nutrition the panel normally disappears entirely — but the
  // breakdown link must stay reachable, so a minimal shell renders instead
  // when there is somewhere to link to.
  if (!recipe.hasNutrition && !ingredientsHref) return null;

  const breakdownLink = ingredientsHref ? (
    <Button asChild size="sm" variant="secondary">
      <Link href={ingredientsHref}>Ingredient breakdown</Link>
    </Button>
  ) : null;

  // No view toggle in this branch: there are no values to render either view of.
  if (!recipe.hasNutrition) {
    return (
      <div className="mt-8 p-4 border border-border rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-foreground">Nutrition</h2>
          {breakdownLink}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          No nutrition data on this recipe yet.
        </p>
      </div>
    );
  }

  const resolved = recipe.nutrition()!;
  const nutrition = resolved.values;
  const portions = recipe.displayPortions;
  const canStep = recipe.baseServings != null;

  return (
    <div className="mt-8 p-4 border border-border rounded-2xl">
      {/* Wrap-safe: three controls have to fit beside the heading at the ~360px
          width cooking mode renders this at. */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl text-foreground">Nutrition</h2>
          <span className="text-sm text-muted-foreground">
            {recipe.nutritionUnitLabel}
          </span>
          {showSources && <NutritionSourceBadge source={resolved.source} />}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* First in the cluster so the stepper stays rightmost, where cooking
              mode's muscle memory expects it. The toggle shows whenever there
              is nutrition — including sparse recipes, where the label's run of
              em dashes is itself the useful signal. */}
          <div
            role="group"
            aria-label="Nutrition view"
            className="flex gap-1"
          >
            {VIEW_OPTIONS.map(({ value, label }) => (
              <SegmentButton
                key={value}
                active={view === value}
                onClick={() => setView(value)}
                // SegmentButton's base is ~32px tall; cooking mode's tap-target
                // floor is 44px. min-h-11 composes with its h-auto (different
                // properties, so no twMerge conflict) and aligns the pills to
                // the 44px stepper beside them.
                className="min-h-11"
              >
                {label}
              </SegmentButton>
            ))}
          </div>
          {breakdownLink}
          {canStep && (
            <div className="flex items-center gap-1">
              <PortionStepperButton
                direction="decrease"
                onClick={() => onSplitPortions(Math.max(1, portions - 1))}
                disabled={portions <= 1}
                aria-label="Larger portion size"
              />
              <span className="font-semibold text-foreground min-w-12 text-center tabular-nums text-sm">
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
      {/* Same resolved values, same basis — only the layout differs. The label
          shows every Schema.org nutrient (absent ones as an em dash); the grid
          shows the curated six and omits what's missing. */}
      {view === "label" ? (
        <NutritionLinearLabel
          values={nutrition}
          servingLabel={recipe.nutritionUnitLabel}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {nutrition.calories && <NutritionStat label="Calories" value={nutrition.calories} />}
          {nutrition.proteinContent && <NutritionStat label="Protein" value={nutrition.proteinContent} />}
          {nutrition.carbohydrateContent && <NutritionStat label="Carbs" value={nutrition.carbohydrateContent} />}
          {nutrition.fatContent && <NutritionStat label="Fat" value={nutrition.fatContent} />}
          {nutrition.fiberContent && <NutritionStat label="Fiber" value={nutrition.fiberContent} />}
          {nutrition.sodiumContent && <NutritionStat label="Sodium" value={nutrition.sodiumContent} />}
        </div>
      )}
    </div>
  );
}

function NutritionStat({ label, value }: { label: string; value: NutrientValue }) {
  return (
    <div className="bg-muted rounded-lg p-2 text-center">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="font-medium text-foreground">{formatNutrientDisplay(value)}</p>
    </div>
  );
}
