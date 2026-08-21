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

/**
 * An object-form (QuantitativeValue) yield: the scalable stepper is labeled
 * with the yield's own unit ("kebabs") instead of the generic "Servings".
 */
export const QuantitativeValueYield: Story = {
  args: {
    recipeYield: { "@type": "QuantitativeValue", value: 4, unitText: "kebabs" },
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

/**
 * Edit mode: the servings cell is a numeric input that edits the recipe's
 * BASE servings (the persisted recipeYield) — unlike the stepper, which only
 * scales the display.
 */
export const Editing: Story = {
  args: {
    servingsEdit: { value: "4", onChange: fn() },
  },
};

/**
 * A recipe with no yield (and no times) still shows the band while editing,
 * so servings can be added where none existed.
 */
export const EditingNoYield: Story = {
  args: {
    prepTime: undefined,
    cookTime: undefined,
    totalTime: undefined,
    recipeYield: undefined,
    servingsEdit: { value: "", onChange: fn() },
  },
};
