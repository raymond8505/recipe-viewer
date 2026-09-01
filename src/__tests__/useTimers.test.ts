import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimers, loadTimers, saveTimers, stopAlarm, timerState } from "@/hooks/useTimers";
import { hashUrl } from "@/lib/hash";

// Stub AudioContext so playAlarm / beep don't throw in jsdom
const mockOscillator = {
  connect: vi.fn(), type: "", frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(),
};
const mockGain = {
  connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
};
const mockCtx = {
  currentTime: 0, createOscillator: vi.fn(() => mockOscillator),
  createGain: vi.fn(() => mockGain), destination: {}, close: vi.fn(),
};
vi.stubGlobal("AudioContext", vi.fn(() => mockCtx));

const RECIPE_URL = "https://example.com/recipe/pasta";
const RECIPE_HASH = hashUrl(RECIPE_URL);

const makeStoredTimer = (overrides = {}) => ({
  id: "t1", label: "Pasta", duration: 600, remaining: 600,
  paused: false, finished: false, ...overrides,
});

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { stopAlarm(); vi.useRealTimers(); });

describe("timerState", () => {
  it("returns running when remaining > 0 and not paused", () => {
    expect(timerState(makeStoredTimer())).toBe("running");
  });
  it("returns paused when remaining > 0 and paused", () => {
    expect(timerState(makeStoredTimer({ paused: true }))).toBe("paused");
  });
  it("returns alarm when remaining is 0 and not finished", () => {
    expect(timerState(makeStoredTimer({ remaining: 0 }))).toBe("alarm");
  });
  it("returns finished when remaining is 0 and finished", () => {
    expect(timerState(makeStoredTimer({ remaining: 0, finished: true }))).toBe("finished");
  });
});

describe("loadTimers / saveTimers", () => {
  it("returns empty array when nothing stored", () => {
    expect(loadTimers(RECIPE_HASH)).toEqual([]);
  });

  it("round-trips timers through localStorage", () => {
    const timers = [makeStoredTimer({ remaining: 500 })];
    saveTimers(RECIPE_HASH, timers);
    expect(loadTimers(RECIPE_HASH)).toEqual(timers);
  });

  it("backfills paused and finished when loading old data", () => {
    const raw = JSON.stringify({ [RECIPE_HASH]: [{ id: "x", label: "Old", duration: 60, remaining: 30 }] });
    localStorage.setItem("cookingTimers", raw);
    const [t] = loadTimers(RECIPE_HASH);
    expect(t.paused).toBe(false);
    expect(t.finished).toBe(false);
  });

  it("scopes timers by recipe hash", () => {
    const hash2 = hashUrl("https://example.com/recipe/soup");
    saveTimers(RECIPE_HASH, [makeStoredTimer({ label: "A" })]);
    saveTimers(hash2, [makeStoredTimer({ id: "t2", label: "B" })]);
    expect(loadTimers(RECIPE_HASH)[0].label).toBe("A");
    expect(loadTimers(hash2)[0].label).toBe("B");
  });
});

describe("useTimers", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    expect(result.current.timers).toEqual([]);
  });

  it("loads persisted timers on mount", () => {
    saveTimers(RECIPE_HASH, [makeStoredTimer({ label: "Sauce", remaining: 250 })]);
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    expect(result.current.timers[0].label).toBe("Sauce");
  });

  it("addTimer creates a timer with paused=false, finished=false", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    const t = result.current.timers[0];
    expect(t.label).toBe("Pasta");
    expect(t.duration).toBe(600);
    expect(t.remaining).toBe(600);
    expect(t.paused).toBe(false);
    expect(t.finished).toBe(false);
  });

  it("addTimer with startPaused=true creates a paused timer", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Simmer", 300, true); });
    const t = result.current.timers[0];
    expect(t.paused).toBe(true);
    expect(t.remaining).toBe(300);
  });

  it("editTimer restarts a running timer at the new duration and keeps it running", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Old Label", 600); });
    act(() => { vi.advanceTimersByTime(5000); }); // remaining = 595
    const id = result.current.timers[0].id;
    act(() => { result.current.editTimer(id, "New Label", 900); });
    const t = result.current.timers[0];
    expect(t.label).toBe("New Label");
    expect(t.duration).toBe(900);
    expect(t.remaining).toBe(900);
    expect(t.paused).toBe(false);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.timers[0].remaining).toBe(898); // still ticking
  });

  it("editTimer restarts a paused timer at the new duration and leaves it paused", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    const id = result.current.timers[0].id;
    act(() => { result.current.togglePause(id); });
    act(() => { result.current.editTimer(id, "Pasta", 900); });
    const t = result.current.timers[0];
    expect(t.remaining).toBe(900);
    expect(t.paused).toBe(true);
  });

  it("editTimer leaves the countdown alone when only the label changes", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Old Label", 600); });
    act(() => { vi.advanceTimersByTime(5000); }); // remaining = 595
    const id = result.current.timers[0].id;
    act(() => { result.current.editTimer(id, "New Label", 600); });
    const t = result.current.timers[0];
    expect(t.label).toBe("New Label");
    expect(t.remaining).toBe(595); // cooking progress preserved
    expect(t.paused).toBe(false);
  });

  it("editTimer stops a ringing timer at the new duration", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 1); });
    act(() => { vi.advanceTimersByTime(2000); }); // alarm: remaining 0, not dismissed
    const id = result.current.timers[0].id;
    expect(timerState(result.current.timers[0])).toBe("alarm");
    act(() => { result.current.editTimer(id, "Pasta", 60); });
    const t = result.current.timers[0];
    expect(t.remaining).toBe(60);
    expect(t.paused).toBe(true);
    expect(t.finished).toBe(false);
    expect(timerState(t)).toBe("paused");
  });

  it("editTimer stops a finished (dismissed) timer at the new duration", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 1); });
    act(() => { vi.advanceTimersByTime(2000); });
    const id = result.current.timers[0].id;
    act(() => { result.current.dismissTimer(id); });
    act(() => { result.current.editTimer(id, "Pasta", 60); });
    const t = result.current.timers[0];
    expect(t.remaining).toBe(60);
    expect(t.paused).toBe(true);
    expect(t.finished).toBe(false);
  });

  it("editTimer persists the restarted timer", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    act(() => { vi.advanceTimersByTime(5000); });
    const id = result.current.timers[0].id;
    act(() => { result.current.editTimer(id, "Pasta", 900); });
    const [stored] = loadTimers(RECIPE_HASH);
    expect(stored.duration).toBe(900);
    expect(stored.remaining).toBe(900);
  });

  it("togglePause pauses a running timer", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    const id = result.current.timers[0].id;
    act(() => { result.current.togglePause(id); });
    expect(result.current.timers[0].paused).toBe(true);
  });

  it("paused timer does not tick", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    const id = result.current.timers[0].id;
    act(() => { result.current.togglePause(id); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.timers[0].remaining).toBe(600);
  });

  it("resetTimer resets remaining to duration and keeps running timer running", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    act(() => { vi.advanceTimersByTime(10000); });
    const id = result.current.timers[0].id;
    act(() => { result.current.resetTimer(id); });
    const t = result.current.timers[0];
    expect(t.remaining).toBe(600);
    expect(t.paused).toBe(false);
    expect(t.finished).toBe(false);
  });

  it("resetTimer keeps paused timer paused", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    const id = result.current.timers[0].id;
    act(() => { result.current.togglePause(id); });
    act(() => { vi.advanceTimersByTime(5000); });
    act(() => { result.current.resetTimer(id); });
    expect(result.current.timers[0].remaining).toBe(600);
    expect(result.current.timers[0].paused).toBe(true);
  });

  it("resetTimer sets paused=true for a finished (dismissed) timer", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 1); });
    act(() => { vi.advanceTimersByTime(2000); });
    const id = result.current.timers[0].id;
    act(() => { result.current.dismissTimer(id); });
    act(() => { result.current.resetTimer(id); });
    const t = result.current.timers[0];
    expect(t.remaining).toBe(1);
    expect(t.paused).toBe(true);
    expect(t.finished).toBe(false);
  });

  it("dismissTimer sets finished=true without removing the timer", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 1); });
    act(() => { vi.advanceTimersByTime(2000); });
    const id = result.current.timers[0].id;
    act(() => { result.current.dismissTimer(id); });
    expect(result.current.timers).toHaveLength(1);
    expect(result.current.timers[0].finished).toBe(true);
  });

  it("removeTimer removes the timer", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); result.current.addTimer("Sauce", 300); });
    const id = result.current.timers[0].id;
    act(() => { result.current.removeTimer(id); });
    expect(result.current.timers).toHaveLength(1);
    expect(result.current.timers[0].label).toBe("Sauce");
  });

  it("resetAll resets all timers to original duration", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); result.current.addTimer("Sauce", 300); });
    act(() => { vi.advanceTimersByTime(10000); });
    act(() => { result.current.resetAll(); });
    expect(result.current.timers).toHaveLength(2);
    expect(result.current.timers[0].remaining).toBe(600);
    expect(result.current.timers[1].remaining).toBe(300);
    expect(result.current.timers[0].paused).toBe(false);
    expect(result.current.timers[0].finished).toBe(false);
  });

  it("resetAll preserves paused state for paused timers", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); result.current.addTimer("Sauce", 300); });
    const pausedId = result.current.timers[0].id;
    act(() => { result.current.togglePause(pausedId); });
    act(() => { vi.advanceTimersByTime(5000); });
    act(() => { result.current.resetAll(); });
    expect(result.current.timers[0].paused).toBe(true);
    expect(result.current.timers[1].paused).toBe(false);
  });

  it("resetAll sets paused=true for finished timers", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 1); });
    act(() => { vi.advanceTimersByTime(2000); });
    const id = result.current.timers[0].id;
    act(() => { result.current.dismissTimer(id); });
    act(() => { result.current.resetAll(); });
    expect(result.current.timers[0].paused).toBe(true);
    expect(result.current.timers[0].finished).toBe(false);
  });

  it("ticks remaining down every second for running timers", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 10); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.timers[0].remaining).toBe(7);
  });

  it("remaining does not go below 0", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Quick", 2); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.timers[0].remaining).toBe(0);
  });
});
