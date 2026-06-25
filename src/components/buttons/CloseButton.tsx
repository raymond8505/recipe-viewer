import * as React from "react";
import { IconButton, type IconButtonProps } from "./IconButton";
import { CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The header "close / dismiss" icon button — an `IconButton` that renders the
 * `CloseIcon` with the shared muted-on-hover look used by modal and cook-mode
 * headers. The label varies by context (e.g. "Close" vs "Exit cooking mode"),
 * so `aria-label` stays caller-supplied (defaulting to "Close"); `title` and
 * `ref` pass straight through. `size-9` overrides IconButton's 44px default to
 * the denser header size.
 */
export const CloseButton = React.forwardRef<
  HTMLButtonElement,
  Omit<IconButtonProps, "aria-label" | "children"> & { "aria-label"?: string }
>(({ className, "aria-label": ariaLabel = "Close", ...props }, ref) => (
  <IconButton
    ref={ref}
    aria-label={ariaLabel}
    className={cn(
      "size-9 text-muted-foreground hover:bg-muted hover:text-foreground",
      className,
    )}
    {...props}
  >
    <CloseIcon />
  </IconButton>
));
CloseButton.displayName = "CloseButton";
