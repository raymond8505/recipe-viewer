import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TimerCard, { formatRemaining } from "@/components/cooking/TimerCard";
import type { Timer } from "@/hooks/useTimers";

const makeTimer = (overrides: Partial<Timer> = {}): Timer => ({
  id: "timer-1",
  label: "Pasta",
  duration: 600,
  remaining: 300,
  paused: false,
  finished: false,
  ...overrides,
});

const defaultProps = {
  onTogglePause: vi.fn(),
  onReset: vi.fn(),
  onRemove: vi.fn(),
  onDismiss: vi.fn(),
  onEdit: vi.fn(),
};

describe("formatRemaining", () => {
  it("formats minutes and seconds", () => {
    expect(formatRemaining(90)).toBe("1:30");
  });

  it("formats zero seconds", () => {
    expect(formatRemaining(0)).toBe("0:00");
  });

  it("pads single-digit seconds", () => {
    expect(formatRemaining(65)).toBe("1:05");
  });

  it("formats hours when >= 3600 seconds", () => {
    expect(formatRemaining(3661)).toBe("1:01:01");
  });

  it("formats exactly 1 hour", () => {
    expect(formatRemaining(3600)).toBe("1:00:00");
  });
});

describe("TimerCard (running)", () => {
  it("renders the timer label", () => {
    render(<TimerCard timer={makeTimer()} {...defaultProps} />);
    expect(screen.getByText("Pasta")).toBeTruthy();
  });

  it("renders remaining time", () => {
    render(<TimerCard timer={makeTimer({ remaining: 90 })} {...defaultProps} />);
    expect(screen.getByText("1:30")).toBeTruthy();
  });

  it("shows edit button", () => {
    render(<TimerCard timer={makeTimer()} {...defaultProps} />);
    expect(screen.getByLabelText(/edit pasta timer/i)).toBeTruthy();
  });

  it("calls onEdit when edit button is clicked", () => {
    const onEdit = vi.fn();
    render(<TimerCard timer={makeTimer()} {...defaultProps} onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText(/edit pasta timer/i));
    expect(onEdit).toHaveBeenCalledWith("timer-1");
  });

  it("calls onTogglePause when time area is tapped", () => {
    const onTogglePause = vi.fn();
    render(<TimerCard timer={makeTimer()} {...defaultProps} onTogglePause={onTogglePause} />);
    fireEvent.click(screen.getByLabelText(/pause pasta timer/i));
    expect(onTogglePause).toHaveBeenCalledWith("timer-1");
  });

  it("calls onReset when reset button clicked", () => {
    const onReset = vi.fn();
    render(<TimerCard timer={makeTimer()} {...defaultProps} onReset={onReset} />);
    fireEvent.click(screen.getByLabelText(/reset timer/i));
    expect(onReset).toHaveBeenCalledWith("timer-1");
  });

  it("does not apply done styling when timer is running", () => {
    const { container } = render(<TimerCard timer={makeTimer({ remaining: 60 })} {...defaultProps} />);
    expect(container.firstChild).not.toHaveClass("animate-timer-done");
  });
});

describe("TimerCard (paused)", () => {
  it("time area shows resume label when paused", () => {
    render(<TimerCard timer={makeTimer({ paused: true })} {...defaultProps} />);
    expect(screen.getByLabelText(/resume pasta timer/i)).toBeTruthy();
  });

  it("time button has resume aria-label when paused", () => {
    render(<TimerCard timer={makeTimer({ paused: true })} {...defaultProps} />);
    expect(screen.getByLabelText(/resume pasta timer/i)).toBeTruthy();
  });

  it("calls onTogglePause when time area tapped while paused", () => {
    const onTogglePause = vi.fn();
    render(<TimerCard timer={makeTimer({ paused: true })} {...defaultProps} onTogglePause={onTogglePause} />);
    fireEvent.click(screen.getByLabelText(/resume pasta timer/i));
    expect(onTogglePause).toHaveBeenCalledWith("timer-1");
  });
});

describe("TimerCard (alarm)", () => {
  it("shows Done! text when remaining is 0 and not finished", () => {
    render(<TimerCard timer={makeTimer({ remaining: 0 })} {...defaultProps} />);
    expect(screen.getByText("Done!")).toBeTruthy();
  });

  it("shows tap to dismiss hint", () => {
    render(<TimerCard timer={makeTimer({ remaining: 0 })} {...defaultProps} />);
    expect(screen.getByText(/tap to dismiss/i)).toBeTruthy();
  });

  it("calls onDismiss when alarm card body is tapped", () => {
    const onDismiss = vi.fn();
    render(<TimerCard timer={makeTimer({ remaining: 0 })} {...defaultProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText(/pasta timer done/i));
    expect(onDismiss).toHaveBeenCalledWith("timer-1");
  });

  it("calls onReset from alarm footer", () => {
    const onReset = vi.fn();
    render(<TimerCard timer={makeTimer({ remaining: 0 })} {...defaultProps} onReset={onReset} />);
    fireEvent.click(screen.getByLabelText(/reset timer/i));
    expect(onReset).toHaveBeenCalledWith("timer-1");
  });

  it("applies done animation styling", () => {
    const { container } = render(<TimerCard timer={makeTimer({ remaining: 0 })} {...defaultProps} />);
    expect(container.firstChild).toHaveClass("animate-timer-done");
  });
});

describe("TimerCard (finished)", () => {
  it("shows Done text for finished timer", () => {
    render(<TimerCard timer={makeTimer({ remaining: 0, finished: true })} {...defaultProps} />);
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("calls onEdit when edit button is clicked on finished timer", () => {
    const onEdit = vi.fn();
    render(<TimerCard timer={makeTimer({ remaining: 0, finished: true })} {...defaultProps} onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText(/edit pasta timer/i));
    expect(onEdit).toHaveBeenCalledWith("timer-1");
  });
});

describe("TimerCard (delete confirmation)", () => {
  it("shows confirmation when delete button clicked", () => {
    render(<TimerCard timer={makeTimer()} {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/delete timer/i));
    expect(screen.getByText(/delete.*pasta/i)).toBeTruthy();
  });

  it("cancels confirmation and returns to normal card", () => {
    render(<TimerCard timer={makeTimer()} {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/delete timer/i));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/delete.*pasta/i)).toBeNull();
    expect(screen.getByText("Pasta")).toBeTruthy();
  });

  it("calls onRemove when Delete confirmed", () => {
    const onRemove = vi.fn();
    render(<TimerCard timer={makeTimer()} {...defaultProps} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText(/delete timer/i));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onRemove).toHaveBeenCalledWith("timer-1");
  });
});
