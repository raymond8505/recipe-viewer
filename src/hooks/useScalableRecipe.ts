import { useCallback, useEffect, useState } from "react";
import { ScalableRecipe, type IngredientRef } from "@/lib/ScalableRecipe";
import type { SchemaRecipe } from "@/types/recipe";

export interface UseScalableRecipe {
  recipe: ScalableRecipe;
  scalePortionsTo: (n: number) => void;
  splitPortions: (n: number) => void;
  anchorIngredientAmount: (ref: IngredientRef, amount: number) => void;
  reset: () => void;
}

/**
 * React binding for ScalableRecipe. Owns one instance per schema reference and
 * exposes the three scaling operations as stable callbacks. When the caller
 * passes a different schema (e.g. CookingMode swaps recipes mid-session) the
 * instance is rebuilt at default state — current scale/split is discarded
 * because the new schema may have a different recipeYield, which would make
 * the carried-over numbers meaningless.
 */
export function useScalableRecipe(schema: SchemaRecipe): UseScalableRecipe {
  const [recipe, setRecipe] = useState(() => new ScalableRecipe(schema));

  useEffect(() => {
    setRecipe((prev) => (prev.schema === schema ? prev : new ScalableRecipe(schema)));
  }, [schema]);

  const scalePortionsTo = useCallback(
    (n: number) => setRecipe((r) => r.scalePortionsTo(n)),
    [],
  );
  const splitPortions = useCallback(
    (n: number) => setRecipe((r) => r.splitPortions(n)),
    [],
  );
  const anchorIngredientAmount = useCallback(
    (ref: IngredientRef, amount: number) =>
      setRecipe((r) => r.anchorIngredientAmount(ref, amount)),
    [],
  );
  const reset = useCallback(() => setRecipe((r) => r.reset()), []);

  return { recipe, scalePortionsTo, splitPortions, anchorIngredientAmount, reset };
}
