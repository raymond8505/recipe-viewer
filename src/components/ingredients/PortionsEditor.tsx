"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_PORTION_DRAFT, type PortionDraft } from "./portions";

// A controlled editor for an ingredient's portions list. Each portion is a
// label (e.g. "cup", "serving") plus a gram weight; the label is optional so
// the default 100 g portion reads as just a weight. Pure presentation — the
// draft lives in the parent (the create form or the row-editor buffer) so both
// surfaces reuse this without duplicating the add/edit/remove wiring.
//
// Grams uses a text input (not type="number") so a half-typed value never
// clears the field; conversion + validation happen in portions.ts on save.

const inputClass =
  "bg-transparent text-sm rounded-none border-0 border-b border-muted-foreground/30 focus:border-orange-400 focus:outline-none";

export default function PortionsEditor({
  portions,
  onChange,
  idPrefix = "portion",
}: {
  portions: PortionDraft[];
  onChange: (next: PortionDraft[]) => void;
  /** Disambiguates aria-labels when more than one editor is on the page. */
  idPrefix?: string;
}) {
  function update(index: number, patch: Partial<PortionDraft>) {
    onChange(portions.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function add() {
    onChange([...portions, { ...DEFAULT_PORTION_DRAFT, grams: "" }]);
  }

  function remove(index: number) {
    onChange(portions.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {portions.map((portion, index) => (
          // Index key: rows are positional and have no stable id; the parent
          // owns the array so React reconciles on the whole list anyway.
          <li key={index} className="flex items-center gap-2">
            <input
              aria-label={`${idPrefix} ${index + 1} label`}
              value={portion.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="label (e.g. cup)"
              className={`${inputClass} flex-1`}
            />
            <input
              aria-label={`${idPrefix} ${index + 1} grams`}
              value={portion.grams}
              onChange={(e) => update(index, { grams: e.target.value })}
              inputMode="decimal"
              placeholder="grams"
              className={`${inputClass} w-20 text-right`}
            />
            <span className="text-sm text-muted-foreground">g</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => remove(index)}
              disabled={portions.length <= 1}
              aria-label={`Remove ${idPrefix} ${index + 1}`}
              className="text-muted-foreground"
            >
              <X size={16} aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={add}
        className="text-muted-foreground"
      >
        <Plus size={16} aria-hidden className="mr-1" />
        Add portion
      </Button>
    </div>
  );
}
