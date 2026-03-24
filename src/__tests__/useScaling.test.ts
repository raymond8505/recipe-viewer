import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScaling } from "@/hooks/useScaling";

describe("useScaling", () => {
  it("starts with scale=1 and correct original servings", () => {
    const { result } = renderHook(() => useScaling("4 servings"));
    expect(result.current.scale).toBe(1);
    expect(result.current.originalServings).toBe(4);
    expect(result.current.servings).toBe(4);
  });

  it("setServings doubles scale when servings doubled", () => {
    const { result } = renderHook(() => useScaling("4 servings"));
    act(() => result.current.setServings(8));
    expect(result.current.scale).toBeCloseTo(2);
    expect(result.current.servings).toBe(8);
  });

  it("setServings halves scale when servings halved", () => {
    const { result } = renderHook(() => useScaling("4 servings"));
    act(() => result.current.setServings(2));
    expect(result.current.scale).toBeCloseTo(0.5);
    expect(result.current.servings).toBe(2);
  });

  it("servings clamps to minimum 1", () => {
    const { result } = renderHook(() => useScaling("4 servings"));
    act(() => result.current.setScale(0.001));
    expect(result.current.servings).toBe(1);
  });

  it("setServings ignores zero and negative values", () => {
    const { result } = renderHook(() => useScaling("4 servings"));
    act(() => result.current.setServings(0));
    expect(result.current.scale).toBe(1);
    act(() => result.current.setServings(-2));
    expect(result.current.scale).toBe(1);
  });

  it("returns null servings when yield is unparseable", () => {
    const { result } = renderHook(() => useScaling("a few"));
    expect(result.current.originalServings).toBeNull();
    expect(result.current.servings).toBeNull();
  });

  it("returns null servings when yield is undefined", () => {
    const { result } = renderHook(() => useScaling(undefined));
    expect(result.current.servings).toBeNull();
    expect(result.current.scale).toBe(1);
  });

  it("setScale directly updates scale", () => {
    const { result } = renderHook(() => useScaling("4 servings"));
    act(() => result.current.setScale(3));
    expect(result.current.scale).toBe(3);
    expect(result.current.servings).toBe(12);
  });
});
