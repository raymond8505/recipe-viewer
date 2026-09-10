import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import {
  ingredientFixtures,
  makeIngredientGroup,
  makeIngredientLines,
  makeMatchedIngredient,
  makeRecipeIngredient,
  matchedLinesScenario,
} from "@/fixtures";
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
 * A fully normalized recipe with two named groups and an ungrouped tail,
 * rendered in the recipe's own group order. Every line converts to grams, so
 * the totals and per-portion rows are fully populated. The long salt line
 * shows the ingredient column wrapping to its full text rather than
 * truncating. Each matched line also carries an external-link icon that opens
 * that catalog row in the ingredient manager (`/ingredients?q=…`, new tab) for
 * editing. The play() opens one line's autocomplete to show the match-editing
 * affordance.
 */
export const Default: Story = {
  args: {
    ingredients: [
      makeIngredientGroup("Spice rub", [
        makeMatchedIngredient("2 tsp cumin seed", cumin),
        makeMatchedIngredient("125 g all-purpose flour", flour),
      ]),
      makeIngredientGroup("Sauce", [makeMatchedIngredient("1 tbsp olive oil", oliveOil)]),
      makeIngredientGroup(undefined, [
        makeMatchedIngredient(
          "1 tsp Diamond Crystal kosher salt, plus more to season the pot generously",
          salt,
          { name_text: "kosher salt", match_status: "manual" },
        ),
      ]),
    ],
    recipeYield: "4 servings",
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
 * The what-if lens: the "Sauce" group has been switched off, so its line is
 * faded and struck through while its numbers stay readable, the group toggle
 * reads unchecked, the recipe total and per-portion rows count only the
 * remaining lines, and an "Enable all" reset appears below the table. This is
 * how a user asks "what are the macros if I skip this component?" — the state
 * is internal to the table and never persists.
 */
export const WithDisabledIngredients: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Include all Sauce ingredients" }),
    );
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
    ingredients: makeIngredientLines([
      makeMatchedIngredient("125 g all-purpose flour", flour),
      makeMatchedIngredient("1 cup diced yellow onion", onion, { name_text: "yellow onion" }),
      makeRecipeIngredient("2 eggs"),
      makeMatchedIngredient("2 cumin pods", cumin),
      makeMatchedIngredient("kosher salt to taste", salt, { name_text: "kosher salt" }),
    ]),
    recipeYield: "2 servings",
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
    ingredients: makeIngredientLines([
      makeMatchedIngredient("3 tbsp diced yellow onion", onion, {
        name_text: "yellow onion",
        estimated_grams: 30,
        grams_source: "llm",
      }),
      makeMatchedIngredient("1 cup diced yellow onion", onion, { name_text: "yellow onion" }),
      makeMatchedIngredient("125 g all-purpose flour", flour),
    ]),
    recipeYield: "2 servings",
  },
};

/**
 * The un-weighable line, zeroed. "kosher salt to taste" carries no amount and
 * no honest estimate exists for it, so it would sit flagged and hold the whole
 * recipe off its ingredient-derived total (coverage is all-or-nothing). A typed
 * 0 settles it: the line reads "not counted" rather than "est." — it's a
 * decision about the line, not a guess at its weight — its nutrition cells show
 * an explicit 0 instead of dashes, and the "Totals exclude N flagged lines"
 * footer is gone entirely, which is the whole point.
 *
 * Compare `WithExclusions`, where the same salt line is the quantity-less
 * exclusion this story resolves.
 */
export const NotCounted: Story = {
  args: {
    ingredients: makeIngredientLines([
      makeMatchedIngredient("125 g all-purpose flour", flour),
      makeMatchedIngredient("1 tbsp olive oil", oliveOil),
      makeMatchedIngredient("kosher salt to taste", salt, {
        name_text: "kosher salt",
        estimated_grams: 0,
        grams_source: "manual",
      }),
    ]),
    recipeYield: "2 servings",
  },
};

/** A recipe with no ingredient groups renders flat, without heading rows. */
export const Flat: Story = {
  args: matchedLinesScenario,
};

/**
 * A recipe the matcher has not seen yet: every line is a row (a line IS its
 * row from the moment it is saved) but none carries a catalog match, so each
 * is flagged unmatched and the totals are empty. The ever-present Normalize
 * button (manual matches survive re-runs) is what fills the associations in.
 */
export const NeverNormalized: Story = {
  args: {
    ingredients: makeIngredientLines([
      "2 tsp cumin seed",
      "1 pinch saffron",
      "1 tbsp olive oil, warmed",
    ]),
    recipeYield: "2 servings",
  },
};

/**
 * Normalize awaiting confirmation. The run costs model parsing plus a USDA
 * lookup per line and the route returns before any of it happens, so there is
 * nothing to undo — the confirm is the only guard.
 */
export const NormalizeConfirm: Story = {
  args: matchedLinesScenario,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Normalize" }));
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
  args: matchedLinesScenario,
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
    ingredients: makeIngredientLines([makeMatchedIngredient("125 g all-purpose flour", flour)]),
    recipeYield: undefined,
  },
};
