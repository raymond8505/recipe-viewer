import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Stat from "@/components/Stat";

describe("Stat", () => {
  it("renders the label and value in read mode", () => {
    render(<Stat label="Prep time" value="15 min" />);
    expect(screen.getByText("Prep time")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();
  });

  it("renders no input in read mode", () => {
    render(<Stat label="Prep time" value="15 min" />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders an input seeded with the value in edit mode", () => {
    render(<Stat label="Prep time" value="15 min" editing onChange={vi.fn()} />);
    expect(screen.getByLabelText("Prep time")).toHaveValue("15 min");
  });

  it("calls onChange with the new string as the value is edited", async () => {
    const onChange = vi.fn();
    render(<Stat label="Prep time" value="" editing onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Prep time"), "5");
    expect(onChange).toHaveBeenCalledWith("5");
  });
});
