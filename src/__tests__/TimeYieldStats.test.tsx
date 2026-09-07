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

  describe("servingsEdit", () => {
    it("renders an input wired to onChange", async () => {
      const onChange = vi.fn();
      render(
        <TimeYieldStats
          recipeYield="4 servings"
          servingsEdit={{ value: "4", onChange }}
        />,
      );
      const input = screen.getByLabelText("Servings") as HTMLInputElement;
      expect(input.value).toBe("4");
      await userEvent.type(input, "2");
      expect(onChange).toHaveBeenCalledWith("42");
    });

    it("takes precedence over the scaling stepper", () => {
      render(
        <TimeYieldStats
          recipeYield="4 servings"
          currentServings={4}
          onServingsChange={vi.fn()}
          servingsEdit={{ value: "4", onChange: vi.fn() }}
        />,
      );
      expect(screen.getByLabelText("Servings")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Increase servings"),
      ).not.toBeInTheDocument();
    });

    it("renders the band even when there are no stats at all", () => {
      render(<TimeYieldStats servingsEdit={{ value: "", onChange: vi.fn() }} />);
      expect(screen.getByLabelText("Servings")).toBeInTheDocument();
    });

    it("labels the cell with the yield unitText for an object yield", () => {
      render(
        <TimeYieldStats
          recipeYield={{ "@type": "QuantitativeValue", value: 4, unitText: "kebabs" }}
          servingsEdit={{ value: "4", onChange: vi.fn() }}
        />,
      );
      expect(screen.getByText("kebabs")).toBeInTheDocument();
    });

    it("disables the input when disabled", () => {
      render(
        <TimeYieldStats
          recipeYield="4 servings"
          servingsEdit={{ value: "4", onChange: vi.fn(), disabled: true }}
        />,
      );
      expect(screen.getByLabelText("Servings")).toBeDisabled();
    });
  });
  describe("timesEdit", () => {
    const noop = { value: "", onChange: vi.fn() };

    it("renders an input per time, wired to onChange", async () => {
      const onChange = vi.fn();
      render(
        <TimeYieldStats
          prepTime="15 min"
          timesEdit={{ prep: { value: "0:15", onChange }, cook: noop, total: noop }}
        />,
      );
      const input = screen.getByLabelText("Prep time") as HTMLInputElement;
      expect(input.value).toBe("0:15");
      await userEvent.type(input, "0");
      expect(onChange).toHaveBeenCalledWith("0:150");
      expect(screen.getByLabelText("Cook time")).toBeInTheDocument();
      expect(screen.getByLabelText("Total time")).toBeInTheDocument();
    });

    it("takes precedence over the static stats", () => {
      render(
        <TimeYieldStats
          prepTime="15 min"
          cookTime="30 min"
          totalTime="45 min"
          timesEdit={{ prep: noop, cook: noop, total: noop }}
        />,
      );
      expect(screen.queryByText("15 min")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Prep time")).toBeInTheDocument();
    });

    it("renders all three cells even for times the recipe does not have", () => {
      // The whole point of the editor: a recipe with no cook time is exactly
      // the one that needs somewhere to type one.
      render(
        <TimeYieldStats
          prepTime="15 min"
          timesEdit={{ prep: { value: "0:15", onChange: vi.fn() }, cook: noop, total: noop }}
        />,
      );
      expect((screen.getByLabelText("Cook time") as HTMLInputElement).value).toBe("");
    });

    it("renders the band even when there are no stats at all", () => {
      render(<TimeYieldStats timesEdit={{ prep: noop, cook: noop, total: noop }} />);
      expect(screen.getByLabelText("Prep time")).toBeInTheDocument();
    });

    it("disables the inputs when disabled", () => {
      render(
        <TimeYieldStats
          timesEdit={{
            prep: { value: "0:15", onChange: vi.fn(), disabled: true },
            cook: noop,
            total: noop,
          }}
        />,
      );
      expect(screen.getByLabelText("Prep time")).toBeDisabled();
    });
  });
});
