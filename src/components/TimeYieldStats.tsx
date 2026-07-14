import ServingsControl from "@/components/ServingsControl";
import Stat from "@/components/Stat";
import type { SchemaRecipe } from "@/types/recipe";
import { getYieldLabel, getYieldUnit, getYieldWeightLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TimeYieldStatsProps {
  /** Pre-formatted durations (see `formatDuration`); null/undefined stats are skipped. */
  prepTime?: string | null;
  cookTime?: string | null;
  totalTime?: string | null;
  recipeYield?: SchemaRecipe["recipeYield"];
  /**
   * When non-null (and `onServingsChange` is provided), the servings cell is a
   * scalable stepper; otherwise it renders `recipeYield` as a static stat.
   */
  currentServings?: number | null;
  onServingsChange?: (n: number) => void;
  /**
   * When true, the time and yield cells become editable text inputs (all shown
   * even when blank, so a missing time/yield can be added — including upgrading
   * a string-only yield to a QuantitativeValue).
   */
  editing?: boolean;
  /** Receives the edited display string for a time cell. Required when editing. */
  onTimeChange?: (field: "prep" | "cook" | "total", value: string) => void;
  /** Edit-mode yield labels: the serving count and the raw weight/volume. */
  yieldServings?: string;
  yieldWeight?: string;
  /** Receives the edited yield display string. Required when editing. */
  onYieldChange?: (field: "servings" | "weight", value: string) => void;
  className?: string;
}

/**
 * The Time / Yield stats band shown under the recipe image in both
 * RecipeDetail and CookingMode. A full-width section framed by hairline
 * top/bottom borders, with the stats centered in a content container inside —
 * place it at a level where the parent spans the full region width (callers
 * pass negative margins via `className` if a padded ancestor must be escaped).
 * Renders nothing when there are no stats to show.
 */
export default function TimeYieldStats({
  prepTime,
  cookTime,
  totalTime,
  recipeYield,
  currentServings,
  onServingsChange,
  editing,
  onTimeChange,
  yieldServings,
  yieldWeight,
  onYieldChange,
  className,
}: TimeYieldStatsProps) {
  // While editing, the band always shows (empty time/yield cells can be filled).
  if (!editing && !prepTime && !cookTime && !totalTime && !recipeYield)
    return null;

  const timeStats = [
    { label: "Prep time", value: prepTime, field: "prep", hint: "e.g. 15 min" },
    { label: "Cook time", value: cookTime, field: "cook", hint: "e.g. 45 min" },
    {
      label: "Total time",
      value: totalTime,
      field: "total",
      hint: "e.g. 1 hr 30 min",
    },
  ] as const;

  const weightLabel = getYieldWeightLabel(recipeYield);

  return (
    <section
      aria-label="Time and yield"
      className={cn("border-y border-border mb-8", className)}
    >
      {/* px here (not on the centered row) recreates the parent's padding that
          the caller's -mx breakout cancels, so the max-w row lines up with the
          page's normal content column. Fixed-width cells in a centered
          flex-wrap keep the columns aligned and center each row (including a
          wrapped final row) instead of left-packing. */}
      <div className="px-4 sm:px-6 py-4">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-4">
          {timeStats.map(({ label, value, field, hint }) =>
            editing || value ? (
              <Stat
                key={field}
                className="w-28"
                label={label}
                value={value ?? ""}
                editing={editing}
                onChange={editing ? (v) => onTimeChange?.(field, v) : undefined}
                hint={editing ? hint : undefined}
              />
            ) : null,
          )}
          {editing ? (
            <>
              <Stat
                className="w-28"
                label="Servings"
                value={yieldServings ?? ""}
                editing
                onChange={(v) => onYieldChange?.("servings", v)}
                hint="e.g. 4 servings"
              />
              {/* Always shown while editing so a string-only yield can be
                  upgraded to a QuantitativeValue with a weight/volume basis. */}
              <Stat
                className="w-28"
                label="Total yield"
                value={yieldWeight ?? ""}
                editing
                onChange={(v) => onYieldChange?.("weight", v)}
                hint="e.g. 50 g or 50 ml"
              />
            </>
          ) : (
            <>
              {recipeYield &&
                (currentServings != null && onServingsChange ? (
                  <ServingsControl
                    servings={currentServings}
                    onChange={onServingsChange}
                    unitLabel={getYieldUnit(recipeYield) ?? undefined}
                  />
                ) : (
                  <Stat
                    className="w-28"
                    label="Servings"
                    value={getYieldLabel(recipeYield) ?? ""}
                  />
                ))}
              {/* Read mode surfaces the total (weight/volume) only for an object
                  yield that actually carries a valueReference. */}
              {weightLabel && (
                <Stat className="w-28" label="Total yield" value={weightLabel} />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
