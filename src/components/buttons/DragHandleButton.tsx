import * as React from "react";
import { Button } from "@/components/ui/button";
import { DragHandleIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface DragHandleButtonProps extends React.ComponentProps<typeof Button> {
  /** Required — e.g. "Reorder 1 tsp cumin" / "Reorder section Sauce". */
  "aria-label": string;
}

/**
 * dnd-kit drag handle. Renders the grip icon and the grab affordance; the
 * caller spreads `useSortable`'s `attributes` / `listeners` straight onto it
 * (they pass through to the underlying `<button>`). Width / colour / vertical
 * alignment differ per call site, so those come in via `className`.
 */
export function DragHandleButton({
  className,
  variant = "ghost",
  ...props
}: DragHandleButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      className={cn(
        "h-auto w-5 shrink-0 cursor-grab touch-none rounded-sm p-0 active:cursor-grabbing disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <DragHandleIcon />
    </Button>
  );
}
