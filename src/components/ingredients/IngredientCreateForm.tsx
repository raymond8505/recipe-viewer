"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createIngredient } from "@/lib/api/ingredients";
import { parseNumeric } from "@/lib/format";
import { scalePortionNutritionToPer100g } from "@/lib/nutritionMath";
import type { IngredientNutrition, IngredientRow } from "@/types/ingredient";
import { NUTRITION_COLUMNS, nutritionLabel } from "./nutritionColumns";
import PortionsEditor from "./PortionsEditor";
import {
  DEFAULT_PORTION_DRAFT,
  fromPortionDrafts,
  portionGrams,
  portionOptionLabel,
  type PortionDraft,
} from "./portions";

// The "new ingredient" panel. Unlike the catalog's per-100g edit path, nutrition
// here is entered against a chosen portion (defaulting to the seed 100 g portion,
// which is an identity scale) and converted to the stored per-100g basis on
// submit. Aliases are typed comma-separated and split into the array the catalog
// stores. Self-contained: the parent just consumes the created row.

const numericInputClass =
  "w-full bg-transparent text-right text-sm rounded-none border-0 border-b border-muted-foreground/30 focus:border-orange-400 focus:outline-none";

const selectClass =
  "bg-transparent text-sm rounded-none border-0 border-b border-muted-foreground/30 focus:border-orange-400 focus:outline-none";

function emptyNutrition(): Record<string, string> {
  return Object.fromEntries(NUTRITION_COLUMNS.map((col) => [col.key, ""]));
}

export default function IngredientCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated: (row: IngredientRow) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [density, setDensity] = useState("");
  const [nutrition, setNutrition] = useState<Record<string, string>>(emptyNutrition);
  const [portions, setPortions] = useState<PortionDraft[]>([
    { ...DEFAULT_PORTION_DRAFT },
  ]);
  const [basisIndex, setBasisIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The basis portion can be removed/reordered; clamp so the selector never
  // points past the end of the list.
  const basis = portions[basisIndex] ?? portions[0];
  const basisGrams = basis ? portionGrams(basis) : null;

  function handlePortionsChange(next: PortionDraft[]) {
    setPortions(next);
    if (basisIndex >= next.length) setBasisIndex(0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (basisGrams == null) {
      setError("The nutrition-basis portion needs a gram weight.");
      return;
    }

    // Nutrition typed against the basis portion → per-100g for storage.
    const entered: IngredientNutrition = {};
    for (const col of NUTRITION_COLUMNS) {
      const value = parseNumeric(nutrition[col.key]);
      if (typeof value === "number") entered[col.key] = value;
    }
    const per100g = scalePortionNutritionToPer100g(entered, basisGrams);

    const densityValue = parseNumeric(density);
    const foodPortions = fromPortionDrafts(portions);

    setBusy(true);
    setError(null);
    try {
      const row = await createIngredient({
        name: trimmedName,
        aliases: aliases
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
        nutrition: Object.keys(per100g).length > 0 ? per100g : undefined,
        density_g_per_ml: typeof densityValue === "number" ? densityValue : undefined,
        food_portions: foodPortions,
        source: "manual",
      });
      onCreated(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add ingredient");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="New ingredient"
      className="space-y-4 rounded-md bg-muted/40 p-4"
    >
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Name</span>
          <Input
            aria-label="New ingredient name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. gochujang"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Aliases</span>
          <Input
            aria-label="New ingredient aliases"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="comma, separated"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-8">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Portions
          </h3>
          <div className="w-72">
            <PortionsEditor
              idPrefix="New ingredient portion"
              portions={portions}
              onChange={handlePortionsChange}
            />
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Density (g/ml)</span>
          <input
            inputMode="decimal"
            aria-label="New ingredient density (g/ml)"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            className={`${numericInputClass} w-24 text-left`}
          />
        </label>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nutrition per
          </h3>
          <select
            aria-label="Nutrition basis portion"
            value={basisIndex}
            onChange={(e) => setBasisIndex(Number(e.target.value))}
            className={selectClass}
          >
            {portions.map((portion, index) => (
              <option key={index} value={index}>
                {portionOptionLabel(portion)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {NUTRITION_COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex min-w-0 items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 text-muted-foreground">
                {nutritionLabel(col)}
              </span>
              <input
                inputMode="decimal"
                aria-label={`${nutritionLabel(col)} for new ingredient`}
                value={nutrition[col.key]}
                onChange={(e) =>
                  setNutrition({ ...nutrition, [col.key]: e.target.value })
                }
                className={`${numericInputClass} w-16`}
              />
            </label>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          Create ingredient
        </Button>
        {onCancel && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
