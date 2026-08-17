"use client";

import ConfirmBar from "@/components/ConfirmBar";

interface DeleteConfirmProps {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Inline delete confirmation bar — Cancel / Delete. The named, destructive-toned
 * binding of `ConfirmBar`; used by both the ingredient/step rows and the group
 * header. Keeping it a named component (rather than spelling out the tone at
 * each call site) is what stops the delete treatment drifting between rows.
 */
export default function DeleteConfirm({
  message,
  onCancel,
  onConfirm,
}: DeleteConfirmProps) {
  return (
    <ConfirmBar
      tone="destructive"
      message={message}
      confirmLabel="Delete"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
