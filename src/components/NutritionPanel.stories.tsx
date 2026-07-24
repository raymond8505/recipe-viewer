import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, fn } from "storybook/test";
import NutritionPanel from "./NutritionPanel";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import {
  makeScalableRecipe,
  makeSchemaRecipe,
  quantitativeValueYield,
} from "@/fixtures";
import type { SchemaRecipe } from "@/types/recipe";

type Nutrition = NonNullable<SchemaRecipe["nutrition"]>;

const fullNutrition: Nutrition = {
  calories: "520 kcal",
  proteinContent: "32 g",
  carbohydrateContent: "48 g",
  fatContent: "18 g",
  fiberContent: "6 g",
  sodiumContent: "820 mg",
};

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
      nutrition: fullNutrition,
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
      nutrition: { calories: "350 kcal", proteinContent: "22 g" },
    }),
  },
};

/**
 * A fully-covered normalized recipe: values are computed from the ingredient
 * list, so each carries an "ingredients" badge. Sodium isn't reported by the
 * ingredients here, so it falls back to the recipe's own field and shows a
 * "recipe" badge — the per-field fallback in action. (Totals are whole-recipe
 * for 4 servings, e.g. 2080 kcal → 520 kcal per serving.) Badges are gated to
 * logged-in users via `showSources`.
 */
export const FromNormalizedIngredients: Story = {
  args: {
    showSources: true,
    initial: new ScalableRecipe(
      makeSchemaRecipe({
        recipeIngredient: undefined,
        recipeYield: "4 servings",
        nutrition: { sodiumContent: "820 mg" },
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
        },
      },
    ),
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
      nutrition: fullNutrition,
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
      nutrition: fullNutrition,
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
