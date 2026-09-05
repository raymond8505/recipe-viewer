interface TimeInputCellProps {
  /** Cell heading, and the input's accessible name — "Prep time", "Cook time", "Total time". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * A Time/Yield-band cell that edits one of the recipe's persisted times as raw
 * input text. Rendered by TimeYieldStats when its `timesEdit` prop is set; the
 * text is parsed by `parseMinutesInput` on save, which accepts a bare minute
 * count, `h:mm`, and unit-tagged forms.
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
          placeholder="min"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-20 text-center font-semibold text-gray-900 tabular-nums border-b border-input bg-transparent focus:outline-hidden focus:border-orange-400 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
