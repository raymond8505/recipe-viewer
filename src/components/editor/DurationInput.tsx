"use client";

import { useState } from "react";

interface DurationInputProps {
  minutes: number;
  seconds: number;
  onChange: (value: { minutes: number; seconds: number }) => void;
  disabled?: boolean;
  errored?: boolean;
  "aria-label"?: string;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** minutes/seconds → "m:ss" display; a zero duration is blank (no timer).
 *  Minutes are not capped, so a long step reads e.g. "90:00". */
export function formatMS(minutes: number, seconds: number): string {
  if (minutes <= 0 && seconds <= 0) return "";
  return `${minutes}:${pad(seconds)}`;
}

/** Lenient parse of a duration: "5:30" → 5m30s (seconds ≥60 carry into
 *  minutes); a bare number is minutes ("5" → 5:00). Never time-of-day, so no
 *  AM/PM. */
export function parseMS(raw: string): { minutes: number; seconds: number } {
  const text = raw.trim();
  if (!text) return { minutes: 0, seconds: 0 };
  if (text.includes(":")) {
    const [m, s] = text.split(":");
    const total =
      Math.max(0, parseInt(m, 10) || 0) * 60 + Math.max(0, parseInt(s, 10) || 0);
    return { minutes: Math.floor(total / 60), seconds: total % 60 };
  }
  return { minutes: Math.max(0, parseInt(text, 10) || 0), seconds: 0 };
}

/**
 * Single-field duration picker for a step timer. A plain text input (not
 * `type="time"`, which renders an AM/PM time-of-day control) that accepts
 * `m:ss` or bare minutes. The raw text is local state so typing isn't fought by
 * reformatting; it canonicalizes on blur from the committed minutes/seconds.
 */
export default function DurationInput({
  minutes,
  seconds,
  onChange,
  disabled,
  errored,
  "aria-label": ariaLabel = "Timer duration",
  className,
}: DurationInputProps) {
  const [text, setText] = useState(() => formatMS(minutes, seconds));

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseMS(e.target.value));
      }}
      onBlur={() => setText(formatMS(minutes, seconds))}
      disabled={disabled}
      placeholder="m:ss"
      aria-label={ariaLabel}
      className={className}
      data-errored={errored ? "" : undefined}
    />
  );
}
