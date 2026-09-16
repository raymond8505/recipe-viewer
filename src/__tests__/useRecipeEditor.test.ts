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
  servings_amount: null,
  servings_unit: null,
  total_weight_amount: null,
  total_weight_unit: null,
};

/** The same document with a serving count — servings are columns, not schema. */
function withServings(amount: number | null, unit: string | null = "servings"): RecipeDocument {
  return { ...doc, servings_amount: amount, servings_unit: unit };
}

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
    it("begin seeds an empty string when the recipe has no serving count", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(doc, ROW));
      expect(result.current.draft.servings).toBe("");
    });

    it("begin seeds the count and the unit straight off the columns", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(withServings(4, "kebabs"), ROW));
      expect(result.current.draft.servings).toBe("4");
      expect(result.current.draft.servingsUnit).toBe("kebabs");
    });

    it("begin seeds a blank unit when the source named none", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(withServings(4, null), ROW));
      expect(result.current.draft.servingsUnit).toBe("");
    });

    it("buildPatch sends the edited count and unit as a servings patch", () => {
      const base = withServings(4, "kebabs");
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servings: "8" }));
      expect(result.current.buildPatch(base).servings).toEqual({
        amount: 8,
        unit: "kebabs",
      });
    });

    it("buildPatch sends an edited unit", () => {
      const base = withServings(4, "kebabs");
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servingsUnit: "skewers" }));
      expect(result.current.buildPatch(base).servings).toEqual({
        amount: 4,
        unit: "skewers",
      });
    });

    // A blank unit is a CLEAR, not "leave it alone": the field shows the
    // fallback word as its placeholder, so emptying it asks for that word back.
    it.each(["", "   "])("buildPatch clears the unit for blank input %j", (unit) => {
      const base = withServings(4, "kebabs");
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servingsUnit: unit }));
      expect(result.current.buildPatch(base).servings).toEqual({
        amount: 4,
        unit: null,
      });
    });

    it("buildPatch trims the unit", () => {
      const base = withServings(4, "kebabs");
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servingsUnit: "  wraps  " }));
      expect(result.current.buildPatch(base).servings?.unit).toBe("wraps");
    });

    // The amount gates the whole patch: a unit with no count is not a state a
    // recipe can be in, so a typo in the count must not half-apply the edit.
    it("buildPatch drops an edited unit when the count is unusable", () => {
      const base = withServings(4, "kebabs");
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servings: "abc", servingsUnit: "skewers" }));
      expect(result.current.buildPatch(base)).not.toHaveProperty("servings");
    });

    it.each(["", "abc", "0", "-2", "2.5"])(
      "buildPatch omits the servings key for invalid input %j",
      (servings) => {
        const base = withServings(4);
        const { result } = renderHook(() => useRecipeEditor());
        act(() => result.current.begin(base, ROW));
        act(() => result.current.patch({ servings }));
        expect(result.current.buildPatch(base)).not.toHaveProperty("servings");
      },
    );

    // The column holds one number, so re-sending an unchanged count is a no-op
    // by construction — buildPatch needs no changed-check to stay safe.
    it("an untouched save re-sends the same count harmlessly", () => {
      const base = withServings(7);
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      expect(result.current.draft.servings).toBe("7");
      expect(result.current.buildPatch(base).servings).toEqual({
        amount: 7,
        unit: "servings",
      });
    });

    it("buildPatch sets a count on a recipe that had none", () => {
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(doc, ROW));
      act(() => result.current.patch({ servings: "6" }));
      expect(result.current.buildPatch(doc).servings).toEqual({
        amount: 6,
        unit: null,
      });
    });

    it("keeps the servings out of the schema half of the patch", () => {
      const base = withServings(4);
      const { result } = renderHook(() => useRecipeEditor());
      act(() => result.current.begin(base, ROW));
      act(() => result.current.patch({ servings: "8" }));
      expect(result.current.buildPatch(base).schema).not.toHaveProperty("recipeYield");
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
