"use client";

import { useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { CloseButton, PrimaryActionButton } from "@/components/buttons";

export type NotesSaveState = "idle" | "saving" | "saved" | "error";

interface CookingNotesModalProps {
  value: string;
  onChange: (value: string) => void;
  /** Progress of the caller's autosave, shown beside the title. */
  saveState: NotesSaveState;
  onClose: () => void;
}

/**
 * The cooking-notes editor, opened from the Notes button in either timer view.
 * Controlled: the caller owns the text and its autosave, so closing the modal
 * never cancels a pending save.
 */
export default function CookingNotesModal({
  value,
  onChange,
  saveState,
  onClose,
}: CookingNotesModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Opening the modal is a request to write, so land the caret after the
  // existing notes.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    // On mobile: bottom sheet. On sm+: centered dialog.
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end sm:items-center sm:justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Cooking notes"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-baseline gap-3 min-w-0">
            <h2 className="text-xl text-card-foreground">Cooking notes</h2>
            <span aria-live="polite" className="text-xs">
              {saveState === "saving" && (
                <span className="text-muted-foreground">Saving…</span>
              )}
              {saveState === "saved" && (
                <span className="text-green-600">Saved ✓</span>
              )}
              {saveState === "error" && (
                <span className="text-red-600">Error saving</span>
              )}
            </span>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="px-6 pb-6 space-y-5 overflow-y-auto">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Note changes for next time…"
            className="min-h-40 max-h-[50dvh] resize-none px-0 leading-relaxed"
          />
          <PrimaryActionButton
            onClick={onClose}
            className="h-auto w-full py-4 text-lg font-semibold"
          >
            Done
          </PrimaryActionButton>
        </div>
      </div>
    </div>
  );
}
