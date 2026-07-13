import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import YieldEditor from "@/components/editor/YieldEditor";
import type { EditableYield } from "@/types/editor";

const base: EditableYield = {
  servings: "4",
  unit: "kebabs",
  weight: "454",
  weightUnit: "g",
};

describe("YieldEditor", () => {
  it("renders the four fields seeded from value", () => {
    render(<YieldEditor value={base} onChange={() => {}} />);
    expect((screen.getByLabelText("Servings") as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText("Serving unit") as HTMLInputElement).value).toBe(
      "kebabs",
    );
    expect((screen.getByLabelText("Yield weight") as HTMLInputElement).value).toBe(
      "454",
    );
    expect(
      (screen.getByLabelText("Yield weight unit") as HTMLInputElement).value,
    ).toBe("g");
  });

  it("merges a single field change into onChange (leaving the rest intact)", () => {
    const onChange = vi.fn();
    render(<YieldEditor value={base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Servings"), {
      target: { value: "6" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...base, servings: "6" });
  });

  it("edits the serving unit", () => {
    const onChange = vi.fn();
    render(<YieldEditor value={base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Serving unit"), {
      target: { value: "skewers" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...base, unit: "skewers" });
  });

  it("edits the yield weight and its unit", () => {
    const onChange = vi.fn();
    render(<YieldEditor value={base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Yield weight"), {
      target: { value: "500" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...base, weight: "500" });
  });

  it("disables all inputs when disabled", () => {
    render(<YieldEditor value={base} onChange={() => {}} disabled />);
    expect(screen.getByLabelText("Servings")).toBeDisabled();
    expect(screen.getByLabelText("Serving unit")).toBeDisabled();
    expect(screen.getByLabelText("Yield weight")).toBeDisabled();
    expect(screen.getByLabelText("Yield weight unit")).toBeDisabled();
  });
});
