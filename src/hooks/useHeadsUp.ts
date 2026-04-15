"use client";

import { useReducer, useEffect, useRef, useCallback } from "react";
import type { RecipeRow } from "@/types/recipe";

// ── Types ──────────────────────────────────────────────────────────────

export interface RoundPresentation {
  label: string;
  options: { id: string; label: string }[];
}

export interface CompletedRound {
  label: string;
  options: { id: string; label: string }[];
  winnerId: string;
  loserIds: string[];
}

export type HeadsUpPhase =
  | "prompt"
  | "searching"
  | "presenting"
  | "selected"
  | "confirming"
  | "deciding"
  | "splash"
  | "winner"
  | "error";

export interface HeadsUpState {
  phase: HeadsUpPhase;
  prompt: string;
  allIds: string[];
  pool: RecipeRow[];
  rounds: CompletedRound[];
  currentRound: RoundPresentation | null;
  roundNumber: number;
  selectedId: string | null;
  winner: RecipeRow | null;
  error: string | null;
}

type HeadsUpAction =
  | { type: "START_SEARCH"; prompt: string }
  | { type: "SEARCH_COMPLETE"; recipes: RecipeRow[]; firstRound: RoundPresentation }
  | { type: "SEARCH_ERROR"; message: string }
  | { type: "SELECT"; recipeId: string }
  | { type: "DESELECT" }
  | { type: "NEXT_ROUND"; round: RoundPresentation }
  | { type: "DECLARE_WINNER"; winnerId: string }
  | { type: "DECIDE_ERROR"; message: string }
  | { type: "SPLASH_DONE" }
  | { type: "RESET" };

// ── Reducer ────────────────────────────────────────────────────────────

const INITIAL_STATE: HeadsUpState = {
  phase: "prompt",
  prompt: "",
  allIds: [],
  pool: [],
  rounds: [],
  currentRound: null,
  roundNumber: 0,
  selectedId: null,
  winner: null,
  error: null,
};

function reducer(state: HeadsUpState, action: HeadsUpAction): HeadsUpState {
  switch (action.type) {
    case "START_SEARCH":
      return {
        ...INITIAL_STATE,
        phase: "searching",
        prompt: action.prompt,
      };

    case "SEARCH_COMPLETE":
      return {
        ...state,
        phase: "presenting",
        pool: action.recipes,
        allIds: action.recipes.map((r) => r.id),
        currentRound: action.firstRound,
        roundNumber: 1,
      };

    case "SEARCH_ERROR":
      return { ...state, phase: "error", error: action.message };

    case "SELECT": {
      // Second click on same card → confirm
      if (state.phase === "selected" && state.selectedId === action.recipeId) {
        // Build the completed round
        const currentRound = state.currentRound!;
        const winnerId = action.recipeId;
        const loserIds = currentRound.options
          .map((o) => o.id)
          .filter((id) => id !== winnerId);

        const completedRound: CompletedRound = {
          label: currentRound.label,
          options: currentRound.options,
          winnerId,
          loserIds,
        };

        return {
          ...state,
          phase: "confirming",
          rounds: [...state.rounds, completedRound],
        };
      }
      // First click or switch selection
      return {
        ...state,
        phase: "selected",
        selectedId: action.recipeId,
      };
    }

    case "DESELECT":
      return { ...state, phase: "presenting", selectedId: null };

    case "NEXT_ROUND":
      return {
        ...state,
        phase: "splash",
        currentRound: action.round,
        selectedId: null,
      };

    case "DECLARE_WINNER": {
      const winnerRecipe = state.pool.find((r) => r.id === action.winnerId) ?? null;
      return {
        ...state,
        phase: "winner",
        winner: winnerRecipe,
        selectedId: null,
      };
    }

    case "DECIDE_ERROR":
      return { ...state, phase: "error", error: action.message };

    case "SPLASH_DONE":
      return {
        ...state,
        phase: "presenting",
        roundNumber: state.roundNumber + 1,
        selectedId: null,
      };

    case "RESET":
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useHeadsUp() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight fetch on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Side effect: searching phase → fetch search + first decide call
  useEffect(() => {
    if (state.phase !== "searching") return;

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        // 1. Search for recipes
        const searchRes = await fetch("/api/headsup/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: state.prompt }),
          signal: controller.signal,
        });

        if (!searchRes.ok) {
          const body = await searchRes.json().catch(() => ({}));
          dispatch({ type: "SEARCH_ERROR", message: body.error ?? `Search failed (${searchRes.status})` });
          return;
        }

        const searchData = await searchRes.json();
        if (!searchData.recipes || searchData.recipes.length < 2) {
          dispatch({ type: "SEARCH_ERROR", message: "Not enough recipes found — try a broader search." });
          return;
        }

        const recipes: RecipeRow[] = searchData.recipes;
        const allIds = recipes.map((r) => r.id);

        // 2. Immediately request first round from decide webhook
        const decideRes = await fetch("/api/headsup/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: state.prompt, allIds, rounds: [] }),
          signal: controller.signal,
        });

        if (!decideRes.ok) {
          const body = await decideRes.json().catch(() => ({}));
          dispatch({ type: "SEARCH_ERROR", message: body.error ?? `Could not start game (${decideRes.status})` });
          return;
        }

        const decideData = await decideRes.json();
        if (decideData.done) {
          // Webhook declared a winner immediately (unusual but handle it)
          dispatch({ type: "SEARCH_COMPLETE", recipes, firstRound: { label: "", options: [] } });
          dispatch({ type: "DECLARE_WINNER", winnerId: decideData.winnerId });
          return;
        }

        if (!decideData.round?.label || !decideData.round?.options) {
          dispatch({ type: "SEARCH_ERROR", message: "Invalid response from decision service." });
          return;
        }

        dispatch({ type: "SEARCH_COMPLETE", recipes, firstRound: decideData.round });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        dispatch({ type: "SEARCH_ERROR", message: "Connection failed — check your network." });
      }
    })();

    return () => controller.abort();
  }, [state.phase, state.prompt]);

  // Side effect: confirming phase → fetch decide webhook for next round
  useEffect(() => {
    if (state.phase !== "confirming") return;

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const res = await fetch("/api/headsup/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: state.prompt,
            allIds: state.allIds,
            rounds: state.rounds,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          dispatch({ type: "DECIDE_ERROR", message: body.error ?? `Decision failed (${res.status})` });
          return;
        }

        const data = await res.json();

        if (data.done) {
          if (!data.winnerId) {
            dispatch({ type: "DECIDE_ERROR", message: "No winner returned." });
            return;
          }
          dispatch({ type: "DECLARE_WINNER", winnerId: data.winnerId });
          return;
        }

        if (!data.round?.label || !data.round?.options) {
          dispatch({ type: "DECIDE_ERROR", message: "Invalid round data from decision service." });
          return;
        }

        dispatch({ type: "NEXT_ROUND", round: data.round });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        dispatch({ type: "DECIDE_ERROR", message: "Connection failed — check your network." });
      }
    })();

    return () => controller.abort();
  }, [state.phase, state.prompt, state.allIds, state.rounds]);

  // ── Public API ─────────────────────────────────────────────────────

  const startSearch = useCallback((prompt: string) => {
    dispatch({ type: "START_SEARCH", prompt });
  }, []);

  const select = useCallback((recipeId: string) => {
    dispatch({ type: "SELECT", recipeId });
  }, []);

  const deselect = useCallback(() => {
    dispatch({ type: "DESELECT" });
  }, []);

  const splashDone = useCallback(() => {
    dispatch({ type: "SPLASH_DONE" });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  return { state, startSearch, select, deselect, splashDone, reset };
}
