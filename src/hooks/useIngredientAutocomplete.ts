"use client";

import { useEffect, useRef, useState } from "react";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import type { UsdaSearchFood } from "@/lib/usda";
import { searchIngredientsKeyword, searchUsdaFoods } from "@/lib/api/ingredients";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export interface IngredientAutocompleteSearch {
  (q: string): Promise<IngredientKeywordMatch[]>;
}

export interface UsdaFoodSearch {
  (q: string): Promise<UsdaSearchFood[]>;
}

// Data layer for IngredientAutocomplete: debounced catalog keyword search
// with a request-sequence guard (a slow early response must never overwrite
// a later query's results) and an explicit error state — a failed search
// renders "Search unavailable", never "No matches". The USDA side is a
// one-shot, explicitly-triggered search (no per-keystroke fallback — the
// upstream is rate-limited); editing the query discards its results.
export function useIngredientAutocomplete(
  search: IngredientAutocompleteSearch = (q) => searchIngredientsKeyword(q),
  usdaSearch: UsdaFoodSearch = (q) => searchUsdaFoods(q),
) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<IngredientKeywordMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not searched for the current query.
  const [usdaResults, setUsdaResults] = useState<UsdaSearchFood[] | null>(null);
  const [usdaLoading, setUsdaLoading] = useState(false);
  const [usdaError, setUsdaError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const usdaSeqRef = useRef(0);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const resetUsda = () => {
    usdaSeqRef.current++;
    setUsdaResults(null);
    setUsdaLoading(false);
    setUsdaError(null);
  };

  const setQuery = (value: string) => {
    setQueryState(value);
    // USDA results answered a previous query — stale the moment it changes.
    resetUsda();
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

  const runUsdaSearch = async () => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) return;
    const seq = ++usdaSeqRef.current;
    setUsdaLoading(true);
    setUsdaError(null);
    try {
      const data = await usdaSearch(q);
      if (seq !== usdaSeqRef.current) return;
      setUsdaResults(data);
      setUsdaLoading(false);
    } catch {
      if (seq !== usdaSeqRef.current) return;
      setUsdaError("USDA search unavailable");
      setUsdaLoading(false);
    }
  };

  const reset = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    seqRef.current++;
    setQueryState("");
    setResults([]);
    setLoading(false);
    setError(null);
    resetUsda();
  };

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    usdaResults,
    usdaLoading,
    usdaError,
    runUsdaSearch,
    reset,
  };
}
