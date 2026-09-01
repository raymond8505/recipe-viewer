import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  fullNutrientValues,
  ingredientFixtures,
  sparseNutrientValues,
} from "@/fixtures";
import { scaleNutritionToGrams } from "@/lib/nutritionMath";
import NutritionFactsLabel from "./NutritionFactsLabel";
import { ingredientNutritionRows, recipeNutritionRows } from "./labelRows";

// Purely prop-driven (no internal state), so every story is args-only — the
// portion-picking interaction lives in NutritionFactsPreview's stories and the
// summary/label toggle in NutritionPanel's.

const cumin = ingredientFixtures[0];
const kosherSalt = ingredientFixtures[3];

const meta: Meta<typeof NutritionFactsLabel> = {
  component: NutritionFactsLabel,
  title: "Components/Nutrition/NutritionFactsLabel",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "control" } },
};

export default meta;
type Story = StoryObj<typeof NutritionFactsLabel>;

/**
 * The catalog editor's label: the stored per-100 g basis straight off a USDA
 * row, in the vertical layout the drawer always uses — the shape a user
 * compares against a package's "per 100 g" column.
 */
export const CatalogVertical: Story = {
  args: {
    data: ingredientNutritionRows(cumin.nutrition!),
    servingLabel: "100 g",
    servingCaption: "Serving size",
  },
};

/**
 * The same row scaled to a household portion (1 tbsp of cumin = 6 g). Small
 * values exercise the ≤1 two-decimal display rounding.
 */
export const CatalogSmallServing: Story = {
  args: {
    data: ingredientNutritionRows(scaleNutritionToGrams(cumin.nutrition!, 6)),
    servingLabel: "tbsp, whole (6 g)",
    servingCaption: "Serving size",
  },
};

/**
 * A manual catalog row tracking only calories and sodium. Untracked nutrients
 * are left off entirely rather than dashed or zeroed, so the label states only
 * what was actually measured — and the whole minerals section drops away.
 */
export const CatalogSparse: Story = {
  args: {
    data: ingredientNutritionRows(kosherSalt.nutrition!),
    servingLabel: "100 g",
    servingCaption: "Serving size",
  },
};

/**
 * The recipe panel's label with room to breathe: the FDA tabular display —
 * serving basis and Calories on the left, then the nutrient groups as columns
 * under "Amount/serving". Column names switch to the FDA abbreviations
 * ("Sat. Fat", "Total Carb.") that the narrow columns need. There is no
 * minerals footer here — the recipe path has no Schema.org slot for them, so
 * they're never emitted.
 */
export const RecipeTabular: Story = {
  args: {
    data: recipeNutritionRows(fullNutrientValues),
    servingLabel: "per 114 g serving",
    layout: "tabular",
  },
  globals: { viewport: { value: "page" } },
};

/**
 * The same tabular label in a container too narrow for columns — roughly a
 * phone, or cooking mode's content column. It falls back to the vertical panel,
 * which is what the FDA itself prescribes when horizontal space runs out.
 *
 * The switch is a CONTAINER query on the label's own box, not a media query.
 * Here the label fills the canvas, so the pinned viewport is what drives it —
 * but in the app one viewport can show a wide recipe page and a ~360px cooking
 * column at the same time, which is why `lg:` would pick the wrong layout for
 * one of them.
 */
export const RecipeNarrowFallback: Story = {
  args: {
    data: recipeNutritionRows(fullNutrientValues),
    servingLabel: "per serving",
    layout: "tabular",
  },
  globals: { viewport: { value: "column" } },
};

/**
 * A recipe that tracks almost nothing, so the label collapses to just what it
 * has: the fats group and the minerals footer disappear along with their rules,
 * leaving a short label rather than a skeleton of empty rows.
 */
export const RecipeSparse: Story = {
  args: {
    data: recipeNutritionRows(sparseNutrientValues),
    servingLabel: "per serving",
    layout: "tabular",
  },
  globals: { viewport: { value: "page" } },
};
