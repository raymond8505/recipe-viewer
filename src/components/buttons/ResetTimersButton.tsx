import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The "Reset All" timers action — the neutral outline counterpart to
 * `AddTimerButton`, sitting beside it in both the desktop column and the mobile
 * ribbon. Owns the outline look + pill shape; padding differs slightly per
 * surface and comes in via `className`. The caller keeps the
 * `timers.length > 0` render guard — this button stays timer-agnostic.
 */
export const ResetTimersButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "children">
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    variant="outline"
    className={cn("h-auto shrink-0", className)}
    {...props}
  >
    Reset All
  </Button>
));
ResetTimersButton.displayName = "ResetTimersButton";
