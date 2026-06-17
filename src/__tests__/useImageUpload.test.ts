import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { useImageUpload } from "@/hooks/useImageUpload";

vi.mock("@/lib/api/recipes", () => ({
  uploadRecipeImageFile: vi.fn().mockResolvedValue("https://cdn.test/img.png"),
}));
import { uploadRecipeImageFile } from "@/lib/api/recipes";

// jsdom doesn't implement object URLs.
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.clearAllMocks());

function changeEventFor(file: File | null): ChangeEvent<HTMLInputElement> {
  return {
    target: { files: file ? [file] : [], value: "x" },
  } as unknown as ChangeEvent<HTMLInputElement>;
}

const pngFile = (size = 1) =>
  new File(["a".repeat(size)], "pic.png", { type: "image/png" });

describe("useImageUpload", () => {
  it("stages a valid file and invokes onAccepted", () => {
    const onAccepted = vi.fn();
    const { result } = renderHook(() => useImageUpload(1024));
    const file = pngFile();
    act(() => result.current.onFileChange(changeEventFor(file), onAccepted));
    expect(result.current.isStaged).toBe(true);
    expect(result.current.previewUrl).toBe("blob:preview");
    expect(result.current.error).toBe(false);
    expect(onAccepted).toHaveBeenCalledWith(file);
  });

  it("rejects a disallowed content type", () => {
    const onAccepted = vi.fn();
    const { result } = renderHook(() => useImageUpload(1024));
    const gif = new File(["x"], "pic.gif", { type: "image/gif" });
    act(() => result.current.onFileChange(changeEventFor(gif), onAccepted));
    expect(result.current.error).toBe(true);
    expect(result.current.isStaged).toBe(false);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("rejects a file over the size cap", () => {
    const { result } = renderHook(() => useImageUpload(4));
    act(() => result.current.onFileChange(changeEventFor(pngFile(100))));
    expect(result.current.error).toBe(true);
    expect(result.current.isStaged).toBe(false);
  });

  it("clear drops the staged file and revokes the preview", () => {
    const { result } = renderHook(() => useImageUpload(1024));
    act(() => result.current.onFileChange(changeEventFor(pngFile())));
    act(() => result.current.clear());
    expect(result.current.isStaged).toBe(false);
    expect(result.current.previewUrl).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("upload delegates to uploadRecipeImageFile with the staged file", async () => {
    const { result } = renderHook(() => useImageUpload(1024));
    const file = pngFile();
    act(() => result.current.onFileChange(changeEventFor(file)));
    let url = "";
    await act(async () => {
      url = await result.current.upload("recipe-1");
    });
    expect(uploadRecipeImageFile).toHaveBeenCalledWith("recipe-1", file);
    expect(url).toBe("https://cdn.test/img.png");
  });
});
