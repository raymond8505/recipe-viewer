interface ServingsInputCellProps {
  /** Cell heading — the yield's `unitText` when it has one, else "Servings". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * A Time/Yield-band cell that edits the recipe's base servings (the persisted
 * `recipeYield`) as raw input text — unlike ServingsControl, which only scales
 * the display. Rendered by TimeYieldStats when its `servingsEdit` prop is set.
 */
export default function ServingsInputCell({
  label,
  value,
  onChange,
  disabled,
}: ServingsInputCellProps) {
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
          aria-label="Servings"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-16 text-center font-semibold text-gray-900 tabular-nums border-b border-input bg-transparent focus:outline-hidden focus:border-orange-400 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
