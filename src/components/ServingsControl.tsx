"use client";

import { PortionStepperButton } from "@/components/buttons";

interface ServingsControlProps {
  servings: number;
  onChange: (n: number) => void;
}

export default function ServingsControl({ servings, onChange }: ServingsControlProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Servings</p>
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
