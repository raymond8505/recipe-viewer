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

/** Missing stats are skipped — the grid simply has fewer cells. */
export const TimesOnly: Story = {
  args: {
    recipeYield: undefined,
  },
};

/** Controlled wrapper so the editable time inputs are live. */
function EditingDemo() {
  const [times, setTimes] = useState({
    prep: "15 min",
    cook: "45 min",
    total: "1 hr",
  });
  return (
    <TimeYieldStats
      prepTime={times.prep}
      cookTime={times.cook}
      totalTime={times.total}
      recipeYield="4 servings"
      editing
      onTimeChange={(field, value) =>
        setTimes((t) => ({ ...t, [field]: value }))
      }
    />
  );
}

/**
 * In edit mode all three time cells become text inputs (blank ones included,
 * so a missing time can be added). The servings cell is unchanged.
 */
export const Editing: Story = {
  render: () => <EditingDemo />,
};
