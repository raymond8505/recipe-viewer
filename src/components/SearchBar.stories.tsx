import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import SearchBar from "./SearchBar";

const meta: Meta<typeof SearchBar> = {
  component: SearchBar,
  title: "Components/SearchBar",
  parameters: {
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SearchBar>;

export const Empty: Story = {
  parameters: {
    nextjs: { navigation: { searchParams: {} } },
  },
};

export const WithQuery: Story = {
  parameters: {
    nextjs: { navigation: { searchParams: { q: "pasta carbonara" } } },
  },
  play: async ({ canvas }) => {
    const input = canvas.getByRole("searchbox");
    await expect(input).toHaveValue("pasta carbonara");
  },
};
