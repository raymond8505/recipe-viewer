import { useCallback, useState } from "react";
import type { SchemaRecipe } from "@/types/recipe";

export type OpState = "idle" | "loading" | "success" | "error";

export interface UseUndoableSchemaOp {
  state: OpState;
  /** The pre-operation schema, present only while a result is under review. */
  preSchema: SchemaRecipe | null;
  isReview: boolean;
  /** Run the operation against the current schema. On success, captures the
   *  current schema as the undo buffer and hands the produced schema to
   *  onApply; on failure transitions to "error" and applies nothing. */
  run: (
    current: SchemaRecipe,
    onApply: (next: SchemaRecipe) => void,
  ) => Promise<void>;
  /** Revert to the captured pre-operation schema and clear the buffer. */
  undo: (onRevert: (prev: SchemaRecipe) => void) => void;
  /** Drop the undo buffer and reset to idle without reverting. */
  clear: () => void;
}

/**
 * Generic "run an async schema-producing operation and keep the previous schema
 * so it can be undone during review" machine. Backs both Re-scrape (which
 * replaces the whole schema) and Regen Image (which patches schema.image) in
 * RecipeDetail — the only difference is the `produce` function the caller
 * supplies. The caller orchestrates what "apply" and "revert" mean for the
 * canonical schema, keeping this hook agnostic of the surrounding component.
 */
export function useUndoableSchemaOp(
  produce: (current: SchemaRecipe) => Promise<SchemaRecipe>,
): UseUndoableSchemaOp {
  const [state, setState] = useState<OpState>("idle");
  const [preSchema, setPreSchema] = useState<SchemaRecipe | null>(null);

  const run = useCallback(
    async (current: SchemaRecipe, onApply: (next: SchemaRecipe) => void) => {
      setState("loading");
      try {
        const next = await produce(current);
        setPreSchema(current);
        onApply(next);
        setState("success");
      } catch {
        setState("error");
      }
    },
    [produce],
  );

  const clear = useCallback(() => {
    setPreSchema(null);
    setState("idle");
  }, []);

  const undo = useCallback((onRevert: (prev: SchemaRecipe) => void) => {
    setPreSchema((prev) => {
      if (prev) onRevert(prev);
      return null;
    });
    setState("idle");
  }, []);

  return {
    state,
    preSchema,
    isReview: preSchema !== null,
    run,
    undo,
    clear,
  };
}
