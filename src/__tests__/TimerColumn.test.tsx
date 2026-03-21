import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TimerColumn from "@/components/cooking/TimerColumn";
import type { Timer } from "@/hooks/useTimers";

const makeTimer = (overrides: Partial<Timer> = {}): Timer => ({
  id: "t1",
  label: "Pasta",
  duration: 300,
  remaining: 150,
  paused: false,
  finished: false,
  ...overrides,
});

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
    render(<TimerColumn timers={[makeTimer()]} {...defaultProps} />);
    expect(screen.getByText("Pasta")).toBeTruthy();
  });

  it("shows Reset All button when timers exist", () => {
    render(<TimerColumn timers={[makeTimer()]} {...defaultProps} />);
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
    render(<TimerColumn timers={[makeTimer()]} {...defaultProps} onResetAll={onResetAll} />);
    fireEvent.click(screen.getByRole("button", { name: /reset all/i }));
    expect(onResetAll).toHaveBeenCalled();
  });
});
