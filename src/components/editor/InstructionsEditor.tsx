"use client";

import { nanoid } from "nanoid";
import type { EditableStep, EditableInstructions } from "@/types/editor";
import SortableGroupedList from "./SortableGroupedList";

interface InstructionsEditorProps {
  value: EditableInstructions;
  onChange: (groups: EditableInstructions) => void;
  /** Step ids where name/time are not both-set-or-both-blank. */
  erroredStepIds?: Set<string>;
  disabled?: boolean;
}

const numberValue = (n: number) => (n > 0 ? String(n) : "");
const toCount = (raw: string) => Math.max(0, parseInt(raw, 10) || 0);

/**
 * Structured instruction editor: each step is a draggable card with a body
 * textarea plus an optional, co-dependent timer (name + hours/minutes → the
 * schema's `HowToStep.name` / `timeRequired`, which seed cook-mode timers).
 * Sections (HowToSection) map to reorderable groups, same as ingredient groups.
 */
export default function InstructionsEditor({
  value,
  onChange,
  erroredStepIds,
  disabled,
}: InstructionsEditorProps) {
  return (
    <SortableGroupedList<EditableStep>
      groups={value}
      onChange={onChange}
      disabled={disabled}
      erroredItemIds={erroredStepIds}
      makeItem={() => ({ id: nanoid(), text: "", name: "", hours: 0, minutes: 0 })}
      itemLabel={(item) => item.text || item.name}
      itemNoun="step"
      groupNoun="section"
      renderItem={(step, update, errored) => (
        <div className="space-y-2 py-1">
          <textarea
            value={step.text}
            onChange={(e) => update({ text: e.target.value })}
            disabled={disabled}
            placeholder="Describe this step…"
            aria-label="Step instructions"
            rows={2}
            className="w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60 resize-y"
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[8rem] text-xs text-gray-500">
              Timer label
              <input
                type="text"
                value={step.name}
                onChange={(e) => update({ name: e.target.value })}
                disabled={disabled}
                placeholder="e.g. Simmer"
                aria-label="Timer label"
                className={`mt-0.5 w-full min-h-[44px] rounded-lg border px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60 ${errored ? "border-red-300" : "border-gray-200"}`}
              />
            </label>
            <label className="text-xs text-gray-500">
              Hours
              <input
                type="number"
                min={0}
                value={numberValue(step.hours)}
                onChange={(e) => update({ hours: toCount(e.target.value) })}
                disabled={disabled}
                placeholder="0"
                aria-label="Timer hours"
                className={`mt-0.5 w-16 min-h-[44px] rounded-lg border px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60 ${errored ? "border-red-300" : "border-gray-200"}`}
              />
            </label>
            <label className="text-xs text-gray-500">
              Minutes
              <input
                type="number"
                min={0}
                value={numberValue(step.minutes)}
                onChange={(e) => update({ minutes: toCount(e.target.value) })}
                disabled={disabled}
                placeholder="0"
                aria-label="Timer minutes"
                className={`mt-0.5 w-16 min-h-[44px] rounded-lg border px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60 ${errored ? "border-red-300" : "border-gray-200"}`}
              />
            </label>
          </div>
          {errored && (
            <p className="text-xs text-red-600">
              A timer needs both a label and a time — set both, or clear both.
            </p>
          )}
        </div>
      )}
    />
  );
}
