import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import InstructionGroup from "./InstructionGroup";
import { makeInstructionGroup, makeStep, makeSteps } from "@/fixtures";

const meta: Meta<typeof InstructionGroup> = {
  component: InstructionGroup,
  title: "Components/Recipes/InstructionGroup",
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
    group: makeInstructionGroup("Sauce", [
      "Sweat the onion in the olive oil until soft and translucent, about 5 minutes.",
      makeStep("Add the tomatoes and simmer until the sauce thickens.", {
        name: "Simmer",
        seconds: 600,
      }),
      "Season to taste with salt and pepper.",
    ]),
    headingClassName: "text-xs",
    stepBadgeClassName: "w-7 h-7 text-sm",
  },
};

export default meta;
type Story = StoryObj<typeof InstructionGroup>;

export const Named: Story = {};

// A nameless run renders no heading.
export const Nameless: Story = {
  args: {
    group: makeSteps(["Bring a large pot of salted water to the boil.", "Cook the pasta until al dente."])[0],
  },
};

// Completable steps, the first already done.
export const WithProgress: Story = {
  args: { onToggleStep: fn(), isStepDone: (si) => si === 0 },
};

// The larger touch-first heading, badge and text cooking mode passes.
export const LargeTouchSizing: Story = {
  args: {
    onToggleStep: fn(),
    isStepDone: (si) => si === 0,
    headingClassName: "text-sm sm:text-xs",
    stepBadgeClassName: "w-8 h-8 sm:w-7 sm:h-7 text-base sm:text-sm",
    stepTextClassName: "text-xl sm:text-base",
  },
  globals: { viewport: { value: "column" } },
};
