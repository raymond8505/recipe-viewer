import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ImagePlaceholder } from "./ImagePlaceholder";

const meta: Meta<typeof ImagePlaceholder> = {
  component: ImagePlaceholder,
  title: "Components/Recipes/ImagePlaceholder",
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ImagePlaceholder>;

export const Default: Story = {};
