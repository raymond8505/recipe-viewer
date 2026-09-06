"use client";

import { canonicalizeTimeInput } from "@/lib/format";

interface TimeInputCellProps {
  /** Cell heading, and the input's accessible name — "Prep time", "Cook time", "Total time". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * A Time/Yield-band cell that edits one of the recipe's persisted times in
 * `HH:MM`. Rendered by TimeYieldStats when its `timesEdit` prop is set; the
 * text is parsed by `parseTimeInput` on save.
 *
 * Re-spells itself in canonical `H:MM` on blur, which is what lets the field
 * accept a bare minute count ("45" → "0:45") and unit-tagged forms ("1h30m" →
 * "1:30") without ambiguity: whatever you type, you see what it meant before
 * you save. Text that doesn't parse is left exactly as typed so the typo stays
 * visible to fix. No local state — the draft field IS the text, so there is no
 * second copy to diverge.
 *
 * Deliberately not the editor's `DurationInput`: that one is the `m:ss` step
 * timer, where "1:30" means ninety seconds. On a recipe it means an hour and a
 * half, and a 90-minute bake reading "90:00" is the wrong unit entirely.
 */
export default function TimeInputCell({
  label,
  value,
  onChange,
  disabled,
}: TimeInputCellProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      {/* min-h matches Stat / ServingsControl so the band height doesn't
          shift when the cell switches into edit mode. */}
      <div className="flex min-h-11 items-center justify-center">
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          placeholder="HH:MM"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const canonical = canonicalizeTimeInput(value);
            if (canonical !== null && canonical !== value) onChange(canonical);
          }}
          disabled={disabled}
          className="w-20 text-center font-semibold text-gray-900 tabular-nums border-b border-input bg-transparent focus:outline-hidden focus:border-orange-400 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
