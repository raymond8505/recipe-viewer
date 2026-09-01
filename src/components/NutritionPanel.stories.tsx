import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, fn } from "storybook/test";
import NutritionPanel from "./NutritionPanel";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import {
  fullSchemaNutrition,
  makeScalableRecipe,
  makeSchemaRecipe,
  quantitativeValueYield,
  sparseSchemaNutrition,
} from "@/fixtures";

/** Stateful wrapper so the ± stepper visibly updates inside the story. */
function StatefulNutritionPanel({
  initial,
  onSplitPortions,
  ingredientsHref,
  showSources,
}: {
  initial: ScalableRecipe;
  onSplitPortions?: (n: number) => void;
  ingredientsHref?: string;
  showSources?: boolean;
}) {
  const [recipe, setRecipe] = useState(initial);
  return (
    <NutritionPanel
      recipe={recipe}
      onSplitPortions={(n) => {
        onSplitPortions?.(n);
        setRecipe((r) => r.splitPortions(n));
      }}
      ingredientsHref={ingredientsHref}
      showSources={showSources}
    />
  );
}

const meta: Meta<typeof StatefulNutritionPanel> = {
  component: StatefulNutritionPanel,
  title: "Components/Recipes/NutritionPanel",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
  args: { onSplitPortions: fn() },
};

export default meta;
type Story = StoryObj<typeof StatefulNutritionPanel>;

export const FullData: Story = {
  args: {
    initial: makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: fullSchemaNutrition,
    }),
  },
  play: async ({ canvas }) => {
    // Demonstrates the per-serving → per-portion transition.
    await userEvent.click(canvas.getByLabelText("Smaller portion size"));
  },
};

export const PartialData: Story = {
  args: {
    initial: makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "2 servings",
      nutrition: sparseSchemaNutrition,
    }),
  },
};

/**
 * The "Full label" view at the default 480px panel width. The label's layout
 * switch is a container query, so at this size it renders the vertical FDA
 * panel — the same fallback cooking mode gets. Where the grid shows a curated
 * six and omits what's missing, the label shows every Schema.org nutrient, so
 * sugars, saturated/unsaturated fat and cholesterol appear here and nowhere
 * else.
 *
 * `view` is internal panel state, so the click genuinely changes what's shown.
 */
export const FullLabelView: Story = {
  args: {
    initial: makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: fullSchemaNutrition,
    }),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Full label" }));
  },
};

/**
 * The same view in a panel wide enough for the FDA tabular display: identity
 * and Calories on the left, the nutrient groups as columns, minerals along the
 * foot. This is what the recipe page shows on a desktop.
 */
export const FullLabelWide: Story = {
  args: {
    initial: makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: fullSchemaNutrition,
    }),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 760 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Full label" }));
  },
};

/**
 * The label on a recipe that tracks almost nothing: it collapses to the few
 * nutrients present rather than listing empty rows, so the "Full label" view
 * degrades to something shorter than the summary grid rather than a skeleton.
 */
export const FullLabelSparse: Story = {
  args: {
    initial: makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: sparseSchemaNutrition,
    }),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Full label" }));
  },
};

/**
 * A fully-covered normalized recipe: the whole panel serves the view computed
 * from the ingredient list, flagged by a single "ingredients" badge in the
 * header. (Totals are whole-recipe for 4 servings, e.g. 2080 kcal → 520 kcal
 * per serving.) The badge is gated to logged-in users via `showSources`.
 */
export const FromNormalizedIngredients: Story = {
  args: {
    showSources: true,
    initial: new ScalableRecipe(
      makeSchemaRecipe({
        recipeIngredient: undefined,
        recipeYield: "4 servings",
        nutrition: undefined,
      }),
      undefined,
      {
        fullyCovered: true,
        total: {
          calories_kcal: 2080,
          protein_g: 128,
          carbs_g: 192,
          fat_g: 72,
          fiber_g: 24,
          sodium_mg: 3280,
        },
      },
    ),
  },
};

/**
 * A recipe without trusted ingredient coverage serves its own manually set
 * nutrition fields — the header badge reads "recipe" for logged-in users.
 */
export const FromRecipeFields: Story = {
  args: {
    showSources: true,
    initial: makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: fullSchemaNutrition,
    }),
  },
};

/**
 * A structured (QuantitativeValue) yield with a valueReference weight: the
 * label reads the real per-serving basis — "per 114 g serving" (454 g / 4).
 */
export const WithYieldWeight: Story = {
  args: {
    initial: makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: quantitativeValueYield,
      nutrition: fullSchemaNutrition,
    }),
  },
};

/**
 * Logged-in view: the heading row gains the "Ingredient breakdown" link to
 * the NutritionDetail screen, beside the portion stepper.
 */
export const WithBreakdownLink: Story = {
  args: {
    initial: makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: fullSchemaNutrition,
    }),
    ingredientsHref: "/recipes/story-recipe/ingredients",
  },
};

/**
 * No schema nutrition but a breakdown link: instead of vanishing (the
 * anonymous behavior), the panel renders a minimal shell so the
 * NutritionDetail screen stays reachable.
 */
export const NoNutritionShell: Story = {
  args: {
    initial: makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: undefined,
    }),
    ingredientsHref: "/recipes/story-recipe/ingredients",
  },
};
