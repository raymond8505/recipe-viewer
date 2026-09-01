import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { CUSTOM_RECIPE_SOURCE } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SetCustomSourceButtonProps
  extends Omit<ButtonProps, "children"> {
  /** The source field's current value — the button is a no-op once it matches. */
  value: string;
}

/**
 * One-click shortcut for the recipe editor's Source name field: stamps it with
 * `CUSTOM_RECIPE_SOURCE`, the value that marks a recipe as the user's own.
 *
 * It exists because that one value has behaviour attached — isOwnRecipe reads it
 * to retire the Re-scrape button — so it should not depend on the user typing a
 * magic word correctly. The label IS the literal rather than a friendly synonym
 * ("Mine", "My recipe"): the field it fills is visible right beside it, so a
 * synonym would leave the user guessing what actually landed in the input.
 *
 * Disabled once the value already matches, which doubles as the "this is
 * already your own recipe" state — no separate indicator needed.
 */
export const SetCustomSourceButton = React.forwardRef<
  HTMLButtonElement,
  SetCustomSourceButtonProps
>(({ value, className, disabled, ...props }, ref) => {
  const alreadyCustom = value === CUSTOM_RECIPE_SOURCE;
  return (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || alreadyCustom}
      aria-label={
        alreadyCustom
          ? `Source is already "${CUSTOM_RECIPE_SOURCE}"`
          : `Set source to "${CUSTOM_RECIPE_SOURCE}"`
      }
      className={cn("shrink-0", className)}
      {...props}
    >
      {CUSTOM_RECIPE_SOURCE}
    </Button>
  );
});
SetCustomSourceButton.displayName = "SetCustomSourceButton";
