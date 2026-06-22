"use client";

import { useState } from "react";
import { formatMS, parseMS } from "@/lib/format";

interface DurationInputProps {
  minutes: number;
  seconds: number;
  onChange: (value: { minutes: number; seconds: number }) => void;
  disabled?: boolean;
  errored?: boolean;
  "aria-label"?: string;
  className?: string;
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
