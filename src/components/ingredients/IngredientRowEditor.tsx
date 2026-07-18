"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronDownIcon } from "@/components/icons";
import { useIngredientRowEditor } from "@/hooks/useIngredientRowEditor";
import type { IngredientRow } from "@/types/ingredient";
import IngredientSourceBadge from "./IngredientSourceBadge";
import {
  NUTRITION_COLUMNS,
  PRIMARY_NUTRITION_COLUMNS,
} from "./nutritionColumns";
import { formatServingSize } from "./servingSize";
import {
  STICKY_ACTIONS_CELL,
  STICKY_ALIASES_CELL,
  STICKY_NAME_CELL,
} from "./tableStyles";

// One editable catalog row. All cells are draft-local until Save, which
// PATCHes only the fields that changed. The parent keys this component by
// `${id}-${updated_at}` so a successful save remounts it with a fresh draft.
// The edit buffer + save/delete lifecycle live in useIngredientRowEditor; this
// component is presentation and input wiring only.
//
// The main row shows only the primary nutrition columns; the rest (plus
// density) live in an expandable detail row. Both edit surfaces bind to the
// same draft keys, so there is a single source of truth and one save path.

const numericCellClass =
  "w-16 bg-transparent text-right text-sm rounded-none border-0 border-b border-transparent focus:border-orange-400 focus:outline-none";

const detailInputClass =
  "w-14 shrink-0 bg-transparent text-right text-sm rounded-none border-0 border-b border-muted-foreground/30 focus:border-orange-400 focus:outline-none";

// Name, Aliases, primary nutrition, Serving, Source, Actions.
const TOTAL_COLUMNS = PRIMARY_NUTRITION_COLUMNS.length + 5;

export default function IngredientRowEditor({
  ingredient,
  detailWidth,
  onSaved,
  onDeleted,
}: {
  ingredient: IngredientRow;
  /** Visible viewport width of the scroll container, so the expanded detail
   *  panel can pin itself to it and keep every field on-screen. */
  detailWidth?: number;
  onSaved: (row: IngredientRow) => void;
  onDeleted: (id: string) => void;
}) {
  const {
    draft,
    setDraft,
    dirty,
    busy,
    error,
    confirmingDelete,
    setConfirmingDelete,
    handleSave,
    handleDelete,
  } = useIngredientRowEditor(ingredient, onSaved, onDeleted);

  const [expanded, setExpanded] = useState(false);
  const servingSize = formatServingSize(ingredient.food_portions);

  return (
    <>
      <TableRow className="group hover:bg-muted">
        <TableCell className={`${STICKY_NAME_CELL} group-hover:bg-muted`}>
          <input
            aria-label={`Name for ${ingredient.name}`}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full bg-transparent text-sm rounded-none border-0 border-b border-transparent focus:border-orange-400 focus:outline-none"
          />
        </TableCell>
        <TableCell className={`${STICKY_ALIASES_CELL} group-hover:bg-muted`}>
          <input
            aria-label={`Aliases for ${ingredient.name}`}
            value={draft.aliases}
            onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
            placeholder="comma, separated"
            className="w-full bg-transparent text-sm text-muted-foreground rounded-none border-0 border-b border-transparent focus:border-orange-400 focus:outline-none"
          />
        </TableCell>
        {PRIMARY_NUTRITION_COLUMNS.map((col) => (
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
        <TableCell className="align-top text-right text-sm text-muted-foreground">
          {/* Inner div caps the width reliably (a td's own max-width isn't
              honored under table-layout:auto), so long portions — e.g. cooking
              spray's "1 spray (1/3 second)…" — wrap instead of widening the
              column. */}
          <div className="ml-auto max-w-40 whitespace-normal break-words">
            {servingSize ?? "—"}
          </div>
        </TableCell>
        <TableCell>
          <IngredientSourceBadge
            source={ingredient.source}
            fdcId={ingredient.fdc_id}
          />
        </TableCell>
        <TableCell
          className={`${STICKY_ACTIONS_CELL} whitespace-nowrap text-right group-hover:bg-muted`}
        >
          {error && (
            <span role="alert" className="text-xs text-red-600 mr-2">
              {error}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={`Details for ${ingredient.name}`}
            aria-expanded={expanded}
            className="mr-1 text-muted-foreground"
          >
            <ChevronDownIcon
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </Button>
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

      {expanded && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={TOTAL_COLUMNS} className="px-0 py-4">
            {/* Pinned to the scroll viewport's left edge and sized to its width
                so every field stays visible without horizontal scrolling, even
                though the cell spans the (wider) full table. */}
            <div
              className="sticky left-0 space-y-4 px-4"
              style={detailWidth ? { width: detailWidth } : undefined}
            >
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  All nutrition (per 100 g)
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                  {NUTRITION_COLUMNS.map((col) => (
                    <label
                      key={col.key}
                      className="flex min-w-0 items-center justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0 text-muted-foreground">
                        {col.title}
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        aria-label={`${col.title} for ${ingredient.name}`}
                        value={draft.nutrition[col.key]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            nutrition: {
                              ...draft.nutrition,
                              [col.key]: e.target.value,
                            },
                          })
                        }
                        className={detailInputClass}
                      />
                    </label>
                  ))}
                  <label className="flex min-w-0 items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 text-muted-foreground">
                      Density (g/ml)
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      aria-label={`Density (g/ml) for ${ingredient.name}`}
                      value={draft.density}
                      onChange={(e) =>
                        setDraft({ ...draft, density: e.target.value })
                      }
                      className={detailInputClass}
                    />
                  </label>
                </div>
              </div>

              <dl className="flex flex-wrap gap-x-8 gap-y-1 text-xs text-muted-foreground">
                <div className="flex gap-1">
                  <dt className="font-medium">Serving:</dt>
                  <dd>{servingSize ?? "—"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="font-medium">Source:</dt>
                  <dd>{ingredient.source}</dd>
                </div>
                {ingredient.fdc_id != null && (
                  <div className="flex gap-1">
                    <dt className="font-medium">FDC ID:</dt>
                    <dd>{ingredient.fdc_id}</dd>
                  </div>
                )}
                {ingredient.fdc_data_type && (
                  <div className="flex gap-1">
                    <dt className="font-medium">Data type:</dt>
                    <dd>{ingredient.fdc_data_type}</dd>
                  </div>
                )}
              </dl>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
