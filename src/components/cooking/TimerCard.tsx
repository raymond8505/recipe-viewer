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

  // Alarm state — left taps to dismiss, right has reset + delete
  if (isAlarm) {
    return (
      <div className="flex items-stretch rounded-xl border border-red-300 animate-timer-done overflow-hidden">
        <button
          className="flex-1 min-w-0 px-4 py-3 text-left active:opacity-70"
          onClick={() => onDismiss(timer.id)}
          aria-label={`${timer.label} timer done — tap to dismiss`}
        >
          <span className="block text-base sm:text-sm font-medium text-red-700 truncate">{timer.label}</span>
          <span className="block text-3xl sm:text-2xl font-mono font-bold tabular-nums text-red-600">Done!</span>
          <span className="block text-xs text-red-400 mt-0.5">Tap to dismiss</span>
          {recipeName && <span className="block text-xs text-red-300 truncate mt-0.5">{recipeName}</span>}
        </button>
        <div className="w-12 shrink-0 flex flex-col border-l border-red-200">
          <button
            onClick={() => onReset(timer.id)}
            className="flex-1 flex items-center justify-center text-red-500 active:opacity-60"
            aria-label="Reset timer"
          >
            <ResetIcon />
          </button>
          <div className="h-px mr-2 bg-red-200" />
          <button
            onClick={() => setConfirming(true)}
            className="flex-1 flex items-center justify-center text-red-500 active:opacity-60"
            aria-label="Delete timer"
          >
            <TrashIcon />
          </button>
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
    <div className={`flex items-stretch rounded-xl border overflow-hidden ${outerBorder} ${isFinished ? "bg-gray-50" : "bg-white"}`}>
      {/* Left col: play/pause (top) + reset (bottom) */}
      <div className={`w-12 shrink-0 flex flex-col border-r ${dividerBg}`}>
        <button
          onClick={() => (isRunning || isPaused) ? onTogglePause(timer.id) : onReset(timer.id)}
          className="flex-1 flex items-center justify-center active:opacity-60"
          aria-label={isRunning ? "Pause" : isPaused ? "Resume" : "Restart"}
        >
          {isRunning ? <PauseIcon /> : <PlayIcon dimmed={isFinished} />}
        </button>
        <div className={`h-px ml-2 ${dividerBg}`} />
        <button
          onClick={() => onReset(timer.id)}
          className="flex-1 flex items-center justify-center text-gray-500 active:opacity-60"
          aria-label="Reset timer"
        >
          <ResetIcon />
        </button>
      </div>

      {/* Middle col: name + time — tap to play/pause (or restart when finished) */}
      <button
        className="flex-1 min-w-0 px-4 py-3 text-left active:opacity-70"
        onClick={() => (isRunning || isPaused) ? onTogglePause(timer.id) : onReset(timer.id)}
        aria-label={isRunning ? `Pause ${timer.label}` : isPaused ? `Resume ${timer.label}` : `Restart ${timer.label}`}
      >
        <span className="block text-base sm:text-sm font-medium text-gray-700 truncate">{timer.label}</span>
        <span className={`block text-3xl sm:text-2xl font-mono font-bold tabular-nums ${isFinished ? "text-gray-400" : "text-gray-900"}`}>
          {formatRemaining(timer.remaining)}
        </span>
        {recipeName && <span className="block text-xs text-gray-400 truncate mt-0.5">{recipeName}</span>}
      </button>

      {/* Right col: edit (top) + delete (bottom) */}
      <div className={`w-12 shrink-0 flex flex-col border-l ${dividerBg}`}>
        <button
          onClick={() => onEdit(timer.id)}
          className="flex-1 flex items-center justify-center text-gray-500 active:opacity-60"
          aria-label={`Edit ${timer.label} timer`}
        >
          <EditIcon />
        </button>
        <div className={`h-px mr-2 ${dividerBg}`} />
        <button
          onClick={() => setConfirming(true)}
          className="flex-1 flex items-center justify-center text-gray-500 active:opacity-60"
          aria-label="Delete timer"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function PlayIcon({ dimmed }: { dimmed?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${dimmed ? "text-gray-300" : "text-orange-500"}`} aria-hidden="true">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-orange-500 shrink-0" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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
