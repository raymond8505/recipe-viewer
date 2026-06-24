import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PortionStepperButtonProps
  extends Omit<ButtonProps, "children"> {
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
 * Large round `+` / `−` stepper used by ServingsControl and NutritionPanel.
 * 44px touch target, brand hover/active tint. The glyph comes from
 * `direction`; the label comes from the caller.
 */
export const PortionStepperButton = React.forwardRef<
  HTMLButtonElement,
  PortionStepperButtonProps
>(({ direction, className, variant = "ghost", ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant}
    className={cn(
      "size-11 rounded-lg text-xl text-muted-foreground hover:bg-brand-subtle hover:text-brand active:bg-brand-subtle disabled:opacity-30",
      className,
    )}
    {...props}
  >
    {direction === "increase" ? "+" : "−"}
  </Button>
));
PortionStepperButton.displayName = "PortionStepperButton";
