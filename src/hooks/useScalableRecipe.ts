import { useCallback, useEffect, useState } from "react";
import {
  ScalableRecipe,
  type IngredientRef,
  type NormalizedNutrition,
} from "@/lib/ScalableRecipe";
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
 *
 * `normalized` (the recipe's normalized ingredient nutrition) is baked into the
 * instance so the panel prefers it over the schema fields. Callers pass it only
 * for the original, unedited schema — see RecipeDetail.
 */
export function useScalableRecipe(
  schema: SchemaRecipe,
  normalized?: NormalizedNutrition | null,
): UseScalableRecipe {
  const [recipe, setRecipe] = useState(() => new ScalableRecipe(schema, undefined, normalized));

  useEffect(() => {
    setRecipe((prev) =>
      prev.schema === schema ? prev : new ScalableRecipe(schema, undefined, normalized),
    );
    // `normalized` is derived from `schema` server-side; rebuilding on schema
    // identity is sufficient (and avoids churn from a fresh object each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
