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

export const WithNotes: Story = {
  args: {
    timers: [makeTimer("t1", "Pasta")],
    onNotesChange: fn(),
    cookingNotes: "Added extra garlic this time.",
    notesSaveState: "saved",
  },
};

export const NotesSaving: Story = {
  args: {
    timers: [],
    onNotesChange: fn(),
    cookingNotes: "Reducing the sauce…",
    notesSaveState: "saving",
  },
};
