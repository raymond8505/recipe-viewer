import type { Meta, StoryObj } from "@storybook/react";
import Pagination from "./Pagination";

const meta: Meta<typeof Pagination> = {
  component: Pagination,
  title: "Components/Recipes/Pagination",
  parameters: {
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof Pagination>;

export const FirstPage: Story = {
  args: { page: 1, total: 100, pageSize: 12 },
};

export const MiddlePage: Story = {
  args: { page: 4, total: 100, pageSize: 12 },
};

export const LastPage: Story = {
  args: { page: 9, total: 100, pageSize: 12 },
};
