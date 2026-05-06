import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import TimerColumn from "./TimerColumn";
import { makeTimer } from "@/fixtures";

const meta: Meta<typeof TimerColumn> = {
  component: TimerColumn,
  title: "Components/Cooking Mode/TimerColumn",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 340, height: 600, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
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
