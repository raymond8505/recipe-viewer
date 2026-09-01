"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { hashUrl } from "@/lib/hash";

export interface Timer {
  id: string;
  label: string;
  duration: number;  // total seconds
  remaining: number; // seconds remaining
  paused: boolean;
  finished: boolean; // alarm has been dismissed (done but acknowledged)
}

// Timer state helpers
export function timerState(t: Timer): "running" | "paused" | "alarm" | "finished" {
  if (t.remaining === 0) return t.finished ? "finished" : "alarm";
  return t.paused ? "paused" : "running";
}

// What the edit modal pre-fills for a timer. A running timer is edited from the time left on
// its clock — that is the number the cook is looking at — everything else from its duration.
export function editorSeconds(t: Timer): number {
  return timerState(t) === "running" ? t.remaining : t.duration;
}

type TimerStore = Record<string, Timer[]>;

const STORAGE_KEY = "cookingTimers";

export function loadTimers(recipeHash: string): Timer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const store: unknown = JSON.parse(raw);
    if (typeof store !== "object" || store === null || Array.isArray(store)) return [];
    const bucket = (store as Record<string, unknown>)[recipeHash];
    if (!Array.isArray(bucket)) return [];
    // Normalize: backfill paused/finished for timers saved before these fields existed
    return bucket
      .filter((t): t is Timer => typeof t === "object" && t !== null && "id" in t && "duration" in t && "remaining" in t)
      .map((t) => ({
        ...t,
        paused: t.paused ?? false,
        finished: t.finished ?? false,
      }));
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
  const [timers, setTimers] = useState<Timer[]>(() => loadTimers(recipeHash));
  const hashRef = useRef(recipeHash);
  hashRef.current = recipeHash;

  // Re-sync when the recipe URL changes (recipeHash changes between renders)
  useEffect(() => {
    setTimers(loadTimers(recipeHash));
  }, [recipeHash]);

  // Tick running timers every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((prev) => {
        const updated = prev.map((t) =>
          t.remaining > 0 && !t.paused ? { ...t, remaining: t.remaining - 1 } : t
        );
        const newlyDone = updated.filter(
          (t, i) => t.remaining === 0 && prev[i].remaining === 1
        );
        if (newlyDone.length > 0) playAlarm();
        saveTimers(hashRef.current, updated);
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const addTimer = useCallback((label: string, duration: number, startPaused = false): string => {
    const id = crypto.randomUUID();
    const newTimer: Timer = {
      id,
      label,
      duration,
      remaining: duration,
      paused: startPaused,
      finished: false,
    };
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
      const updated = prev.map((t) => {
        if (t.id !== id) return t;
        if (duration === null) return { ...t, label };
        return {
          ...t,
          label,
          duration,
          remaining: duration,
          paused: t.remaining === 0 ? true : t.paused,
          finished: false,
        };
      });
      saveTimers(hashRef.current, updated);
      if (!hasActiveAlarm(updated)) stopAlarm();
      return updated;
    });
  }, []);

  const togglePause = useCallback((id: string) => {
    setTimers((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, paused: !t.paused } : t));
      saveTimers(hashRef.current, updated);
      return updated;
    });
  }, []);

  // Reset a single timer to its full duration, preserving running/paused state.
  // Finished (dismissed) timers reset to paused so the user can start them manually.
  const resetTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const updated = prev.map((t) =>
        t.id === id
          ? { ...t, remaining: t.duration, paused: t.finished ? true : t.paused, finished: false }
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
      const updated = prev.map((t) => (t.id === id ? { ...t, finished: true } : t));
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
      const updated = prev.map((t) => ({
        ...t,
        remaining: t.duration,
        paused: t.finished ? true : t.paused,
        finished: false,
      }));
      saveTimers(hashRef.current, updated);
      stopAlarm();
      return updated;
    });
  }, []);

  return { timers, addTimer, editTimer, togglePause, resetTimer, dismissTimer, removeTimer, removeTimers, resetAll };
}
