"use client";

import { nanoid } from "nanoid";
import type { EditableStep, EditableInstructions } from "@/types/editor";
import { TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
            className="min-h-[44px] text-sm leading-relaxed resize-none overflow-hidden"
          />
          <div className="flex flex-wrap items-end gap-2">
            <Label className="flex-1 min-w-32 flex-col items-stretch gap-0.5 text-xs font-normal text-muted-foreground">
              Timer label
              <Input
                type="text"
                value={step.name}
                onChange={(e) => update({ name: e.target.value })}
                disabled={disabled}
                placeholder="e.g. Simmer"
                aria-label="Timer label"
                aria-invalid={errored || undefined}
                className="w-full min-h-[40px] text-sm"
              />
            </Label>
            <Label className="flex-col items-stretch gap-0.5 text-xs font-normal text-muted-foreground">
              Timer
              <DurationInput
                minutes={step.minutes}
                seconds={step.seconds}
                onChange={update}
                disabled={disabled}
                className="w-24 min-h-[40px] text-sm"
              />
            </Label>
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
            <p className="text-xs text-destructive">
              A timer needs a label — add one or clear the time.
            </p>
          )}
        </div>
      )}
    />
  );
}
