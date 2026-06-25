import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PrimaryActionButton,
  IconButton,
  PortionStepperButton,
  SegmentButton,
  DragHandleButton,
} from "@/components/buttons";

describe("PrimaryActionButton", () => {
  it("renders a real <button> and forwards clicks", async () => {
    const onClick = vi.fn();
    render(<PrimaryActionButton onClick={onClick}>Save</PrimaryActionButton>);
    const btn = screen.getByRole("button", { name: "Save" });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <PrimaryActionButton onClick={onClick} disabled>
        Save
      </PrimaryActionButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("preserves an explicit type (no forced default)", () => {
    render(<PrimaryActionButton type="submit">Go</PrimaryActionButton>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveProperty(
      "type",
      "submit",
    );
  });
});

describe("IconButton", () => {
  it("uses its aria-label as the accessible name", () => {
    render(
      <IconButton aria-label="Close">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});

describe("PortionStepperButton", () => {
  it("renders + for increase and − for decrease", () => {
    render(
      <>
        <PortionStepperButton direction="increase" aria-label="Increase" />
        <PortionStepperButton direction="decrease" aria-label="Decrease" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Increase" }).textContent).toBe("+");
    expect(screen.getByRole("button", { name: "Decrease" }).textContent).toBe("−");
  });
});

describe("SegmentButton", () => {
  it("reflects active state via aria-pressed", () => {
    const { rerender } = render(<SegmentButton active>Newest</SegmentButton>);
    expect(screen.getByRole("button", { name: "Newest" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    rerender(<SegmentButton active={false}>Newest</SegmentButton>);
    expect(screen.getByRole("button", { name: "Newest" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("DragHandleButton", () => {
  it("spreads dnd-kit listeners/attributes onto the button", async () => {
    const onPointerDown = vi.fn();
    render(
      <DragHandleButton
        aria-label="Reorder row"
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
      />,
    );
    const handle = screen.getByRole("button", { name: "Reorder row" });
    expect(handle).toHaveAttribute("tabindex", "0");
    await userEvent.pointer({ target: handle, keys: "[MouseLeft>]" });
    expect(onPointerDown).toHaveBeenCalled();
  });
});
