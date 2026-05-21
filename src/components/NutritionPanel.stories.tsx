import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, fn } from "storybook/test";
import NutritionPanel from "./NutritionPanel";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
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

function makeRecipe(nutrition: Nutrition, servings: number) {
  const schema: SchemaRecipe = { name: "story", recipeYield: `${servings} servings`, nutrition };
  return new ScalableRecipe(schema);
}

/** Stateful wrapper so the ± stepper visibly updates inside the story. */
function StatefulNutritionPanel({
  initial,
  onSplitPortions,
}: {
  initial: ScalableRecipe;
  onSplitPortions?: (n: number) => void;
}) {
  const [recipe, setRecipe] = useState(initial);
  return (
    <NutritionPanel
      recipe={recipe}
      onSplitPortions={(n) => {
        onSplitPortions?.(n);
        setRecipe((r) => r.splitPortions(n));
      }}
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
  args: { initial: makeRecipe(fullNutrition, 4) },
  play: async ({ canvas }) => {
    // Demonstrates the per-serving → per-portion transition.
    await userEvent.click(canvas.getByLabelText("More portions"));
  },
};

export const PartialData: Story = {
  args: { initial: makeRecipe({ calories: "350 kcal", proteinContent: "22 g" }, 2) },
};
