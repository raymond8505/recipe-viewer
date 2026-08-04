"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Generated from the radix-nova registry, with three deliberate divergences —
// re-apply them if this file is ever regenerated:
//  1. `data-[state=...]` in place of the registry's `data-checked:` variants.
//     Those target a newer Radix; the pinned @radix-ui/react-checkbox (1.3.5,
//     via the `radix-ui` umbrella package) only emits
//     data-state="checked|unchecked|indeterminate", so the registry selectors
//     never match and a checked box renders as an unfilled outline.
//  2. `rounded-sm` in place of `rounded-[4px]`. Arbitrary radii bypass the
//     flattened --radius-* scale in globals.css (see the radius doctrine).
//  3. A MinusIcon for the indeterminate state; the registry indicator only ever
//     renders a check, which reads as "all selected" for a partial group.
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
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-input transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
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
