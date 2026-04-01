"use client";

import type { Timer } from "@/hooks/useTimers";
import TimerCard from "./TimerCard";

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
}: TimerColumnProps) {
  return (
    <div className="w-full h-full border-l border-gray-200 flex flex-col min-w-0">
      {/* Sticky header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
        <button
          onClick={onAddTimer}
          className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-base transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <PlusIcon />
          Add Timer
        </button>
        {timers.length > 0 && (
          <button
            onClick={onResetAll}
            className="shrink-0 py-3 px-3 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium transition-colors whitespace-nowrap"
          >
            Reset All
          </button>
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
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
