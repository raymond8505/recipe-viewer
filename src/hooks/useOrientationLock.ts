"use client";

import { useState, useEffect } from "react";

export function useOrientationLock(): { isPortrait: boolean } {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(orientation: portrait)");
    setIsPortrait(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mql.addEventListener("change", handler);

    // Best-effort: lock to landscape if API available (only works in fullscreen on most browsers)
    if ("orientation" in screen && "lock" in screen.orientation) {
      screen.orientation.lock("landscape-primary").catch(() => {
        // Not supported or not in fullscreen — ignore
      });
    }

    return () => {
      mql.removeEventListener("change", handler);
    };
  }, []);

  return { isPortrait };
}
