import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import InstructionStep from "./InstructionStep";
import { makeStep } from "@/fixtures";

const meta: Meta<typeof InstructionStep> = {
  component: InstructionStep,
  title: "Components/Recipes/InstructionStep",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "editor" } },
  decorators: [
    (Story) => (
      <ol className="p-4">
        <Story />
      </ol>
    ),
  ],
  args: {
    step: makeStep("Simmer the sauce until it thickens and coats the back of a spoon, about 10 minutes."),
    number: 1,
    badgeClassName: "w-7 h-7 text-sm",
  },
};

export default meta;
type Story = StoryObj<typeof InstructionStep>;

// No completion → a plain, read-only step.
export const Default: Story = {};

// Tappable to mark done.
export const Completable: Story = {
  args: { completion: { done: false, onToggle: fn() } },
};

// Marked done: a check replaces the number and the text is struck through.
export const Completed: Story = {
  args: { completion: { done: true, onToggle: fn() } },
};

// The larger touch-first badge and text cooking mode passes.
export const LargeTouchSizing: Story = {
  args: {
    completion: { done: false, onToggle: fn() },
    badgeClassName: "w-8 h-8 sm:w-7 sm:h-7 text-base sm:text-sm",
    textClassName: "text-xl sm:text-base",
  },
  globals: { viewport: { value: "column" } },
};
