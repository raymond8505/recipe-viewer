import { SERVINGS_UNIT_FALLBACK } from "@/lib/format";

interface ServingsInputCellProps {
  /** The count, as raw input text. */
  value: string;
  onChange: (value: string) => void;
  /** What the count counts, as raw input text. Blank saves as "no unit named",
   *  which renders as SERVINGS_UNIT_FALLBACK — hence the placeholder. */
  unit: string;
  onUnitChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * A Time/Yield-band cell that edits the recipe's base servings — both columns,
 * `servings_amount` and `servings_unit` — as raw input text. Unlike
 * ServingsControl, which only scales the display, this changes what is stored.
 * Rendered by TimeYieldStats when its `servingsEdit` prop is set.
 *
 * The unit is an input rather than the cell's heading, which is why the heading
 * is the static word "Servings": a heading that showed the unit would render the
 * same word twice the moment it became editable.
 *
 * Deliberately NOT a revival of the removed `YieldEditor` (7e81735). That was a
 * separate block with its own editor-only type and a pair of converters, editing
 * the whole Schema.org yield — string, array, QuantitativeValue and nested
 * weight alike. Two columns need two text inputs and no converters; the recipe's
 * raw weight stays MCP-only.
 */
export default function ServingsInputCell({
  value,
  onChange,
  unit,
  onUnitChange,
  disabled,
}: ServingsInputCellProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        Servings
      </p>
      {/* min-h matches Stat / ServingsControl so the band height doesn't
          shift when the cell switches into edit mode. */}
      <div className="flex min-h-11 items-center justify-center gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          aria-label="Servings"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-10 text-center font-semibold text-gray-900 tabular-nums border-b border-input bg-transparent focus:outline-hidden focus:border-orange-400 disabled:opacity-50"
        />
        <input
          type="text"
          aria-label="Servings unit"
          placeholder={SERVINGS_UNIT_FALLBACK}
          value={unit}
          onChange={(e) => onUnitChange(e.target.value)}
          disabled={disabled}
          className="w-20 text-center font-semibold text-gray-900 border-b border-input bg-transparent focus:outline-hidden focus:border-orange-400 disabled:opacity-50 placeholder:font-normal placeholder:text-gray-400"
        />
      </div>
    </div>
  );
}
