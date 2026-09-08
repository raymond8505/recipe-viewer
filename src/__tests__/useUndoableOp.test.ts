import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoableOp } from "@/hooks/useUndoableOp";
import type { RecipeDocument } from "@/types/recipe";

// The value is a whole document, not just a schema: a re-scrape replaces the
// ingredients too, and undo has to bring both halves back together.
const times = { prep_time: null, cook_time: null, total_time: null };
const current: RecipeDocument = { schema: { name: "Before" }, ingredients: [], ...times };
const produced: RecipeDocument = { schema: { name: "After" }, ingredients: [], ...times };

describe("useUndoableOp", () => {
  it("starts idle with no review buffer", () => {
    const { result } = renderHook(() =>
      useUndoableOp<RecipeDocument>(async () => produced),
    );
    expect(result.current.state).toBe("idle");
    expect(result.current.isReview).toBe(false);
  });

  it("run applies the produced value and captures the previous one", async () => {
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useUndoableOp<RecipeDocument>(async () => produced),
    );
    await act(async () => {
      await result.current.run(current, onApply);
    });
    expect(onApply).toHaveBeenCalledWith(produced);
    expect(result.current.state).toBe("success");
    expect(result.current.isReview).toBe(true);
    expect(result.current.previous).toBe(current);
  });

  it("run transitions to error and applies nothing on failure", async () => {
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useUndoableOp<RecipeDocument>(async () => {
        throw new Error("network");
      }),
    );
    await act(async () => {
      await result.current.run(current, onApply);
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(result.current.state).toBe("error");
    expect(result.current.isReview).toBe(false);
  });

  it("undo reverts to the captured value and clears the buffer", async () => {
    const onRevert = vi.fn();
    const { result } = renderHook(() =>
      useUndoableOp<RecipeDocument>(async () => produced),
    );
    await act(async () => {
      await result.current.run(current, vi.fn());
    });
    act(() => result.current.undo(onRevert));
    expect(onRevert).toHaveBeenCalledWith(current);
    expect(result.current.isReview).toBe(false);
    expect(result.current.state).toBe("idle");
  });

  it("clear drops the buffer without reverting", async () => {
    const { result } = renderHook(() =>
      useUndoableOp<RecipeDocument>(async () => produced),
    );
    await act(async () => {
      await result.current.run(current, vi.fn());
    });
    act(() => result.current.clear());
    expect(result.current.isReview).toBe(false);
    expect(result.current.state).toBe("idle");
  });
});
