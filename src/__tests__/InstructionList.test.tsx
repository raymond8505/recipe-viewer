import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InstructionList from "@/components/InstructionList";
import { makeInstructionGroup } from "@/fixtures";

describe("InstructionList", () => {
  const groups = [
    makeInstructionGroup(undefined, ["Preheat the oven.", "Grease the tin."]),
    makeInstructionGroup("Sauce", ["Simmer the tomatoes.", "Season."]),
  ];

  it("restarts step numbers in every group", () => {
    render(<InstructionList groups={groups} />);
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getAllByText("2")).toHaveLength(2);
  });

  it("renders a heading only for named groups", () => {
    render(<InstructionList groups={groups} />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Sauce"]);
  });

  it("renders read-only steps without callbacks", () => {
    render(<InstructionList groups={groups} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hands onToggleStep the group and step index", () => {
    const onToggleStep = vi.fn();
    render(<InstructionList groups={groups} onToggleStep={onToggleStep} />);
    const [, sauceFirst] = screen.getAllByRole("button", { name: "Step 1: mark complete" });
    fireEvent.click(sauceFirst);
    expect(onToggleStep).toHaveBeenCalledWith(1, 0);
  });

  it("asks isStepDone with the group and step index", () => {
    render(
      <InstructionList
        groups={groups}
        onToggleStep={() => {}}
        isStepDone={(gi, si) => gi === 1 && si === 1}
      />,
    );
    const done = screen.getAllByRole("button", { pressed: true });
    expect(done).toHaveLength(1);
    expect(done[0]).toHaveAccessibleName("Step 2: completed");
    expect(screen.getByText("Season.")).toHaveClass("line-through");
  });

  it("passes the class props through to headings and steps", () => {
    render(
      <InstructionList
        groups={groups}
        headingClassName="text-sm"
        stepBadgeClassName="w-8"
        stepTextClassName="text-xl"
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Sauce" })).toHaveClass("text-sm");
    for (const badge of screen.getAllByText("1")) expect(badge).toHaveClass("w-8");
    expect(screen.getByText("Preheat the oven.")).toHaveClass("text-xl");
  });
});
