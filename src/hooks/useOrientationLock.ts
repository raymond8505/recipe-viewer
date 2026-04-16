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
    const orient = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (orient?.lock) {
      orient.lock("landscape-primary").catch(() => {
        // Not supported or not in fullscreen — ignore
      });
    }

    return () => {
      mql.removeEventListener("change", handler);
    };
  }, []);

  return { isPortrait };
}
