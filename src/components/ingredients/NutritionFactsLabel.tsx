import { formatNutrientDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IngredientNutrition } from "@/types/ingredient";
import {
  NUTRITION_LABEL_MICRONUTRIENTS,
  NUTRITION_LABEL_ROWS,
  type NutritionLabelRow,
} from "./nutritionFacts";

// An FDA-style Nutrition Facts panel, purely presentational: `nutrition` is
// already scaled to the serving that `servingLabel` names — no math in here.
// The point of the classic look (heavy rules, big bold Calories) is to let the
// user hold a real package label next to it and compare line by line.
//
// Absent nutrients render an em dash, not 0 — key sparsity is meaningful
// (absent ≠ zero), and it keeps a half-typed draft value from flashing as a
// fake zero while the user edits.
//
// The header is a <div>, not an h-tag: the global base layer styles headings
// serif-light, and this must stay sans black like the real label.

/** A row's value: the display-formatted amount, or an em dash when absent. */
function rowValue(nutrition: IngredientNutrition, row: NutritionLabelRow) {
  const value = nutrition[row.key];
  return value != null
    ? formatNutrientDisplay({ value, unit: row.unit })
    : "—";
}

export default function NutritionFactsLabel({
  nutrition,
  servingLabel,
  className,
}: {
  /** Nutrient amounts already scaled to the serving being shown. */
  nutrition: IngredientNutrition;
  /** The serving the amounts describe, e.g. "tbsp, whole (6 g)" or "100 g". */
  servingLabel: string;
  className?: string;
}) {
  const calories = nutrition.calories_kcal;
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
      <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-foreground/40 pt-1 text-sm font-bold">
        <span>Serving size</span>
        <span className="text-right">{servingLabel}</span>
      </div>

      <div className="mt-1 border-t-8 border-foreground pt-1">
        <div className="text-[10px] font-bold uppercase tracking-wide">
          Amount per serving
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="text-xl font-black">Calories</span>
          <span className="text-3xl font-black leading-none tabular-nums">
            {calories != null
              ? formatNutrientDisplay({ value: calories, unit: "" })
              : "—"}
          </span>
        </div>
      </div>

      <div className="mt-1 border-t-4 border-foreground">
        {NUTRITION_LABEL_ROWS.map((row) => (
          <div
            key={row.key}
            className="flex items-baseline justify-between gap-2 border-t border-foreground/40 py-0.5 text-sm first:border-t-0"
          >
            <span className={cn(row.bold && "font-bold", row.indent && "pl-4")}>
              {row.name}
            </span>
            <span className="tabular-nums">{rowValue(nutrition, row)}</span>
          </div>
        ))}
      </div>

      <div className="mt-1 flex flex-wrap gap-x-2 border-t-8 border-foreground pt-1 text-xs">
        {NUTRITION_LABEL_MICRONUTRIENTS.map((row, index) => (
          <span key={row.key} className="whitespace-nowrap">
            {index > 0 && <span aria-hidden="true">· </span>}
            {row.name} {rowValue(nutrition, row)}
          </span>
        ))}
      </div>
    </div>
  );
}
