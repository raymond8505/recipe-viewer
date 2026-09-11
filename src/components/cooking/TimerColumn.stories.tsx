import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import TimerColumn from "./TimerColumn";
import { makeTimer } from "@/fixtures";

const meta: Meta<typeof TimerColumn> = {
  component: TimerColumn,
  title: "Components/Cooking Mode/TimerColumn",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Vertical timer sidebar shown in landscape/desktop (`lg:flex`). For the portrait/mobile horizontal ribbon, see **DraggableRibbon** stories.",
      },
    },
  },
  globals: { viewport: { value: "column" } },
  decorators: [
    // The column is `h-full`, which needs a parent with a *definite* height —
    // the story root has none. `h-screen` resolves against the canvas instead,
    // so the column fills it and its timer list scrolls rather than growing.
    (Story) => (
      <div className="h-screen overflow-hidden">
        <Story />
      </div>
    ),
  ],
  args: {
    onAddTimer: fn(),
    onEditTimer: fn(),
    onTogglePauseTimer: fn(),
    onResetTimer: fn(),
    onRemoveTimer: fn(),
    onDismissTimer: fn(),
    onResetAll: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof TimerColumn>;

// No timers → "No timers yet" message; Reset All hidden
export const Empty: Story = {
  args: { timers: [] },
};

export const WithTimers: Story = {
  args: {
    timers: [
      makeTimer("t1", "Pasta"),
      makeTimer("t2", "Sauce", { remaining: 180, paused: true }),
    ],
  },
};

/**
 * Logged in, the header gains a Notes button right of Reset All; it opens
 * CookingNotesModal over the whole cooking view.
 */
export const LoggedIn: Story = {
  args: {
    timers: [makeTimer("t1", "Pasta")],
    onOpenNotes: fn(),
  },
};

/**
 * Notes doesn't depend on timers: with none, Reset All is hidden and Notes
 * sits directly beside Add Timer.
 */
export const LoggedInNoTimers: Story = {
  args: {
    timers: [],
    onOpenNotes: fn(),
  },
};
