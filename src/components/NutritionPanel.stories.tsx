import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, fn } from "storybook/test";
import NutritionPanel from "./NutritionPanel";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import {
  fullCatalogTotal,
  makeNutritionRecipe,
  quantitativeValueYield,
  sparseCatalogTotal,
} from "@/fixtures";

/** Stateful wrapper so the ± stepper visibly updates inside the story. */
function StatefulNutritionPanel({
  initial,
  onSplitPortions,
  ingredientsHref,
}: {
  initial: ScalableRecipe;
  onSplitPortions?: (n: number) => void;
  ingredientsHref?: string;
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
    />
  );
}

const meta: Meta<typeof StatefulNutritionPanel> = {
  component: StatefulNutritionPanel,
  title: "Components/Recipes/NutritionPanel",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "panel" } },
  args: { onSplitPortions: fn() },
};

export default meta;
type Story = StoryObj<typeof StatefulNutritionPanel>;

// Every recipe below comes from a fully-covered catalog total, because that is
// the panel's only nutrition source — a recipe's own stored Schema.org fields
// render nothing. Totals are whole-recipe over four servings, so
// fullCatalogTotal's 2080 kcal shows as 520 kcal per serving.

export const FullData: Story = {
  args: { initial: makeNutritionRecipe(fullCatalogTotal) },
  play: async ({ canvas }) => {
    // Demonstrates the per-serving → per-portion transition.
    await userEvent.click(canvas.getByLabelText("Smaller portion size"));
  },
};

export const PartialData: Story = {
  args: {
    initial: makeNutritionRecipe(sparseCatalogTotal, {
      schema: { recipeYield: "2 servings" },
    }),
  },
};

/**
 * The "Full label" view at the default panel width. The label's layout switch
 * is a container query, so at this size it renders the vertical FDA panel — the
 * same fallback cooking mode gets. Where the grid shows a curated six and omits
 * what's missing, the label shows every nutrient the catalog tracks, so sugars,
 * saturated fat and cholesterol appear here and nowhere else. (Unsaturated fat
 * is absent everywhere: the catalog has no column for it.)
 *
 * `view` is internal panel state, so the click genuinely changes what's shown.
 */
export const FullLabelView: Story = {
  args: { initial: makeNutritionRecipe(fullCatalogTotal) },
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
  args: { initial: makeNutritionRecipe(fullCatalogTotal) },
  globals: { viewport: { value: "page" } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Full label" }));
  },
};

/**
 * The label on a recipe whose ingredients report almost nothing: it collapses
 * to the few nutrients present rather than listing empty rows, so the "Full
 * label" view degrades to something shorter than the summary grid rather than a
 * skeleton.
 */
export const FullLabelSparse: Story = {
  args: { initial: makeNutritionRecipe(sparseCatalogTotal) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Full label" }));
  },
};

/**
 * A structured (QuantitativeValue) yield with a valueReference weight: the
 * label reads the real per-serving basis — "per 114 g serving" (454 g / 4).
 */
export const WithYieldWeight: Story = {
  args: {
    initial: makeNutritionRecipe(fullCatalogTotal, {
      schema: { recipeYield: quantitativeValueYield },
    }),
  },
};

/**
 * Logged-in view: the heading row gains the "Ingredient breakdown" link to
 * the NutritionDetail screen, beside the portion stepper.
 */
export const WithBreakdownLink: Story = {
  args: {
    initial: makeNutritionRecipe(fullCatalogTotal),
    ingredientsHref: "/recipes/story-recipe/ingredients",
  },
};

/**
 * A recipe whose ingredient list isn't fully matched, plus a breakdown link.
 * The panel renders a minimal shell rather than vanishing (which is what the
 * anonymous view does), and the link is the way out — the unmatched lines get
 * fixed there.
 *
 * This recipe DOES carry hand-entered Schema.org nutrition fields, and the
 * shell is the point: those are stored but never read back, so partial coverage
 * shows nothing rather than falling back to them.
 */
export const NoNutritionShell: Story = {
  args: {
    initial: makeNutritionRecipe(
      { calories_kcal: 2080 },
      {
        fullyCovered: false,
        schema: { nutrition: { calories: "520 kcal", proteinContent: "32 g" } },
      },
    ),
    ingredientsHref: "/recipes/story-recipe/ingredients",
  },
};
