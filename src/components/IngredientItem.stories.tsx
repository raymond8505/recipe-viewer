import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, fn } from "storybook/test";
import IngredientItem from "./IngredientItem";
import { ScalableRecipe, type ScaledIngredient } from "@/lib/ScalableRecipe";
import type { SchemaRecipe } from "@/types/recipe";

/** Build a ScaledIngredient from a single ingredient string for story args. */
function scaled(text: string, ingredientScale = 1): ScaledIngredient {
  const schema: SchemaRecipe = {
    name: "story",
    recipeYield: "1 serving",
    recipeIngredient: [text],
  };
  return new ScalableRecipe(schema, { ingredientScale }).ingredients[0];
}

const meta: Meta<typeof IngredientItem> = {
  component: IngredientItem,
  title: "Components/Recipes/IngredientItem",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <ul className="list-disc pl-6 text-gray-800 text-base">
        <li>
          <Story />
        </li>
      </ul>
    ),
  ],
  args: { onAnchor: fn() },
};

export default meta;
type Story = StoryObj<typeof IngredientItem>;

// Amount is a clickable button; unit select is visible (cups ↔ ml, etc.)
export const Default: Story = {
  args: { ingredient: scaled("2 cups flour") },
};

// No onAnchor → amount renders as plain <span>, no edit button
export const ReadOnly: Story = {
  args: { ingredient: scaled("2 cups flour"), onAnchor: undefined },
};

// Recipe scaled 2x — 2 cups × 2 = 4 cups displayed
export const Scaled: Story = {
  args: { ingredient: scaled("2 cups flour", 2) },
};

// Ingredient without a parseable unit (no unit select rendered)
export const NoUnit: Story = {
  args: { ingredient: scaled("3 cloves garlic") },
};

// Ingredient that cannot be parsed at all → renders as plain text
export const Unparseable: Story = {
  args: { ingredient: scaled("a handful of fresh herbs") },
};

// Range source — display renders both ends with a hyphen
export const RangeAmount: Story = {
  args: { ingredient: scaled("3-5 cloves garlic") },
};

// Range source scaled 2x — both ends double
export const RangeScaled: Story = {
  args: { ingredient: scaled("3-5 cloves garlic", 2) },
};

// Unicode fraction round-trips through formatAmount
export const UnicodeFraction: Story = {
  args: { ingredient: scaled("1/2 cup milk") },
};

export const EditingAmount: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Clicking the amount reveals a text input. Accepts integers, decimals, fractions (3/4), unicode fractions (½), and mixed (1½). Range input is rejected; single numbers anchor the whole recipe.",
      },
    },
  },
  args: { ingredient: scaled("2 cups flour") },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /edit amount/i }));
  },
};
