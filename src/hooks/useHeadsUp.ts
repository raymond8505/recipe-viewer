"use client";

import { useReducer, useEffect, useRef, useCallback } from "react";
import type { RecipeRow } from "@/types/recipe";
import type { Matchup } from "@/types/headsup";
import {
  buildFirstRound,
  buildNextRound,
  totalRoundsFor,
} from "@/lib/bracket";

export type { Matchup };

// ── Phases ────────────────────────────────────────────────────────────

export type HeadsUpPhase =
  | "prompt"
  | "searching"
  | "few_results"
  | "presenting"
  | "confirming"
  | "splash"
  | "winner"
  | "error";

// ── State ─────────────────────────────────────────────────────────────

export interface HeadsUpState {
  phase: HeadsUpPhase;
  prompt: string;
  pool: RecipeRow[];

  // Bracket
  matchups: Matchup[];
  currentMatchupIndex: number;
  roundNumber: number;
  totalRounds: number;
  /** Winners from the current round so far, in bracket position order.
   *  Bye winners are pre-filled; matchup slots start null and fill as
   *  the user picks. */
  bracketWinners: (string | null)[];
  /** Index into bracketWinners for the next matchup slot to fill. */
  nextWinnerSlot: number;

  // UI
  selectedId: string | null;
  winner: RecipeRow | null;
  error: string | null;
}

// ── Actions ───────────────────────────────────────────────────────────

type HeadsUpAction =
  | { type: "START_SEARCH"; prompt: string }
  | { type: "SEARCH_COMPLETE"; recipes: RecipeRow[] }
  | { type: "SEARCH_ERROR"; message: string }
  | { type: "SELECT"; recipeId: string }
  | { type: "CONFIRM_DONE" }
  | { type: "SPLASH_DONE" }
  | { type: "RESET" };

// ── Initial state ─────────────────────────────────────────────────────

const INITIAL_STATE: HeadsUpState = {
  phase: "prompt",
  prompt: "",
  pool: [],
  matchups: [],
  currentMatchupIndex: 0,
  roundNumber: 0,
  totalRounds: 0,
  bracketWinners: [],
  nextWinnerSlot: 0,
  selectedId: null,
  winner: null,
  error: null,
};

// ── Helpers ───────────────────────────────────────────────────────────

/** Find the index of the next null slot in bracketWinners at or after `from`. */
function findNextNullSlot(winners: (string | null)[], from: number): number {
  for (let i = from; i < winners.length; i++) {
    if (winners[i] === null) return i;
  }
  return -1;
}

/** Collect all non-null winners from a bracketWinners array. */
function collectWinners(bw: (string | null)[]): string[] {
  return bw.filter((id): id is string => id !== null);
}

// ── Reducer ───────────────────────────────────────────────────────────

function reducer(state: HeadsUpState, action: HeadsUpAction): HeadsUpState {
  switch (action.type) {
    case "START_SEARCH":
      return {
        ...INITIAL_STATE,
        phase: "searching",
        prompt: action.prompt,
      };

    case "SEARCH_COMPLETE": {
      const recipes = action.recipes;

      // < 4 results: skip bracket, show all for direct pick
      if (recipes.length < 4) {
        return {
          ...INITIAL_STATE,
          phase: "few_results",
          prompt: state.prompt,
          pool: recipes,
        };
      }

      // Build bracket round 1
      const ids = recipes.map((r) => r.id);
      const { matchups, bracketWinners } = buildFirstRound(ids);
      const rounds = totalRoundsFor(recipes.length);

      // If round 1 has no real matchups (all byes, only possible with
      // exactly a power-of-2 count where N <= bracketSize/2 — shouldn't
      // happen with N >= 4 but guard anyway), jump straight to round 2.
      if (matchups.length === 0) {
        const round2Winners = collectWinners(bracketWinners);
        const round2Matchups = buildNextRound(round2Winners);
        return {
          ...INITIAL_STATE,
          phase: "presenting",
          prompt: state.prompt,
          pool: recipes,
          matchups: round2Matchups,
          currentMatchupIndex: 0,
          roundNumber: 2,
          totalRounds: rounds,
          bracketWinners: new Array(round2Matchups.length).fill(null),
          nextWinnerSlot: 0,
        };
      }

      return {
        ...INITIAL_STATE,
        phase: "presenting",
        prompt: state.prompt,
        pool: recipes,
        matchups,
        currentMatchupIndex: 0,
        roundNumber: 1,
        totalRounds: rounds,
        bracketWinners,
        nextWinnerSlot: findNextNullSlot(bracketWinners, 0),
      };
    }

    case "SEARCH_ERROR":
      return { ...state, phase: "error", error: action.message };

    case "SELECT": {
      if (state.phase === "few_results") {
        // Direct pick from grid — immediate winner
        const winnerRecipe =
          state.pool.find((r) => r.id === action.recipeId) ?? null;
        return { ...state, phase: "winner", winner: winnerRecipe };
      }

      // Bracket pick
      const winnerId = action.recipeId;

      // Fill the winner into bracketWinners at the current null slot
      const newBracketWinners = [...state.bracketWinners];
      newBracketWinners[state.nextWinnerSlot] = winnerId;

      return {
        ...state,
        phase: "confirming",
        selectedId: winnerId,
        bracketWinners: newBracketWinners,
      };
    }

    case "CONFIRM_DONE": {
      const bw = state.bracketWinners;
      const matchupIdx = state.currentMatchupIndex;
      const isLastMatchup = matchupIdx >= state.matchups.length - 1;

      if (!isLastMatchup) {
        // More matchups this round — advance
        const nextSlot = findNextNullSlot(bw, state.nextWinnerSlot + 1);
        return {
          ...state,
          phase: "presenting",
          currentMatchupIndex: matchupIdx + 1,
          selectedId: null,
          nextWinnerSlot: nextSlot,
        };
      }

      // Round complete — collect winners
      const roundWinners = collectWinners(bw);

      if (roundWinners.length === 1) {
        // Tournament over
        const winnerRecipe =
          state.pool.find((r) => r.id === roundWinners[0]) ?? null;
        return {
          ...state,
          phase: "winner",
          winner: winnerRecipe,
          selectedId: null,
        };
      }

      // Build next round
      const nextMatchups = buildNextRound(roundWinners);

      if (nextMatchups.length === 1) {
        // Final round — go straight to presenting (no splash for the final)
        return {
          ...state,
          phase: "splash",
          matchups: nextMatchups,
          currentMatchupIndex: 0,
          roundNumber: state.roundNumber + 1,
          bracketWinners: new Array(nextMatchups.length).fill(null),
          nextWinnerSlot: 0,
          selectedId: null,
        };
      }

      // Multi-matchup next round — splash transition
      return {
        ...state,
        phase: "splash",
        matchups: nextMatchups,
        currentMatchupIndex: 0,
        roundNumber: state.roundNumber + 1,
        bracketWinners: new Array(nextMatchups.length).fill(null),
        nextWinnerSlot: 0,
        selectedId: null,
      };
    }

    case "SPLASH_DONE":
      return { ...state, phase: "presenting", selectedId: null };

    case "RESET":
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useHeadsUp() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight fetch on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Side effect: searching phase → fetch search results
  useEffect(() => {
    if (state.phase !== "searching") return;

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const searchRes = await fetch("/api/headsup/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: state.prompt }),
          signal: controller.signal,
        });

        if (!searchRes.ok) {
          const body = await searchRes.json().catch(() => ({}));
          dispatch({
            type: "SEARCH_ERROR",
            message: body.error ?? `Search failed (${searchRes.status})`,
          });
          return;
        }

        const searchData = await searchRes.json();
        if (!searchData.recipes || searchData.recipes.length < 2) {
          dispatch({
            type: "SEARCH_ERROR",
            message: "Not enough recipes found — try a broader search.",
          });
          return;
        }

        dispatch({
          type: "SEARCH_COMPLETE",
          recipes: searchData.recipes as RecipeRow[],
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        dispatch({
          type: "SEARCH_ERROR",
          message: "Connection failed — check your network.",
        });
      }
    })();

    return () => controller.abort();
  }, [state.phase, state.prompt]);

  // Side effect: confirming phase → brief delay then advance
  useEffect(() => {
    if (state.phase !== "confirming") return;
    const timer = setTimeout(() => dispatch({ type: "CONFIRM_DONE" }), 500);
    return () => clearTimeout(timer);
  }, [state.phase, state.bracketWinners]);

  // ── Public API ────────────────────────────────────────────────────

  const startSearch = useCallback((prompt: string) => {
    dispatch({ type: "START_SEARCH", prompt });
  }, []);

  const select = useCallback((recipeId: string) => {
    dispatch({ type: "SELECT", recipeId });
  }, []);

  const splashDone = useCallback(() => {
    dispatch({ type: "SPLASH_DONE" });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  return { state, startSearch, select, splashDone, reset };
}
