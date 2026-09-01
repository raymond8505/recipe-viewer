import { Fragment } from "react";
import { formatNutrientDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NutrientValues } from "@/lib/nutritionMath";
import { LINEAR_NUTRIENT_ROWS } from "./nutritionLinearRows";

// The FDA "linear display" Nutrition Facts label — the compact one-continuous-
// run format real packages use when there's no room for the full panel. Purely
// presentational: `values` is already scaled to the portion `servingLabel`
// names, so there is no math in here.
//
// Sibling of, not a variant of, ingredients/NutritionFactsLabel: that one is
// the catalog editor's label and keys on IngredientNutrition (snake_case bare
// numbers, carries calcium/iron/potassium, has no unsaturated fat), while this
// one keys on NutrientField. Converting between the two shapes is lossy in both
// directions, so they stay separate components in the same visual family — the
// class strings below deliberately mirror that file's.
//
// Absent nutrients render an em dash, not 0 — key sparsity is meaningful
// (absent ≠ zero), and showing every slot is the point of this view: a reader
// can see at a glance what the recipe doesn't track.
//
// The header is a <div>, not an h-tag: the global base layer styles headings
// serif-light, and this must stay sans black like the real label.

export default function NutritionLinearLabel({
  values,
  servingLabel,
  className,
}: {
  /**
   * Resolved nutrition already scaled to the portion being shown —
   * `ScalableRecipe.nutrition()!.values`.
   *
   * Typed `NutrientValues` rather than `ScaledNutrition` deliberately:
   * `servingSize` rides through `scaleNutrition` unscaled, so it still reads
   * "1 cup" after the user splits the recipe into eight portions. An FDA label
   * with a "Serving size" line begs you to use it; this type makes that
   * mistake unavailable. Use `servingLabel` instead.
   */
  values: NutrientValues;
  /**
   * The basis the amounts describe — `ScalableRecipe.nutritionUnitLabel`,
   * e.g. "per serving" or "per 114 g serving". Already a prepositional phrase,
   * so it is rendered bare rather than behind a "Serving size" prefix.
   */
  servingLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-foreground bg-card p-3 font-sans text-card-foreground",
        className,
      )}
    >
      <div className="text-2xl font-black leading-none tracking-tight">
        Nutrition Facts
      </div>
      <div className="mt-1 border-t border-foreground/40 pt-1 text-sm font-bold">
        {servingLabel}
      </div>

      <div className="mt-1 border-t-8 border-foreground pt-1 text-[10px] font-bold uppercase tracking-wide">
        Amount per serving
      </div>

      {/*
        One flowing run. Each name+value pair is `whitespace-nowrap` so a
        nutrient never splits across lines, and the literal {" "} either side of
        the separator is load-bearing: real whitespace text nodes are what
        create the soft-wrap opportunities between pairs. Removing them (a
        tempting "tidy") makes the run overflow horizontally on a narrow screen.
      */}
      <p className="mt-1 border-t-4 border-foreground pt-1 text-sm leading-relaxed">
        {LINEAR_NUTRIENT_ROWS.map((row, i) => {
          const value = values[row.key];
          return (
            <Fragment key={row.key}>
              {i > 0 && (
                <>
                  {" "}
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>{" "}
                </>
              )}
              <span className="whitespace-nowrap">
                <span className={cn(!row.sub && "font-bold")}>{row.name}</span>{" "}
                <span className="tabular-nums">
                  {value ? formatNutrientDisplay(value) : "—"}
                </span>
              </span>
            </Fragment>
          );
        })}
      </p>
    </div>
  );
}
