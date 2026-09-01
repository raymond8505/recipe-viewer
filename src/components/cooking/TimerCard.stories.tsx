import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, fn } from "storybook/test";
import TimerCard from "./TimerCard";
import { makeTimer } from "@/fixtures";

const meta: Meta<typeof TimerCard> = {
  component: TimerCard,
  title: "Components/Cooking Mode/TimerCard",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "card" } },
  args: {
    onTogglePause: fn(),
    onReset: fn(),
    onRemove: fn(),
    onDismiss: fn(),
    onEdit: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof TimerCard>;

export const Running: Story = {
  args: { timer: makeTimer("timer-1", "Pasta", { paused: false }) },
};

export const Paused: Story = {
  args: { timer: makeTimer("timer-1", "Pasta", { paused: true }) },
};

// remaining=0, finished=false → alarm state (animated border, "Done!")
export const Alarm: Story = {
  args: { timer: makeTimer("timer-1", "Pasta", { remaining: 0, finished: false }) },
};

// remaining=0, finished=true → dimmed "finished" state
export const Finished: Story = {
  args: { timer: makeTimer("timer-1", "Pasta", { remaining: 0, finished: true }) },
};

// Clicking trash opens an in-card confirmation overlay
export const ConfirmDelete: Story = {
  args: { timer: makeTimer("timer-1", "Pasta") },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("Delete timer"));
  },
};

export const WithRecipeName: Story = {
  args: {
    timer: makeTimer("timer-1", "Pasta"),
    recipeName: "Pasta Carbonara",
  },
};

export const LongLabel: Story = {
  args: {
    timer: makeTimer("timer-1", "Slow-roasted cherry tomatoes with garlic and basil"),
  },
};
