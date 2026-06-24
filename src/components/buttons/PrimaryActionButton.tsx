import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The app's primary call-to-action (orange brand) button. This is the single
 * home for the brand-primary look — Save, Submit, Add Timer, Allow, etc. —
 * so the look stays in sync everywhere. Brand isn't a base `Button` variant
 * (the base `default` is the neutral stone primary), so the brand styling
 * lives here, layered over `Button` via `cn` (last-wins).
 *
 * No `type` default: passes straight through so it preserves the exact submit
 * semantics of whatever `<button>` it replaces.
 */
export const PrimaryActionButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    className={cn(
      "bg-brand text-white shadow-xs hover:bg-brand/90 active:bg-brand/95",
      className,
    )}
    {...props}
  />
));
PrimaryActionButton.displayName = "PrimaryActionButton";
