"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { hashUrl } from "@/lib/hash";

export interface Timer {
  id: string;
  label: string;
  duration: number;  // total seconds
  remaining: number; // seconds remaining — derived from endsAt while running, authoritative otherwise
  paused: boolean;
  finished: boolean; // alarm has been dismissed (done but acknowledged)
  // Epoch ms the countdown hits zero. Non-null exactly when the timer is running (see
  // withDeadline), which is what lets a timer survive cook mode closing, the tab being killed,
  // or the phone sleeping: the deadline is written when the countdown starts, so no shutdown
  // event has to fire for the elapsed time to be recovered on the way back in.
  endsAt: number | null;
}

// How far past its deadline a timer can be found and still deserve the cook's acknowledgement.
// Past this, it comes back already dismissed — see reconcileTimer.
export const ALARM_GRACE_MS = 10_000;

// Timer state helpers
export function timerState(t: Timer): "running" | "paused" | "alarm" | "finished" {
  if (t.remaining === 0) return t.finished ? "finished" : "alarm";
  return t.paused ? "paused" : "running";
}

// Re-derive endsAt from a timer's own state. Every mutation ends with this — it is what keeps
// the invariant "endsAt is non-null exactly when timerState() is 'running'" true.
function withDeadline(t: Timer, now: number): Timer {
  const running = !t.paused && !t.finished && t.remaining > 0;
  return { ...t, endsAt: running ? now + t.remaining * 1000 : null };
}

// Bring a timer up to date with the wall clock. Pure — whether this should make a sound is the
// caller's call, because the answer depends on whether anyone was watching.
export function reconcileTimer(t: Timer, now: number): Timer {
  if (t.endsAt === null) return t; // paused/ringing/finished — the wall clock is irrelevant
  const msLeft = t.endsAt - now;
  if (msLeft > 0) return { ...t, remaining: Math.ceil(msLeft / 1000) };
  // Past the deadline. Inside the grace window the cook hasn't had a chance to react yet, so it
  // still needs acknowledging; well past it, ringing is stale news — land it already dismissed.
  return { ...t, remaining: 0, endsAt: null, finished: -msLeft >= ALARM_GRACE_MS };
}

// What the edit modal pre-fills for a timer. A running timer is edited from the time left on
// its clock — that is the number the cook is looking at — everything else from its duration.
export function editorSeconds(t: Timer): number {
  return timerState(t) === "running" ? t.remaining : t.duration;
}

type TimerStore = Record<string, Timer[]>;

// What may actually be sitting in localStorage: rows written by older builds are missing the
// fields those builds didn't have yet.
type StoredTimer = Omit<Timer, "paused" | "finished" | "endsAt"> &
  Partial<Pick<Timer, "paused" | "finished" | "endsAt">>;

const STORAGE_KEY = "cookingTimers";

export function loadTimers(recipeHash: string): Timer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const store: unknown = JSON.parse(raw);
    if (typeof store !== "object" || store === null || Array.isArray(store)) return [];
    const bucket = (store as Record<string, unknown>)[recipeHash];
    if (!Array.isArray(bucket)) return [];
    const now = Date.now();
    // Normalize: backfill paused/finished for timers saved before these fields existed
    return bucket
      .filter((t): t is StoredTimer => typeof t === "object" && t !== null && "id" in t && "duration" in t && "remaining" in t)
      .map((t) => {
        const normalized: Timer = {
          ...t,
          paused: t.paused ?? false,
          finished: t.finished ?? false,
          endsAt: t.endsAt ?? null,
        };
        // Rows written before deadlines existed froze their countdown whenever cook mode closed,
        // so `remaining` is the last thing the cook saw. Dating the deadline from now resumes
        // them exactly there — the old behaviour — rather than back-dating them and finding
        // every timer expired on the first load after this ships.
        return t.endsAt === undefined ? withDeadline(normalized, now) : normalized;
      });
  } catch {
    return [];
  }
}

export function saveTimers(recipeHash: string, timers: Timer[]): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const store: TimerStore = raw ? JSON.parse(raw) : {};
    store[recipeHash] = timers;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage may be unavailable
  }
}

// Module-level so only one alarm loop runs at a time
let alarmLoopId: ReturnType<typeof setInterval> | null = null;

function beep(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [0, 0.4, 0.8].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.3);
      osc.start(now + offset);
      osc.stop(now + offset + 0.3);
    });
    setTimeout(() => ctx.close(), 1400);
  } catch {
    // Audio may be unavailable
  }
}

export function playAlarm(): void {
  if (alarmLoopId !== null) return;
  beep();
  alarmLoopId = setInterval(beep, 3000);
}

export function stopAlarm(): void {
  if (alarmLoopId !== null) {
    clearInterval(alarmLoopId);
    alarmLoopId = null;
  }
}

function hasActiveAlarm(timers: Timer[]): boolean {
  return timers.some((t) => t.remaining === 0 && !t.finished);
}

export function useTimers(recipeUrl: string) {
  const recipeHash = hashUrl(recipeUrl);
  // Reconcile in the initialiser so the very first paint shows the true time left, rather than
  // flashing whatever was on the clock when the cook last closed cook mode.
  const [timers, setTimers] = useState<Timer[]>(() =>
    loadTimers(recipeHash).map((t) => reconcileTimer(t, Date.now()))
  );
  const hashRef = useRef(recipeHash);
  hashRef.current = recipeHash;

  // Re-sync when the recipe URL changes (recipeHash changes between renders). This also runs on
  // mount, where writing the settled timers straight back is the point: the initialiser above
  // only reconciled in memory, so without this a second visit would re-derive from the same
  // stale deadline and could reach a different verdict about whether it is still worth ringing.
  useEffect(() => {
    const settled = loadTimers(recipeHash).map((t) => reconcileTimer(t, Date.now()));
    saveTimers(recipeHash, settled);
    setTimers(settled);
  }, [recipeHash]);

  // Advance timers against the wall clock, but only while the page is on screen. Ticking a
  // hidden page buys nothing — browsers throttle the interval to about once a minute anyway —
  // and stopping means every transition happens either on a live tick or on the catch-up when
  // the page comes back, with no third path where a late tick strands a timer mid-alarm.
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // `ring` is false for the catch-up: a timer that ended while nobody was looking must never
    // start beeping of its own accord. It comes back as a silent visual alert instead.
    function sync(ring: boolean) {
      setTimers((prev) => {
        const now = Date.now();
        const updated = prev.map((t) => reconcileTimer(t, now));
        // reconcileTimer returns the same object for anything not running, so this skips both
        // the re-render and the storage write when there is nothing to count down.
        if (updated.every((t, i) => t === prev[i])) return prev;
        const newlyDone = updated.some(
          (t, i) => prev[i].endsAt !== null && t.endsAt === null && !t.finished
        );
        if (ring && newlyDone) playAlarm();
        saveTimers(hashRef.current, updated);
        return updated;
      });
    }

    function start() {
      if (intervalId === null) intervalId = setInterval(() => sync(true), 1000);
    }
    function stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        sync(false);
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // The alarm loop is module-level, so without this it would go on beeping after cook mode
      // closes with no UI left to dismiss it.
      stopAlarm();
    };
  }, []);

  const addTimer = useCallback((label: string, duration: number, startPaused = false): string => {
    const id = crypto.randomUUID();
    const newTimer = withDeadline(
      { id, label, duration, remaining: duration, paused: startPaused, finished: false, endsAt: null },
      Date.now()
    );
    setTimers((prev) => {
      const updated = [...prev, newTimer];
      saveTimers(hashRef.current, updated);
      return updated;
    });
    return id;
  }, []);

  // A new duration restarts the timer at it, preserving running/stopped state — otherwise the
  // edit is invisible until the next reset. A timer that had already hit zero (ringing or
  // dismissed) comes back stopped, so nothing silently starts counting down.
  // `duration: null` is a label-only edit: it leaves the duration, the countdown and any
  // ringing alarm alone. Only the caller knows whether the user touched the duration field
  // (the modal pre-fills from `editorSeconds`, which is `remaining` for a running timer), so
  // that decision is passed in rather than inferred from the value.
  const editTimer = useCallback((id: string, label: string, duration: number | null) => {
    setTimers((prev) => {
      const now = Date.now();
      const updated = prev.map((t) => {
        if (t.id !== id) return t;
        // A label-only edit leaves the deadline alone along with the countdown.
        if (duration === null) return { ...t, label };
        return withDeadline(
          {
            ...t,
            label,
            duration,
            remaining: duration,
            paused: t.remaining === 0 ? true : t.paused,
            finished: false,
          },
          now
        );
      });
      saveTimers(hashRef.current, updated);
      if (!hasActiveAlarm(updated)) stopAlarm();
      return updated;
    });
  }, []);

  const togglePause = useCallback((id: string) => {
    setTimers((prev) => {
      const now = Date.now();
      const updated = prev.map((t) =>
        // Freeze the countdown off the deadline before dropping it — `remaining` is only
        // refreshed once a second, so pausing without this throws away up to a second.
        t.id === id ? withDeadline({ ...reconcileTimer(t, now), paused: !t.paused }, now) : t
      );
      saveTimers(hashRef.current, updated);
      return updated;
    });
  }, []);

  // Reset a single timer to its full duration, preserving running/paused state.
  // Finished (dismissed) timers reset to paused so the user can start them manually.
  const resetTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const now = Date.now();
      const updated = prev.map((t) =>
        t.id === id
          ? withDeadline(
              { ...t, remaining: t.duration, paused: t.finished ? true : t.paused, finished: false },
              now
            )
          : t
      );
      saveTimers(hashRef.current, updated);
      if (!hasActiveAlarm(updated)) stopAlarm();
      return updated;
    });
  }, []);

  // Acknowledge a done timer's alarm without removing it
  const dismissTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const now = Date.now();
      const updated = prev.map((t) =>
        t.id === id ? withDeadline({ ...t, finished: true }, now) : t
      );
      saveTimers(hashRef.current, updated);
      if (!hasActiveAlarm(updated)) stopAlarm();
      return updated;
    });
  }, []);

  const removeTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      saveTimers(hashRef.current, updated);
      if (!hasActiveAlarm(updated)) stopAlarm();
      return updated;
    });
  }, []);

  const removeTimers = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setTimers((prev) => {
      const updated = prev.filter((t) => !idSet.has(t.id));
      saveTimers(hashRef.current, updated);
      if (!hasActiveAlarm(updated)) stopAlarm();
      return updated;
    });
  }, []);

  const resetAll = useCallback(() => {
    setTimers((prev) => {
      const now = Date.now();
      const updated = prev.map((t) =>
        withDeadline(
          { ...t, remaining: t.duration, paused: t.finished ? true : t.paused, finished: false },
          now
        )
      );
      saveTimers(hashRef.current, updated);
      stopAlarm();
      return updated;
    });
  }, []);

  return { timers, addTimer, editTimer, togglePause, resetTimer, dismissTimer, removeTimer, removeTimers, resetAll };
}
