"use client";

import { Button } from "@/components/ui/button";

interface DeleteConfirmProps {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Inline delete confirmation bar — Cancel / Delete. Mirrors the in-card
 * confirm pattern from `src/components/cooking/TimerCard.tsx`; used by both the
 * ingredient/step rows and the group header. Tap targets are ≥44px tall for
 * touch use (the editor follows the same touch-first rules as cook mode).
 */
export default function DeleteConfirm({
  message,
  onCancel,
  onConfirm,
}: DeleteConfirmProps) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-medium text-red-700 mb-3">{message}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="h-auto min-h-[44px] flex-1 rounded-xl py-3"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onConfirm}
          className="h-auto min-h-[44px] flex-1 rounded-xl py-3"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
