import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import InstructionsEditor from "@/components/editor/InstructionsEditor";
import type { EditableInstructions } from "@/types/editor";

function Harness({
  initial,
  erroredStepIds,
}: {
  initial: EditableInstructions;
  erroredStepIds?: Set<string>;
}) {
  const [groups, setGroups] = useState(initial);
  return (
    <InstructionsEditor
      value={groups}
      onChange={setGroups}
      erroredStepIds={erroredStepIds}
    />
  );
}

const oneStep: EditableInstructions = [
  {
    id: "g0",
    heading: null,
    items: [{ id: "s1", text: "Boil water.", name: "", minutes: 0, seconds: 0 }],
  },
];

describe("InstructionsEditor", () => {
  it("renders a textarea per step with its text", () => {
    render(<Harness initial={oneStep} />);
    const area = screen.getByLabelText(
      "Step instructions",
    ) as HTMLTextAreaElement;
    expect(area.value).toBe("Boil water.");
  });

  it("edits step text", () => {
    render(<Harness initial={oneStep} />);
    fireEvent.change(screen.getByLabelText("Step instructions"), {
      target: { value: "Boil 2L water." },
    });
    expect(
      (screen.getByLabelText("Step instructions") as HTMLTextAreaElement).value,
    ).toBe("Boil 2L water.");
  });

  it("exposes a timer label + a single duration input (no AM/PM time picker)", () => {
    render(<Harness initial={oneStep} />);
    expect(screen.getByLabelText("Timer label")).toBeInTheDocument();
    const duration = screen.getByLabelText("Timer duration") as HTMLInputElement;
    expect(duration).toBeInTheDocument();
    // type="text", NOT type="time" (which renders an AM/PM time-of-day control)
    expect(duration.type).toBe("text");
  });

  it("renders an existing timer as h:mm and round-trips edits", () => {
    render(
      <Harness
        initial={[
          {
            id: "g0",
            heading: null,
            items: [{ id: "s1", text: "Simmer.", name: "Simmer", minutes: 1, seconds: 30 }],
          },
        ]}
      />,
    );
    const duration = screen.getByLabelText("Timer duration") as HTMLInputElement;
    expect(duration.value).toBe("1:30");
    fireEvent.change(duration, { target: { value: "0:05" } });
    expect((screen.getByLabelText("Timer duration") as HTMLInputElement).value).toBe(
      "0:05",
    );
  });

  it("shows the timer-needs-a-label error for a flagged step", () => {
    render(<Harness initial={oneStep} erroredStepIds={new Set(["s1"])} />);
    expect(screen.getByText(/a timer needs a label/i)).toBeInTheDocument();
    // The errored timer-label input surfaces the invalid state via aria-invalid
    // (the primitive renders the destructive ring off this), not a red border.
    expect(screen.getByLabelText("Timer label")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("does not show the error when no step is flagged", () => {
    render(<Harness initial={oneStep} />);
    expect(
      screen.queryByText(/a timer needs a label/i),
    ).not.toBeInTheDocument();
  });

  it("adds a step to the list", () => {
    render(<Harness initial={oneStep} />);
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(screen.getAllByLabelText("Step instructions")).toHaveLength(2);
  });

  it("adds a section", () => {
    render(<Harness initial={oneStep} />);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    expect(screen.getByLabelText("Group name")).toBeInTheDocument();
  });

  it("deletes a step only after confirming", () => {
    render(<Harness initial={oneStep} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete this step?" }));
    // Row is swapped for the confirm bar; cancelling restores it (not deleted).
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Step instructions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete this step?" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.queryByLabelText("Step instructions"),
    ).not.toBeInTheDocument();
  });
});
