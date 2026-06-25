import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SegmentButtonProps extends ButtonProps {
  /** Whether this segment is the selected one (brand fill vs. outline). */
  active: boolean;
}

/**
 * A toggle "pill" in a segmented control — used by SortBar and StatusFilter.
 * `active` drives the look: brand fill when selected, neutral outline when
 * not. Sets `aria-pressed` so the toggle state is exposed to assistive tech.
 */
export const SegmentButton = React.forwardRef<
  HTMLButtonElement,
  SegmentButtonProps
>(({ active, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="ghost"
    aria-pressed={active}
    className={cn(
      "h-auto rounded-lg px-3 py-1.5 text-sm font-medium",
      active
        ? "bg-brand text-white hover:bg-brand/90 hover:text-white"
        : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      className,
    )}
    {...props}
  />
));
SegmentButton.displayName = "SegmentButton";
