"use client";

import type { EditableYield } from "@/types/editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface YieldEditorProps {
  value: EditableYield;
  onChange: (value: EditableYield) => void;
  disabled?: boolean;
}

/**
 * Recipe-level yield editor: a serving count + unit label and an optional raw
 * weight/volume. These map to a Schema.org `QuantitativeValue` recipeYield —
 * count in `value`/`unitText`, weight in `valueReference` — via format.ts's
 * `editableYieldToSchema`. The weight pair is optional and drives the nutrition
 * panel's per-serving basis ("per 114 g serving"). Underline inputs with large
 * (44px+) tap targets follow the editor's touch-first conventions; the field
 * labels mirror InstructionsEditor's `Label` + muted-foreground pattern.
 */
export default function YieldEditor({
  value,
  onChange,
  disabled,
}: YieldEditorProps) {
  const set = (patch: Partial<EditableYield>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <p className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Yield
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Label className="flex flex-col items-stretch gap-0.5 text-xs font-normal text-muted-foreground">
          Servings
          <Input
            type="text"
            inputMode="numeric"
            value={value.servings}
            onChange={(e) => set({ servings: e.target.value })}
            disabled={disabled}
            placeholder="e.g. 4"
            aria-label="Servings"
            className="min-h-[44px] w-24 text-sm"
          />
        </Label>
        <Label className="flex min-w-32 flex-1 flex-col items-stretch gap-0.5 text-xs font-normal text-muted-foreground">
          Unit
          <Input
            type="text"
            value={value.unit}
            onChange={(e) => set({ unit: e.target.value })}
            disabled={disabled}
            placeholder="e.g. servings, kebabs"
            aria-label="Serving unit"
            className="min-h-[44px] w-full text-sm"
          />
        </Label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Label className="flex flex-col items-stretch gap-0.5 text-xs font-normal text-muted-foreground">
          Yield weight
          <Input
            type="text"
            inputMode="decimal"
            value={value.weight}
            onChange={(e) => set({ weight: e.target.value })}
            disabled={disabled}
            placeholder="e.g. 454"
            aria-label="Yield weight"
            className="min-h-[44px] w-24 text-sm"
          />
        </Label>
        <Label className="flex min-w-32 flex-1 flex-col items-stretch gap-0.5 text-xs font-normal text-muted-foreground">
          Weight unit
          <Input
            type="text"
            value={value.weightUnit}
            onChange={(e) => set({ weightUnit: e.target.value })}
            disabled={disabled}
            placeholder="e.g. g, ml"
            aria-label="Yield weight unit"
            className="min-h-[44px] w-full text-sm"
          />
        </Label>
      </div>
    </div>
  );
}
