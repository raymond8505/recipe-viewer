import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";
import NutritionPanel from "./NutritionPanel";

const fullNutrition = {
  calories: "520 kcal",
  proteinContent: "32 g",
  carbohydrateContent: "48 g",
  fatContent: "18 g",
  fiberContent: "6 g",
  sodiumContent: "820 mg",
};

const meta: Meta<typeof NutritionPanel> = {
  component: NutritionPanel,
  title: "Components/Recipes/NutritionPanel",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NutritionPanel>;

export const FullData: Story = {
  args: { nutrition: fullNutrition, totalServings: 4 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("520 kcal")).toBeInTheDocument();
    await userEvent.click(canvas.getByLabelText("More portions"));
    // portions goes from 4 → 5; multiplier = 4/5 = 0.8; 520 * 0.8 = 416
    await expect(canvas.getByText("416 kcal")).toBeInTheDocument();
  },
};

export const PartialData: Story = {
  args: {
    nutrition: { calories: "350 kcal", proteinContent: "22 g" },
    totalServings: 2,
  },
};
