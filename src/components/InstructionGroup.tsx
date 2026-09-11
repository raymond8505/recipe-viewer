import type { RecipeInstructionGroup } from "@/types/recipe";
import InstructionStep from "@/components/InstructionStep";
import { cn } from "@/lib/utils";

interface InstructionGroupProps {
  group: RecipeInstructionGroup;
  /** Whether the step at `stepIndex` is done. Read only when `onToggleStep` is given. */
  isStepDone?: (stepIndex: number) => boolean;
  /** Makes every step completable; omit it for read-only steps. */
  onToggleStep?: (stepIndex: number) => void;
  /** Merged onto the heading, which sets no text size of its own. */
  headingClassName?: string;
  /** Handed to every step's number badge. */
  stepBadgeClassName?: string;
  /** Handed to every step's text. */
  stepTextClassName?: string;
}

/** One instruction group: its heading (none for a nameless run) over its steps, numbered from 1. */
export default function InstructionGroup({
  group,
  isStepDone,
  onToggleStep,
  headingClassName,
  stepBadgeClassName,
  stepTextClassName,
}: InstructionGroupProps) {
  return (
    <div>
      {group.name && (
        <h3
          className={cn(
            "font-sans font-semibold uppercase tracking-widest text-brand mb-3",
            headingClassName,
          )}
        >
          {group.name}
        </h3>
      )}
      <ol className="space-y-3">
        {group.steps.map((step, si) => (
          <InstructionStep
            key={si}
            step={step}
            number={si + 1}
            completion={
              onToggleStep && {
                done: isStepDone?.(si) ?? false,
                onToggle: () => onToggleStep(si),
              }
            }
            badgeClassName={stepBadgeClassName}
            textClassName={stepTextClassName}
          />
        ))}
      </ol>
    </div>
  );
}
