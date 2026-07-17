"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { deleteIngredient, updateIngredient } from "@/lib/api/ingredients";
import type { IngredientUpdateInput } from "@/lib/schemas/ingredient";
import type { IngredientNutrition, IngredientRow } from "@/types/ingredient";
import IngredientSourceBadge from "./IngredientSourceBadge";
import { NUTRITION_COLUMNS } from "./nutritionColumns";

// One editable catalog row. All cells are draft-local until Save, which
// PATCHes only the fields that changed. The parent keys this component by
// `${id}-${updated_at}` so a successful save remounts it with a fresh draft.

interface Draft {
  name: string;
  aliases: string;
  density: string;
  nutrition: Record<string, string>;
}

function toDraft(ingredient: IngredientRow): Draft {
  const nutrition: Record<string, string> = {};
  for (const col of NUTRITION_COLUMNS) {
    const value = ingredient.nutrition?.[col.key];
    nutrition[col.key] = value !== undefined && value !== null ? String(value) : "";
  }
  return {
    name: ingredient.name,
    aliases: ingredient.aliases.join(", "),
    density:
      ingredient.density_g_per_ml !== null ? String(ingredient.density_g_per_ml) : "",
    nutrition,
  };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.name === b.name &&
    a.aliases === b.aliases &&
    a.density === b.density &&
    NUTRITION_COLUMNS.every((col) => a.nutrition[col.key] === b.nutrition[col.key])
  );
}

// "" → null (clear the value); anything unparseable → undefined (field
// dropped from the patch rather than sent as garbage).
function parseNumeric(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

const numericCellClass =
  "w-16 bg-transparent text-right text-sm rounded-none border-0 border-b border-transparent focus:border-orange-400 focus:outline-none";

export default function IngredientRowEditor({
  ingredient,
  onSaved,
  onDeleted,
}: {
  ingredient: IngredientRow;
  onSaved: (row: IngredientRow) => void;
  onDeleted: (id: string) => void;
}) {
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
      const nutrition: IngredientNutrition = {};
      for (const col of NUTRITION_COLUMNS) {
        const value = parseNumeric(draft.nutrition[col.key]);
        if (typeof value === "number") nutrition[col.key] = value;
      }
      patch.nutrition = nutrition;
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

  return (
    <TableRow>
      <TableCell className="min-w-40">
        <input
          aria-label={`Name for ${ingredient.name}`}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full bg-transparent text-sm rounded-none border-0 border-b border-transparent focus:border-orange-400 focus:outline-none"
        />
      </TableCell>
      <TableCell className="min-w-40">
        <input
          aria-label={`Aliases for ${ingredient.name}`}
          value={draft.aliases}
          onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
          placeholder="comma, separated"
          className="w-full bg-transparent text-sm text-muted-foreground rounded-none border-0 border-b border-transparent focus:border-orange-400 focus:outline-none"
        />
      </TableCell>
      {NUTRITION_COLUMNS.map((col) => (
        <TableCell key={col.key} className="text-right">
          <input
            type="number"
            step="any"
            min="0"
            aria-label={`${col.title} for ${ingredient.name}`}
            value={draft.nutrition[col.key]}
            onChange={(e) =>
              setDraft({
                ...draft,
                nutrition: { ...draft.nutrition, [col.key]: e.target.value },
              })
            }
            className={numericCellClass}
          />
        </TableCell>
      ))}
      <TableCell className="text-right">
        <input
          type="number"
          step="any"
          min="0"
          aria-label={`Density (g/ml) for ${ingredient.name}`}
          value={draft.density}
          onChange={(e) => setDraft({ ...draft, density: e.target.value })}
          className={numericCellClass}
        />
      </TableCell>
      <TableCell>
        <IngredientSourceBadge source={ingredient.source} fdcId={ingredient.fdc_id} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        {error && (
          <span role="alert" className="text-xs text-red-600 mr-2">
            {error}
          </span>
        )}
        {dirty && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={busy}
            aria-label={`Save ${ingredient.name}`}
          >
            Save
          </Button>
        )}
        {confirmingDelete ? (
          <span className="inline-flex gap-1 ml-1">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={busy}
              aria-label={`Confirm delete ${ingredient.name}`}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              aria-label={`Cancel delete ${ingredient.name}`}
            >
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="ml-1 text-muted-foreground"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
            aria-label={`Delete ${ingredient.name}`}
          >
            Delete
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
