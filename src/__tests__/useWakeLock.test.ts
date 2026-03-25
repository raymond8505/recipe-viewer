import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWakeLock } from "@/hooks/useWakeLock";

const mockRelease = vi.fn().mockResolvedValue(undefined);
const mockSentinel = { release: mockRelease };
const mockRequest = vi.fn().mockResolvedValue(mockSentinel);

beforeEach(() => {
  mockRelease.mockClear();
  mockRequest.mockClear();
  vi.stubGlobal("navigator", { ...navigator, wakeLock: { request: mockRequest } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWakeLock", () => {
  it("requests a screen wake lock on mount", async () => {
    const { unmount } = renderHook(() => useWakeLock());
    // flush microtasks so the async acquire resolves
    await vi.waitFor(() => expect(mockRequest).toHaveBeenCalledWith("screen"));
    unmount();
  });

  it("releases the lock on unmount", async () => {
    const { unmount } = renderHook(() => useWakeLock());
    await vi.waitFor(() => expect(mockRequest).toHaveBeenCalled());
    unmount();
    expect(mockRelease).toHaveBeenCalled();
  });

  it("re-acquires the lock when the page becomes visible", async () => {
    renderHook(() => useWakeLock());
    await vi.waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));

    // Simulate page becoming visible again (e.g. user switches back from another tab)
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
  });

  it("silently no-ops when wake lock is not supported", () => {
    vi.stubGlobal("navigator", {});
    expect(() => renderHook(() => useWakeLock())).not.toThrow();
  });

  it("does not throw when request is rejected", async () => {
    mockRequest.mockRejectedValueOnce(new DOMException("NotAllowedError"));
    expect(() => renderHook(() => useWakeLock())).not.toThrow();
    // Let the rejected promise settle without unhandled rejection
    await vi.waitFor(() => expect(mockRequest).toHaveBeenCalled());
  });
});
