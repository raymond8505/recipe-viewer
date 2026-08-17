"use client";

import { Button } from "@/components/ui/button";
import { PrimaryActionButton } from "@/components/buttons";
import { cn } from "@/lib/utils";

export interface ConfirmBarProps {
  /** The question being asked, e.g. "Delete this ingredient?". */
  message: string;
  /** Label on the affirmative button — name the action, never "OK". */
  confirmLabel: string;
  /**
   * `destructive` is the red treatment for irreversible data loss (see
   * `editor/DeleteConfirm`). `neutral` is for actions that are merely
   * expensive or slow — a plain surface with the brand call-to-action.
   */
  tone?: "neutral" | "destructive";
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Inline confirmation bar — Cancel / <action>. The row or toolbar that owns it
 * swaps *itself* for this bar rather than layering a dialog over the page, so
 * exactly one decision is on screen at a time. Tap targets are ≥44px tall for
 * touch use (the editor follows the same touch-first rules as cook mode).
 */
export default function ConfirmBar({
  message,
  confirmLabel,
  tone = "neutral",
  onCancel,
  onConfirm,
}: ConfirmBarProps) {
  const destructive = tone === "destructive";
  const ConfirmButton = destructive ? Button : PrimaryActionButton;

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        destructive ? "border-red-200 bg-red-50" : "border-border bg-muted",
      )}
    >
      <p
        className={cn(
          "text-sm font-medium mb-3",
          destructive ? "text-red-700" : "text-foreground",
        )}
      >
        {message}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="h-auto min-h-[44px] flex-1 py-3"
        >
          Cancel
        </Button>
        <ConfirmButton
          type="button"
          variant={destructive ? "destructive" : undefined}
          onClick={onConfirm}
          className="h-auto min-h-[44px] flex-1 py-3"
        >
          {confirmLabel}
        </ConfirmButton>
      </div>
    </div>
  );
}
