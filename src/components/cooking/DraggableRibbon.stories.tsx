import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import DraggableRibbon from "./DraggableRibbon";
import TimerCard from "./TimerCard";
import { makeTimer } from "@/fixtures";

const timerProps = {
  onTogglePause: fn(),
  onReset: fn(),
  onRemove: fn(),
  onEdit: fn(),
  onDismiss: fn(),
};

const meta: Meta<typeof DraggableRibbon> = {
  component: DraggableRibbon,
  title: "Components/Cooking Mode/DraggableRibbon",
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof DraggableRibbon>;

export const Default: Story = {
  render: () => (
    <DraggableRibbon className="bg-gray-900 p-2">
      {[
        makeTimer("t1", "Pasta"),
        makeTimer("t2", "Sauce", { remaining: 180, paused: true }),
        makeTimer("t3", "Garlic Bread", { remaining: 60 }),
      ].map((timer) => (
        <div key={timer.id} className="snap-start shrink-0 w-64 mr-2">
          <TimerCard timer={timer} {...timerProps} />
        </div>
      ))}
    </DraggableRibbon>
  ),
};

export const SingleTimer: Story = {
  render: () => (
    <DraggableRibbon className="bg-gray-900 p-2">
      <div className="snap-start shrink-0 w-64">
        <TimerCard timer={makeTimer("t1", "Pasta")} {...timerProps} />
      </div>
    </DraggableRibbon>
  ),
};
