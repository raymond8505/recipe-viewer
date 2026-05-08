"use client";

import { useReducer, useEffect, useRef, useCallback } from "react";
import type { WFDState } from "@/types/whats-for-dinner";
import { reducer, INITIAL_STATE } from "./wfdReducer";
import { fetchWFDContenders } from "@/lib/wfd";

export type { WFDState };

export function useWFD() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (state.phase !== "loading") return;

    const controller = new AbortController();
    abortRef.current = controller;

    const flatChoices = state.choices.map(
      ({ metadata: { schema }, ...rest }) => ({ ...rest, schema }),
    );

    (async () => {
      try {
        const result = await fetchWFDContenders(state.prompt, flatChoices, controller.signal);
        if (result.error) {
          dispatch({ type: "ERROR", message: result.error });
          return;
        }
        dispatch({ type: "CONTENDERS_LOADED", recipes: result.recipes });
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
