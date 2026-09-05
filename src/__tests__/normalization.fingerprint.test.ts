// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ingredientFingerprint,
  recipeFingerprint,
} from "@/lib/normalization/fingerprint";
import { composeRecipeSchema } from "@/lib/recipeSchema";
import { makeRecipe } from "@/fixtures";
import type { RecipeRow, SchemaRecipe } from "@/types/recipe";

const CURRENT_LINES = ["2 cups flour", "1 tsp salt"];
const FROZEN_LINES = ["2 cups flour", "1 tsp salt", "1 egg"];

// A backfilled row as it actually sits in the database: the lines live on the
// recipe_ingredients rows, and metadata.schema still carries the pre-0016
// copy of recipeIngredient that nothing has stripped. The two differ for any
// recipe edited since the migration.
function makeBackfilledRecipe(): RecipeRow {
  const recipe = makeRecipe("r-1", "Backfilled", {
    schema: { recipeIngredient: CURRENT_LINES },
  });
  const frozen = {
    ...recipe.metadata.schema,
    recipeIngredient: FROZEN_LINES,
  } as SchemaRecipe;
  return { ...recipe, metadata: { schema: frozen } };
}

describe("recipeFingerprint", () => {
  it("hashes the lines the recipe currently has, not the frozen metadata copy", () => {
    const recipe = makeBackfilledRecipe();

    expect(recipeFingerprint(recipe)).toBe(
      ingredientFingerprint({ recipeIngredient: CURRENT_LINES }),
    );
    expect(recipeFingerprint(recipe)).not.toBe(
      ingredientFingerprint(recipe.metadata.schema),
    );
  });

  it("is what a completed normalization run stores", () => {
    // runNormalization writes ingredientFingerprint(composeRecipeSchema(recipe))
    // as normalized_fingerprint; a stale-check that computes anything else
    // never agrees with it.
    const recipe = makeBackfilledRecipe();
    expect(recipeFingerprint(recipe)).toBe(
      ingredientFingerprint(composeRecipeSchema(recipe)),
    );
  });

  it("ignores group membership and every non-ingredient field", () => {
    const plain = makeRecipe("r-2", "Plain", {
      schema: { recipeIngredient: CURRENT_LINES },
    });
    const grouped = makeRecipe("r-3", "Grouped", {
      schema: {
        description: "different",
        recipeIngredient: CURRENT_LINES.map((name) => ({ name, group: "Dough" })),
      },
    });
    expect(recipeFingerprint(grouped)).toBe(recipeFingerprint(plain));
  });
});
