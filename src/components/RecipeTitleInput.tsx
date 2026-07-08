import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RecipeTitleInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

/**
 * The recipe-title field shown in edit mode — a shadcn `Input` sized to match
 * the display `<h1>` (3xl, 4xl at `sm`+). The explicit `md:text-4xl` overrides
 * the Input primitive's `md:text-sm`, which would otherwise shrink the title on
 * larger screens. Behavior (value/onChange/disabled) is the caller's.
 */
export default function RecipeTitleInput({
  className,
  ...props
}: RecipeTitleInputProps) {
  return (
    <Input
      type="text"
      aria-label="Recipe title"
      placeholder="Recipe title"
      className={cn(
        "h-auto p-3 font-heading text-3xl font-light leading-tight sm:text-4xl md:text-4xl",
        className,
      )}
      {...props}
    />
  );
}
