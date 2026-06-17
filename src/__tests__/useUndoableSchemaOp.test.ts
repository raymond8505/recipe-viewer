import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoableSchemaOp } from "@/hooks/useUndoableSchemaOp";
import type { SchemaRecipe } from "@/types/recipe";

const current: SchemaRecipe = { name: "Before" };
const produced: SchemaRecipe = { name: "After" };

describe("useUndoableSchemaOp", () => {
  it("starts idle with no review buffer", () => {
    const { result } = renderHook(() =>
      useUndoableSchemaOp(async () => produced),
    );
    expect(result.current.state).toBe("idle");
    expect(result.current.isReview).toBe(false);
  });

  it("run applies the produced schema and captures the previous one", async () => {
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useUndoableSchemaOp(async () => produced),
    );
    await act(async () => {
      await result.current.run(current, onApply);
    });
    expect(onApply).toHaveBeenCalledWith(produced);
    expect(result.current.state).toBe("success");
    expect(result.current.isReview).toBe(true);
    expect(result.current.preSchema).toBe(current);
  });

  it("run transitions to error and applies nothing on failure", async () => {
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useUndoableSchemaOp(async () => {
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

  it("undo reverts to the captured schema and clears the buffer", async () => {
    const onRevert = vi.fn();
    const { result } = renderHook(() =>
      useUndoableSchemaOp(async () => produced),
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
      useUndoableSchemaOp(async () => produced),
    );
    await act(async () => {
      await result.current.run(current, vi.fn());
    });
    act(() => result.current.clear());
    expect(result.current.isReview).toBe(false);
    expect(result.current.state).toBe("idle");
  });
});
