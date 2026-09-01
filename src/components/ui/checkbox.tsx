"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Generated from the radix-nova registry, with two deliberate divergences —
// re-apply them if this file is ever regenerated:
//  1. `rounded-sm` in place of `rounded-[4px]`. Arbitrary radii bypass the
//     flattened --radius-* scale in globals.css (see the radius doctrine).
//  2. Indeterminate support, for the tri-state group toggle in NutritionDetail:
//     the `data-[state=indeterminate]:` fill classes and the MinusIcon. shadcn
//     ships no `data-indeterminate` custom variant (hence the arbitrary form),
//     and the registry indicator only ever draws a check — which reads as "all
//     selected" on a partial group.
//
// The registry's `data-checked:` classes are left as-is: that variant comes
// from the `@import "shadcn/tailwind.css"` in globals.css and already resolves
// to `[data-state="checked"]`, which is what Radix emits.
//
// The `after:` inset expands the pointer target well past the 16px box without
// affecting layout — the visual box stays small enough for a dense table row.
function Checkbox({
  className,
  checked,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={checked}
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        {checked === "indeterminate" ? <MinusIcon /> : <CheckIcon />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
