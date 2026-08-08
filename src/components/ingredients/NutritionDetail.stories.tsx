import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { ingredientFixtures, makeRecipeIngredient } from "@/fixtures";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import type { UsdaSearchFood } from "@/lib/usda";
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

// USDA candidates for the autocomplete's fallback flow (no backend in
// stories; picking one would hit the real import wrapper, so stories only
// demonstrate the list).
async function fixtureUsdaSearch(q: string): Promise<UsdaSearchFood[]> {
  return [
    { fdcId: 2710101, description: `${q.toUpperCase()}, TRADITIONAL`, dataType: "Branded" },
    { fdcId: 173460, description: `Sauce, ${q}, ready-to-serve`, dataType: "SR Legacy" },
  ];
}

const [cumin, flour, oliveOil, salt, onion] = ingredientFixtures;

const meta: Meta<typeof NutritionDetail> = {
  component: NutritionDetail,
  title: "Components/Ingredients/NutritionDetail",
  parameters: { layout: "padded" },
  args: {
    recipeId: "story-recipe",
    search: fixtureSearch,
    usdaSearch: fixtureUsdaSearch,
  },
};

export default meta;
type Story = StoryObj<typeof NutritionDetail>;

/**
 * A fully normalized recipe with interleaved groups ("Spice rub" lines are
 * split around a "Sauce" line in the schema, and regroup for display exactly
 * like the recipe page). Every line converts to grams, so the totals and
 * per-portion rows are fully populated. The long salt line shows the
 * ingredient column wrapping to its full text instead of truncating. The
 * play() opens one line's autocomplete to show the match-editing affordance.
 */
export const Default: Story = {
  args: {
    schemaIngredients: [
      { name: "2 tsp cumin seed", group: "Spice rub" },
      { name: "1 tbsp olive oil", group: "Sauce" },
      { name: "125 g all-purpose flour", group: "Spice rub" },
      "1 tsp Diamond Crystal kosher salt, plus more to season the pot generously",
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
        raw_text:
          "1 tsp Diamond Crystal kosher salt, plus more to season the pot generously",
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

/**
 * Per-line gram estimates — the rescue for lines the density path can't
 * convert. The first line (a volume amount matched to a density-less onion)
 * carries a stored estimate, so it shows the "est." marker, the filled grams
 * field, and contributes to the totals. The second identical line has no
 * estimate yet: it's flagged (no density) and shows the "Estimate" trigger.
 * The convertible flour line shows its derived grams as the field placeholder.
 */
export const EstimatedGrams: Story = {
  args: {
    schemaIngredients: [
      "3 tbsp diced yellow onion",
      "1 cup diced yellow onion",
      "125 g all-purpose flour",
    ],
    recipeYield: "2 servings",
    initialRows: [
      makeRecipeIngredient("story-recipe", 0, {
        raw_text: "3 tbsp diced yellow onion",
        quantity: 3,
        unit: "tbsp",
        name_text: "yellow onion",
        ingredient_id: onion.id,
        match_status: "matched",
        estimated_grams: 30,
        grams_source: "llm",
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
        raw_text: "125 g all-purpose flour",
        quantity: 125,
        unit: "g",
        name_text: "all-purpose flour",
        ingredient_id: flour.id,
        match_status: "matched",
      }),
    ],
    initialIngredients: [onion, flour],
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
 * The three states a line's join can be in, side by side.
 *
 * - **Cumin** was reworded after its last normalization run — the row still
 *   says "1 tsp cumin seed". The line is keyed by a stable id, so the reword
 *   costs it neither its match nor its place in the totals. Text is display
 *   copy; only the curator changes an association.
 * - **Saffron** has no normalized row at all, so it is flagged and excluded.
 * - **Olive oil** is a legacy line with no id: its row can only be found by
 *   position, which makes the text the sole evidence the row belongs to it —
 *   and the recipe has moved past what the row says. Still flagged.
 *
 * The ever-present Normalize button (manual matches survive re-runs) builds
 * the missing rows.
 */
export const StaleNormalization: Story = {
  args: {
    schemaIngredients: [
      { name: "2 tsp cumin seed", id: "line-cumin" },
      { name: "1 pinch saffron", id: "line-saffron" },
      "1 tbsp olive oil, warmed",
    ],
    recipeYield: "2 servings",
    initialRows: [
      makeRecipeIngredient("story-recipe", 0, {
        line_id: "line-cumin",
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
 * The inline line-text editor: the play() clicks a line's pencil and retypes
 * the amount, showing the underline edit field in place of the frozen recipe
 * text. Committing is not demonstrated — it PATCHes the recipe through the
 * real API wrapper (no DI seam), same reason the Default story stops at the
 * USDA list.
 */
export const EditingLineText: Story = {
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Edit 2 tsp cumin seed"));
    const field = canvas.getByLabelText("Edit line 2 tsp cumin seed");
    await userEvent.clear(field);
    await userEvent.type(field, "1 tbsp cumin seed");
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
