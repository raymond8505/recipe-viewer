import * as React from "react";
import { PrimaryActionButton } from "./PrimaryActionButton";
import { type ButtonProps } from "@/components/ui/button";
import { PlusIcon, SmallPlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface AddTimerButtonProps extends Omit<ButtonProps, "children"> {
  /**
   * Mobile-ribbon density: smaller plus glyph and tighter vertical padding.
   * Defaults to the roomier desktop (TimerColumn) look.
   */
  compact?: boolean;
}

/**
 * The brand "Add Timer" action — a `PrimaryActionButton` with a plus glyph and
 * the "Add Timer" label. Both timer surfaces (desktop column + mobile ribbon)
 * share the same intent and brand fill; only the icon size and padding differ,
 * which `compact` selects so the two existing looks are preserved. Width/shape
 * (`flex-1 rounded-xl`) is owned here; `className` merges last for the rest.
 */
export const AddTimerButton = React.forwardRef<
  HTMLButtonElement,
  AddTimerButtonProps
>(({ compact = false, className, ...props }, ref) => (
  <PrimaryActionButton
    ref={ref}
    className={cn(
      "h-auto flex-1 rounded-xl font-semibold",
      compact ? "gap-1.5 py-2.5 text-sm" : "gap-2 py-3 text-base",
      className,
    )}
    {...props}
  >
    {compact ? <SmallPlusIcon /> : <PlusIcon />}
    Add Timer
  </PrimaryActionButton>
));
AddTimerButton.displayName = "AddTimerButton";
