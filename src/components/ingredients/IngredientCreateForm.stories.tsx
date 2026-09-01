import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import IngredientCreateForm from "./IngredientCreateForm";

const meta: Meta<typeof IngredientCreateForm> = {
  component: IngredientCreateForm,
  title: "Components/Ingredients/IngredientCreateForm",
  parameters: { layout: "padded" },
  args: { onCreated: () => {}, onCancel: () => {} },
};

export default meta;
type Story = StoryObj<typeof IngredientCreateForm>;

/**
 * The manual "new ingredient" panel. Nutrition is entered against a chosen
 * portion (the seed 100 g portion is an identity scale) and converted to the
 * stored per-100g basis on submit; aliases are typed comma-separated and split
 * into the array the catalog stores. Every ingredient starts with a default
 * 100 g portion in the Portions list.
 */
export const Default: Story = {};

/**
 * A partly-filled form: a second, non-100 g portion has been added and selected
 * as the nutrition basis, showing how a user enters values per serving. The
 * inputs hold internal state, so typing genuinely changes what's shown.
 */
export const NutritionPerServing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("New ingredient name"),
      "peanut butter",
    );
    await userEvent.type(
      canvas.getByLabelText("New ingredient aliases"),
      "smooth peanut butter",
    );
    await userEvent.type(
      canvas.getByLabelText("New ingredient portion 1 label"),
      "2 tbsp",
    );
    await userEvent.clear(canvas.getByLabelText("New ingredient portion 1 grams"));
    await userEvent.type(
      canvas.getByLabelText("New ingredient portion 1 grams"),
      "32",
    );
    await userEvent.type(
      canvas.getByLabelText("Calories (kcal) for new ingredient"),
      "190",
    );
  },
};
