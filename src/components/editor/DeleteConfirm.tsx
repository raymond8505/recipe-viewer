"use client";

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
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 min-h-[44px] py-3 rounded-xl border border-gray-300 bg-white text-gray-700 font-medium text-sm active:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 min-h-[44px] py-3 rounded-xl bg-red-500 text-white font-medium text-sm active:bg-red-600"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
