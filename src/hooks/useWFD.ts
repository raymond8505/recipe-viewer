"use client";

import { useReducer, useEffect, useRef, useCallback } from "react";
import type { RecipeRow } from "@/types/recipe";
import type { WFDState } from "@/types/whats-for-dinner";

export type { WFDState };

// ── Actions ───────────────────────────────────────────────────────────

type WFDAction =
  | { type: "START_SEARCH"; prompt: string }
  | { type: "CONTENDERS_LOADED"; recipes: RecipeRow[] }
  | { type: "PICK"; index: number }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

// ── Initial state ─────────────────────────────────────────────────────

const INITIAL_STATE: WFDState = {
  phase: "prompt",
  prompt: "",
  contenders: [],
  losingIndices: [],
  winnerIndex: null,
  choices: [],
  error: null,
};

// ── Reducer ───────────────────────────────────────────────────────────

function reducer(state: WFDState, action: WFDAction): WFDState {
  switch (action.type) {
    case "START_SEARCH":
      return { ...INITIAL_STATE, phase: "loading", prompt: action.prompt };

    case "CONTENDERS_LOADED": {
      // Initial load — no winner yet, just place the response directly.
      if (state.winnerIndex === null) {
        return {
          ...state,
          phase: "presenting",
          contenders: action.recipes,
          losingIndices: [],
        };
      }

      // After a pick: winner stays at its index, all other slots are filled
      // from the response (winner excluded). The response is unordered, so we
      // consume it left-to-right to fill the non-winner slots.
      const winner = state.choices[state.choices.length - 1];
      const winnerIdx = state.winnerIndex;
      const pool = action.recipes.filter((r) => r.id !== winner.id);
      let poolCursor = 0;

      const newContenders = state.contenders.map((current, i) => {
        if (i === winnerIdx) return winner;
        return pool[poolCursor++] ?? current;
      });

      return {
        ...state,
        phase: "presenting",
        contenders: newContenders,
        winnerIndex: null,
        losingIndices: [],
      };
    }

    case "PICK": {
      const winner = state.contenders[action.index];
      if (!winner) return state;
      const losingIndices = state.contenders
        .map((_, i) => i)
        .filter((i) => i !== action.index);
      return {
        ...state,
        phase: "loading",
        winnerIndex: action.index,
        choices: [...state.choices, winner],
        losingIndices,
      };
    }

    case "ERROR":
      return { ...state, phase: "error", error: action.message };

    case "RESET":
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useWFD() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Side effect: loading phase → call webhook
  useEffect(() => {
    if (state.phase !== "loading") return;

    const controller = new AbortController();
    abortRef.current = controller;

    const flatChoices = state.choices.map(
      ({ metadata: { schema }, ...rest }) => ({ ...rest, schema }),
    );

    (async () => {
      try {
        const res = await fetch("/api/whats-for-dinner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: state.prompt, choices: flatChoices }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          dispatch({
            type: "ERROR",
            message: body.error ?? `Request failed (${res.status})`,
          });
          return;
        }

        const data = await res.json();
        if (!Array.isArray(data.recipes) || data.recipes.length < 2) {
          dispatch({ type: "ERROR", message: "Not enough recipes returned." });
          return;
        }

        dispatch({ type: "CONTENDERS_LOADED", recipes: data.recipes as RecipeRow[] });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        dispatch({ type: "ERROR", message: "Connection failed — check your network." });
      }
    })();

    return () => controller.abort();
    // choices.length changes on every PICK, which re-triggers this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.choices.length]);

  const startSearch = useCallback((prompt: string) => {
    dispatch({ type: "START_SEARCH", prompt });
  }, []);

  const pick = useCallback((index: number) => {
    dispatch({ type: "PICK", index });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  return { state, startSearch, pick, reset };
}
