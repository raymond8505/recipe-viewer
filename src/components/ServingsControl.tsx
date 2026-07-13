"use client";

import { PortionStepperButton } from "@/components/buttons";

interface ServingsControlProps {
  servings: number;
  onChange: (n: number) => void;
  /** Cell label — the yield's unitText when set (e.g. "kebabs"), so the unit
   *  stays visible while scaling. Defaults to "Servings". Rendered uppercase. */
  unitLabel?: string;
}

export default function ServingsControl({
  servings,
  onChange,
  unitLabel = "Servings",
}: ServingsControlProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        {unitLabel}
      </p>
      <div className="flex items-center justify-center gap-1">
        <PortionStepperButton
          direction="decrease"
          onClick={() => onChange(Math.max(1, servings - 1))}
          aria-label="Decrease servings"
        />
        <span className="font-semibold text-gray-900 min-w-8 text-center tabular-nums">
          {servings}
        </span>
        <PortionStepperButton
          direction="increase"
          onClick={() => onChange(servings + 1)}
          aria-label="Increase servings"
        />
      </div>
    </div>
  );
}
