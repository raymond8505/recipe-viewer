"use client";

import { Input } from "@/components/ui/input";

interface StatProps {
  label: string;
  value: string;
  /** When true, render an editable text input instead of the static value. */
  editing?: boolean;
  /** Required in edit mode; receives the raw edited string. */
  onChange?: (value: string) => void;
  /** Edit-mode hint shown as small text directly below the input (e.g. a format
   *  example like "e.g. 4 servings"). Read mode ignores it. */
  hint?: string;
}

/**
 * A single centered cell in the Time/Yield band: an uppercase label over a bold
 * value. When `editing`, the value becomes an underline text input (the value
 * stays a plain display string — e.g. "1 hr 30 min" — so a text field, not a
 * numeric one) with an optional `hint` below it. The `min-h-11` value row
 * matches ServingsControl's stepper height so the input shares a vertical
 * center with the other cells' values regardless of the hint below.
 */
export default function Stat({
  label,
  value,
  editing,
  onChange,
  hint,
}: StatProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      {editing ? (
        <>
          <div className="flex min-h-11 items-center justify-center">
            <Input
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              aria-label={label}
              className="text-center font-semibold text-gray-900"
            />
          </div>
          {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
        </>
      ) : (
        <p className="flex min-h-11 items-center justify-center font-semibold text-gray-900">
          {value}
        </p>
      )}
    </div>
  );
}
