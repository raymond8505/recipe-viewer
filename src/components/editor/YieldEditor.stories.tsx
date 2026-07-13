import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import YieldEditor from "./YieldEditor";
import type { EditableYield } from "@/types/editor";

/** Controlled wrapper so typing across the four fields is visible in the story. */
function Demo({ initial }: { initial: EditableYield }) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ maxWidth: 420 }}>
      <YieldEditor value={value} onChange={setValue} />
      <p className="mt-4 text-xs text-gray-500">stored: {JSON.stringify(value)}</p>
    </div>
  );
}

const meta: Meta<typeof YieldEditor> = {
  component: YieldEditor,
  title: "Components/Recipes/Editor/YieldEditor",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof YieldEditor>;

export const Empty: Story = {
  render: () => (
    <Demo initial={{ servings: "", unit: "", weight: "", weightUnit: "" }} />
  ),
};

export const ServingsAndUnit: Story = {
  render: () => (
    <Demo
      initial={{ servings: "4", unit: "kebabs", weight: "", weightUnit: "" }}
    />
  ),
};

/** Full QuantitativeValue: count + unit and the optional raw-weight reference
 *  that drives the nutrition panel's "per 114 g serving" label. */
export const WithYieldWeight: Story = {
  render: () => (
    <Demo
      initial={{ servings: "4", unit: "kebabs", weight: "454", weightUnit: "g" }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <YieldEditor
        value={{ servings: "4", unit: "kebabs", weight: "454", weightUnit: "g" }}
        onChange={() => {}}
        disabled
      />
    </div>
  ),
};
