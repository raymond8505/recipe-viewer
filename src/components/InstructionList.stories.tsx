import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import InstructionList from "./InstructionList";
import { recipeFixtures } from "@/fixtures";

const meta: Meta<typeof InstructionList> = {
  component: InstructionList,
  title: "Components/Recipes/InstructionList",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "editor" } },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    // A real production recipe with two instruction groups — numbering restarts in the second.
    groups: recipeFixtures[2].instructions,
    headingClassName: "text-xs",
    stepBadgeClassName: "w-7 h-7 text-sm",
  },
};

export default meta;
type Story = StoryObj<typeof InstructionList>;

export const Default: Story = {};

// Completable steps, the whole first group done.
export const WithProgress: Story = {
  args: { onToggleStep: fn(), isStepDone: (gi) => gi === 0 },
};

// The larger touch-first heading, badge and text cooking mode passes.
export const LargeTouchSizing: Story = {
  args: {
    onToggleStep: fn(),
    isStepDone: (gi) => gi === 0,
    headingClassName: "text-sm sm:text-xs",
    stepBadgeClassName: "w-8 h-8 sm:w-7 sm:h-7 text-base sm:text-sm",
    stepTextClassName: "text-xl sm:text-base",
  },
  globals: { viewport: { value: "column" } },
};
