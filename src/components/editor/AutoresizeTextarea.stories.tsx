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
