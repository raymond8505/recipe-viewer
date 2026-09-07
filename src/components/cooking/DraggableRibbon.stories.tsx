import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import DraggableRibbon, { RibbonItem } from "./DraggableRibbon";
import TimerCard from "./TimerCard";
import { makeTimer } from "@/fixtures";

const timerProps: Omit<ComponentProps<typeof TimerCard>, "timer"> = {
  onTogglePause: fn(),
  onReset: fn(),
  onRemove: fn(),
  onEdit: fn(),
  onDismiss: fn(),
};

const meta: Meta<typeof DraggableRibbon> = {
  component: DraggableRibbon,
  title: "Components/Cooking Mode/DraggableRibbon",
  parameters: { layout: "fullscreen" },
  // `parameters.viewport.defaultViewport` was the v7/v8 spelling and is a
  // silent no-op in Storybook 10 — this ribbon has been rendering at full
  // browser width, not phone width, since the upgrade.
  globals: { viewport: { value: "phone" } },
};

export default meta;
type Story = StoryObj<typeof DraggableRibbon>;

/**
 * The ribbon as CookingMode renders it on a phone (`px-3 … gap-2`). Cards hold
 * the `RibbonItem` floor until their content needs more: the hour-format timer
 * widens to fit its time, and the long-label timer stops at the cap and
 * truncates.
 */
export const Default: Story = {
  render: () => (
    <DraggableRibbon className="bg-gray-900 px-3 py-2 gap-2">
      {[
        makeTimer("t1", "Pasta"),
        makeTimer("t2", "Sauce", { remaining: 180, paused: true }),
        makeTimer("t3", "Garlic Bread", { remaining: 60 }),
        makeTimer("t4", "Braise", { duration: 7200, remaining: 5400 }),
        makeTimer("t5", "Simmer the tomato sauce until it is thick"),
      ].map((timer) => (
        <RibbonItem key={timer.id}>
          <TimerCard timer={timer} {...timerProps} />
        </RibbonItem>
      ))}
    </DraggableRibbon>
  ),
};

export const SingleTimer: Story = {
  render: () => (
    <DraggableRibbon className="bg-gray-900 px-3 py-2 gap-2">
      <RibbonItem>
        <TimerCard timer={makeTimer("t1", "Pasta")} {...timerProps} />
      </RibbonItem>
    </DraggableRibbon>
  ),
};
