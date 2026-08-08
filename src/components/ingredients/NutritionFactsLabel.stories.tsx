import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ingredientFixtures } from "@/fixtures";
import { scaleNutritionToGrams } from "@/lib/nutritionMath";
import NutritionFactsLabel from "./NutritionFactsLabel";

// Purely prop-driven (no internal state), so every story is args-only — the
// portion-picking interaction lives in NutritionFactsPreview's stories.

const cumin = ingredientFixtures[0];
const kosherSalt = ingredientFixtures[3];

const meta: Meta<typeof NutritionFactsLabel> = {
  component: NutritionFactsLabel,
  title: "Components/Ingredients/NutritionFactsLabel",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NutritionFactsLabel>;

/**
 * The stored per-100 g basis, straight off a USDA row — the label the user
 * compares against a package's "per 100 g" column.
 */
export const Default: Story = {
  args: {
    nutrition: cumin.nutrition!,
    servingLabel: "100 g",
  },
};

/**
 * The same row scaled to a household portion (1 tbsp of cumin = 6 g). Small
 * values exercise the ≤1 two-decimal display rounding.
 */
export const SmallServing: Story = {
  args: {
    nutrition: scaleNutritionToGrams(cumin.nutrition!, 6),
    servingLabel: "tbsp, whole (6 g)",
  },
};

/**
 * A manual row that only tracks calories and sodium: every absent nutrient
 * renders an em dash, not a fake zero (absent ≠ 0).
 */
export const SparseNutrition: Story = {
  args: {
    nutrition: kosherSalt.nutrition!,
    servingLabel: "100 g",
  },
};
