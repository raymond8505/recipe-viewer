import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type GroupHeadingInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type"
>;

/**
 * The section/group heading field in the structured editors (ingredient groups
 * and instruction sections) — a shadcn `Input` carrying the heading identity:
 * brand-colored, uppercase, semibold. Layout that depends on the surrounding
 * row (e.g. `flex-1 min-w-0`) is the caller's via `className`. Defaults the
 * "Group name" placeholder/aria-label so call sites only wire value + onChange.
 */
export default function GroupHeadingInput({
  className,
  ...props
}: GroupHeadingInputProps) {
  return (
    <Input
      type="text"
      placeholder="Group name"
      aria-label="Group name"
      className={cn(
        "min-h-[40px] text-sm font-semibold uppercase tracking-wide text-brand",
        className,
      )}
      {...props}
    />
  );
}
