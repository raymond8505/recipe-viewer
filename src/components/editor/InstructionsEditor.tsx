"use client";

import { nanoid } from "nanoid";
import type { EditableStep, EditableInstructions } from "@/types/editor";
import { TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import SortableGroupedList from "./SortableGroupedList";
import AutoresizeTextarea from "./AutoresizeTextarea";
import DurationInput from "./DurationInput";

interface InstructionsEditorProps {
  value: EditableInstructions;
  onChange: (groups: EditableInstructions) => void;
  /** Step ids with a timer but no label (a label is required for a timer). */
  erroredStepIds?: Set<string>;
  disabled?: boolean;
}

/**
 * Structured instruction editor: each step is a draggable card with a body
 * textarea plus an optional timer label + hours/minutes → the schema's
 * `HowToStep.name` / `timeRequired`, which seed cook-mode timers. A label may
 * stand alone, but a timer requires a label.
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
      makeItem={() => ({
        id: nanoid(),
        text: "",
        name: "",
        minutes: 0,
        seconds: 0,
      })}
      itemLabel={(item) => item.text || item.name}
      itemNoun="step"
      groupNoun="section"
      rowDeleteInline
      spacious
      renderItem={(step, update, errored, requestDelete) => (
        <div className="space-y-2 py-1">
          <AutoresizeTextarea
            value={step.text}
            onChange={(e) => update({ text: e.target.value })}
            disabled={disabled}
            placeholder="Describe this step…"
            aria-label="Step instructions"
            className="block w-full min-h-[44px] rounded-lg border border-gray-200 p-2 text-sm text-gray-700 leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-orange-300 disabled:opacity-60 resize-none overflow-hidden"
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-32 text-xs text-gray-500">
              Timer label
              <input
                type="text"
                value={step.name}
                onChange={(e) => update({ name: e.target.value })}
                disabled={disabled}
                placeholder="e.g. Simmer"
                aria-label="Timer label"
                className={`mt-0.5 w-full min-h-[40px] rounded-lg border px-2 text-sm text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-orange-300 disabled:opacity-60 ${errored ? "border-red-300" : "border-gray-200"}`}
              />
            </label>
            <label className="text-xs text-gray-500">
              Timer
              <DurationInput
                minutes={step.minutes}
                seconds={step.seconds}
                onChange={update}
                disabled={disabled}
                className="mt-0.5 w-24 min-h-[40px] rounded-lg border border-gray-200 px-2 text-sm text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={requestDelete}
              disabled={disabled}
              aria-label="Delete this step?"
              className="h-auto w-10 min-h-[40px] shrink-0 rounded-lg text-gray-300 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            >
              <TrashIcon />
            </Button>
          </div>
          {errored && (
            <p className="text-xs text-red-600">
              A timer needs a label — add one or clear the time.
            </p>
          )}
        </div>
      )}
    />
  );
}
