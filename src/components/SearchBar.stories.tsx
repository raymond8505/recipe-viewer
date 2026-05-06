import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent } from "storybook/test";
import SearchBar from "./SearchBar";

const meta: Meta<typeof SearchBar> = {
  component: SearchBar,
  title: "Components/Recipes/SearchBar",
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

export const Empty: Story = {};

export const WithQuery: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByRole("searchbox");
    await userEvent.type(input, "tomatillo enchiladas");
  },
};
