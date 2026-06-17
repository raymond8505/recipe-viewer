import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecipeEditor } from "@/hooks/useRecipeEditor";
import type { SchemaRecipe } from "@/types/recipe";

const schema: SchemaRecipe = {
  name: "Pancakes",
  description: "Fluffy.",
  recipeIngredient: ["2 cups flour", "1 egg"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Mix" }],
  notes: "Use buttermilk.",
};

describe("useRecipeEditor", () => {
  it("starts idle with an empty draft", () => {
    const { result } = renderHook(() => useRecipeEditor());
    expect(result.current.isEditing).toBe(false);
    expect(result.current.editState).toBe("idle");
    expect(result.current.draft.name).toBe("");
  });

  it("begin seeds every field from the schema and enters editing", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "published", "https://x.test"));
    expect(result.current.isEditing).toBe(true);
    expect(result.current.draft).toEqual({
      name: "Pancakes",
      url: "https://x.test",
      description: "Fluffy.",
      ingredients: "2 cups flour\n1 egg",
      instructions: expect.stringContaining("Mix"),
      notes: "Use buttermilk.",
      status: "published",
    });
  });

  it("patch shallow-merges the draft", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    act(() => result.current.patch({ name: "Crepes" }));
    expect(result.current.draft.name).toBe("Crepes");
    expect(result.current.draft.description).toBe("Fluffy.");
  });

  it("cancel returns to idle", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    act(() => result.current.cancel());
    expect(result.current.isEditing).toBe(false);
  });

  it("buildSchema merges the draft and falls back to base name when blank", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    act(() => result.current.patch({ name: "   ", description: "" }));
    const built = result.current.buildSchema(schema);
    expect(built.name).toBe("Pancakes");
    expect(built.description).toBeUndefined();
  });

  it("runSave transitions saving → idle on success", async () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    await act(async () => {
      await result.current.runSave(async () => {});
    });
    expect(result.current.editState).toBe("idle");
  });

  it("runSave transitions to error and keeps the draft on failure", async () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    act(() => result.current.patch({ name: "Edited" }));
    await act(async () => {
      await result.current.runSave(async () => {
        throw new Error("boom");
      });
    });
    expect(result.current.editState).toBe("error");
    expect(result.current.draft.name).toBe("Edited");
  });
});
