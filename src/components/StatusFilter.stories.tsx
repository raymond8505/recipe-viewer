import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import StatusFilter from "./StatusFilter";

const counts = { published: 42, draft: 7, archived: 3 };

const meta: Meta<typeof StatusFilter> = {
  component: StatusFilter,
  title: "Components/StatusFilter",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
  args: { counts },
};

export default meta;
type Story = StoryObj<typeof StatusFilter>;

// "All" shows published + draft count (archived excluded per component logic)
export const AllSelected: Story = {
  args: { current: undefined },
};

export const PublishedSelected: Story = {
  args: { current: "published" },
};

export const DraftSelected: Story = {
  args: { current: "draft" },
};

export const ArchivedSelected: Story = {
  args: { current: "archived" },
};
