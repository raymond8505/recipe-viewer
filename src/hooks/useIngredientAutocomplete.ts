"use client";

import { useEffect, useRef, useState } from "react";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import { searchIngredientsKeyword } from "@/lib/api/ingredients";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export interface IngredientAutocompleteSearch {
  (q: string): Promise<IngredientKeywordMatch[]>;
}

// Data layer for IngredientAutocomplete: debounced keyword search with a
// request-sequence guard (a slow early response must never overwrite a
// later query's results) and an explicit error state — a failed search
// renders "Search unavailable", never "No matches".
export function useIngredientAutocomplete(
  search: IngredientAutocompleteSearch = (q) => searchIngredientsKeyword(q),
) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<IngredientKeywordMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const setQuery = (value: string) => {
    setQueryState(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const seq = ++seqRef.current;

    if (value.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await search(value.trim());
        if (seq !== seqRef.current) return;
        setResults(data);
        setLoading(false);
      } catch {
        if (seq !== seqRef.current) return;
        setResults([]);
        setError("Search unavailable");
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const reset = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    seqRef.current++;
    setQueryState("");
    setResults([]);
    setLoading(false);
    setError(null);
  };

  return { query, setQuery, results, loading, error, reset };
}
