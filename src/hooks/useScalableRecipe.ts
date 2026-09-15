import { useCallback, useEffect, useState } from "react";
import {
  ScalableRecipe,
  type IngredientRef,
  type NormalizedNutrition,
} from "@/lib/ScalableRecipe";
import type { RecipeDocument } from "@/types/recipe";

export interface UseScalableRecipe {
  recipe: ScalableRecipe;
  scalePortionsTo: (n: number) => void;
  splitPortions: (n: number) => void;
  anchorIngredientAmount: (ref: IngredientRef, amount: number) => void;
  reset: () => void;
}

/**
 * React binding for ScalableRecipe. Owns one instance per document and exposes
 * the three scaling operations as stable callbacks. When the caller passes a
 * different document (a save, a re-scrape, CookingMode swapping recipes
 * mid-session) the instance is rebuilt at default state — current scale/split
 * is discarded because the new document may have a different serving count,
 * which would make the carried-over numbers meaningless.
 *
 * The rebuild is guarded on the DOCUMENT's identity, not field by field. That
 * is load-bearing: a servings-only save produces a new document whose `schema`
 * and `ingredients` are still reference-equal, so only the document's own
 * identity separates it from no change at all. An instance kept across one
 * scales against a `baseServings` that contradicts the document. The caller
 * holds `doc` in state, so its identity changes exactly when its content does.
 *
 * `normalized` (the recipe's normalized ingredient nutrition) is baked into the
 * instance, whose `nutrition()` decides whether to serve it. Callers derive it
 * from `doc.ingredients`, memoized on the groups — see RecipeDetail — so a new
 * value only ever arrives with a new document.
 */
export function useScalableRecipe(
  doc: RecipeDocument,
  normalized?: NormalizedNutrition | null,
): UseScalableRecipe {
  const [recipe, setRecipe] = useState(
    () => new ScalableRecipe(doc, undefined, normalized),
  );

  useEffect(() => {
    setRecipe((prev) =>
      prev.document === doc ? prev : new ScalableRecipe(doc, undefined, normalized),
    );
    // `normalized` is derived from the document's own groups, so rebuilding on
    // the document's identity covers it (and avoids churn from a fresh object
    // each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

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
