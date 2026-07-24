"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import type { UsdaSearchFood } from "@/lib/usda";
import { SpinnerIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  useIngredientAutocomplete,
  type IngredientAutocompleteSearch,
  type UsdaFoodSearch,
} from "@/hooks/useIngredientAutocomplete";

// One keyboard-navigable entry in the dropdown. Catalog matches, the
// "Search USDA" action, USDA foods, and "Clear match" share a single
// options array so ArrowDown/Up walk everything the mouse can reach.
type AutocompleteOption =
  | { kind: "catalog"; match: IngredientKeywordMatch }
  | { kind: "usda-search" }
  | { kind: "usda"; food: UsdaSearchFood }
  | { kind: "clear" };

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
  /** DI seam for the USDA candidate search; defaults to the api wrapper. */
  usdaSearch?: UsdaFoodSearch;
  /**
   * Import a picked USDA food (parent mints the catalog row + persists the
   * association). The USDA affordance only renders when this is provided.
   */
  onImportUsda?: (food: UsdaSearchFood) => void;
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
// When the catalog comes up short, a "Search USDA" action pulls FoodData
// Central candidates (Branded included) for one-click import.
export default function IngredientAutocomplete({
  value,
  onSelect,
  ariaLabel,
  disabled,
  search,
  usdaSearch,
  onImportUsda,
  onOpenChange,
}: IngredientAutocompleteProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
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
  } = useIngredientAutocomplete(search, usdaSearch);

  const queryReady = query.trim().length >= 2;
  const usdaActionEnabled = queryReady && !usdaLoading;

  // The USDA action is ALWAYS the last option while the editor is open (a
  // pinned footer, never buried under scrolling results — DB matches can be
  // wrong, so the escape hatch must stay visible next to them). It's merely
  // disabled until a query is typed, and doubles as retry/re-run afterwards.
  const options: AutocompleteOption[] = [
    ...results.map((match): AutocompleteOption => ({ kind: "catalog", match })),
    ...(usdaResults ?? []).map(
      (food): AutocompleteOption => ({ kind: "usda", food }),
    ),
    ...(value ? [{ kind: "clear" } as const] : []),
    ...(onImportUsda ? [{ kind: "usda-search" } as const] : []),
  ];

  useEffect(() => {
    setHighlight(0);
  }, [results, usdaResults]);

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

  const select = (option: AutocompleteOption | undefined) => {
    if (!option) return;
    switch (option.kind) {
      case "catalog":
        onSelect(option.match);
        close();
        break;
      case "usda-search":
        if (!usdaActionEnabled) return;
        // Stays open: the USDA results append above this pinned action.
        void runUsdaSearch();
        break;
      case "usda":
        onImportUsda?.(option.food);
        close();
        break;
      case "clear":
        onSelect(null);
        close();
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && options.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(options[highlight]);
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

  // cn/twMerge: the highlight bg must beat the sticky footer's own bg-popover.
  // shrink-0: flex-column children would compress to fit max-h instead of
  // letting the container scroll.
  const optionClass = (index: number, extra = "") =>
    cn(
      "w-full shrink-0 px-3 py-2 text-left text-sm",
      extra,
      index === highlight && "bg-brand-subtle",
    );

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
            options.length > 0 ? `${listboxId}-opt-${highlight}` : undefined
          }
          className="w-full min-w-0 bg-transparent text-sm rounded-none border-0 border-b border-border outline-hidden focus:border-orange-400"
        />
        {(loading || usdaLoading) && <SpinnerIcon />}
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label="Ingredient matches"
        // Size to the longest option instead of the (narrow, frozen) host
        // column: `w-max` grows to the widest child, `min-w-full` keeps it at
        // least as wide as the trigger, and `max-w` caps it against the
        // viewport. `whitespace-nowrap` lets option text define that intrinsic
        // width (names beyond the cap still truncate); flex-col stacks the
        // option buttons regardless of white-space.
        className="absolute left-0 top-full z-30 mt-1 flex max-h-60 w-max min-w-full max-w-[min(32rem,90vw)] flex-col overflow-y-auto whitespace-nowrap rounded-xl border border-border bg-popover shadow-lg"
      >
        {error && (
          <p className="shrink-0 px-3 py-2 text-sm text-muted-foreground" role="status">
            {error}
          </p>
        )}
        {!error && results.length === 0 && !loading && (
          <p className="shrink-0 px-3 py-2 text-sm text-muted-foreground" role="status">
            {queryReady ? "No catalog matches" : "Type to search…"}
          </p>
        )}
        {usdaLoading && (
          <p className="shrink-0 px-3 py-2 text-sm text-muted-foreground" role="status">
            Searching USDA…
          </p>
        )}
        {usdaError && (
          <p className="shrink-0 px-3 py-2 text-sm text-muted-foreground" role="status">
            {usdaError}
          </p>
        )}
        {usdaResults?.length === 0 && (
          <p className="shrink-0 px-3 py-2 text-sm text-muted-foreground" role="status">
            No USDA results
          </p>
        )}
        {options.map((option, i) => (
          <button
            key={optionKey(option)}
            id={`${listboxId}-opt-${i}`}
            type="button"
            role="option"
            aria-selected={i === highlight}
            tabIndex={-1}
            disabled={option.kind === "usda-search" && !usdaActionEnabled}
            onClick={() => select(option)}
            onPointerEnter={() => setHighlight(i)}
            className={optionClass(i, optionExtraClass(option))}
          >
            <OptionContent option={option} query={query} />
          </button>
        ))}
      </div>
    </div>
  );
}

function optionKey(option: AutocompleteOption): string {
  switch (option.kind) {
    case "catalog":
      return `catalog-${option.match.id}`;
    case "usda":
      return `usda-${option.food.fdcId}`;
    default:
      return option.kind;
  }
}

function optionExtraClass(option: AutocompleteOption): string {
  switch (option.kind) {
    case "usda-search":
      // Pinned to the scrollbox's visible bottom so results can never push
      // it out of view; opaque bg covers content scrolling beneath it.
      return "sticky bottom-0 border-t border-border bg-popover text-brand disabled:text-muted-foreground";
    case "clear":
      return "border-t border-border text-muted-foreground";
    default:
      return "";
  }
}

// Row content per option kind. Catalog rows show name + alias hint +
// similarity; USDA rows show the FDC description + data-type provenance.
function OptionContent({
  option,
  query,
}: {
  option: AutocompleteOption;
  query: string;
}) {
  switch (option.kind) {
    case "catalog":
      return (
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate">{option.match.name}</span>
            <MatchedAlias match={option.match} query={query} />
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {Math.round(option.match.similarity * 100)}%
          </span>
        </span>
      );
    case "usda-search": {
      const q = query.trim();
      return q.length >= 2 ? <>Search USDA for “{q}”</> : <>Search USDA…</>;
    }
    case "usda":
      return (
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate">{option.food.description}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {option.food.dataType}
          </span>
        </span>
      );
    case "clear":
      return <>Clear match</>;
  }
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
