import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecipeEditor } from "@/hooks/useRecipeEditor";
import type { EditRowFields } from "@/hooks/useRecipeEditor";
import { makeIngredientLines, makeSteps } from "@/fixtures";
import type { RecipeDocument, SchemaRecipe } from "@/types/recipe";

const doc: RecipeDocument = {
  schema: {
    name: "Pancakes",
    description: "Fluffy.",
    notes: "Use buttermilk.",
  },
  ingredients: makeIngredientLines(["2 cups flour", "1 egg"]),
  instructions: makeSteps(["Mix"]),
  prep_time: null,
  cook_time: null,
  total_time: null,
};

/** The same document with some schema fields swapped. */
function withSchema(overrides: Partial<SchemaRecipe>): RecipeDocument {
  return { ...doc, schema: { ...doc.schema, ...overrides } };
}

/** Row-level fields for cases that only care about the schema half of begin(). */
const ROW: EditRowFields = { status: "draft", url: "", source: "" };

describe("useRecipeEditor", () => {
  it("starts idle with an empty draft", () => {
    const { result } = renderHook(() => useRecipeEditor());
    expect(result.current.isEditing).toBe(false);
    expect(result.current.editState).toBe("idle");
    expect(result.current.draft.name).toBe("");
  });

  it("begin seeds every field from the document and enters editing", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() =>
      result.current.begin(doc, {
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
    act(() => result.current.begin(doc, ROW));
    act(() => result.current.patch({ name: "Crepes" }));
    expect(result.current.draft.name).toBe("Crepes");
    expect(result.current.draft.description).toBe("Fluffy.");
  });

  it("cancel returns to idle", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(doc, ROW));
    act(() => result.current.cancel());
    expect(result.current.isEditing).toBe(false);
  });

  it("buildPatch merges the draft and falls back to base name when blank", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(doc, ROW));
    act(() => result.current.patch({ name: "   ", description: "" }));
    const built = result.current.buildPatch(doc).schema;
    expect(built.name).toBe("Pancakes");
    expect(built.description).toBeUndefined();
  });

  it("buildPatch produces the ingredient groups and the instruction groups beside the schema", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(doc, ROW));
    const built = result.current.buildPatch(doc);
    expect(built.ingredients).toEqual([
      {
        ingredients: [
          { id: "ri-2-cups-flour", raw_text: "2 cups flour" },
          { id: "ri-1-egg", raw_text: "1 egg" },
        ],
      },
    ]);
    expect(built.instructions).toEqual(makeSteps(["Mix"]));
    expect(built.schema).not.toHaveProperty("recipeIngredient");
    expect(built.schema).not.toHaveProperty("recipeInstructions");
  });

  // The row id is what keeps a line's catalog match across a save. An editor
  // that dropped it would recreate every row on every save — so a reworded
  // seeded line must still name its row, and only a line the user added may
  // arrive without one.
  it("hands every seeded line's row id back, and none for a new line", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(doc, ROW));
    act(() => {
      const [group] = result.current.draft.ingredients;
      result.current.patch({
        ingredients: [
          {
            ...group,
            items: [
              { ...group.items[0], name: "2 cups bread flour" },
              group.items[1],
              { id: "new-row", name: "1 tsp salt" },
            ],
          },
        ],
      });
    });
    expect(result.current.buildPatch(doc).ingredients).toEqual([
      {
        ingredients: [
          { id: "ri-2-cups-flour", raw_text: "2 cups bread flour" },
          { id: "ri-1-egg", raw_text: "1 egg" },
          { raw_text: "1 tsp salt" },
        ],
      },
    ]);
  });

  it("allows a label with no time and keeps saving enabled", () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(doc, ROW));
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
    act(() => result.current.begin(doc, ROW));
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
    act(() => result.current.begin(doc, ROW));
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
      act(() => result.current.begin(doc, ROW));
      expect(result.current.draft.servings).toBe("");
    });

    it("begin seeds the parsed count from a string yield", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(withSchema({ recipeYield: "4 servings" }), ROW));
      expect(result.current.draft.servings).toBe("4");
    });

    it("begin seeds the value from a QuantitativeValue yield", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() =>
        result.current.begin(
          withSchema({ recipeYield: { "@type": "QuantitativeValue", value: 4 } }),
          ROW,
        ),
      );
      expect(result.current.draft.servings).toBe("4");
    });

    it("buildPatch rewrites a string yield when servings change", () => {
      const base = withSchema({ recipeYield: "4 servings" });
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servings: "8" }));
      expect(result.current.buildPatch(base).schema.recipeYield).toBe("8 servings");
    });

    it("buildPatch replaces only the value on a QuantitativeValue yield", () => {
      const base = withSchema({
        recipeYield: {
          "@type": "QuantitativeValue",
          value: 4,
          unitText: "kebabs",
          valueReference: { value: 454, unitText: "g" },
        },
      });
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servings: "8" }));
      expect(result.current.buildPatch(base).schema.recipeYield).toEqual({
        "@type": "QuantitativeValue",
        value: 8,
        unitText: "kebabs",
        valueReference: { value: 454, unitText: "g" },
      });
    });

    it.each(["", "abc", "0", "-2", "2.5"])(
      "buildPatch leaves the yield untouched for invalid input %j",
      (servings) => {
        const base = withSchema({ recipeYield: "4 servings" });
        const { result } = renderHook(() => useRecipeEditor());
        act(() => result.current.begin(base, ROW));
        act(() => result.current.patch({ servings }));
        expect(result.current.buildPatch(base).schema.recipeYield).toBe("4 servings");
      },
    );

    it("an untouched save preserves a range yield verbatim", () => {
      // "6-8 servings" seeds the input with its midpoint "7"; saving without
      // editing must not collapse the range to "7 servings".
      const base = withSchema({ recipeYield: "6-8 servings" });
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      expect(result.current.draft.servings).toBe("7");
      expect(result.current.buildPatch(base).schema.recipeYield).toBe("6-8 servings");
    });

    it("buildPatch creates a yield on a recipe that had none", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(doc, ROW));
      act(() => result.current.patch({ servings: "6" }));
      expect(result.current.buildPatch(doc).schema.recipeYield).toEqual({
        "@type": "QuantitativeValue",
        value: 6,
      });
    });
  });

  it("runSave transitions saving → idle on success", async () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(doc, ROW));
    await act(async () => {
      await result.current.runSave(async () => {});
    });
    expect(result.current.editState).toBe("idle");
  });

  it("runSave transitions to error and keeps the draft on failure", async () => {
    const { result } = renderHook(() => useRecipeEditor());
    act(() => result.current.begin(doc, ROW));
    act(() => result.current.patch({ name: "Edited" }));
    await act(async () => {
      await result.current.runSave(async () => {
        throw new Error("boom");
      });
    });
    expect(result.current.editState).toBe("error");
    expect(result.current.draft.name).toBe("Edited");
  });
  describe("recipe times", () => {
    // The columns carry the times; the schema deliberately carries stale
    // copies (a different prep, a total the column has cleared) so a read
    // that consults the blob rather than the column fails visibly.
    const timed: RecipeDocument = {
      schema: { name: "Pancakes", prepTime: "PT5M", cookTime: "PT1H30M", totalTime: "PT2H" },
      ingredients: [],
      instructions: [],
      prep_time: 900,
      cook_time: 5400,
      total_time: null,
    };

    it("begin seeds the time fields as H:MM from the columns", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(timed, ROW));
      expect(result.current.draft.prepTime).toBe("0:15");
      expect(result.current.draft.cookTime).toBe("1:30");
      // A time the recipe doesn't have seeds blank, not "0:00".
      expect(result.current.draft.totalTime).toBe("");
    });

    it("buildPatch writes the edited H:MM back as ISO", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(timed, ROW));
      act(() => result.current.patch({ prepTime: "0:20", totalTime: "1:45" }));
      const built = result.current.buildPatch(timed).schema;
      expect(built.prepTime).toBe("PT20M");
      expect(built.totalTime).toBe("PT1H45M");
    });

    it("clears a time to null when the field is emptied", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(timed, ROW));
      act(() => result.current.patch({ cookTime: "" }));
      // null, not undefined: undefined disappears in JSON, so after the POST
      // the merge would read it as "absent, leave it alone" and the time the
      // user just deleted would come straight back.
      expect(result.current.buildPatch(timed).schema.cookTime).toBeNull();
    });

    it("degrades an unparseable time to the column's value rather than blocking the save", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(timed, ROW));
      act(() => result.current.patch({ prepTime: "a while" }));
      expect(result.current.buildPatch(timed).schema.prepTime).toBe("PT15M");
      expect(result.current.canSave).toBe(true);
    });

    it("round-trips an untouched recipe's column times unchanged", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(timed, ROW));
      const built = result.current.buildPatch(timed).schema;
      expect(built.prepTime).toBe("PT15M");
      expect(built.cookTime).toBe("PT1H30M");
      expect(built.totalTime).toBeNull();
    });
  });
});
