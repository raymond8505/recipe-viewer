import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useTimers,
  loadTimers,
  saveTimers,
  stopAlarm,
  timerState,
  editorSeconds,
  reconcileTimer,
  ALARM_GRACE_MS,
} from "@/hooks/useTimers";
import type { Timer } from "@/hooks/useTimers";
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
// Constructing an AudioContext is the first thing beep() does, so this doubles as the probe for
// "did anything make a sound" — the load-bearing assertion for the never-ring-on-return rule.
const audioContext = vi.fn(() => mockCtx);
vi.stubGlobal("AudioContext", audioContext);

const RECIPE_URL = "https://example.com/recipe/pasta";
const RECIPE_HASH = hashUrl(RECIPE_URL);

const makeStoredTimer = (overrides: Partial<Timer> = {}): Timer => ({
  id: "t1", label: "Pasta", duration: 600, remaining: 600,
  paused: false, finished: false, endsAt: null, ...overrides,
});

function stubVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

function setVisibility(state: "visible" | "hidden") {
  stubVisibility(state);
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); audioContext.mockClear(); });
// Reset the stub without dispatching: RTL's cleanup runs after this hook, so a real event here
// would reach a still-mounted hook and update state outside act().
afterEach(() => { stopAlarm(); vi.useRealTimers(); stubVisibility("visible"); });

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

describe("editorSeconds", () => {
  it("uses the time left for a running timer", () => {
    expect(editorSeconds(makeStoredTimer({ remaining: 245 }))).toBe(245);
  });
  it("uses the full duration for a paused timer", () => {
    expect(editorSeconds(makeStoredTimer({ remaining: 245, paused: true }))).toBe(600);
  });
  it("uses the full duration for a ringing timer", () => {
    expect(editorSeconds(makeStoredTimer({ remaining: 0 }))).toBe(600);
  });
  it("uses the full duration for a finished timer", () => {
    expect(editorSeconds(makeStoredTimer({ remaining: 0, finished: true }))).toBe(600);
  });
});

describe("reconcileTimer", () => {
  const NOW = 1_000_000;

  it("derives remaining from the deadline while it is still in the future", () => {
    const t = reconcileTimer(makeStoredTimer({ endsAt: NOW + 245_400 }), NOW);
    expect(t.remaining).toBe(246); // rounds up — 245.4s left still reads as 4:06
    expect(t.endsAt).toBe(NOW + 245_400);
  });

  it("rings a timer found just past its deadline", () => {
    const t = reconcileTimer(makeStoredTimer({ endsAt: NOW - 3_000 }), NOW);
    expect(timerState(t)).toBe("alarm");
    expect(t.remaining).toBe(0);
    expect(t.endsAt).toBeNull();
  });

  it("returns a long-expired timer already dismissed", () => {
    const t = reconcileTimer(makeStoredTimer({ endsAt: NOW - 30_000 }), NOW);
    expect(timerState(t)).toBe("finished");
  });

  it("treats exactly the grace window as too late to ring", () => {
    expect(timerState(reconcileTimer(makeStoredTimer({ endsAt: NOW - ALARM_GRACE_MS }), NOW)))
      .toBe("finished");
    expect(timerState(reconcileTimer(makeStoredTimer({ endsAt: NOW - (ALARM_GRACE_MS - 1) }), NOW)))
      .toBe("alarm");
  });

  it("leaves a deadline-less timer untouched", () => {
    const paused = makeStoredTimer({ remaining: 245, paused: true, endsAt: null });
    expect(reconcileTimer(paused, NOW + 9_999_999)).toBe(paused);
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

  it("dates a deadline-less running timer from now, so it resumes rather than expires", () => {
    // Rows written before endsAt existed froze at whatever the cook last saw. Back-dating them
    // would expire every timer in storage the first time this build loads.
    const raw = JSON.stringify({ [RECIPE_HASH]: [{ id: "x", label: "Old", duration: 60, remaining: 30 }] });
    localStorage.setItem("cookingTimers", raw);
    const [t] = loadTimers(RECIPE_HASH);
    expect(t.endsAt).toBe(Date.now() + 30_000);
    expect(reconcileTimer(t, Date.now()).remaining).toBe(30);
  });

  it("leaves a deadline-less paused timer without a deadline", () => {
    const raw = JSON.stringify({
      [RECIPE_HASH]: [{ id: "x", label: "Old", duration: 60, remaining: 30, paused: true }],
    });
    localStorage.setItem("cookingTimers", raw);
    expect(loadTimers(RECIPE_HASH)[0].endsAt).toBeNull();
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

  it("editTimer with a null duration leaves the countdown alone (label-only edit)", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Old Label", 600); });
    act(() => { vi.advanceTimersByTime(5000); }); // remaining = 595
    const id = result.current.timers[0].id;
    act(() => { result.current.editTimer(id, "New Label", null); });
    const t = result.current.timers[0];
    expect(t.label).toBe("New Label");
    expect(t.duration).toBe(600);
    expect(t.remaining).toBe(595); // cooking progress preserved
    expect(t.paused).toBe(false);
  });

  it("editTimer restarts even when the new duration equals the stored one", () => {
    // A running timer is edited from its remaining time, so re-submitting the full duration
    // is a real change the cook made — it must not be mistaken for an untouched field.
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    act(() => { vi.advanceTimersByTime(5000); }); // remaining = 595
    const id = result.current.timers[0].id;
    act(() => { result.current.editTimer(id, "Pasta", 600); });
    expect(result.current.timers[0].remaining).toBe(600);
  });

  it("editTimer with a null duration leaves a ringing alarm ringing", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 1); });
    act(() => { vi.advanceTimersByTime(2000); });
    const id = result.current.timers[0].id;
    act(() => { result.current.editTimer(id, "Renamed", null); });
    const t = result.current.timers[0];
    expect(t.label).toBe("Renamed");
    expect(timerState(t)).toBe("alarm");
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

  it("gives a running timer a deadline and a paused one none", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    act(() => { result.current.addTimer("Simmer", 300, true); });
    expect(result.current.timers[0].endsAt).toBe(Date.now() + 600_000);
    expect(result.current.timers[1].endsAt).toBeNull();
  });

  it("keeps the deadline aligned with the clock the cook sees when pausing and resuming", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    const id = result.current.timers[0].id;
    act(() => { vi.advanceTimersByTime(5000); });
    act(() => { result.current.togglePause(id); });
    expect(result.current.timers[0].remaining).toBe(595);
    expect(result.current.timers[0].endsAt).toBeNull();
    act(() => { vi.advanceTimersByTime(60_000); }); // paused time must not count
    act(() => { result.current.togglePause(id); });
    expect(result.current.timers[0].remaining).toBe(595);
    expect(result.current.timers[0].endsAt).toBe(Date.now() + 595_000);
  });
});

// The point of the feature: a cook who fumbles cook mode closed comes back to timers where
// physics left them, and never to a noise they didn't ask for.
describe("useTimers — time away from the page", () => {
  it("counts down time spent with cook mode closed", () => {
    saveTimers(RECIPE_HASH, [makeStoredTimer({ endsAt: Date.now() + 600_000 })]);
    act(() => { vi.advanceTimersByTime(120_000); }); // cook mode is not mounted for this stretch
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    expect(result.current.timers[0].remaining).toBe(480);
    expect(timerState(result.current.timers[0])).toBe("running");
  });

  it("comes back ringing, but silent, when a timer ended moments ago", () => {
    saveTimers(RECIPE_HASH, [makeStoredTimer({ endsAt: Date.now() - 3_000 })]);
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    expect(timerState(result.current.timers[0])).toBe("alarm");
    expect(audioContext).not.toHaveBeenCalled();
  });

  it("comes back already dismissed when a timer ended long ago", () => {
    saveTimers(RECIPE_HASH, [makeStoredTimer({ endsAt: Date.now() - 30_000 })]);
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    expect(timerState(result.current.timers[0])).toBe("finished");
    expect(audioContext).not.toHaveBeenCalled();
  });

  it("persists what it reconciled, so a second visit agrees with the first", () => {
    saveTimers(RECIPE_HASH, [makeStoredTimer({ endsAt: Date.now() - 3_000 })]);
    renderHook(() => useTimers(RECIPE_URL));
    const [stored] = loadTimers(RECIPE_HASH);
    expect(stored.remaining).toBe(0);
    expect(stored.endsAt).toBeNull();
    expect(stored.finished).toBe(false);
  });

  it("leaves a paused timer alone no matter how long the cook is away", () => {
    saveTimers(RECIPE_HASH, [makeStoredTimer({ remaining: 245, paused: true })]);
    act(() => { vi.advanceTimersByTime(3_600_000); });
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    expect(result.current.timers[0].remaining).toBe(245);
    expect(timerState(result.current.timers[0])).toBe("paused");
  });

  it("does not tick while the page is hidden, then catches up when it returns", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 600); });
    act(() => { setVisibility("hidden"); });
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(result.current.timers[0].remaining).toBe(600); // no work done off-screen
    act(() => { setVisibility("visible"); });
    expect(result.current.timers[0].remaining).toBe(480); // but no time lost either
  });

  it("does not ring for a timer that expired while the page was hidden", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Pasta", 5); });
    act(() => { setVisibility("hidden"); });
    act(() => { vi.advanceTimersByTime(8_000); }); // ended 3s ago — inside the grace window
    act(() => { setVisibility("visible"); });
    expect(timerState(result.current.timers[0])).toBe("alarm");
    expect(audioContext).not.toHaveBeenCalled();
  });

  it("still rings for a timer that expires while the cook is watching", () => {
    const { result } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Quick", 2); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(timerState(result.current.timers[0])).toBe("alarm");
    expect(audioContext).toHaveBeenCalled();
  });

  it("stops the alarm when cook mode closes mid-ring", () => {
    const { result, unmount } = renderHook(() => useTimers(RECIPE_URL));
    act(() => { result.current.addTimer("Quick", 2); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(audioContext).toHaveBeenCalled();
    unmount();
    audioContext.mockClear();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(audioContext).not.toHaveBeenCalled();
  });
});
