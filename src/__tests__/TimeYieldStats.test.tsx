import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeYieldStats from "@/components/TimeYieldStats";

describe("TimeYieldStats", () => {
  it("renders nothing when there are no stats", () => {
    const { container } = render(
      <TimeYieldStats prepTime={null} cookTime={null} totalTime={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the provided stats", () => {
    render(<TimeYieldStats prepTime="15 min" cookTime={null} totalTime="1 hr" />);
    expect(screen.getByText("Prep time")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("Total time")).toBeInTheDocument();
    expect(screen.queryByText("Cook time")).not.toBeInTheDocument();
  });

  it("shows recipeYield as a static servings stat when not scalable", () => {
    render(<TimeYieldStats recipeYield={["6 servings", "6"]} />);
    expect(screen.getByText("Servings")).toBeInTheDocument();
    expect(screen.getByText("6 servings")).toBeInTheDocument();
    expect(screen.queryByLabelText("Increase servings")).not.toBeInTheDocument();
  });

  it("renders a servings stepper wired to onServingsChange when scalable", async () => {
    const onServingsChange = vi.fn();
    render(
      <TimeYieldStats
        recipeYield="4 servings"
        currentServings={4}
        onServingsChange={onServingsChange}
      />,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Increase servings"));
    expect(onServingsChange).toHaveBeenCalledWith(5);
    await userEvent.click(screen.getByLabelText("Decrease servings"));
    expect(onServingsChange).toHaveBeenCalledWith(3);
  });

  it("labels the stepper with the yield unitText for an object yield", () => {
    render(
      <TimeYieldStats
        recipeYield={{ "@type": "QuantitativeValue", value: 4, unitText: "kebabs" }}
        currentServings={4}
        onServingsChange={vi.fn()}
      />,
    );
    // "kebabs" surfaces as the stepper's label instead of the generic "Servings".
    expect(screen.getByText("kebabs")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("Servings")).not.toBeInTheDocument();
  });
});
