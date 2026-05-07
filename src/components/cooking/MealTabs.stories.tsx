import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, fn } from "storybook/test";
import MealTabs from "./MealTabs";
import { makeRecipe } from "@/fixtures";

const recipes = [
  makeRecipe("r1", "Pasta Carbonara"),
  makeRecipe("r2", "Chicken Tikka"),
  makeRecipe("r3", "Beef Tacos"),
];

const meta: Meta<typeof MealTabs> = {
  component: MealTabs,
  title: "Components/Cooking Mode/MealTabs",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 600 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onSelect: fn(),
    onRemove: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof MealTabs>;

export const SingleTab: Story = {
  parameters: {
    docs: { description: { story: "First tab is always the primary — no close button." } },
  },
  args: { recipes: [recipes[0]], activeIndex: 0 },
};

export const MultipleTabs: Story = {
  args: { recipes, activeIndex: 1 },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Pasta Carbonara" }));
    await userEvent.click(canvas.getByLabelText("Remove Beef Tacos from meal"));
  },
};

export const LongNames: Story = {
  args: {
    recipes: [
      makeRecipe("r1", "Pasta Carbonara"),
      makeRecipe("r2", "Slow-roasted cherry tomatoes with garlic and basil"),
      makeRecipe("r3", "Braised short ribs"),
    ],
    activeIndex: 0,
  },
};
