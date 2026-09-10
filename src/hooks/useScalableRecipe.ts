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
 * React binding for ScalableRecipe. Owns one instance per document (schema +
 * ingredient groups, compared by reference) and exposes the three scaling
 * operations as stable callbacks. When the caller passes a different document
 * (a save, a re-scrape, CookingMode swapping recipes mid-session) the instance
 * is rebuilt at default state — current scale/split is discarded because the
 * new document may have a different recipeYield, which would make the
 * carried-over numbers meaningless.
 *
 * `normalized` (the recipe's normalized ingredient nutrition) is baked into the
 * instance, whose `nutrition()` decides whether to serve it or the schema
 * fields. Callers pass it only for the original, unedited document — see
 * RecipeDetail.
 */
export function useScalableRecipe(
  doc: RecipeDocument,
  normalized?: NormalizedNutrition | null,
): UseScalableRecipe {
  const [recipe, setRecipe] = useState(
    () => new ScalableRecipe(doc.schema, doc.ingredients, undefined, normalized),
  );

  useEffect(() => {
    setRecipe((prev) =>
      prev.schema === doc.schema && prev.ingredientGroups === doc.ingredients
        ? prev
        : new ScalableRecipe(doc.schema, doc.ingredients, undefined, normalized),
    );
    // `normalized` is derived from the document server-side; rebuilding on the
    // document's identity is sufficient (and avoids churn from a fresh object
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
