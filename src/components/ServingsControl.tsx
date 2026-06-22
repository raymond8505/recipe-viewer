"use client";

interface ServingsControlProps {
  servings: number;
  onChange: (n: number) => void;
}

export default function ServingsControl({ servings, onChange }: ServingsControlProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Servings</p>
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, servings - 1))}
          className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:bg-orange-100 hover:text-orange-600 active:bg-orange-200 transition-colors text-xl"
          aria-label="Decrease servings"
        >
          −
        </button>
        <span className="font-semibold text-gray-900 min-w-8 text-center tabular-nums">
          {servings}
        </span>
        <button
          onClick={() => onChange(servings + 1)}
          className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:bg-orange-100 hover:text-orange-600 active:bg-orange-200 transition-colors text-xl"
          aria-label="Increase servings"
        >
          +
        </button>
      </div>
    </div>
  );
}
