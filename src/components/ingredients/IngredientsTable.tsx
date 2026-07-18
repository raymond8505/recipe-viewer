"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SpinnerIcon } from "@/components/icons";
import { createIngredient } from "@/lib/api/ingredients";
import { pluralize } from "@/lib/format";
import { useIngredientsTable } from "@/hooks/useIngredientsTable";
import type { IngredientRow } from "@/types/ingredient";
import IngredientRowEditor from "./IngredientRowEditor";
import { PRIMARY_NUTRITION_COLUMNS } from "./nutritionColumns";
import {
  STICKY_ACTIONS_HEAD,
  STICKY_ALIASES_HEAD,
  STICKY_HEAD,
  STICKY_NAME_HEAD,
} from "./tableStyles";

/**
 * The ingredient manager: a flat, editable view of the whole catalog. The
 * server page hands over the first page; searching and paging re-fetch
 * client-side through src/lib/api/ingredients.ts. Rows save/delete themselves
 * (IngredientRowEditor) and report back so the list stays in sync without a
 * refetch. The data layer (state + fetch) lives in useIngredientsTable; the
 * event handlers stay here next to the JSX.
 *
 * @summary editable admin table over the ingredient catalog
 */
export default function IngredientsTable({
  initialIngredients,
  initialCount,
}: {
  initialIngredients: IngredientRow[];
  initialCount: number;
}) {
  const {
    rows,
    setRows,
    count,
    setCount,
    query,
    setQuery,
    page,
    setPage,
    loading,
    newName,
    setNewName,
    busyAdding,
    setBusyAdding,
    error,
    setError,
    totalPages,
    load,
  } = useIngredientsTable(initialIngredients, initialCount);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    void load(query, 1);
  }

  function goToPage(p: number) {
    setPage(p);
    void load(query, p);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusyAdding(true);
    setError(null);
    try {
      const row = await createIngredient({ name, source: "manual" });
      setRows((current) => [row, ...current]);
      setCount((current) => current + 1);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add ingredient");
    } finally {
      setBusyAdding(false);
    }
  }

  function handleSaved(updated: IngredientRow) {
    setRows((current) =>
      current.map((row) => (row.id === updated.id ? updated : row)),
    );
  }

  function handleDeleted(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    setCount((current) => Math.max(0, current - 1));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form onSubmit={handleSearch} className="flex items-end gap-2">
          <Input
            aria-label="Search ingredients"
            placeholder="Search ingredients…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={loading}
            aria-label="Search"
          >
            {loading ? <SpinnerIcon className="animate-spin" /> : "Search"}
          </Button>
        </form>
        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <Input
            aria-label="New ingredient name"
            placeholder="New ingredient name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-64"
          />
          <Button type="submit" size="sm" disabled={busyAdding || !newName.trim()}>
            Add
          </Button>
        </form>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Nutrition values are per 100 g. Density converts volume to weight
        (grams = ml × g/ml).
      </p>

      {/* Single scroll box (both axes). Capped at ~73vh so the chrome, heading,
          and search/add row above it fit without forcing a page-level (body)
          scrollbar. The header sticks to the top and the Name/Aliases/Actions
          columns stick to the sides — so the shadcn Table's own overflow
          wrapper must be neutralized, or it would become the scrollport and
          break the sticky. */}
      <div className="max-h-[73vh] overflow-auto [&_[data-slot=table-container]]:overflow-visible">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={STICKY_NAME_HEAD}>Name</TableHead>
              <TableHead className={STICKY_ALIASES_HEAD}>Aliases</TableHead>
              {PRIMARY_NUTRITION_COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  title={col.title}
                  className={`${STICKY_HEAD} text-right`}
                >
                  {col.label}
                  {col.unit && (
                    <span className="ml-0.5 font-normal text-muted-foreground">
                      ({col.unit})
                    </span>
                  )}
                </TableHead>
              ))}
              <TableHead
                title="Representative serving from USDA food portions"
                className={`${STICKY_HEAD} text-right`}
              >
                Serving
              </TableHead>
              <TableHead className={STICKY_HEAD}>Source</TableHead>
              <TableHead className={`${STICKY_ACTIONS_HEAD} text-right`}>
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={PRIMARY_NUTRITION_COLUMNS.length + 5}
                  className="text-center text-muted-foreground py-8"
                >
                  {loading
                    ? "Loading…"
                    : "No ingredients found — add one above, or save a recipe and let normalization populate the catalog."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <IngredientRowEditor
                  // updated_at in the key remounts the row with a fresh draft
                  // after each successful save.
                  key={`${row.id}-${row.updated_at}`}
                  ingredient={row}
                  onSaved={handleSaved}
                  onDeleted={handleDeleted}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {count} {pluralize(count, "ingredient")}
        </span>
        {totalPages > 1 && (
          <span className="inline-flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
            >
              Previous
            </Button>
            Page {page} of {totalPages}
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}
