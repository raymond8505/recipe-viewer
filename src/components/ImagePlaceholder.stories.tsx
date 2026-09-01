import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ImagePlaceholder } from "./ImagePlaceholder";

const meta: Meta<typeof ImagePlaceholder> = {
  component: ImagePlaceholder,
  title: "Components/Recipes/ImagePlaceholder",
  parameters: {
    layout: "fullscreen",
  },
  globals: { viewport: { value: "card" } },
};

export default meta;

type Story = StoryObj<typeof ImagePlaceholder>;

export const Default: Story = {};
