"use client";

import type { RecipeStep } from "@/types/recipe";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface InstructionStepProps {
  step: RecipeStep;
  /** 1-based number shown in the badge. */
  number: number;
  /** Makes the step tappable to mark it done; omit it for a plain read-only step. */
  completion?: { done: boolean; onToggle: () => void };
  /** Merged onto the number badge, which sets no size of its own. */
  badgeClassName?: string;
  /** Merged onto the step text, which sets no size of its own. */
  textClassName?: string;
}

/**
 * One instruction step: a numbered badge beside its text. With `completion` the
 * whole step is a toggle button — a done step shows a check and struck-through text.
 */
export default function InstructionStep({
  step,
  number,
  completion,
  badgeClassName,
  textClassName,
}: InstructionStepProps) {
  const done = completion?.done ?? false;
  return (
    <li
      className={cn("flex gap-4", completion && "active:opacity-60")}
      onClick={completion?.onToggle}
      role={completion ? "button" : undefined}
      aria-pressed={completion ? done : undefined}
      aria-label={
        completion ? `Step ${number}: ${done ? "completed" : "mark complete"}` : undefined
      }
    >
      <span
        className={cn(
          "shrink-0 rounded-full text-white font-bold flex items-center justify-center transition-colors",
          done ? "bg-green-500" : "bg-secondary-foreground",
          badgeClassName,
        )}
      >
        {done ? <CheckIcon size={14} /> : number}
      </span>
      <p
        className={cn(
          "leading-relaxed pt-0.5 transition-colors",
          done ? "line-through text-gray-400" : "text-gray-700",
          textClassName,
        )}
      >
        {step.text}
      </p>
    </li>
  );
}
