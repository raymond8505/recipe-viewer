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
 * Edit mode, the shape RecipeDetail actually renders: all four cells become
 * inputs at once. The times are minutes over the persisted values, and the
 * servings cell edits BASE servings (the persisted recipeYield) — unlike the
 * stepper, which only scales the display.
 */
export const Editing: Story = {
  args: {
    servingsEdit: { value: "4", onChange: fn() },
    timesEdit: {
      prep: { value: "15", onChange: fn() },
      cook: { value: "45", onChange: fn() },
      total: { value: "60", onChange: fn() },
    },
  },
};

/**
 * A recipe with nothing recorded still shows the full band while editing — the
 * recipe that has never had a cook time is exactly the one that needs
 * somewhere to type one.
 */
export const EditingEmptyRecipe: Story = {
  args: {
    prepTime: undefined,
    cookTime: undefined,
    totalTime: undefined,
    recipeYield: undefined,
    servingsEdit: { value: "", onChange: fn() },
    timesEdit: {
      prep: { value: "", onChange: fn() },
      cook: { value: "", onChange: fn() },
      total: { value: "", onChange: fn() },
    },
  },
};

/**
 * Saving: every cell is disabled together, so the band can't be edited while
 * the write is in flight.
 */
export const EditingWhileSaving: Story = {
  args: {
    servingsEdit: { value: "4", onChange: fn(), disabled: true },
    timesEdit: {
      prep: { value: "15", onChange: fn(), disabled: true },
      cook: { value: "45", onChange: fn(), disabled: true },
      total: { value: "60", onChange: fn(), disabled: true },
    },
  },
};
