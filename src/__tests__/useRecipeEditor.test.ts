import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecipeEditor } from "@/hooks/useRecipeEditor";
import type { EditRowFields } from "@/hooks/useRecipeEditor";
import type { SchemaRecipe } from "@/types/recipe";

const schema: SchemaRecipe = {
  name: "Pancakes",
  description: "Fluffy.",
  recipeIngredient: ["2 cups flour", "1 egg"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Mix" }],
  notes: "Use buttermilk.",
};

/** Row-level fields for cases that only care about the schema half of begin(). */
const ROW: EditRowFields = { status: "draft", url: "", source: "" };

describe("useRecipeEditor", () => {
  it("starts idle with an empty draft", () => {
    const { result } = renderHook(() => useRecipeEditor());
    expect(result.current.isEditing).toBe(false);
    expect(result.current.editState).toBe("idle");
    expect(result.current.draft.name).toBe("");
  });

  it("begin seeds every field from the schema and enters editing", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() =>
      result.current.begin(schema, {
        status: "published",
        url: "https://x.test",
        source: "seriouseats.com",
      }),
    );
    expect(result.current.isEditing).toBe(true);
    expect(result.current.draft).toMatchObject({
      name: "Pancakes",
      url: "https://x.test",
      description: "Fluffy.",
      notes: "Use buttermilk.",
      status: "published",
      source: "seriouseats.com",
    });
    // ingredients/instructions are the structured editor trees
    expect(result.current.draft.ingredients[0].items.map((i) => i.name)).toEqual(
      ["2 cups flour", "1 egg"],
    );
    expect(result.current.draft.instructions[0].items[0].text).toBe("Mix");
  });

  it("patch shallow-merges the draft", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, ROW));
    act(() => result.current.patch({ name: "Crepes" }));
    expect(result.current.draft.name).toBe("Crepes");
    expect(result.current.draft.description).toBe("Fluffy.");
  });

  it("cancel returns to idle", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, ROW));
    act(() => result.current.cancel());
    expect(result.current.isEditing).toBe(false);
  });

  it("buildSchema merges the draft and falls back to base name when blank", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, ROW));
    act(() => result.current.patch({ name: "   ", description: "" }));
    const built = result.current.buildSchema(schema);
    expect(built.name).toBe("Pancakes");
    expect(built.description).toBeUndefined();
  });

  it("buildSchema produces structured ingredient/instruction arrays", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, ROW));
    const built = result.current.buildSchema(schema);
    expect(built.recipeIngredient).toEqual(["2 cups flour", "1 egg"]);
    expect(built.recipeInstructions).toEqual([
      { "@type": "HowToStep", text: "Mix" },
    ]);
  });

  it("allows a label with no time and keeps saving enabled", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, ROW));
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
    act(() => result.current.begin(schema, ROW));
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
    act(() => result.current.begin(schema, ROW));
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

  describe("servings", () => {
    it("begin seeds an empty string when the schema has no yield", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(schema, ROW));
      expect(result.current.draft.servings).toBe("");
    });

    it("begin seeds the parsed count from a string yield", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() =>
        result.current.begin(
          { ...schema, recipeYield: "4 servings" },
          ROW,
        ),
      );
      expect(result.current.draft.servings).toBe("4");
    });

    it("begin seeds the value from a QuantitativeValue yield", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() =>
        result.current.begin(
          {
            ...schema,
            recipeYield: { "@type": "QuantitativeValue", value: 4 },
          },
          ROW,
        ),
      );
      expect(result.current.draft.servings).toBe("4");
    });

    it("buildSchema rewrites a string yield when servings change", () => {
      const base = { ...schema, recipeYield: "4 servings" };
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servings: "8" }));
      expect(result.current.buildSchema(base).recipeYield).toBe("8 servings");
    });

    it("buildSchema replaces only the value on a QuantitativeValue yield", () => {
      const base: SchemaRecipe = {
        ...schema,
        recipeYield: {
          "@type": "QuantitativeValue",
          value: 4,
          unitText: "kebabs",
          valueReference: { value: 454, unitText: "g" },
        },
      };
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servings: "8" }));
      expect(result.current.buildSchema(base).recipeYield).toEqual({
        "@type": "QuantitativeValue",
        value: 8,
        unitText: "kebabs",
        valueReference: { value: 454, unitText: "g" },
      });
    });

    it.each(["", "abc", "0", "-2", "2.5"])(
      "buildSchema leaves the yield untouched for invalid input %j",
      (servings) => {
        const base = { ...schema, recipeYield: "4 servings" };
        const { result } = renderHook(() => useRecipeEditor());
        act(() => result.current.begin(base, ROW));
        act(() => result.current.patch({ servings }));
        expect(result.current.buildSchema(base).recipeYield).toBe("4 servings");
      },
    );

    it("an untouched save preserves a range yield verbatim", () => {
      // "6-8 servings" seeds the input with its midpoint "7"; saving without
      // editing must not collapse the range to "7 servings".
      const base = { ...schema, recipeYield: "6-8 servings" };
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      expect(result.current.draft.servings).toBe("7");
      expect(result.current.buildSchema(base).recipeYield).toBe("6-8 servings");
    });

    it("buildSchema creates a yield on a recipe that had none", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(schema, ROW));
      act(() => result.current.patch({ servings: "6" }));
      expect(result.current.buildSchema(schema).recipeYield).toEqual({
        "@type": "QuantitativeValue",
        value: 6,
      });
    });
  });

  it("runSave transitions saving → idle on success", async () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, ROW));
    await act(async () => {
      await result.current.runSave(async () => {});
    });
    expect(result.current.editState).toBe("idle");
  });

  it("runSave transitions to error and keeps the draft on failure", async () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(schema, ROW));
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
