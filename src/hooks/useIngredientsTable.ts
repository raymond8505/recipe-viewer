import { useState, type Dispatch, type SetStateAction } from "react";
import { fetchIngredients } from "@/lib/api/ingredients";
import type { IngredientRow } from "@/types/ingredient";

export const PAGE_SIZE = 50;

export interface UseIngredientsTable {
  rows: IngredientRow[];
  setRows: Dispatch<SetStateAction<IngredientRow[]>>;
  count: number;
  setCount: Dispatch<SetStateAction<number>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  loading: boolean;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  /** Derived: page count from `count`, never below 1. */
  totalPages: number;
  /** Fetch a page for the given query and replace the rows/count. Owns the
   *  loading flag and surfaces failures through `error`. */
  load: (q: string, p: number) => Promise<void>;
}

/**
 * Owns the ingredient manager's data layer: the row/count/query/page state and
 * the server fetch (`load`). The event handlers (search/paginate/save/delete)
 * stay in IngredientsTable — they read and drive this state, keeping the wiring
 * next to the JSX while the fetch-and-set business logic lives here. The
 * create-ingredient panel (IngredientCreateForm) owns its own field state.
 */
export function useIngredientsTable(
  initialIngredients: IngredientRow[],
  initialCount: number,
): UseIngredientsTable {
  const [rows, setRows] = useState(initialIngredients);
  const [count, setCount] = useState(initialCount);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
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

  return {
    rows,
    setRows,
    count,
    setCount,
    query,
    setQuery,
    page,
    setPage,
    loading,
    error,
    setError,
    totalPages,
    load,
  };
}
