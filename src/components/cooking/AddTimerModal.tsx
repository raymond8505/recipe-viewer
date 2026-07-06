"use client";

import { useState, useEffect, useRef } from "react";
import DraggableRibbon from "./DraggableRibbon";
import { Button } from "@/components/ui/button";
import { CloseButton, PrimaryActionButton } from "@/components/buttons";

interface AddTimerModalProps {
  /** Pre-fill for edit mode. If provided, modal shows "Edit Timer" / "Save". */
  initialLabel?: string;
  initialSeconds?: number;
  onAdd: (label: string, duration: number) => void;
  onClose: () => void;
}

const QUICK_MINUTES = [1, 3, 5, 10, 15, 30];

// ─── Drag-to-adjust number spinner ───────────────────────────────────────────
// Drag handle bars above/below the number signal that it is scrollable.
// Dragging up increases, dragging down decreases (3 px per unit).
interface DragNumberProps {
  value: number;
  onChange: (v: number) => void;
  clamp: (v: number) => number;
  pixelsPerUnit?: number;
}

function DragNumber({
  value,
  onChange,
  clamp,
  pixelsPerUnit = 3,
}: DragNumberProps) {
  const startY = useRef<number | null>(null);
  const startValue = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    startValue.current = value;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const delta = startY.current - e.clientY; // up = positive = increase
    onChange(clamp(startValue.current + Math.round(delta / pixelsPerUnit)));
  };

  const onPointerUp = () => {
    startY.current = null;
  };

  return (
    <div
      className="flex flex-col items-center cursor-ns-resize select-none touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label={`${value}, drag up or down to adjust`}
    >
      {/* Top drag handle */}
      <div className="flex gap-1 mb-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block w-4 h-0.5 rounded-full bg-gray-300" />
        ))}
      </div>
      <span className="text-4xl font-mono font-bold tabular-nums text-gray-900 w-16 text-center block bg-gray-100 rounded-xl py-1.5">
        {String(value).padStart(2, "0")}
      </span>
      {/* Bottom drag handle */}
      <div className="flex gap-1 mt-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block w-4 h-0.5 rounded-full bg-gray-300" />
        ))}
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function AddTimerModal({
  initialLabel,
  initialSeconds,
  onAdd,
  onClose,
}: AddTimerModalProps) {
  const isEditMode = initialLabel !== undefined;
  const [label, setLabel] = useState(initialLabel ?? "");
  const [minutes, setMinutes] = useState(
    Math.floor((initialSeconds ?? 300) / 60),
  );
  const [seconds, setSeconds] = useState((initialSeconds ?? 300) % 60);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the close button on mount so the on-screen keyboard stays down
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const clampMin = (v: number) => Math.max(0, Math.min(99, v));
  const clampSec = (v: number) => Math.max(0, Math.min(59, v));

  const totalSeconds = minutes * 60 + seconds;
  const canSubmit = totalSeconds > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onAdd(label.trim() || "Timer", totalSeconds);
  };

  return (
    // On mobile: bottom sheet. On sm+: centered dialog.
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end sm:items-center sm:justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={isEditMode ? "Edit timer" : "Add timer"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-sm bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h2 className="text-xl text-gray-900">
            {isEditMode ? "Edit Timer" : "New Timer"}
          </h2>
          <CloseButton ref={closeButtonRef} onClick={onClose} />
        </div>

        <div className="px-6 pb-6 space-y-5 overflow-y-auto">
          {/* Label */}
          <div>
            <label
              htmlFor="timer-label"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Label
            </label>
            <input
              id="timer-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Pasta, Sauce…"
              className="w-full text-lg rounded-none border-0 border-b border-gray-300 px-4 py-3 focus:outline-hidden focus:border-orange-400"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>

          {/* Duration picker */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-0.5">Duration</p>
            <p className="text-xs text-gray-400 mb-3">
              Tap + / − to adjust, or drag numbers up and down
            </p>
            <div className="flex items-center justify-center gap-6">
              {/* Minutes */}
              <div className="flex flex-col items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setMinutes((m) => clampMin(m + 1))}
                  className="size-14 bg-muted text-2xl font-bold text-gray-700 hover:bg-gray-200 active:bg-gray-300"
                  aria-label="Increase minutes"
                >
                  +
                </Button>
                <DragNumber
                  value={minutes}
                  onChange={setMinutes}
                  clamp={clampMin}
                />
                <Button
                  variant="ghost"
                  onClick={() => setMinutes((m) => clampMin(m - 1))}
                  className="size-14 bg-muted text-2xl font-bold text-gray-700 hover:bg-gray-200 active:bg-gray-300"
                  aria-label="Decrease minutes"
                >
                  −
                </Button>
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  min
                </span>
              </div>

              <span className="text-3xl font-bold text-gray-400 pb-7">:</span>

              {/* Seconds */}
              <div className="flex flex-col items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setSeconds((s) => clampSec(s + 15))}
                  className="size-14 bg-muted text-2xl font-bold text-gray-700 hover:bg-gray-200 active:bg-gray-300"
                  aria-label="Increase seconds"
                >
                  +
                </Button>
                <DragNumber
                  value={seconds}
                  onChange={setSeconds}
                  clamp={clampSec}
                />
                <Button
                  variant="ghost"
                  onClick={() => setSeconds((s) => clampSec(s - 15))}
                  className="size-14 bg-muted text-2xl font-bold text-gray-700 hover:bg-gray-200 active:bg-gray-300"
                  aria-label="Decrease seconds"
                >
                  −
                </Button>
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  sec
                </span>
              </div>
            </div>

            {/* Quick presets — horizontal ribbon, no wrapping */}
            <DraggableRibbon className="gap-2 mt-4">
              {QUICK_MINUTES.map((m) => (
                <Button
                  key={m}
                  variant="ghost"
                  onClick={() => {
                    setMinutes(m);
                    setSeconds(0);
                  }}
                  className="h-auto shrink-0 snap-start bg-brand-subtle px-4 py-2 text-brand hover:bg-brand/15 hover:text-brand"
                >
                  {m}m
                </Button>
              ))}
            </DraggableRibbon>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="h-auto flex-1 py-4 text-lg font-semibold"
            >
              Cancel
            </Button>
            <PrimaryActionButton
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="h-auto flex-1 py-4 text-lg font-semibold disabled:opacity-40"
            >
              {isEditMode ? "Save" : "Start Timer"}
            </PrimaryActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
