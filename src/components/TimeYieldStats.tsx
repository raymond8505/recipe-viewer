import ServingsControl from "@/components/ServingsControl";
import type { SchemaRecipe } from "@/types/recipe";
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
  className?: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      {/* min-h matches ServingsControl's size-11 stepper row so values share a
          vertical center across cells (and the band height doesn't shift when
          servings switch between static and stepper). */}
      <p className="flex min-h-11 items-center justify-center font-semibold text-gray-900">
        {value}
      </p>
    </div>
  );
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
  className,
}: TimeYieldStatsProps) {
  if (!prepTime && !cookTime && !totalTime && !recipeYield) return null;

  return (
    <section
      aria-label="Time and yield"
      className={cn("border-y border-border mb-8", className)}
    >
      <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 sm:px-6 py-4">
        {prepTime && <Stat label="Prep time" value={prepTime} />}
        {cookTime && <Stat label="Cook time" value={cookTime} />}
        {totalTime && <Stat label="Total time" value={totalTime} />}
        {recipeYield &&
          (currentServings != null && onServingsChange ? (
            <ServingsControl
              servings={currentServings}
              onChange={onServingsChange}
            />
          ) : (
            <Stat
              label="Servings"
              value={
                Array.isArray(recipeYield) ? recipeYield[0] : recipeYield
              }
            />
          ))}
      </div>
    </section>
  );
}
