import type { RecipeInstructionGroup } from "@/types/recipe";
import InstructionGroup from "@/components/InstructionGroup";

interface InstructionListProps {
  groups: RecipeInstructionGroup[];
  /** Whether a step is done. Read only when `onToggleStep` is given. */
  isStepDone?: (groupIndex: number, stepIndex: number) => boolean;
  /** Makes every step completable; omit it for read-only steps. */
  onToggleStep?: (groupIndex: number, stepIndex: number) => void;
  /** Merged onto every group heading, which sets no text size of its own. */
  headingClassName?: string;
  /** Handed to every step's number badge. */
  stepBadgeClassName?: string;
  /** Handed to every step's text. */
  stepTextClassName?: string;
}

/** A recipe's instructions, group by group; step numbers restart in each group. */
export default function InstructionList({
  groups,
  isStepDone,
  onToggleStep,
  ...groupProps
}: InstructionListProps) {
  return (
    <div className="space-y-6">
      {groups.map((group, gi) => (
        <InstructionGroup
          key={gi}
          group={group}
          isStepDone={isStepDone && ((si) => isStepDone(gi, si))}
          onToggleStep={onToggleStep && ((si) => onToggleStep(gi, si))}
          {...groupProps}
        />
      ))}
    </div>
  );
}
