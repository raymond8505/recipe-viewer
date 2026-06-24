import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PortionStepperButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "children"> {
  /** Which way this stepper steps — picks the `+` / `−` glyph. */
  direction: "increase" | "decrease";
  /**
   * Required — the label is passed in (not derived from `direction`) because
   * callers phrase it differently: a `−` is "Decrease servings" but "Larger
   * portion size" (fewer portions ⇒ each portion is larger).
   */
  "aria-label": string;
}

/**
 * Large round `+` / `−` stepper used by ServingsControl, NutritionPanel and
 * the AddTimerModal duration controls. 44px touch target, brand hover/active
 * tint. The glyph comes from `direction`; the label comes from the caller.
 */
export function PortionStepperButton({
  direction,
  className,
  variant = "ghost",
  ...props
}: PortionStepperButtonProps) {
  return (
    <Button
      variant={variant}
      className={cn(
        "size-11 rounded-lg text-xl text-muted-foreground hover:bg-brand-subtle hover:text-brand active:bg-brand-subtle disabled:opacity-30",
        className,
      )}
      {...props}
    >
      {direction === "increase" ? "+" : "−"}
    </Button>
  );
}
