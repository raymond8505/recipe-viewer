import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeYieldStats from "@/components/TimeYieldStats";
import { quantitativeValueYield } from "@/fixtures";

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

  it("shows a static Total yield stat for an object yield with a valueReference", () => {
    render(<TimeYieldStats recipeYield={quantitativeValueYield} />);
    expect(screen.getByText("Total yield")).toBeInTheDocument();
    expect(screen.getByText("454 g")).toBeInTheDocument();
  });

  it("shows no Total yield stat for a string yield", () => {
    render(<TimeYieldStats recipeYield="4 servings" />);
    expect(screen.queryByText("Total yield")).not.toBeInTheDocument();
  });

  it("shows no Total yield stat for an object yield without a valueReference", () => {
    render(
      <TimeYieldStats
        recipeYield={{ "@type": "QuantitativeValue", value: 4, unitText: "kebabs" }}
      />,
    );
    expect(screen.queryByText("Total yield")).not.toBeInTheDocument();
  });

  it("renders editable servings + total-yield inputs when editing", () => {
    render(
      <TimeYieldStats
        recipeYield="4 servings"
        editing
        yieldServings="4 servings"
        yieldWeight="454 g"
        onYieldChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Servings")).toHaveValue("4 servings");
    expect(screen.getByLabelText("Total yield")).toHaveValue("454 g");
    // No scaling stepper while editing.
    expect(screen.queryByLabelText("Increase servings")).not.toBeInTheDocument();
  });

  it("calls onYieldChange with the field key as the yield is edited", async () => {
    const onYieldChange = vi.fn();
    render(
      <TimeYieldStats
        editing
        yieldServings=""
        yieldWeight=""
        onYieldChange={onYieldChange}
      />,
    );
    await userEvent.type(screen.getByLabelText("Total yield"), "5");
    expect(onYieldChange).toHaveBeenCalledWith("weight", "5");
  });

  it("renders all three time cells as inputs when editing, including empty ones", () => {
    render(
      <TimeYieldStats
        prepTime="15 min"
        cookTime={null}
        totalTime={null}
        editing
        onTimeChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Prep time")).toHaveValue("15 min");
    expect(screen.getByLabelText("Cook time")).toHaveValue("");
    expect(screen.getByLabelText("Total time")).toHaveValue("");
    // Every editable time cell shows its format hint, not just servings/yield.
    expect(screen.getByText("e.g. 15 min")).toBeInTheDocument();
    expect(screen.getByText("e.g. 1 hr 30 min")).toBeInTheDocument();
  });

  it("calls onTimeChange with the field key as a time is edited", async () => {
    const onTimeChange = vi.fn();
    render(
      <TimeYieldStats
        prepTime={null}
        cookTime={null}
        totalTime={null}
        editing
        onTimeChange={onTimeChange}
      />,
    );
    await userEvent.type(screen.getByLabelText("Cook time"), "5");
    expect(onTimeChange).toHaveBeenCalledWith("cook", "5");
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
