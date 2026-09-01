import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import IngredientsEditor from "./IngredientsEditor";
import type { EditableIngredients } from "@/types/editor";

/**
 * Controlled editor — the story holds the draft in `useState` so adding,
 * editing, deleting, and dragging actually mutate what you see (a static
 * `value` arg would make every interaction a no-op).
 */
function Demo({ initial }: { initial: EditableIngredients }) {
  const [groups, setGroups] = useState(initial);
  return <IngredientsEditor value={groups} onChange={setGroups} />;
}

const meta: Meta<typeof IngredientsEditor> = {
  component: IngredientsEditor,
  title: "Components/Recipes/Editor/IngredientsEditor",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "panel" } },
};

export default meta;
type Story = StoryObj<typeof IngredientsEditor>;

export const GroupedAndUngrouped: Story = {
  render: () => (
    <Demo
      initial={[
        {
          id: "g0",
          heading: null,
          items: [
            { id: "i0", name: "1 tbsp olive oil" },
            { id: "i1", name: "1 onion, diced" },
          ],
        },
        {
          id: "g1",
          heading: "Spice blend",
          items: [
            { id: "i2", name: "1 tsp cumin" },
            { id: "i3", name: "1 tsp paprika" },
          ],
        },
      ]}
    />
  ),
};

export const Empty: Story = {
  render: () => <Demo initial={[]} />,
};
