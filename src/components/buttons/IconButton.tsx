import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends ButtonProps {
  /** Required — an icon-only button must name its action for screen readers. */
  "aria-label": string;
}

/**
 * Icon-only button. Ghost styling + a 44px touch target by default (the
 * cooking-mode minimum), with a required `aria-label`. Geometry is
 * overridable via `className` for the spots that fill a flex column or sit in
 * a denser toolbar (TimerCard rails, modal close, etc.).
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "ghost", ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      className={cn("size-11", className)}
      {...props}
    />
  ),
);
IconButton.displayName = "IconButton";
