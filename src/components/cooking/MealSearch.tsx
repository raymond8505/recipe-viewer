"use client";

import { useRef, useState, useEffect } from "react";
import type { RecipeRow } from "@/types/recipe";
import { SearchIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface MealSearchProps {
  excludeIds: Set<string>;
  onAdd: (recipe: RecipeRow) => void;
}

export default function MealSearch({ excludeIds, onAdd }: MealSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Click outside → close dropdown
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setQuery("");
        setResults([]);
      }
    };
    document.addEventListener("pointerdown", handler, { capture: true });
    return () => document.removeEventListener("pointerdown", handler, { capture: true });
  }, []);

  // Cancel pending work on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (value.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/recipes?q=${encodeURIComponent(value.trim())}&limit=8`,
          { signal: controller.signal, headers: { "x-requested-by": "recipe-viewer" } }
        );
        const json: { data: RecipeRow[] } = await res.json();
        setResults(json.data.filter((r) => !excludeIds.has(r.id)));
      } catch {
        // aborted or network error — ignore
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const dismiss = () => {
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      resultRefs.current[0]?.focus();
    } else if (e.key === "Escape") {
      dismiss();
    }
  };

  const handleResultKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      resultRefs.current[index + 1]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index === 0) inputRef.current?.focus();
      else resultRefs.current[index - 1]?.focus();
    } else if (e.key === "Escape") {
      dismiss();
    }
  };

  const showDropdown = query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-card focus-within:border-orange-400 focus-within:ring-1 focus-within:ring-orange-400 transition-colors">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Add recipe to meal…"
          className="flex-1 min-w-0 text-sm text-gray-800 placeholder-gray-400 outline-hidden bg-transparent"
          aria-label="Search recipes to add to meal"
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={showDropdown ? "meal-search-results" : undefined}
        />
        {loading && <SpinnerIcon />}
      </div>

      {showDropdown && (
        <div
          id="meal-search-results"
          role="listbox"
          aria-label="Recipe search results"
          className="absolute left-0 right-0 top-full mt-1 bg-popover rounded-xl border border-gray-200 shadow-lg z-10 max-h-[240px] overflow-y-auto"
        >
          {loading && results.length === 0 ? (
            <p className="py-3 px-4 text-sm text-gray-400" role="status">Searching…</p>
          ) : results.length === 0 ? (
            <p className="py-3 px-4 text-sm text-gray-400" role="status">No recipes found</p>
          ) : (
            results.map((recipe, i) => (
              <Button
                key={recipe.id}
                ref={(el) => { resultRefs.current[i] = el; }}
                variant="ghost"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onAdd(recipe);
                  setQuery("");
                  setResults([]);
                }}
                onKeyDown={(e) => handleResultKeyDown(e, i)}
                className="h-auto w-full min-h-[44px] flex-col items-start justify-center gap-0 whitespace-normal rounded-none border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-800 hover:bg-brand-subtle hover:text-gray-800 active:bg-brand/10 last:border-0"
              >
                <span className="block font-medium leading-snug">
                  {recipe.metadata.schema.name}
                </span>
                {recipe.source && (
                  <span className="block text-xs text-gray-400 mt-0.5">{recipe.source}</span>
                )}
              </Button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
