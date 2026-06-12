import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import RecipeDetail from "./RecipeDetail";
import { recipeFixtures, makeRecipe } from "@/fixtures";

// Minimal 1×1 transparent PNG. Used to feed a real File into the upload input
// so the preview blob URL renders something the browser can actually decode.
const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

const baseRecipe = recipeFixtures[2]; // Thai Curry Chicken Meatballs — full schema with ingredients/instructions/notes

const meta: Meta<typeof RecipeDetail> = {
  component: RecipeDetail,
  title: "Components/Recipes/RecipeDetail",
  parameters: {
    nextjs: { appDirectory: true },
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="p-6 sm:p-10">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RecipeDetail>;

export const Default: Story = {
  args: { recipe: baseRecipe },
};

export const LoggedIn: Story = {
  args: { recipe: baseRecipe, isLoggedIn: true },
};

export const Draft: Story = {
  args: {
    recipe: { ...baseRecipe, status: "draft" },
    isLoggedIn: true,
  },
};

export const WithImageUploadButton: Story = {
  name: "Image Upload — button visible",
  args: { recipe: baseRecipe, isLoggedIn: true },
};

export const ImageUploadPreview: Story = {
  name: "Image Upload — previewing chosen file",
  args: { recipe: baseRecipe, isLoggedIn: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const file = new File([TINY_PNG_BYTES], "tiny.png", { type: "image/png" });
    const input = canvas.getByLabelText("Choose image file to upload") as HTMLInputElement;
    await userEvent.upload(input, file);
  },
};
