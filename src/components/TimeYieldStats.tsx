import ServingsControl from "@/components/ServingsControl";
import ServingsInputCell from "@/components/ServingsInputCell";
import Stat from "@/components/Stat";
import type { SchemaRecipe } from "@/types/recipe";
import { getYieldLabel, getYieldUnit } from "@/lib/format";
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
   * When set, the servings cell becomes a base-servings editor (persisted
   * `recipeYield`, not display scaling) and takes precedence over the stepper.
   * The band renders even with no stats at all, so a recipe without a yield
   * can gain one while editing.
   */
  servingsEdit?: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  };
  className?: string;
}

/**
 * The Time / Yield stats band shown under the recipe image in both
 * RecipeDetail and CookingMode. A full-width section framed by hairline
 * top/bottom borders, with the stats centered in a content container inside —
 * place it at a level where the parent spans the full region width (callers
 * pass negative margins via `className` if a padded ancestor must be escaped).
 * Renders nothing when there are no stats to show and no servings editor.
 */
export default function TimeYieldStats({
  prepTime,
  cookTime,
  totalTime,
  recipeYield,
  currentServings,
  onServingsChange,
  servingsEdit,
  className,
}: TimeYieldStatsProps) {
  if (!prepTime && !cookTime && !totalTime && !recipeYield && !servingsEdit)
    return null;

  return (
    <section
      aria-label="Time and yield"
      className={cn("border-y border-border mb-8", className)}
    >
      <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 sm:px-6 py-4">
        {prepTime && <Stat label="Prep time" value={prepTime} />}
        {cookTime && <Stat label="Cook time" value={cookTime} />}
        {totalTime && <Stat label="Total time" value={totalTime} />}
        {servingsEdit ? (
          <ServingsInputCell
            label={getYieldUnit(recipeYield) ?? "Servings"}
            value={servingsEdit.value}
            onChange={servingsEdit.onChange}
            disabled={servingsEdit.disabled}
          />
        ) : (
          recipeYield &&
          (currentServings != null && onServingsChange ? (
            <ServingsControl
              servings={currentServings}
              onChange={onServingsChange}
              unitLabel={getYieldUnit(recipeYield) ?? undefined}
            />
          ) : (
            <Stat label="Servings" value={getYieldLabel(recipeYield) ?? ""} />
          ))
        )}
      </div>
    </section>
  );
}
