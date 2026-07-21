import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { ingredientFixtures, makeRecipeIngredient } from "@/fixtures";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import NutritionDetail from "./NutritionDetail";

// In-memory stand-in for the trigram search route (DI seam on the component)
// so the autocomplete works in stories without a backend.
async function fixtureSearch(q: string): Promise<IngredientKeywordMatch[]> {
  const query = q.toLowerCase();
  return ingredientFixtures
    .filter(
      (ing) =>
        ing.name.toLowerCase().includes(query) ||
        ing.aliases.some((a) => a.toLowerCase().includes(query)),
    )
    .map((ing) => ({
      id: ing.id,
      name: ing.name,
      aliases: ing.aliases,
      nutrition: ing.nutrition,
      density_g_per_ml: ing.density_g_per_ml,
      similarity: ing.name.toLowerCase().startsWith(query) ? 0.95 : 0.6,
    }));
}

const [cumin, flour, oliveOil, salt, onion] = ingredientFixtures;

const meta: Meta<typeof NutritionDetail> = {
  component: NutritionDetail,
  title: "Components/Ingredients/NutritionDetail",
  parameters: { layout: "padded" },
  args: {
    recipeId: "story-recipe",
    search: fixtureSearch,
  },
};

export default meta;
type Story = StoryObj<typeof NutritionDetail>;

/**
 * A fully normalized recipe with interleaved groups ("Spice rub" lines are
 * split around a "Sauce" line in the schema, and regroup for display exactly
 * like the recipe page). Every line converts to grams, so the totals and
 * per-portion rows are fully populated. The play() opens one line's
 * autocomplete to show the match-editing affordance.
 */
export const Default: Story = {
  args: {
    schemaIngredients: [
      { name: "2 tsp cumin seed", group: "Spice rub" },
      { name: "1 tbsp olive oil", group: "Sauce" },
      { name: "125 g all-purpose flour", group: "Spice rub" },
      "1 tsp kosher salt",
    ],
    recipeYield: "4 servings",
    initialRows: [
      makeRecipeIngredient("story-recipe", 0, {
        raw_text: "2 tsp cumin seed",
        quantity: 2,
        unit: "tsp",
        name_text: "cumin seed",
        ingredient_id: cumin.id,
        match_status: "matched",
      }),
      makeRecipeIngredient("story-recipe", 1, {
        raw_text: "1 tbsp olive oil",
        quantity: 1,
        unit: "tbsp",
        name_text: "olive oil",
        ingredient_id: oliveOil.id,
        match_status: "matched",
      }),
      makeRecipeIngredient("story-recipe", 2, {
        raw_text: "125 g all-purpose flour",
        quantity: 125,
        unit: "g",
        name_text: "all-purpose flour",
        ingredient_id: flour.id,
        match_status: "matched",
      }),
      makeRecipeIngredient("story-recipe", 3, {
        raw_text: "1 tsp kosher salt",
        quantity: 1,
        unit: "tsp",
        name_text: "kosher salt",
        ingredient_id: salt.id,
        match_status: "manual",
      }),
    ],
    initialIngredients: [cumin, flour, oliveOil, salt],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByLabelText("Change match for 2 tsp cumin seed"),
    );
    await userEvent.type(canvas.getByRole("combobox"), "cumin");
  },
};

/**
 * Every exclusion flavor at once: an unmatched line, a count line with no
 * unit, a volume line whose ingredient has no density (yellow onion), and a
 * quantity-less "to taste" line — each flagged with its reason, dashed out,
 * and left out of the totals. One convertible line keeps the totals non-empty.
 */
export const WithExclusions: Story = {
  args: {
    schemaIngredients: [
      "125 g all-purpose flour",
      "1 cup diced yellow onion",
      "2 eggs",
      "2 cumin pods",
      "kosher salt to taste",
    ],
    recipeYield: "2 servings",
    initialRows: [
      makeRecipeIngredient("story-recipe", 0, {
        raw_text: "125 g all-purpose flour",
        quantity: 125,
        unit: "g",
        name_text: "all-purpose flour",
        ingredient_id: flour.id,
        match_status: "matched",
      }),
      makeRecipeIngredient("story-recipe", 1, {
        raw_text: "1 cup diced yellow onion",
        quantity: 1,
        unit: "cup",
        name_text: "yellow onion",
        ingredient_id: onion.id,
        match_status: "matched",
      }),
      makeRecipeIngredient("story-recipe", 2, {
        raw_text: "2 eggs",
        quantity: 2,
        unit: null,
        name_text: "eggs",
        ingredient_id: null,
        match_status: "unmatched",
      }),
      makeRecipeIngredient("story-recipe", 3, {
        raw_text: "2 cumin pods",
        quantity: 2,
        unit: null,
        name_text: "cumin pods",
        ingredient_id: cumin.id,
        match_status: "matched",
      }),
      makeRecipeIngredient("story-recipe", 4, {
        raw_text: "kosher salt to taste",
        quantity: null,
        unit: null,
        name_text: "kosher salt",
        ingredient_id: salt.id,
        match_status: "matched",
      }),
    ],
    initialIngredients: [flour, onion, cumin, salt],
  },
};

/** A recipe with no ingredient groups renders flat, without heading rows. */
export const Flat: Story = {
  args: {
    schemaIngredients: ["2 tsp cumin seed", "1 tbsp olive oil"],
    recipeYield: "2 servings",
    initialRows: [
      makeRecipeIngredient("story-recipe", 0, {
        raw_text: "2 tsp cumin seed",
        quantity: 2,
        unit: "tsp",
        name_text: "cumin seed",
        ingredient_id: cumin.id,
        match_status: "matched",
      }),
      makeRecipeIngredient("story-recipe", 1, {
        raw_text: "1 tbsp olive oil",
        quantity: 1,
        unit: "tbsp",
        name_text: "olive oil",
        ingredient_id: oliveOil.id,
        match_status: "matched",
      }),
    ],
    initialIngredients: [cumin, oliveOil],
  },
};

/**
 * The recipe text was edited after the last normalization run: the first
 * line's stored row no longer matches ("2 tsp" vs "1 tsp") and the second
 * has no row at all. Both are flagged stale and a banner offers a re-run —
 * with the warning that re-running discards manual matches.
 */
export const StaleNormalization: Story = {
  args: {
    schemaIngredients: ["2 tsp cumin seed", "1 pinch saffron", "1 tbsp olive oil"],
    recipeYield: "2 servings",
    initialRows: [
      makeRecipeIngredient("story-recipe", 0, {
        raw_text: "1 tsp cumin seed",
        quantity: 1,
        unit: "tsp",
        name_text: "cumin seed",
        ingredient_id: cumin.id,
        match_status: "matched",
      }),
      makeRecipeIngredient("story-recipe", 2, {
        raw_text: "1 tbsp olive oil",
        quantity: 1,
        unit: "tbsp",
        name_text: "olive oil",
        ingredient_id: oliveOil.id,
        match_status: "matched",
      }),
    ],
    initialIngredients: [cumin, oliveOil],
  },
};

/**
 * recipeYield has no parseable number, so the per-portion row renders dashes
 * with a title explaining why; the recipe-total row still works.
 */
export const NoServings: Story = {
  args: {
    schemaIngredients: ["125 g all-purpose flour"],
    recipeYield: undefined,
    initialRows: [
      makeRecipeIngredient("story-recipe", 0, {
        raw_text: "125 g all-purpose flour",
        quantity: 125,
        unit: "g",
        name_text: "all-purpose flour",
        ingredient_id: flour.id,
        match_status: "matched",
      }),
    ],
    initialIngredients: [flour],
  },
};
