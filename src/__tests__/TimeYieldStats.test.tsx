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

  it("shows the servings columns as a static stat when not scalable", () => {
    render(<TimeYieldStats servingsAmount={6} servingsUnit="servings" />);
    expect(screen.getByText("Servings")).toBeInTheDocument();
    expect(screen.getByText("6 servings")).toBeInTheDocument();
    expect(screen.queryByLabelText("Increase servings")).not.toBeInTheDocument();
  });

  it("renders a servings stepper wired to onServingsChange when scalable", async () => {
    const onServingsChange = vi.fn();
    render(
      <TimeYieldStats
        servingsAmount={4}
        servingsUnit="servings"
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

  it("labels the stepper with the servings unit", () => {
    render(
      <TimeYieldStats
        servingsAmount={4}
        servingsUnit="kebabs"
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
    // Mirrors the `noop` helper the timesEdit block uses: the cell needs four
    // props to render at all, and only one varies per case.
    const edit = (over: Partial<Parameters<typeof TimeYieldStats>[0]["servingsEdit"] & object> = {}) => ({
      value: "4",
      onChange: vi.fn(),
      unit: "servings",
      onUnitChange: vi.fn(),
      ...over,
    });

    it("renders a count input wired to onChange", async () => {
      const onChange = vi.fn();
      render(<TimeYieldStats servingsAmount={4} servingsEdit={edit({ onChange })} />);
      const input = screen.getByLabelText("Servings") as HTMLInputElement;
      expect(input.value).toBe("4");
      await userEvent.type(input, "2");
      expect(onChange).toHaveBeenCalledWith("42");
    });

    it("renders a unit input wired to onUnitChange", async () => {
      const onUnitChange = vi.fn();
      render(
        <TimeYieldStats
          servingsAmount={4}
          servingsEdit={edit({ unit: "kebab", onUnitChange })}
        />,
      );
      const input = screen.getByLabelText("Servings unit") as HTMLInputElement;
      expect(input.value).toBe("kebab");
      await userEvent.type(input, "s");
      expect(onUnitChange).toHaveBeenCalledWith("kebabs");
    });

    // The heading is the static word, not the unit: with the unit editable
    // beside it, a unit heading would render the same word twice.
    it("heads the cell with the static word, not the unit", () => {
      render(
        <TimeYieldStats servingsAmount={4} servingsEdit={edit({ unit: "kebabs" })} />,
      );
      expect(screen.getByText("Servings")).toBeInTheDocument();
      expect(screen.getByLabelText("Servings unit")).toHaveValue("kebabs");
    });

    // Blank saves as "no unit named", which renders as the fallback — so the
    // field shows that word rather than leaving the user guessing.
    it("shows the fallback word as the unit placeholder", () => {
      render(<TimeYieldStats servingsAmount={4} servingsEdit={edit({ unit: "" })} />);
      expect(screen.getByLabelText("Servings unit")).toHaveAttribute(
        "placeholder",
        "servings",
      );
    });

    it("takes precedence over the scaling stepper", () => {
      render(
        <TimeYieldStats
          servingsAmount={4}
          currentServings={4}
          onServingsChange={vi.fn()}
          servingsEdit={edit()}
        />,
      );
      expect(screen.getByLabelText("Servings")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Increase servings"),
      ).not.toBeInTheDocument();
    });

    it("renders the band even when there are no stats at all", () => {
      render(<TimeYieldStats servingsEdit={edit({ value: "", unit: "" })} />);
      expect(screen.getByLabelText("Servings")).toBeInTheDocument();
      expect(screen.getByLabelText("Servings unit")).toBeInTheDocument();
    });

    it("disables both inputs when disabled", () => {
      render(
        <TimeYieldStats servingsAmount={4} servingsEdit={edit({ disabled: true })} />,
      );
      expect(screen.getByLabelText("Servings")).toBeDisabled();
      expect(screen.getByLabelText("Servings unit")).toBeDisabled();
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
