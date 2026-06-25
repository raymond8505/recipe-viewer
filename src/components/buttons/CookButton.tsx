import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ChefHatIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The "Cook" entry pill — the brand-subtle rounded affordance that opens cook
 * mode from a recipe. It owns the pill look (chip-shaped, brand-tinted) and the
 * chef-hat + "Cook" content; the stateful container (`CookingModeButton`) just
 * wires `onClick`. Geometry/colour are fixed here so the pill stays identical
 * wherever it's used; `className` still merges last for one-off tweaks.
 */
export const CookButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "children">
>(({ className, ...props }, ref) => (
    <Button
      ref={ref}
      variant="ghost"
      className={cn(
        "h-auto gap-1.5 rounded-full bg-brand-subtle px-3 py-1 text-brand hover:bg-brand/15 hover:text-brand",
        className,
      )}
      {...props}
    >
      <ChefHatIcon />
      Cook
    </Button>
  ),
);
CookButton.displayName = "CookButton";
