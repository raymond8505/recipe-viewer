import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import DurationInput from "./DurationInput";

/** Controlled wrapper so typing/blur reformatting is exercised. */
function Demo({ m, s }: { m: number; s: number }) {
  const [{ minutes, seconds }, set] = useState({ minutes: m, seconds: s });
  return (
    <div style={{ maxWidth: 220 }}>
      <DurationInput
        minutes={minutes}
        seconds={seconds}
        onChange={set}
        className="w-24 min-h-[40px] rounded-lg border border-gray-200 px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
      />
      <p className="mt-2 text-xs text-gray-500">
        stored: {minutes}m {seconds}s
      </p>
    </div>
  );
}

const meta: Meta<typeof DurationInput> = {
  component: DurationInput,
  title: "Components/Recipes/Editor/DurationInput",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof DurationInput>;

export const Empty: Story = { render: () => <Demo m={0} s={0} /> };
export const SecondsOnly: Story = { render: () => <Demo m={0} s={45} /> };
export const MinutesAndSeconds: Story = { render: () => <Demo m={5} s={30} /> };
