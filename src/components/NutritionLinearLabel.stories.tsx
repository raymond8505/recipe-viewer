import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { schemaNutritionToValues } from "@/lib/nutritionMath";
import NutritionLinearLabel from "./NutritionLinearLabel";

// Purely prop-driven (no internal state), so every story is args-only — the
// summary/label toggle that reaches this component lives in NutritionPanel's
// stories.
//
// Args are built through schemaNutritionToValues so the stories consume the
// same wire strings a recipe stores, parsed by the same boundary the panel uses.

const fullValues = schemaNutritionToValues({
  calories: "520 kcal",
  proteinContent: "32 g",
  carbohydrateContent: "48 g",
  fatContent: "18 g",
  fiberContent: "6 g",
  sodiumContent: "820 mg",
  sugarContent: "10 g",
  saturatedFatContent: "5 g",
  unsaturatedFatContent: "8 g",
  cholesterolContent: "50 mg",
});

const meta: Meta<typeof NutritionLinearLabel> = {
  component: NutritionLinearLabel,
  title: "Components/Recipes/NutritionLinearLabel",
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
type Story = StoryObj<typeof NutritionLinearLabel>;

/**
 * A recipe tracking every Schema.org nutrient. The run reads as one continuous
 * line of bold nutrient names and values — the FDA's "linear display", the
 * format small packages use when there's no room for the full panel.
 */
export const Default: Story = {
  args: { values: fullValues, servingLabel: "per serving" },
};

/**
 * Only calories and protein are known. Absent nutrients render an em dash
 * rather than a fake zero (absent ≠ 0) — showing the empty slots is the point,
 * since the summary grid simply omits what's missing.
 */
export const SparseNutrition: Story = {
  args: {
    values: schemaNutritionToValues({
      calories: "350 kcal",
      proteinContent: "22 g",
    }),
    servingLabel: "per serving",
  },
};

/**
 * A structured yield carries a per-serving weight, so the basis line names it.
 * The serving line is always `ScalableRecipe.nutritionUnitLabel` — never the
 * schema's `servingSize`, which isn't scaled and would lie after a portion split.
 */
export const WithServingWeight: Story = {
  args: { values: fullValues, servingLabel: "per 114 g serving" },
};

/**
 * The narrow case, at roughly a phone's content width. Wrapping is the whole
 * responsive strategy: each name+value pair is unbreakable, and the run reflows
 * between pairs.
 */
export const Narrow: Story = {
  args: { values: fullValues, servingLabel: "per serving" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
