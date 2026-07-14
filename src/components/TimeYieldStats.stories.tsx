import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { useState } from "react";
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

/**
 * An object yield carrying a `valueReference` also surfaces a static "Yield
 * weight" stat (the raw weight that drives the nutrition per-serving basis).
 */
export const WithYieldWeight: Story = {
  args: {
    recipeYield: {
      "@type": "QuantitativeValue",
      value: 4,
      unitText: "kebabs",
      valueReference: { "@type": "QuantitativeValue", value: 454, unitText: "g" },
    },
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

/** Controlled wrapper so the editable time + yield inputs are live. */
function EditingDemo() {
  const [times, setTimes] = useState({
    prep: "15 min",
    cook: "45 min",
    total: "1 hr",
  });
  const [yieldFields, setYield] = useState({
    servings: "4 servings",
    weight: "454 g",
  });
  return (
    <TimeYieldStats
      prepTime={times.prep}
      cookTime={times.cook}
      totalTime={times.total}
      editing
      onTimeChange={(field, value) =>
        setTimes((t) => ({ ...t, [field]: value }))
      }
      yieldServings={yieldFields.servings}
      yieldWeight={yieldFields.weight}
      onYieldChange={(field, value) =>
        setYield((y) => ({ ...y, [field]: value }))
      }
    />
  );
}

/**
 * In edit mode every time and yield cell becomes a text input (blank ones
 * included, so a missing time or a string-only yield can be added/upgraded).
 */
export const Editing: Story = {
  render: () => <EditingDemo />,
};
