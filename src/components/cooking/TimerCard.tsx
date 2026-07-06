"use client";

import { useState } from "react";
import type { Timer } from "@/hooks/useTimers";
import { timerState } from "@/hooks/useTimers";
import {
  PlayIcon,
  PauseIcon,
  EditIcon,
  ResetIcon,
  TrashIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The TimerCard's buttons are bespoke tap-zones inside a bordered card, not
// standalone icon buttons — they fill their flex column/row with no rounding
// or padding. These two strings neutralise the Button primitive's defaults
// (height, padding, rounding, centring, hover bg) for those two shapes.
const TAP_COL =
  "h-auto flex-1 rounded-none p-0 hover:bg-transparent active:opacity-60";
const TAP_BLOCK =
  "h-auto flex-1 min-w-0 flex-col items-start justify-center gap-0 whitespace-normal rounded-none px-4 py-3 text-left hover:bg-transparent active:opacity-70";

interface TimerCardProps {
  timer: Timer;
  onTogglePause: (id: string) => void;
  onReset: (id: string) => void;
  onRemove: (id: string) => void;
  onDismiss: (id: string) => void;
  onEdit: (id: string) => void;
  recipeName?: string;
}

export function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TimerCard({
  timer,
  onTogglePause,
  onReset,
  onRemove,
  onDismiss,
  onEdit,
  recipeName,
}: TimerCardProps) {
  const [confirming, setConfirming] = useState(false);
  const state = timerState(timer);
  const isAlarm = state === "alarm";

  // Delete confirmation overlay — replaces card content
  if (confirming) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-700 mb-3">
          Delete &quot;{timer.label}&quot;?
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setConfirming(false)}
            className="h-auto flex-1 py-3"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onRemove(timer.id);
              setConfirming(false);
            }}
            className="h-auto flex-1 py-3"
          >
            Delete
          </Button>
        </div>
      </div>
    );
  }

  // Alarm state — left taps to dismiss, right has reset + delete
  if (isAlarm) {
    return (
      <div className="flex items-stretch rounded-xl border border-red-300 animate-timer-done overflow-hidden">
        <Button
          variant="ghost"
          className={cn(TAP_BLOCK, "w-full")}
          onClick={() => onDismiss(timer.id)}
          aria-label={`${timer.label} timer done — tap to dismiss`}
        >
          <span className="block text-base sm:text-sm font-medium text-red-700 truncate">
            {timer.label}
          </span>
          <span className="block text-3xl sm:text-2xl font-mono font-bold tabular-nums text-red-600">
            Done!
          </span>
          <span className="block text-xs text-red-400 mt-0.5">
            Tap to dismiss
          </span>
          {recipeName && (
            <span className="block text-xs text-red-300 truncate mt-0.5">
              {recipeName}
            </span>
          )}
        </Button>
        <div className="w-12 shrink-0 flex flex-col border-l border-red-200">
          <Button
            variant="ghost"
            onClick={() => onReset(timer.id)}
            className={cn(TAP_COL, "text-red-500")}
            aria-label="Reset timer"
          >
            <ResetIcon />
          </Button>
          <div className="h-px mr-2 bg-red-200" />
          <Button
            variant="ghost"
            onClick={() => setConfirming(true)}
            className={cn(TAP_COL, "text-red-500")}
            aria-label="Delete timer"
          >
            <TrashIcon />
          </Button>
        </div>
      </div>
    );
  }

  // Running / paused / finished states
  const isRunning = state === "running";
  const isPaused = state === "paused";
  const isFinished = state === "finished";

  const outerBorder = isFinished ? "border-gray-300" : "border-gray-200";
  const dividerBg = isFinished ? "bg-gray-200" : "bg-gray-100";

  return (
    <div
      className={`flex items-stretch rounded-xl border overflow-hidden ${outerBorder} ${isFinished ? "bg-gray-50" : "bg-card"}`}
    >
      {/* Left col: play/pause (top) + reset (bottom) */}
      <div className={`w-12 shrink-0 flex flex-col border-r ${dividerBg}`}>
        <Button
          variant="ghost"
          onClick={() =>
            isRunning || isPaused ? onTogglePause(timer.id) : onReset(timer.id)
          }
          className={TAP_COL}
          aria-label={isRunning ? "Pause" : isPaused ? "Resume" : "Restart"}
        >
          {isRunning ? <PauseIcon /> : <PlayIcon dimmed={isFinished} />}
        </Button>
        <div className={`h-px ml-2 ${dividerBg}`} />
        <Button
          variant="ghost"
          onClick={() => onReset(timer.id)}
          className={cn(TAP_COL, "text-gray-500")}
          aria-label="Reset timer"
        >
          <ResetIcon />
        </Button>
      </div>

      {/* Middle col: name + time — tap to play/pause (or restart when finished) */}
      <Button
        variant="ghost"
        className={TAP_BLOCK}
        onClick={() =>
          isRunning || isPaused ? onTogglePause(timer.id) : onReset(timer.id)
        }
        aria-label={
          isRunning
            ? `Pause ${timer.label}`
            : isPaused
              ? `Resume ${timer.label}`
              : `Restart ${timer.label}`
        }
      >
        <span className="block text-base sm:text-sm font-medium text-gray-700 truncate">
          {timer.label}
        </span>
        <span
          className={`block text-3xl sm:text-2xl font-mono font-bold tabular-nums ${isFinished ? "text-gray-400" : "text-gray-900"}`}
        >
          {formatRemaining(timer.remaining)}
        </span>
        {recipeName && (
          <span className="block text-xs text-gray-400 truncate mt-0.5">
            {recipeName}
          </span>
        )}
      </Button>

      {/* Right col: edit (top) + delete (bottom) */}
      <div className={`w-12 shrink-0 flex flex-col border-l ${dividerBg}`}>
        <Button
          variant="ghost"
          onClick={() => onEdit(timer.id)}
          className={cn(TAP_COL, "text-gray-500")}
          aria-label={`Edit ${timer.label} timer`}
        >
          <EditIcon />
        </Button>
        <div className={`h-px mr-2 ${dividerBg}`} />
        <Button
          variant="ghost"
          onClick={() => setConfirming(true)}
          className={cn(TAP_COL, "text-gray-500")}
          aria-label="Delete timer"
        >
          <TrashIcon />
        </Button>
      </div>
    </div>
  );
}
