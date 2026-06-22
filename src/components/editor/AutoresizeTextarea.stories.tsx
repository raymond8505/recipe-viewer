import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import AutoresizeTextarea from "./AutoresizeTextarea";

/** Controlled wrapper so the height recompute fires as you type. */
function Demo({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ maxWidth: 480 }}>
      <AutoresizeTextarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Step instructions"
        placeholder="Describe this step…"
        className="block w-full min-h-[44px] rounded-lg border border-gray-200 p-2 text-sm text-gray-700 leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-orange-300 resize-none overflow-hidden"
      />
    </div>
  );
}

const meta: Meta<typeof AutoresizeTextarea> = {
  component: AutoresizeTextarea,
  title: "Components/Recipes/Editor/AutoresizeTextarea",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof AutoresizeTextarea>;

export const Empty: Story = { render: () => <Demo initial="" /> };

export const FitsExistingContent: Story = {
  render: () => (
    <Demo initial="Simmer the tomatoes over low heat, stirring occasionally, until the sauce has reduced and thickened noticeably — about 25 minutes. Season to taste and stir in the torn basil just before serving." />
  ),
};
