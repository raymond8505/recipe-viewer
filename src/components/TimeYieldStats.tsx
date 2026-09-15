import ServingsControl from "@/components/ServingsControl";
import ServingsInputCell from "@/components/ServingsInputCell";
import Stat from "@/components/Stat";
import TimeInputCell from "@/components/TimeInputCell";
import { formatServings } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TimeYieldStatsProps {
  /** Pre-formatted durations (see `formatDuration`); null/undefined stats are skipped. */
  prepTime?: string | null;
  cookTime?: string | null;
  totalTime?: string | null;
  /**
   * The servings columns. `servingsAmount` null means the recipe has no serving
   * count, and the cell is skipped; `servingsUnit` null means the source named
   * none, and the generic fallback labels it.
   */
  servingsAmount?: number | null;
  servingsUnit?: string | null;
  /**
   * When non-null (and `onServingsChange` is provided), the servings cell is a
   * scalable stepper; otherwise it renders the stored servings as a static stat.
   */
  currentServings?: number | null;
  onServingsChange?: (n: number) => void;
  /**
   * When set, the servings cell becomes a base-servings editor — both persisted
   * columns, not display scaling — and takes precedence over the stepper. The
   * band renders even with no stats at all, so a recipe with no serving count
   * can gain one while editing.
   */
  servingsEdit?: {
    value: string;
    onChange: (value: string) => void;
    unit: string;
    onUnitChange: (value: string) => void;
    disabled?: boolean;
  };
  /**
   * When set, the three time cells become inputs over the persisted times and
   * take precedence over the static stats. Like `servingsEdit`, this forces the
   * band to render even with no stats at all — a recipe that has never had a
   * cook time is exactly the one that needs somewhere to type it.
   */
  timesEdit?: {
    prep: TimeEdit;
    cook: TimeEdit;
    total: TimeEdit;
  };
  className?: string;
}

interface TimeEdit {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
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
  servingsAmount,
  servingsUnit,
  currentServings,
  onServingsChange,
  servingsEdit,
  timesEdit,
  className,
}: TimeYieldStatsProps) {
  if (
    !prepTime &&
    !cookTime &&
    !totalTime &&
    servingsAmount == null &&
    !servingsEdit &&
    !timesEdit
  )
    return null;

  return (
    <section
      aria-label="Time and yield"
      className={cn("border-y border-border mb-8", className)}
    >
      <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 sm:px-6 py-4">
        {timesEdit ? (
          <>
            <TimeInputCell label="Prep time" {...timesEdit.prep} />
            <TimeInputCell label="Cook time" {...timesEdit.cook} />
            <TimeInputCell label="Total time" {...timesEdit.total} />
          </>
        ) : (
          <>
            {prepTime && <Stat label="Prep time" value={prepTime} />}
            {cookTime && <Stat label="Cook time" value={cookTime} />}
            {totalTime && <Stat label="Total time" value={totalTime} />}
          </>
        )}
        {servingsEdit ? (
          <ServingsInputCell {...servingsEdit} />
        ) : (
          servingsAmount != null &&
          (currentServings != null && onServingsChange ? (
            <ServingsControl
              servings={currentServings}
              onChange={onServingsChange}
              unitLabel={servingsUnit?.trim() || undefined}
            />
          ) : (
            <Stat
              label="Servings"
              value={formatServings(servingsAmount, servingsUnit ?? null) ?? ""}
            />
          ))
        )}
      </div>
    </section>
  );
}
