import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InstructionStep from "@/components/InstructionStep";
import { makeStep } from "@/fixtures";

describe("InstructionStep", () => {
  it("renders a plain numbered list item without completion", () => {
    render(
      <ol>
        <InstructionStep step={makeStep("Boil the pasta.")} number={1} />
      </ol>,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Boil the pasta.")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is a native toggle button, named with the step text, when completable", () => {
    const onToggle = vi.fn();
    render(
      <ol>
        <InstructionStep
          step={makeStep("Boil the pasta.")}
          number={2}
          completion={{ done: false, onToggle }}
        />
      </ol>,
    );
    const step = screen.getByRole("button", { name: "Step 2: Boil the pasta." });
    // Native, so Enter/Space work without any tabIndex or key handler of ours.
    expect(step.tagName).toBe("BUTTON");
    expect(step).toHaveAttribute("type", "button");
    expect(step).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(step);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps the step a list item with the button inside it", () => {
    render(
      <ol>
        <InstructionStep
          step={makeStep("Boil the pasta.")}
          number={1}
          completion={{ done: false, onToggle: () => {} }}
        />
      </ol>,
    );
    const item = screen.getByRole("listitem");
    expect(item.contains(screen.getByRole("button"))).toBe(true);
  });

  it("shows a check instead of the number once done", () => {
    render(
      <ol>
        <InstructionStep
          step={makeStep("Boil the pasta.")}
          number={2}
          completion={{ done: true, onToggle: () => {} }}
        />
      </ol>,
    );
    expect(screen.getByRole("button", { name: /step 2/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("2")).toBeNull();
    expect(screen.getByText("Boil the pasta.")).toHaveClass("line-through");
  });

  it("applies the caller's badge and text classes", () => {
    render(
      <ol>
        <InstructionStep
          step={makeStep("Boil the pasta.")}
          number={1}
          badgeClassName="w-8 h-8"
          textClassName="text-xl"
        />
      </ol>,
    );
    expect(screen.getByText("1")).toHaveClass("w-8", "h-8");
    expect(screen.getByText("Boil the pasta.")).toHaveClass("text-xl");
  });
});
