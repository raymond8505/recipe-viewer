import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import InstructionsEditor from "./InstructionsEditor";
import type { EditableInstructions } from "@/types/editor";

/** Controlled editor — story holds the draft so interactions mutate the view. */
function Demo({
  initial,
  erroredStepIds,
}: {
  initial: EditableInstructions;
  erroredStepIds?: Set<string>;
}) {
  const [groups, setGroups] = useState(initial);
  return (
    <div style={{ maxWidth: 560 }}>
      <InstructionsEditor
        value={groups}
        onChange={setGroups}
        erroredStepIds={erroredStepIds}
      />
    </div>
  );
}

const meta: Meta<typeof InstructionsEditor> = {
  component: InstructionsEditor,
  title: "Components/Recipes/Editor/InstructionsEditor",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof InstructionsEditor>;

export const WithSectionsAndTimer: Story = {
  render: () => (
    <Demo
      initial={[
        {
          id: "g0",
          heading: null,
          items: [
            { id: "s0", text: "Preheat the oven to 200°C.", name: "", hours: 0, minutes: 0 },
          ],
        },
        {
          id: "g1",
          heading: "Sauce",
          items: [
            { id: "s1", text: "Simmer the tomatoes until reduced.", name: "Simmer", hours: 1, minutes: 30 },
            { id: "s2", text: "Stir in the basil.", name: "", hours: 0, minutes: 0 },
          ],
        },
      ]}
    />
  ),
};

/** A step with a label but no time (or vice-versa) is flagged — Save is blocked
 *  until both are set or both cleared. */
export const TimerValidationError: Story = {
  render: () => (
    <Demo
      erroredStepIds={new Set(["s1"])}
      initial={[
        {
          id: "g0",
          heading: null,
          items: [
            { id: "s1", text: "Rest the dough.", name: "Rest", hours: 0, minutes: 0 },
          ],
        },
      ]}
    />
  ),
};

export const Empty: Story = {
  render: () => <Demo initial={[]} />,
};
