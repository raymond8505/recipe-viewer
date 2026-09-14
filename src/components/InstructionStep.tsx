"use client";

import type { RecipeStep } from "@/types/recipe";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface InstructionStepProps {
  step: RecipeStep;
  /** 1-based number shown in the badge. */
  number: number;
  /** Makes the step a toggle button for marking it done; omit it for a plain read-only step. */
  completion?: { done: boolean; onToggle: () => void };
  /** Merged onto the number badge, which sets no size of its own. */
  badgeClassName?: string;
  /** Merged onto the step text, which sets no size of its own. */
  textClassName?: string;
}

/**
 * One instruction step: a numbered badge beside its text. With `completion` the step
 * is a real toggle button — keyboard-operable, and a done step shows a check and
 * struck-through text.
 */
export default function InstructionStep({
  step,
  number,
  completion,
  badgeClassName,
  textClassName,
}: InstructionStepProps) {
  const done = completion?.done ?? false;
  // Spans, not a <p>: the completable step wraps this in a <button>, which takes
  // phrasing content only.
  const body = (
    <>
      <span
        className={cn(
          "shrink-0 rounded-full text-white font-bold flex items-center justify-center transition-colors",
          done ? "bg-green-500" : "bg-secondary-foreground",
          badgeClassName,
        )}
      >
        {done ? <CheckIcon size={14} /> : number}
      </span>
      <span
        className={cn(
          "block leading-relaxed pt-0.5 transition-colors",
          done ? "line-through text-gray-400" : "text-gray-700",
          textClassName,
        )}
      >
        {step.text}
      </span>
    </>
  );

  if (!completion) return <li className="flex gap-4">{body}</li>;

  return (
    <li>
      <button
        type="button"
        onClick={completion.onToggle}
        aria-pressed={done}
        aria-label={`Step ${number}: ${step.text}`}
        className="flex w-full gap-4 text-left active:opacity-60"
      >
        {body}
      </button>
    </li>
  );
}
