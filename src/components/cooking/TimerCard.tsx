"use client";

import { useState } from "react";
import type { Timer } from "@/hooks/useTimers";
import { timerState } from "@/hooks/useTimers";

interface TimerCardProps {
  timer: Timer;
  onTogglePause: (id: string) => void;
  onReset: (id: string) => void;
  onRemove: (id: string) => void;
  onDismiss: (id: string) => void;
  onEdit: (id: string) => void;
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
}: TimerCardProps) {
  const [confirming, setConfirming] = useState(false);
  const state = timerState(timer);
  const isAlarm = state === "alarm";
  const isDone = state === "alarm" || state === "finished";

  // Delete confirmation overlay — replaces card content
  if (confirming) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-700 mb-3">
          Delete &ldquo;{timer.label}&rdquo;?
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 py-3 rounded-xl border border-gray-300 bg-white text-gray-700 font-medium text-sm active:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onRemove(timer.id);
              setConfirming(false);
            }}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium text-sm active:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  // Alarm state — whole card taps to dismiss
  if (isAlarm) {
    return (
      <div className="rounded-xl border border-red-300 animate-timer-done overflow-hidden">
        <button
          className="w-full p-4 text-left active:opacity-70"
          onClick={() => onDismiss(timer.id)}
          aria-label={`${timer.label} timer done — tap to dismiss`}
        >
          <p className="text-sm font-medium text-red-700 truncate">{timer.label}</p>
          <p className="text-2xl font-mono font-bold tabular-nums text-red-600">Done!</p>
          <p className="text-xs text-red-400 mt-0.5">Tap to dismiss</p>
        </button>
        {/* Reset + delete still accessible in alarm state */}
        <div className="flex border-t border-red-200">
          <button
            onClick={() => onReset(timer.id)}
            className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-red-600 active:bg-red-100"
            aria-label="Reset timer"
          >
            <ResetIcon />
            Reset
          </button>
          <div className="w-px bg-red-200" />
          <button
            onClick={() => setConfirming(true)}
            className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-red-600 active:bg-red-100"
            aria-label="Delete timer"
          >
            <TrashIcon />
            Delete
          </button>
        </div>
      </div>
    );
  }

  // Running / paused / finished states
  const isRunning = state === "running";
  const isPaused = state === "paused";

  return (
    <div className={`rounded-xl border overflow-hidden ${isDone ? "border-gray-300 bg-gray-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-stretch">
        {/* Play/pause — only for running/paused */}
        {(isRunning || isPaused) ? (
          <button
            onClick={() => onTogglePause(timer.id)}
            className="px-3 flex items-center justify-center text-orange-500 active:bg-orange-50 shrink-0"
            aria-label={isPaused ? "Resume timer" : "Pause timer"}
          >
            {isPaused ? <PlayIcon /> : <PauseIcon />}
          </button>
        ) : (
          // Spacer so body aligns consistently when no play/pause button
          <div className="w-4 shrink-0" />
        )}

        {/* Body — tappable to open edit modal */}
        <button
          className="flex-1 min-w-0 py-3 pr-2 text-left active:opacity-70"
          onClick={() => onEdit(timer.id)}
          aria-label={`Edit ${timer.label} timer`}
        >
          <p className="text-sm font-medium text-gray-700 truncate">{timer.label}</p>
          <p className={`text-2xl font-mono font-bold tabular-nums ${isDone ? "text-gray-400" : "text-gray-900"}`}>
            {formatRemaining(timer.remaining)}
          </p>
          {isPaused && (
            <p className="text-xs text-orange-500 font-medium mt-0.5">Paused</p>
          )}
          {isDone && (
            <p className="text-xs text-gray-400 mt-0.5">Done</p>
          )}
        </button>

        {/* Reset + delete */}
        <div className="flex items-center gap-1 px-2 shrink-0">
          <button
            onClick={() => onReset(timer.id)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 active:bg-gray-100"
            aria-label="Reset timer"
          >
            <ResetIcon />
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 active:bg-gray-100"
            aria-label="Delete timer"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}
