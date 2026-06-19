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
    items: [{ id: "s1", text: "Boil water.", name: "", hours: 0, minutes: 0 }],
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

  it("exposes a timer label + hours + minutes per step", () => {
    render(<Harness initial={oneStep} />);
    expect(screen.getByLabelText("Timer label")).toBeInTheDocument();
    expect(screen.getByLabelText("Timer hours")).toBeInTheDocument();
    expect(screen.getByLabelText("Timer minutes")).toBeInTheDocument();
  });

  it("shows the co-dependency error for a flagged step", () => {
    render(<Harness initial={oneStep} erroredStepIds={new Set(["s1"])} />);
    expect(
      screen.getByText(/needs both a label and a time/i),
    ).toBeInTheDocument();
  });

  it("does not show the error when no step is flagged", () => {
    render(<Harness initial={oneStep} />);
    expect(
      screen.queryByText(/needs both a label and a time/i),
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
