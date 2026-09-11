import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InstructionGroup from "@/components/InstructionGroup";
import { makeInstructionGroup, makeSteps } from "@/fixtures";

const sauce = makeInstructionGroup("Sauce", ["Sweat the onion.", "Add the tomatoes.", "Season."]);

describe("InstructionGroup", () => {
  it("renders a named group's heading with the caller's className", () => {
    render(<InstructionGroup group={sauce} headingClassName="text-sm sm:text-xs" />);
    expect(screen.getByRole("heading", { level: 3, name: "Sauce" })).toHaveClass(
      "text-sm",
      "sm:text-xs",
    );
  });

  it("renders no heading for a nameless run", () => {
    const [nameless] = makeSteps(["Boil.", "Drain."]);
    render(<InstructionGroup group={nameless} />);
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(screen.getByText("Drain.")).toBeInTheDocument();
  });

  it("numbers its steps from 1", () => {
    render(<InstructionGroup group={sauce} />);
    for (const n of ["1", "2", "3"]) expect(screen.getByText(n)).toBeInTheDocument();
  });

  it("renders read-only steps without onToggleStep", () => {
    render(<InstructionGroup group={sauce} isStepDone={() => true} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hands onToggleStep the tapped step's index", () => {
    const onToggleStep = vi.fn();
    render(<InstructionGroup group={sauce} onToggleStep={onToggleStep} />);
    fireEvent.click(screen.getByRole("button", { name: "Step 2: mark complete" }));
    expect(onToggleStep).toHaveBeenCalledWith(1);
  });

  it("asks isStepDone for each step's pressed state", () => {
    render(
      <InstructionGroup group={sauce} onToggleStep={() => {}} isStepDone={(si) => si === 0} />,
    );
    expect(screen.getByRole("button", { name: "Step 1: completed" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Step 2: mark complete" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("hands the step class props to every step", () => {
    render(
      <InstructionGroup group={sauce} stepBadgeClassName="w-8" stepTextClassName="text-xl" />,
    );
    expect(screen.getByText("3")).toHaveClass("w-8");
    expect(screen.getByText("Season.")).toHaveClass("text-xl");
  });
});
