"use client";

import type { Timer } from "@/hooks/useTimers";
import TimerCard from "./TimerCard";
import { PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { PrimaryActionButton } from "@/components/buttons";

interface TimerColumnProps {
  timers: Timer[];
  onAddTimer: () => void;
  onEditTimer: (id: string) => void;
  onTogglePauseTimer: (id: string) => void;
  onResetTimer: (id: string) => void;
  onRemoveTimer: (id: string) => void;
  onDismissTimer: (id: string) => void;
  onResetAll: () => void;
  timerRecipeNames?: Map<string, string>;
  cookingNotes?: string;
  onNotesChange?: (value: string) => void;
  notesSaveState?: "idle" | "saving" | "saved" | "error";
}

export default function TimerColumn({
  timers,
  onAddTimer,
  onEditTimer,
  onTogglePauseTimer,
  onResetTimer,
  onRemoveTimer,
  onDismissTimer,
  onResetAll,
  timerRecipeNames,
  cookingNotes = "",
  onNotesChange,
  notesSaveState = "idle",
}: TimerColumnProps) {
  return (
    <div className="w-full h-full border-l border-gray-200 flex flex-col min-w-0">
      {/* Sticky header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
        <PrimaryActionButton
          onClick={onAddTimer}
          className="h-auto flex-1 gap-2 rounded-xl py-3 text-base font-semibold"
        >
          <PlusIcon />
          Add Timer
        </PrimaryActionButton>
        {timers.length > 0 && (
          <Button
            variant="outline"
            onClick={onResetAll}
            className="h-auto shrink-0 rounded-xl px-3 py-3"
          >
            Reset All
          </Button>
        )}
      </div>

      {/* Timer list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {timers.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-4">No timers yet</p>
        )}
        {timers.map((timer) => (
          <div key={timer.id} data-timer-id={timer.id}>
            <TimerCard
              timer={timer}
              onTogglePause={onTogglePauseTimer}
              onReset={onResetTimer}
              onRemove={onRemoveTimer}
              onDismiss={onDismissTimer}
              onEdit={onEditTimer}
              recipeName={timerRecipeNames?.get(timer.id)}
            />
          </div>
        ))}
      </div>

      {/* Cooking notes — pinned at bottom (only when onNotesChange provided, i.e. logged in) */}
      {onNotesChange && (
        <div className="shrink-0 border-t border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cooking notes</p>
            {notesSaveState === "saving" && <span className="text-xs text-gray-400">Saving…</span>}
            {notesSaveState === "saved" && <span className="text-xs text-green-500">Saved ✓</span>}
            {notesSaveState === "error" && <span className="text-xs text-red-500">Error saving</span>}
          </div>
          <textarea
            value={cookingNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Note changes for next time…"
            rows={4}
            className="w-full resize-none text-sm text-gray-700 placeholder-gray-400 focus:outline-hidden leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}
