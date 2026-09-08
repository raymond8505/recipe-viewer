import { useCallback, useState } from "react";

export type OpState = "idle" | "loading" | "success" | "error";

export interface UseUndoableOp<T> {
  state: OpState;
  /** The pre-operation value, present only while a result is under review. */
  previous: T | null;
  isReview: boolean;
  /** Run the operation against the current value. On success, captures the
   *  current value as the undo buffer and hands the produced value to
   *  onApply; on failure transitions to "error" and applies nothing. */
  run: (current: T, onApply: (next: T) => void) => Promise<void>;
  /** Revert to the captured pre-operation value and clear the buffer. */
  undo: (onRevert: (prev: T) => void) => void;
  /** Drop the undo buffer and reset to idle without reverting. */
  clear: () => void;
}

/**
 * Generic "run an async operation that produces a new value and keep the
 * previous one so it can be undone during review" machine. Backs both
 * Re-scrape (which replaces the whole recipe document — schema AND
 * ingredients, which is why the value is generic rather than a schema) and
 * Regen Image (which patches schema.image) in RecipeDetail — the only
 * difference is the `produce` function the caller supplies. The caller
 * orchestrates what "apply" and "revert" mean for its canonical state,
 * keeping this hook agnostic of the surrounding component.
 */
export function useUndoableOp<T>(
  produce: (current: T) => Promise<T>,
): UseUndoableOp<T> {
  const [state, setState] = useState<OpState>("idle");
  const [previous, setPrevious] = useState<T | null>(null);

  const run = useCallback(
    async (current: T, onApply: (next: T) => void) => {
      setState("loading");
      try {
        const next = await produce(current);
        setPrevious(current);
        onApply(next);
        setState("success");
      } catch {
        setState("error");
      }
    },
    [produce],
  );

  const clear = useCallback(() => {
    setPrevious(null);
    setState("idle");
  }, []);

  const undo = useCallback((onRevert: (prev: T) => void) => {
    setPrevious((prev) => {
      if (prev) onRevert(prev);
      return null;
    });
    setState("idle");
  }, []);

  return {
    state,
    previous,
    isReview: previous !== null,
    run,
    undo,
    clear,
  };
}
