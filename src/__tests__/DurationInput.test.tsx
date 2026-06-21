import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DurationInput from "@/components/editor/DurationInput";

describe("DurationInput", () => {
  it("is a plain text input (not an AM/PM time picker)", () => {
    render(<DurationInput minutes={5} seconds={30} onChange={vi.fn()} />);
    const input = screen.getByLabelText("Timer duration") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.value).toBe("5:30");
  });

  it("reports parsed minutes/seconds on change", () => {
    const onChange = vi.fn();
    render(<DurationInput minutes={0} seconds={0} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Timer duration"), {
      target: { value: "1:05" },
    });
    expect(onChange).toHaveBeenCalledWith({ minutes: 1, seconds: 5 });
  });
});
