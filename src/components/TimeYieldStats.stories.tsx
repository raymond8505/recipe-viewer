import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import TimeYieldStats from "./TimeYieldStats";

const meta: Meta<typeof TimeYieldStats> = {
  component: TimeYieldStats,
  title: "Components/Recipes/TimeYieldStats",
  parameters: {
    layout: "fullscreen",
  },
  args: {
    prepTime: "15 min",
    cookTime: "45 min",
    totalTime: "1 hr",
    recipeYield: "4 servings",
  },
};

export default meta;

type Story = StoryObj<typeof TimeYieldStats>;

/** The full band: three times plus a static servings stat from recipeYield. */
export const Default: Story = {};

/**
 * When the recipe is scalable (currentServings set), the servings cell becomes
 * a +/− stepper instead of a static value.
 */
export const WithServingsControl: Story = {
  args: {
    currentServings: 4,
    onServingsChange: fn(),
  },
};

/** Missing stats are skipped — the grid simply has fewer cells. */
export const TimesOnly: Story = {
  args: {
    recipeYield: undefined,
  },
};
