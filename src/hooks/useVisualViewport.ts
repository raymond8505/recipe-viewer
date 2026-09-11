import { useEffect, useState } from "react";

export interface ViewportRect {
  height: number;
  offsetTop: number;
}

type VisualViewportMetrics = Pick<VisualViewport, "height" | "offsetTop" | "scale">;

// Absorbs sub-pixel rounding between the two viewports' reported heights.
const HEIGHT_TOLERANCE_PX = 1;

/**
 * The visible part of the layout viewport, or `null` when all of it is visible.
 *
 * Only an unzoomed visual viewport counts: at `scale` 1, a visual viewport
 * shorter than the layout viewport means something (the on-screen keyboard)
 * covers the bottom of it. A pinch-zoomed one is shorter because it is
 * magnified, and fitting content to it would shrink the page under the zoom.
 */
export function visibleViewportRect(
  layoutHeight: number,
  vv: VisualViewportMetrics,
): ViewportRect | null {
  if (Math.abs(vv.scale - 1) > 0.01) return null;
  if (layoutHeight - vv.height <= HEIGHT_TOLERANCE_PX) return null;
  return { height: vv.height, offsetTop: vv.offsetTop };
}

/**
 * Tracks the area left visible when the on-screen keyboard is open.
 *
 * Android Chrome's default `interactive-widget=resizes-visual` shrinks only the
 * visual viewport for the keyboard, so `position: fixed` boxes and `svh`/`dvh`
 * heights stay full size and their bottom edge sits under the keyboard
 * (https://developer.chrome.com/blog/viewport-resize-behavior). A fixed
 * container sized to this rect keeps its content above the keyboard. `null`
 * means the whole layout viewport is visible, or the browser has no
 * `visualViewport`.
 */
export function useVisualViewport(): ViewportRect | null {
  const [rect, setRect] = useState<ViewportRect | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      const next = visibleViewportRect(window.innerHeight, vv!);
      // Scroll events fire continuously while the visual viewport pans; keep
      // the previous object when nothing moved so consumers don't re-render.
      setRect((prev) =>
        prev?.height === next?.height && prev?.offsetTop === next?.offsetTop
          ? prev
          : next,
      );
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return rect;
}
