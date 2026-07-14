import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecipeEditor } from "@/hooks/useRecipeEditor";
import type { SchemaRecipe } from "@/types/recipe";

const schema: SchemaRecipe = {
  name: "Pancakes",
  description: "Fluffy.",
  recipeIngredient: ["2 cups flour", "1 egg"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Mix" }],
  prepTime: "PT15M",
  cookTime: "PT1H30M",
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
    expect(result.current.draft).toMatchObject({
      name: "Pancakes",
      url: "https://x.test",
      description: "Fluffy.",
      notes: "Use buttermilk.",
      status: "published",
    });
    // ingredients/instructions are the structured editor trees
    expect(result.current.draft.ingredients[0].items.map((i) => i.name)).toEqual(
      ["2 cups flour", "1 egg"],
    );
    expect(result.current.draft.instructions[0].items[0].text).toBe("Mix");
  });

  it("begin seeds prep/cook/total times as display strings", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    expect(result.current.draft.prepTime).toBe("15 min");
    expect(result.current.draft.cookTime).toBe("1 hr 30 min");
    // totalTime is unset on the schema → blank draft field.
    expect(result.current.draft.totalTime).toBe("");
  });

  it("buildSchema converts time display strings back to ISO durations", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    act(() => result.current.patch({ totalTime: "45 min" }));
    const built = result.current.buildSchema(schema);
    expect(built.prepTime).toBe("PT15M");
    expect(built.cookTime).toBe("PT1H30M");
    expect(built.totalTime).toBe("PT45M");
  });

  it("buildSchema omits a time key when its field is cleared", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    act(() => result.current.patch({ prepTime: "" }));
    const built = result.current.buildSchema(schema);
    expect(built.prepTime).toBeUndefined();
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

  it("buildSchema produces structured ingredient/instruction arrays", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    const built = result.current.buildSchema(schema);
    expect(built.recipeIngredient).toEqual(["2 cups flour", "1 egg"]);
    expect(built.recipeInstructions).toEqual([
      { "@type": "HowToStep", text: "Mix" },
    ]);
  });

  it("allows a label with no time and keeps saving enabled", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    const stepId = result.current.draft.instructions[0].items[0].id;
    act(() =>
      result.current.patch({
        instructions: [
          {
            ...result.current.draft.instructions[0],
            items: [
              {
                ...result.current.draft.instructions[0].items[0],
                name: "Mix well",
              },
            ],
          },
        ],
      }),
    );
    expect(result.current.instructionErrors.has(stepId)).toBe(false);
    expect(result.current.canSave).toBe(true);
  });

  it("flags a step with a time but no label and blocks saving", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    const stepId = result.current.draft.instructions[0].items[0].id;
    act(() =>
      result.current.patch({
        instructions: [
          {
            ...result.current.draft.instructions[0],
            items: [
              {
                ...result.current.draft.instructions[0].items[0],
                minutes: 5,
              },
            ],
          },
        ],
      }),
    );
    expect(result.current.instructionErrors.has(stepId)).toBe(true);
    expect(result.current.canSave).toBe(false);
  });

  it("canSave is true once name and time are both set", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, "draft", ""));
    act(() =>
      result.current.patch({
        instructions: [
          {
            ...result.current.draft.instructions[0],
            items: [
              {
                ...result.current.draft.instructions[0].items[0],
                name: "Mix well",
                minutes: 5,
              },
            ],
          },
        ],
      }),
    );
    expect(result.current.canSave).toBe(true);
    expect(result.current.instructionErrors.size).toBe(0);
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
