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
    { label: "Prep time", value: prepTime, field: "prep" },
    { label: "Cook time", value: cookTime, field: "cook" },
    { label: "Total time", value: totalTime, field: "total" },
  ] as const;

  const weightLabel = getYieldWeightLabel(recipeYield);

  return (
    <section
      aria-label="Time and yield"
      className={cn("border-y border-border mb-8", className)}
    >
      <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 sm:px-6 py-4">
        {timeStats.map(({ label, value, field }) =>
          editing || value ? (
            <Stat
              key={field}
              label={label}
              value={value ?? ""}
              editing={editing}
              onChange={
                editing ? (v) => onTimeChange?.(field, v) : undefined
              }
            />
          ) : null,
        )}
        {editing ? (
          <>
            <Stat
              label="Servings"
              value={yieldServings ?? ""}
              editing
              onChange={(v) => onYieldChange?.("servings", v)}
              placeholder="e.g. 4 servings"
            />
            {/* Always shown while editing so a string-only yield can be
                upgraded to a QuantitativeValue with a weight/volume basis. */}
            <Stat
              label="Yield weight"
              value={yieldWeight ?? ""}
              editing
              onChange={(v) => onYieldChange?.("weight", v)}
              placeholder="e.g. 454 g"
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
                  label="Servings"
                  value={getYieldLabel(recipeYield) ?? ""}
                />
              ))}
            {/* Read mode surfaces the weight only for an object yield that
                actually carries a valueReference. */}
            {weightLabel && <Stat label="Yield weight" value={weightLabel} />}
          </>
        )}
      </div>
    </section>
  );
}
