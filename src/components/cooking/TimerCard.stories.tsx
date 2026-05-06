import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, fn } from "storybook/test";
import TimerCard from "./TimerCard";
import type { Timer } from "@/hooks/useTimers";

const makeTimer = (overrides: Partial<Timer> = {}): Timer => ({
  id: "timer-1",
  label: "Pasta",
  duration: 600,
  remaining: 300,
  paused: false,
  finished: false,
  ...overrides,
});

const meta: Meta<typeof TimerCard> = {
  component: TimerCard,
  title: "Components/Cooking/TimerCard",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
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
  args: { timer: makeTimer({ paused: false }) },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByLabelText("Pause"));
    await expect(args.onTogglePause).toHaveBeenCalledWith("timer-1");
  },
};

export const Paused: Story = {
  args: { timer: makeTimer({ paused: true }) },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByLabelText("Resume"));
    await expect(args.onTogglePause).toHaveBeenCalledWith("timer-1");
  },
};

// remaining=0, finished=false → alarm state (animated border, "Done!")
export const Alarm: Story = {
  args: { timer: makeTimer({ remaining: 0, finished: false }) },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByLabelText(/Pasta timer done/i));
    await expect(args.onDismiss).toHaveBeenCalledWith("timer-1");
  },
};

// remaining=0, finished=true → dimmed "finished" state
export const Finished: Story = {
  args: { timer: makeTimer({ remaining: 0, finished: true }) },
};

// Clicking trash opens an in-card confirmation overlay
export const ConfirmDelete: Story = {
  args: { timer: makeTimer() },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("Delete timer"));
    await expect(canvas.getByText(/Delete "Pasta"\?/)).toBeInTheDocument();
  },
};

export const WithRecipeName: Story = {
  args: {
    timer: makeTimer(),
    recipeName: "Pasta Carbonara",
  },
};

export const LongLabel: Story = {
  args: {
    timer: makeTimer({ label: "Slow-roasted cherry tomatoes with garlic and basil" }),
  },
};
