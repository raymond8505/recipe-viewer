import { parseNumeric } from "@/lib/format";
import type { UsdaFoodPortion } from "@/types/ingredient";

// Editor-specific pure logic for the manual portions list (co-located per the
// project's "Editor Helper Placement" rule). A portion is stored as a
// UsdaFoodPortion so hand-entered rows and USDA-imported rows share the one
// `food_portions` column and the same serving-size render (formatServingSize).
// In the editor each portion is a draft of two strings so its inputs stay
// controlled; numbers are parsed only when converting back to a portion.

export interface PortionDraft {
  /** The human label / unit, e.g. "cup" or "serving". Maps to `modifier`. */
  label: string;
  /** Grams for this portion, kept as a string for the controlled input. */
  grams: string;
}

// The seed portion every new ingredient starts with: a plain 100 g basis, so
// nutrition typed against it is already per-100g (an identity scale). No label,
// so formatServingSize renders just "100 g" rather than "1 100 g ≈ 100 g".
export const DEFAULT_PORTION_DRAFT: PortionDraft = { label: "", grams: "100" };

/** A portion's label for the nutrition-basis selector: its label, or its grams
 *  when unlabelled (the default 100 g portion). */
export function portionOptionLabel(portion: PortionDraft): string {
  const label = portion.label.trim();
  const grams = portion.grams.trim();
  if (label && grams) return `${label} (${grams} g)`;
  if (label) return label;
  return grams ? `${grams} g` : "portion";
}

/** The parsed gram weight of a portion, or null when it isn't a positive
 *  number — such a portion can't be a nutrition basis or a saved row. */
export function portionGrams(portion: PortionDraft): number | null {
  const grams = parseNumeric(portion.grams);
  return grams != null && grams > 0 ? grams : null;
}

/** Flatten a stored portion to an editable draft. A USDA portion's household
 *  amount (e.g. 2 tbsp) is folded into the label so it survives a round-trip as
 *  readable text; measureUnit.name is used when there is no modifier. */
export function toPortionDraft(portion: UsdaFoodPortion): PortionDraft {
  const unit =
    portion.modifier ??
    (portion.measureUnit?.name && portion.measureUnit.name !== "undetermined"
      ? portion.measureUnit.name
      : "");
  const label =
    portion.amount != null && portion.amount !== 1 && unit
      ? `${portion.amount} ${unit}`
      : unit;
  return { label, grams: String(portion.gramWeight) };
}

/** Convert an editable draft back to a stored portion, or null when its grams
 *  aren't a positive number (so invalid/blank rows drop out on save). */
export function fromPortionDraft(portion: PortionDraft): UsdaFoodPortion | null {
  const grams = portionGrams(portion);
  if (grams == null) return null;
  const label = portion.label.trim();
  return label ? { modifier: label, gramWeight: grams } : { gramWeight: grams };
}

/** Convert a list of drafts to stored portions, dropping any that are invalid. */
export function fromPortionDrafts(portions: PortionDraft[]): UsdaFoodPortion[] {
  return portions
    .map(fromPortionDraft)
    .filter((p): p is UsdaFoodPortion => p !== null);
}

/** Seed the editor from a stored list, falling back to the default 100 g
 *  portion when an ingredient has none. */
export function toPortionDrafts(
  portions: UsdaFoodPortion[] | null | undefined,
): PortionDraft[] {
  if (!portions || portions.length === 0) return [{ ...DEFAULT_PORTION_DRAFT }];
  return portions.map(toPortionDraft);
}
