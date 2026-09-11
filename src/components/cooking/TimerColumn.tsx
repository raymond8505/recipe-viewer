"use client";

import type { Timer } from "@/hooks/useTimers";
import TimerCard from "./TimerCard";
import {
  AddTimerButton,
  CookingNotesButton,
  ResetTimersButton,
} from "@/components/buttons";

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
  /** Opens the cooking-notes modal. The Notes button renders only when given. */
  onOpenNotes?: () => void;
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
  onOpenNotes,
}: TimerColumnProps) {
  return (
    <div className="w-full h-full border-l border-gray-200 flex flex-col min-w-0">
      {/* Sticky header */}
      <div className="shrink-0 bg-card border-b border-gray-200 px-4 py-3 flex items-center gap-2">
        <AddTimerButton onClick={onAddTimer} />
        {timers.length > 0 && (
          <ResetTimersButton onClick={onResetAll} className="px-3 py-3" />
        )}
        {onOpenNotes && (
          <CookingNotesButton onClick={onOpenNotes} className="px-3 py-3" />
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
