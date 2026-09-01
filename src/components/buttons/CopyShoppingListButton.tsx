import * as React from "react";
import { IconButton, type IconButtonProps } from "./IconButton";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CopyShoppingListButtonProps
  extends Omit<IconButtonProps, "aria-label" | "children" | "disabled"> {
  /** Number of selected ingredients — drives the label, count, and visibility. */
  count: number;
  /** Whether the copy just succeeded — toggles the checkmark feedback icon. */
  copied: boolean;
}

/**
 * The "copy shopping list to clipboard" icon button, shared by cook mode and
 * the recipe detail ingredients header. It owns everything that was duplicated
 * inline at both call sites: the muted header styling, the count-based
 * `aria-label`, the copy/checkmark icon swap, and the empty-state behaviour —
 * `invisible` + `disabled` when nothing is selected (kept in the DOM so the
 * heading layout never shifts). The caller passes `count` + `copied` + the
 * handler; everything else is derived.
 */
export const CopyShoppingListButton = React.forwardRef<
  HTMLButtonElement,
  CopyShoppingListButtonProps
>(({ count, copied, className, ...props }, ref) => {
  const empty = count === 0;
  return (
    <IconButton
      ref={ref}
      disabled={empty}
      aria-label={`Copy shopping list, ${count} ${pluralize(count, "item")}`}
      className={cn(
        "size-9 text-muted-foreground hover:bg-muted hover:text-foreground",
        empty && "invisible",
        className,
      )}
      {...props}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon />}
    </IconButton>
  );
});
CopyShoppingListButton.displayName = "CopyShoppingListButton";
