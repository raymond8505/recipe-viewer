/**
 * A `window.visualViewport` stand-in — jsdom implements none. Install it with
 * `vi.stubGlobal("visualViewport", vv)`, then drive it with `set`.
 */
export class FakeVisualViewport extends EventTarget {
  height: number;
  offsetTop = 0;
  scale = 1;

  constructor(height: number) {
    super();
    this.height = height;
  }

  /** Applies `metrics` and fires `event`, as the browser does when the keyboard opens or the viewport pans. */
  set(
    metrics: Partial<Pick<FakeVisualViewport, "height" | "offsetTop" | "scale">>,
    event: "resize" | "scroll" = "resize",
  ) {
    Object.assign(this, metrics);
    this.dispatchEvent(new Event(event));
  }
}
