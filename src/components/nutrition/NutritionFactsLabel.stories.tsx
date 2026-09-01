import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ingredientFixtures } from "@/fixtures";
import { scaleNutritionToGrams, schemaNutritionToValues } from "@/lib/nutritionMath";
import NutritionFactsLabel from "./NutritionFactsLabel";
import { ingredientNutritionRows, recipeNutritionRows } from "./labelRows";

// Purely prop-driven (no internal state), so every story is args-only — the
// portion-picking interaction lives in NutritionFactsPreview's stories and the
// summary/label toggle in NutritionPanel's.
//
// The two data sources reach the same component through the adapters in
// labelRows.ts: `ingredientNutritionRows` for the catalog editor's per-100g
// numbers, `recipeNutritionRows` for a recipe's resolved nutrition.

const cumin = ingredientFixtures[0];
const kosherSalt = ingredientFixtures[3];

const recipeValues = schemaNutritionToValues({
  calories: "520 kcal",
  proteinContent: "32 g",
  carbohydrateContent: "48 g",
  fatContent: "18 g",
  fiberContent: "6 g",
  sodiumContent: "820 mg",
  sugarContent: "10 g",
  saturatedFatContent: "5 g",
  unsaturatedFatContent: "8 g",
  cholesterolContent: "50 mg",
});

const meta: Meta<typeof NutritionFactsLabel> = {
  component: NutritionFactsLabel,
  title: "Components/Nutrition/NutritionFactsLabel",
  parameters: { layout: "centered" },
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
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
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
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

/**
 * A manual catalog row tracking only calories and sodium: every absent nutrient
 * renders an em dash, not a fake zero (absent ≠ 0).
 */
export const CatalogSparse: Story = {
  args: {
    data: ingredientNutritionRows(kosherSalt.nutrition!),
    servingLabel: "100 g",
    servingCaption: "Serving size",
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

/**
 * The recipe panel's label with room to breathe: the FDA tabular display —
 * identity and Calories on the left, then the nutrient groups as columns under
 * "Amount/serving", with the minerals as a footer run. Column names switch to
 * the FDA abbreviations ("Sat. Fat", "Total Carb.") that the narrow columns
 * need. The minerals are em dashes because they have no Schema.org slot.
 */
export const RecipeTabular: Story = {
  args: {
    data: recipeNutritionRows(recipeValues),
    servingLabel: "per 114 g serving",
    layout: "tabular",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 700 }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * The same tabular label in a container too narrow for columns — roughly a
 * phone, or cooking mode's content column. It falls back to the vertical panel,
 * which is what the FDA itself prescribes when horizontal space runs out. The
 * switch is a CONTAINER query, so it tracks this box's width rather than the
 * browser window: resizing the Storybook viewport will not change it.
 */
export const RecipeNarrowFallback: Story = {
  args: {
    data: recipeNutritionRows(recipeValues),
    servingLabel: "per serving",
    layout: "tabular",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * A recipe that tracks almost nothing. The em-dash run is the point: seeing
 * which slots are empty is information the summary grid can't convey, since it
 * simply omits the missing stats.
 */
export const RecipeSparse: Story = {
  args: {
    data: recipeNutritionRows(
      schemaNutritionToValues({ calories: "350 kcal", proteinContent: "22 g" }),
    ),
    servingLabel: "per serving",
    layout: "tabular",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 700 }}>
        <Story />
      </div>
    ),
  ],
};
