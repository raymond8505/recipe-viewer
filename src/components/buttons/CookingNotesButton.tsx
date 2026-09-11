import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Opens the cooking-notes modal. Sits right of "Reset All" in both timer
 * surfaces (desktop column + mobile ribbon) and shares its outline pill, so the
 * two secondary actions read as a pair. Padding differs per surface and comes
 * in via `className`. The caller decides visibility — notes are logged-in only.
 */
export const CookingNotesButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "children">
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    variant="outline"
    className={cn("h-auto shrink-0", className)}
    {...props}
  >
    Notes
  </Button>
));
CookingNotesButton.displayName = "CookingNotesButton";
