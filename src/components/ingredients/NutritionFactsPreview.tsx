"use client";

import { useState } from "react";
import { scaleNutritionToGrams } from "@/lib/nutritionMath";
import NutritionFactsLabel from "./NutritionFactsLabel";
import {
  nutritionBasisOptions,
  parseDraftNutrition,
} from "./nutritionFacts";
import type { PortionDraft } from "./portions";

// The drawer's live label preview: draft nutrition strings + draft portions
// in, an FDA-style label out, with a selector for which portion the label
// shows. Everything re-derives from the draft on every render, so the label
// tracks each keystroke in the nutrition grid and the portions editor.
//
// Selection is a soft reference: the chosen option key is looked up against
// the freshly derived options, falling back to the first option (the 100 g
// baseline when present) whenever the selected portion was deleted or its
// grams edited to something non-positive. Because portion options are keyed
// by list index (matching the create form's index-clamp approach), deleting
// an earlier portion can shift the selection onto its successor — accepted,
// same as the create form. A save remounts the whole row (the parent keys it
// by `${id}-${updated_at}`), which resets the selection to the baseline.

const selectClass =
  "max-w-full bg-transparent text-sm rounded-none border-0 border-b border-muted-foreground/30 focus:border-orange-400 focus:outline-none";

export default function NutritionFactsPreview({
  nutrition,
  portions,
  idPrefix,
}: {
  /** The drawer's per-100 g draft strings, live. */
  nutrition: Record<string, string>;
  /** The drawer's draft portions, live. */
  portions: PortionDraft[];
  /** Disambiguates aria-labels across rows (the ingredient name). */
  idPrefix: string;
}) {
  const [selectedKey, setSelectedKey] = useState("100g");
  const options = nutritionBasisOptions(portions);
  const selected = options.find((o) => o.key === selectedKey) ?? options[0];
  const scaled = scaleNutritionToGrams(
    parseDraftNutrition(nutrition),
    selected.grams,
  );

  return (
    <div className="space-y-2">
      <label className="flex items-baseline gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">Show per</span>
        <select
          aria-label={`Nutrition label portion for ${idPrefix}`}
          value={selected.key}
          onChange={(e) => setSelectedKey(e.target.value)}
          className={selectClass}
        >
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <NutritionFactsLabel nutrition={scaled} servingLabel={selected.label} />
    </div>
  );
}
