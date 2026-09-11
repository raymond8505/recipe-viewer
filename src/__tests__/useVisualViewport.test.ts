import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVisualViewport, visibleViewportRect } from "@/hooks/useVisualViewport";
import { FakeVisualViewport } from "@/fixtures/visualViewport";

const LAYOUT_HEIGHT = 800;

describe("visibleViewportRect", () => {
  it("is null when the visual viewport covers the whole layout viewport", () => {
    expect(visibleViewportRect(LAYOUT_HEIGHT, { height: 800, offsetTop: 0, scale: 1 })).toBeNull();
  });

  it("ignores a sub-pixel difference between the two heights", () => {
    expect(visibleViewportRect(LAYOUT_HEIGHT, { height: 799.5, offsetTop: 0, scale: 1 })).toBeNull();
  });

  it("returns the visible rect when the keyboard covers the bottom", () => {
    expect(visibleViewportRect(LAYOUT_HEIGHT, { height: 450, offsetTop: 0, scale: 1 })).toEqual({
      height: 450,
      offsetTop: 0,
    });
  });

  it("carries the visual viewport's pan offset", () => {
    expect(visibleViewportRect(LAYOUT_HEIGHT, { height: 450, offsetTop: 120, scale: 1 })).toEqual({
      height: 450,
      offsetTop: 120,
    });
  });

  it("is null while pinch-zoomed, even though the visual viewport is shorter", () => {
    expect(visibleViewportRect(LAYOUT_HEIGHT, { height: 400, offsetTop: 0, scale: 2 })).toBeNull();
  });
});

describe("useVisualViewport", () => {
  let vv: FakeVisualViewport;

  beforeEach(() => {
    vv = new FakeVisualViewport(LAYOUT_HEIGHT);
    vi.stubGlobal("visualViewport", vv);
    vi.stubGlobal("innerHeight", LAYOUT_HEIGHT);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is null while the whole layout viewport is visible", () => {
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toBeNull();
  });

  it("reports the visible rect when the keyboard opens", () => {
    const { result } = renderHook(() => useVisualViewport());
    act(() => vv.set({ height: 450 }));
    expect(result.current).toEqual({ height: 450, offsetTop: 0 });
  });

  it("reads a keyboard that is already open on mount", () => {
    vv.height = 450;
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toEqual({ height: 450, offsetTop: 0 });
  });

  it("follows the visual viewport as it pans", () => {
    const { result } = renderHook(() => useVisualViewport());
    act(() => vv.set({ height: 450 }));
    act(() => vv.set({ offsetTop: 120 }, "scroll"));
    expect(result.current).toEqual({ height: 450, offsetTop: 120 });
  });

  it("returns to null when the keyboard closes", () => {
    const { result } = renderHook(() => useVisualViewport());
    act(() => vv.set({ height: 450 }));
    act(() => vv.set({ height: LAYOUT_HEIGHT }));
    expect(result.current).toBeNull();
  });

  it("keeps the same rect object when a scroll event moves nothing", () => {
    const { result } = renderHook(() => useVisualViewport());
    act(() => vv.set({ height: 450 }));
    const before = result.current;
    act(() => vv.set({}, "scroll"));
    expect(result.current).toBe(before);
  });

  it("stops listening on unmount", () => {
    const remove = vi.spyOn(vv, "removeEventListener");
    const { unmount } = renderHook(() => useVisualViewport());
    unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("is null when the browser has no visualViewport", () => {
    vi.stubGlobal("visualViewport", undefined);
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toBeNull();
  });
});
