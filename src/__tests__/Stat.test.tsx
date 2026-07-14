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

  it("shows the hint below the input in edit mode", () => {
    render(
      <Stat
        label="Total yield"
        value=""
        editing
        onChange={vi.fn()}
        hint="eg 50 g or 50 ml"
      />,
    );
    expect(screen.getByText("eg 50 g or 50 ml")).toBeInTheDocument();
  });

  it("does not render the hint in read mode", () => {
    render(<Stat label="Total yield" value="454 g" hint="eg 50 g or 50 ml" />);
    expect(screen.queryByText("eg 50 g or 50 ml")).not.toBeInTheDocument();
  });
});
