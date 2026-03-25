import { useEffect, useRef } from "react";

/**
 * Requests a screen wake lock for the duration of the component's life.
 * Automatically re-acquires if the lock is released when the page is hidden
 * and then becomes visible again (the browser drops wake locks on hide).
 * Silently no-ops on browsers that don't support the Wake Lock API.
 */
export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    let active = true;

    async function acquire() {
      if (!active) return;
      try {
        lockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Permission denied or other transient error — ignore
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") acquire();
    }

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, []);
}
