import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DurationInput, { formatMS, parseMS } from "@/components/editor/DurationInput";

describe("formatMS", () => {
  it("blanks a zero duration", () => {
    expect(formatMS(0, 0)).toBe("");
  });
  it("shows m:ss", () => {
    expect(formatMS(5, 30)).toBe("5:30");
    expect(formatMS(0, 45)).toBe("0:45");
    expect(formatMS(2, 0)).toBe("2:00");
  });
  it("does not cap minutes", () => {
    expect(formatMS(90, 0)).toBe("90:00");
  });
});

describe("parseMS", () => {
  it("parses m:ss", () => {
    expect(parseMS("5:30")).toEqual({ minutes: 5, seconds: 30 });
  });
  it("carries seconds >= 60 into minutes", () => {
    expect(parseMS("1:90")).toEqual({ minutes: 2, seconds: 30 });
  });
  it("treats a bare number as minutes", () => {
    expect(parseMS("5")).toEqual({ minutes: 5, seconds: 0 });
  });
  it("treats blank/garbage as zero", () => {
    expect(parseMS("")).toEqual({ minutes: 0, seconds: 0 });
    expect(parseMS("abc")).toEqual({ minutes: 0, seconds: 0 });
  });
});

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
