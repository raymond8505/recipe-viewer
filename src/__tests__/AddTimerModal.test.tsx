import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AddTimerModal from "@/components/cooking/AddTimerModal";

describe("AddTimerModal (add mode)", () => {
  it("renders label input and duration controls", () => {
    render(<AddTimerModal onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/label/i)).toBeTruthy();
    expect(screen.getByLabelText(/increase minutes/i)).toBeTruthy();
    expect(screen.getByLabelText(/increase seconds/i)).toBeTruthy();
  });

  it("shows 'New Timer' title", () => {
    render(<AddTimerModal onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("New Timer")).toBeTruthy();
  });

  it("shows 'Start Timer' button", () => {
    render(<AddTimerModal onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /start timer/i })).toBeTruthy();
  });

  it("renders quick preset buttons", () => {
    render(<AddTimerModal onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "5m" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "10m" })).toBeTruthy();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<AddTimerModal onAdd={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onAdd with label and duration when Start Timer clicked", () => {
    const onAdd = vi.fn();
    render(<AddTimerModal onAdd={onAdd} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: "Pasta" } });
    fireEvent.click(screen.getByRole("button", { name: /start timer/i }));
    // Default is 5 min = 300 seconds
    expect(onAdd).toHaveBeenCalledWith("Pasta", 300);
  });

  it("uses 'Timer' as default label when field is empty", () => {
    const onAdd = vi.fn();
    render(<AddTimerModal onAdd={onAdd} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /start timer/i }));
    expect(onAdd).toHaveBeenCalledWith("Timer", 300);
  });

  it("preset button sets minutes", () => {
    const onAdd = vi.fn();
    render(<AddTimerModal onAdd={onAdd} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "10m" }));
    fireEvent.click(screen.getByRole("button", { name: /start timer/i }));
    expect(onAdd).toHaveBeenCalledWith("Timer", 600);
  });

  it("increases minutes when + is clicked", () => {
    const onAdd = vi.fn();
    render(<AddTimerModal onAdd={onAdd} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/increase minutes/i));
    fireEvent.click(screen.getByRole("button", { name: /start timer/i }));
    expect(onAdd).toHaveBeenCalledWith("Timer", 360); // 6 min
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(<AddTimerModal onAdd={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Start Timer is disabled when duration is 0", () => {
    render(<AddTimerModal onAdd={vi.fn()} onClose={vi.fn()} />);
    // Decrease minutes 5 times to reach 0 (starts at 5)
    const decMin = screen.getByLabelText(/decrease minutes/i);
    for (let i = 0; i < 5; i++) {
      fireEvent.click(decMin);
    }
    expect(screen.getByRole("button", { name: /start timer/i })).toBeDisabled();
  });
});

describe("AddTimerModal (edit mode)", () => {
  it("shows 'Edit Timer' title when initialLabel is provided", () => {
    render(<AddTimerModal initialLabel="Sauce" initialSeconds={180} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Edit Timer")).toBeTruthy();
  });

  it("shows 'Save' button in edit mode", () => {
    render(<AddTimerModal initialLabel="Sauce" initialSeconds={180} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
  });

  it("pre-fills label with initialLabel", () => {
    render(<AddTimerModal initialLabel="Sauce" initialSeconds={180} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>(/label/i).value).toBe("Sauce");
  });

  it("calls onAdd with updated values when Save clicked", () => {
    const onAdd = vi.fn();
    render(<AddTimerModal initialLabel="Sauce" initialSeconds={180} onAdd={onAdd} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: "Soup" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onAdd).toHaveBeenCalledWith("Soup", 180);
  });
});
