import { useState, type Dispatch, type SetStateAction } from "react";
import { parseNumeric } from "@/lib/format";
import { formatAmount } from "@/lib/units";
import { deleteIngredient, updateIngredient } from "@/lib/api/ingredients";
import type { IngredientUpdateInput } from "@/lib/schemas/ingredient";
import type { IngredientRow } from "@/types/ingredient";
import { NUTRITION_COLUMNS } from "@/components/ingredients/nutritionColumns";
import { parseDraftNutrition } from "@/components/ingredients/nutritionFacts";
import {
  fromPortionDrafts,
  toPortionDrafts,
  type PortionDraft,
} from "@/components/ingredients/portions";

/** The draft buffer for one editable catalog row. Every field is a string so
 *  the inputs stay controlled; numbers are parsed only when building a patch. */
export interface Draft {
  name: string;
  aliases: string;
  density: string;
  nutrition: Record<string, string>;
  portions: PortionDraft[];
}

function toDraft(ingredient: IngredientRow): Draft {
  const nutrition: Record<string, string> = {};
  for (const col of NUTRITION_COLUMNS) {
    const value = ingredient.nutrition?.[col.key];
    // Display (and, on save, persist) at 2 dp — matches formatAmount everywhere
    // else nutrition surfaces (NutritionDetail), so a USDA 1.535 reads 1.54.
    nutrition[col.key] =
      value !== undefined && value !== null ? formatAmount(value) : "";
  }
  return {
    name: ingredient.name,
    aliases: ingredient.aliases.join(", "),
    density:
      ingredient.density_g_per_ml !== null ? String(ingredient.density_g_per_ml) : "",
    nutrition,
    portions: toPortionDrafts(ingredient.food_portions),
  };
}

function portionsEqual(a: PortionDraft[], b: PortionDraft[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => p.label === b[i].label && p.grams === b[i].grams)
  );
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.name === b.name &&
    a.aliases === b.aliases &&
    a.density === b.density &&
    NUTRITION_COLUMNS.every((col) => a.nutrition[col.key] === b.nutrition[col.key]) &&
    portionsEqual(a.portions, b.portions)
  );
}

export interface UseIngredientRowEditor {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  /** True when the draft differs from the row as first loaded (drives Save). */
  dirty: boolean;
  /** True while a save/delete request is in flight. */
  busy: boolean;
  /** The last save/delete error message, or null. */
  error: string | null;
  /** True once Delete is armed and awaiting confirmation. */
  confirmingDelete: boolean;
  setConfirmingDelete: Dispatch<SetStateAction<boolean>>;
  /** PATCH only the changed fields; on success hands the fresh row to onSaved. */
  handleSave: () => Promise<void>;
  /** DELETE the row; on success reports its id to onDeleted. */
  handleDelete: () => Promise<void>;
}

/**
 * Owns the edit buffer + save/delete lifecycle for one IngredientRowEditor row.
 * The draft is seeded once from the ingredient (the parent remounts the row on a
 * successful save via its `${id}-${updated_at}` key, which re-seeds it), and only
 * the fields that actually changed are sent — the nutrition jsonb is replaced
 * whole, so a nutrition edit resends every non-empty field.
 */
export function useIngredientRowEditor(
  ingredient: IngredientRow,
  onSaved: (row: IngredientRow) => void,
  onDeleted: (id: string) => void,
): UseIngredientRowEditor {
  const [initial] = useState(() => toDraft(ingredient));
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = !draftsEqual(draft, initial);

  function buildPatch(): IngredientUpdateInput {
    const patch: IngredientUpdateInput = {};
    if (draft.name !== initial.name && draft.name.trim()) {
      patch.name = draft.name.trim();
    }
    if (draft.aliases !== initial.aliases) {
      patch.aliases = draft.aliases
        .split(",")
        .map((alias) => alias.trim())
        .filter(Boolean);
    }
    if (draft.density !== initial.density) {
      const density = parseNumeric(draft.density);
      if (density !== undefined) patch.density_g_per_ml = density;
    }
    const nutritionChanged = NUTRITION_COLUMNS.some(
      (col) => draft.nutrition[col.key] !== initial.nutrition[col.key],
    );
    if (nutritionChanged) {
      // The nutrition jsonb is replaced whole, so send every non-empty field —
      // not just the edited ones — or untouched values would be dropped.
      // parseDraftNutrition is shared with the label preview, so what the
      // label shows and what a save persists can never parse differently.
      patch.nutrition = parseDraftNutrition(draft.nutrition);
    }
    if (!portionsEqual(draft.portions, initial.portions)) {
      // Replaced whole, like nutrition: send every valid portion so untouched
      // rows aren't dropped. Invalid/blank-grams rows fall out in conversion.
      patch.food_portions = fromPortionDrafts(draft.portions);
    }
    return patch;
  }

  async function handleSave() {
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateIngredient(ingredient.id, patch));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteIngredient(ingredient.id);
      onDeleted(ingredient.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return {
    draft,
    setDraft,
    dirty,
    busy,
    error,
    confirmingDelete,
    setConfirmingDelete,
    handleSave,
    handleDelete,
  };
}
