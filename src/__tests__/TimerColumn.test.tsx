import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TimerColumn from "@/components/cooking/TimerColumn";
import { makeTimer } from "@/fixtures";

const defaultProps = {
  onAddTimer: vi.fn(),
  onEditTimer: vi.fn(),
  onTogglePauseTimer: vi.fn(),
  onResetTimer: vi.fn(),
  onRemoveTimer: vi.fn(),
  onDismissTimer: vi.fn(),
  onResetAll: vi.fn(),
};

describe("TimerColumn", () => {
  it("renders Add Timer button", () => {
    render(<TimerColumn timers={[]} {...defaultProps} />);
    expect(screen.getByRole("button", { name: /add timer/i })).toBeTruthy();
  });

  it("shows empty state when no timers", () => {
    render(<TimerColumn timers={[]} {...defaultProps} />);
    expect(screen.getByText(/no timers yet/i)).toBeTruthy();
  });

  it("renders timer cards", () => {
    render(<TimerColumn timers={[makeTimer("t1", "Pasta")]} {...defaultProps} />);
    expect(screen.getByText("Pasta")).toBeTruthy();
  });

  it("shows Reset All button when timers exist", () => {
    render(<TimerColumn timers={[makeTimer("t1", "Pasta")]} {...defaultProps} />);
    expect(screen.getByRole("button", { name: /reset all/i })).toBeTruthy();
  });

  it("hides Reset All when no timers", () => {
    render(<TimerColumn timers={[]} {...defaultProps} />);
    expect(screen.queryByRole("button", { name: /reset all/i })).toBeNull();
  });

  it("calls onAddTimer when Add Timer is clicked", () => {
    const onAddTimer = vi.fn();
    render(<TimerColumn timers={[]} {...defaultProps} onAddTimer={onAddTimer} />);
    fireEvent.click(screen.getByRole("button", { name: /add timer/i }));
    expect(onAddTimer).toHaveBeenCalled();
  });

  it("calls onResetAll when Reset All is clicked", () => {
    const onResetAll = vi.fn();
    render(<TimerColumn timers={[makeTimer("t1", "Pasta")]} {...defaultProps} onResetAll={onResetAll} />);
    fireEvent.click(screen.getByRole("button", { name: /reset all/i }));
    expect(onResetAll).toHaveBeenCalled();
  });

  it("shows the Notes button when onOpenNotes is provided, even with no timers", () => {
    render(<TimerColumn timers={[]} {...defaultProps} onOpenNotes={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Notes" })).toBeTruthy();
  });

  it("hides the Notes button when onOpenNotes is not provided", () => {
    render(<TimerColumn timers={[makeTimer("t1", "Pasta")]} {...defaultProps} />);
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
  });

  it("places Notes to the right of Reset All", () => {
    render(<TimerColumn timers={[makeTimer("t1", "Pasta")]} {...defaultProps} onOpenNotes={vi.fn()} />);
    const resetAll = screen.getByRole("button", { name: /reset all/i });
    const notes = screen.getByRole("button", { name: "Notes" });
    expect(
      resetAll.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("calls onOpenNotes when Notes is clicked", () => {
    const onOpenNotes = vi.fn();
    render(<TimerColumn timers={[]} {...defaultProps} onOpenNotes={onOpenNotes} />);
    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(onOpenNotes).toHaveBeenCalledOnce();
  });
});
