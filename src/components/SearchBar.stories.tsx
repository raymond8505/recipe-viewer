import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SearchBar from "./SearchBar";

const meta: Meta<typeof SearchBar> = {
  component: SearchBar,
  title: "Components/Recipes/SearchBar",
  parameters: {
    nextjs: { appDirectory: true },
    layout: "fullscreen",
  },
  globals: { viewport: { value: "sheet" } },
};

export default meta;
type Story = StoryObj<typeof SearchBar>;

export const Empty: Story = {};

export const WithQuery: Story = {
  parameters: {
    nextjs: { navigation: { searchParams: { q: "tomatillo enchiladas" } } },
  },
};
