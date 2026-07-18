"use client";

import { useState } from "react";
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
import { createIngredient, fetchIngredients } from "@/lib/api/ingredients";
import { pluralize } from "@/lib/format";
import type { IngredientRow } from "@/types/ingredient";
import IngredientRowEditor from "./IngredientRowEditor";
import { NUTRITION_COLUMNS } from "./nutritionColumns";

const PAGE_SIZE = 50;

/**
 * The ingredient manager: a flat, editable view of the whole catalog. The
 * server page hands over the first page; searching and paging re-fetch
 * client-side through src/lib/api/ingredients.ts. Rows save/delete themselves
 * (IngredientRowEditor) and report back so the list stays in sync without a
 * refetch.
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
  const [rows, setRows] = useState(initialIngredients);
  const [count, setCount] = useState(initialCount);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [busyAdding, setBusyAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  async function load(q: string, p: number) {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIngredients({
        q: q.trim() || undefined,
        page: p,
        limit: PAGE_SIZE,
      });
      setRows(result.data);
      setCount(result.count);
    } catch {
      setError("Failed to load ingredients");
    } finally {
      setLoading(false);
    }
  }

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
          <Button type="submit" variant="secondary" size="sm" disabled={loading}>
            Search
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

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Aliases</TableHead>
              {NUTRITION_COLUMNS.map((col) => (
                <TableHead key={col.key} title={col.title} className="text-right">
                  {col.label}
                </TableHead>
              ))}
              <TableHead title="Density (g/ml)" className="text-right">
                g/ml
              </TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={NUTRITION_COLUMNS.length + 5}
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
