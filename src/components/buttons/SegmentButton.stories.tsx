import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { SegmentButton } from "./SegmentButton";

const meta: Meta<typeof SegmentButton> = {
  component: SegmentButton,
  title: "Components/Buttons/SegmentButton",
  parameters: { layout: "centered" },
  args: { children: "Newest", onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof SegmentButton>;

export const Active: Story = { args: { active: true } };

export const Inactive: Story = { args: { active: false } };

// A segmented control row, the way SortBar/StatusFilter use it.
export const Group: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-1">
      <SegmentButton {...args} active>
        Newest
      </SegmentButton>
      <SegmentButton {...args} active={false}>
        Oldest
      </SegmentButton>
      <SegmentButton {...args} active={false}>
        Name A–Z
      </SegmentButton>
      <SegmentButton {...args} active={false}>
        Name Z–A
      </SegmentButton>
    </div>
  ),
};
