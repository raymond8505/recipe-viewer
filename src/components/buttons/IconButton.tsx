import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IconButtonProps extends React.ComponentProps<typeof Button> {
  /** Required — an icon-only button must name its action for screen readers. */
  "aria-label": string;
}

/**
 * Icon-only button. Ghost styling + a 44px touch target by default (the
 * cooking-mode minimum), with a required `aria-label`. Geometry is
 * overridable via `className` for the spots that fill a flex column or sit in
 * a denser toolbar (TimerCard rails, modal close, etc.).
 */
export function IconButton({
  className,
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      className={cn("size-11 rounded-lg", className)}
      {...props}
    />
  );
}
