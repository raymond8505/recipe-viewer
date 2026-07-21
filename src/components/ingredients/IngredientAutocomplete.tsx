"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import { SpinnerIcon } from "@/components/icons";
import {
  useIngredientAutocomplete,
  type IngredientAutocompleteSearch,
} from "@/hooks/useIngredientAutocomplete";

interface IngredientAutocompleteProps {
  /** Current association; null renders the "unmatched" trigger. */
  value: { id: string; name: string } | null;
  /** null = clear the association. Persistence lives in the parent. */
  onSelect: (match: IngredientKeywordMatch | null) => void;
  /**
   * Per-row accessible trigger label (e.g. "Change match for 1 tsp cumin") —
   * required because a table renders many of these and duplicate aria-labels
   * are a hard getByLabelText failure.
   */
  ariaLabel: string;
  disabled?: boolean;
  /** DI seam so stories/tests run without a backend; defaults to the api wrapper. */
  search?: IngredientAutocompleteSearch;
  /**
   * Fires when the editor opens/closes. The host table cell is a sticky
   * stacking context, so the parent must raise its z-index while the
   * dropdown is open — the dropdown's own z-index can't beat sibling cells.
   */
  onOpenChange?: (open: boolean) => void;
}

// Combobox for re-pointing a recipe line at a catalog ingredient. The input
// keeps focus while ArrowDown/ArrowUp move a highlight through the options
// (wrapping), Enter selects, Escape/click-outside close without change.
export default function IngredientAutocomplete({
  value,
  onSelect,
  ariaLabel,
  disabled,
  search,
  onOpenChange,
}: IngredientAutocompleteProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { query, setQuery, results, loading, error, reset } = useIngredientAutocomplete(search);

  // The "Clear match" item sits after the results in the keyboard cycle.
  const optionCount = results.length + (value ? 1 : 0);

  useEffect(() => {
    setHighlight(0);
  }, [results]);

  const close = () => {
    setOpen(false);
    reset();
    onOpenChange?.(false);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("pointerdown", handler, { capture: true });
    return () => document.removeEventListener("pointerdown", handler, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openEditor = () => {
    setOpen(true);
    onOpenChange?.(true);
    // Pre-fill with the current name so a small correction is one keystroke
    // away; selecting the text keeps "type a new name" equally cheap.
    setQuery(value?.name ?? "");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const select = (index: number) => {
    if (index < results.length) {
      onSelect(results[index]);
    } else if (value) {
      onSelect(null);
    }
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && optionCount > 0) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % optionCount);
    } else if (e.key === "ArrowUp" && optionCount > 0) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + optionCount) % optionCount);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (optionCount > 0) select(highlight);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openEditor}
        disabled={disabled}
        aria-label={ariaLabel}
        className="w-full min-h-9 text-left text-sm disabled:opacity-50"
      >
        {value ? (
          <span className="text-foreground">{value.name}</span>
        ) : (
          <span className="italic text-muted-foreground">unmatched</span>
        )}
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search ingredients…"
          aria-label={ariaLabel}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={true}
          aria-controls={listboxId}
          aria-activedescendant={
            optionCount > 0 ? `${listboxId}-opt-${highlight}` : undefined
          }
          className="w-full min-w-0 bg-transparent text-sm rounded-none border-0 border-b border-border outline-hidden focus:border-orange-400"
        />
        {loading && <SpinnerIcon />}
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label="Ingredient matches"
        className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
      >
        {error ? (
          <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
            {error}
          </p>
        ) : results.length === 0 && !loading ? (
          <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
            {query.trim().length < 2 ? "Type to search…" : "No matches"}
          </p>
        ) : (
          results.map((match, i) => (
            <button
              key={match.id}
              id={`${listboxId}-opt-${i}`}
              type="button"
              role="option"
              aria-selected={i === highlight}
              tabIndex={-1}
              onClick={() => select(i)}
              onPointerEnter={() => setHighlight(i)}
              className={`flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm ${
                i === highlight ? "bg-brand-subtle" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{match.name}</span>
                <MatchedAlias match={match} query={query} />
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {Math.round(match.similarity * 100)}%
              </span>
            </button>
          ))
        )}
        {value && !error && (
          <button
            id={`${listboxId}-opt-${results.length}`}
            type="button"
            role="option"
            aria-selected={highlight === results.length}
            tabIndex={-1}
            onClick={() => select(results.length)}
            onPointerEnter={() => setHighlight(results.length)}
            className={`w-full border-t border-border px-3 py-2 text-left text-sm text-muted-foreground ${
              highlight === results.length ? "bg-brand-subtle" : ""
            }`}
          >
            Clear match
          </button>
        )}
      </div>
    </div>
  );
}

// The RPC scores best-of over name + aliases but doesn't say which won, so
// this is a display heuristic: surface the first alias containing the query
// when the name itself doesn't — the likely reason the row ranked.
function MatchedAlias({
  match,
  query,
}: {
  match: IngredientKeywordMatch;
  query: string;
}) {
  const q = query.trim().toLowerCase();
  if (!q || match.name.toLowerCase().includes(q)) return null;
  const alias = match.aliases.find((a) => a.toLowerCase().includes(q));
  if (!alias) return null;
  return (
    <span className="block truncate text-xs text-muted-foreground">{alias}</span>
  );
}
