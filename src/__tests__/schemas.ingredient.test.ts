import { describe, it, expect } from "vitest";
import {
  DEFAULT_INGREDIENT_SOURCE,
  INGREDIENT_SOURCES,
  ingredientCreateInputSchema,
  ingredientUpdateInputSchema,
} from "@/lib/schemas/ingredient";
import { FOOD_PORTION_UNIQUE_RULE } from "@/lib/foodPortions";
import { NUTRITION_FIELDS } from "@/lib/nutritionFields";
import { nutritionSchema } from "@/lib/schemas/nutrition";

// The nutrition validator's shape is generated from NUTRITION_FIELDS, so these
// exercise it behaviourally — the object itself is module-private, and a
// generated shape is exactly the kind that can go subtly wrong (every key
// present but validating nothing, say) without a compile error.

const allNutrients = Object.fromEntries(
  NUTRITION_FIELDS.map((field, i) => [field, i + 1]),
);

describe("NUTRITION_FIELDS vs the schema that declares the nutrients", () => {
  // exhaustiveKeys makes a MISSING or UNKNOWN nutrient a compile error, but key
  // order isn't visible to the type system — and order is read by humans in the
  // MCP tool prose and the manager's columns. So it's pinned here.
  it("lists exactly the schema's nutrients, in the schema's order", () => {
    expect([...NUTRITION_FIELDS]).toEqual(Object.keys(nutritionSchema.shape));
  });
});

describe("ingredient nutrition validator", () => {
  it("accepts and preserves every nutrient the catalog declares", () => {
    const parsed = ingredientCreateInputSchema.parse({
      name: "test",
      nutrition: allNutrients,
    });
    expect(parsed.nutrition).toEqual(allNutrients);
  });

  it("treats every nutrient as optional", () => {
    const parsed = ingredientCreateInputSchema.parse({
      name: "test",
      nutrition: { calories_kcal: 10 },
    });
    expect(parsed.nutrition).toEqual({ calories_kcal: 10 });
  });

  it("strips a key that isn't a catalog nutrient", () => {
    const parsed = ingredientCreateInputSchema.parse({
      name: "test",
      nutrition: { calories_kcal: 10, vitamin_c_mg: 5 },
    });
    expect(parsed.nutrition).toEqual({ calories_kcal: 10 });
  });

  it("rejects a negative value on any nutrient", () => {
    for (const field of NUTRITION_FIELDS) {
      const result = ingredientCreateInputSchema.safeParse({
        name: "test",
        nutrition: { [field]: -1 },
      });
      expect(result.success, `${field} should reject -1`).toBe(false);
    }
  });
});

describe("ingredient source enum", () => {
  it("defaults to the documented provenance", () => {
    const parsed = ingredientCreateInputSchema.parse({ name: "test" });
    expect(parsed.source).toBe(DEFAULT_INGREDIENT_SOURCE);
    expect(INGREDIENT_SOURCES).toContain(DEFAULT_INGREDIENT_SOURCE);
  });

  // `.partial()` keeps an inherited `.default()`, so without the explicit
  // override on the update schema an absent source parses as "manual" and
  // every patch silently rewrites the column — including one that only stamps
  // last_checked. Demotion is updateIngredientRow's decision, not the
  // validator's, because only it can see whether the patch changes any data.
  it("does not inject a source into an update patch that omits one", () => {
    const parsed = ingredientUpdateInputSchema.parse({ density_g_per_ml: 0.5 });
    expect(parsed).not.toHaveProperty("source");
  });

  it("still carries an explicit source through an update", () => {
    const parsed = ingredientUpdateInputSchema.parse({ source: "usda" });
    expect(parsed.source).toBe("usda");
  });

  it("accepts every declared source and nothing else", () => {
    for (const source of INGREDIENT_SOURCES) {
      expect(
        ingredientCreateInputSchema.safeParse({ name: "test", source }).success,
      ).toBe(true);
    }
    expect(
      ingredientCreateInputSchema.safeParse({ name: "test", source: "scraped" })
        .success,
    ).toBe(false);
  });
});

describe("last_checked", () => {
  // Agents format "now" either way and both name the same instant, so an
  // offset must not be the difference between a stamp landing and a 400.
  it.each([
    ["Z", "2026-09-22T14:03:00.000Z"],
    ["a numeric offset", "2026-09-22T10:03:00-04:00"],
  ])("accepts an ISO timestamp with %s", (_label, value) => {
    const parsed = ingredientCreateInputSchema.parse({
      name: "test",
      last_checked: value,
    });
    expect(parsed.last_checked).toBe(value);
  });

  it("accepts null, which clears the stamp back to never-checked", () => {
    const parsed = ingredientCreateInputSchema.parse({
      name: "test",
      last_checked: null,
    });
    expect(parsed.last_checked).toBeNull();
  });

  it("leaves the column alone when the field is absent", () => {
    const parsed = ingredientCreateInputSchema.parse({ name: "test" });
    expect(parsed).not.toHaveProperty("last_checked");
  });

  it.each(["yesterday", "2026-09-22", "", "1758549780"])(
    "rejects %j, which is not an instant",
    (value) => {
      expect(
        ingredientCreateInputSchema.safeParse({ name: "test", last_checked: value })
          .success,
      ).toBe(false);
    },
  );
});

// The uniqueness rule lives on the shared validator, so the HTTP routes and
// both MCP tools inherit it from one declaration. USDA imports deliberately
// bypass it — ingredientImport writes createIngredientRow directly, and USDA
// really does ship one label at several weights.
describe("food_portions uniqueness", () => {
  function parse(food_portions: unknown) {
    return ingredientCreateInputSchema.safeParse({ name: "test", food_portions });
  }

  it("collapses an exactly repeated portion", () => {
    const result = parse([
      { gramWeight: 85, modifier: "1/4 package" },
      { gramWeight: 85, modifier: "1/4 package" },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.food_portions).toEqual([
        { gramWeight: 85, modifier: "1/4 package" },
      ]);
    }
  });

  it("rejects one label at two weights, naming it on the field", () => {
    const result = parse([
      { gramWeight: 85, modifier: "cup" },
      { gramWeight: 90, modifier: "cup" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.path).toEqual(["food_portions"]);
      expect(issue.message).toContain('"cup"');
      expect(issue.message).toContain(FOOD_PORTION_UNIQUE_RULE);
    }
  });

  it("accepts one weight under two labels", () => {
    const result = parse([
      { gramWeight: 85, modifier: "1/4 package" },
      { gramWeight: 85, modifier: "about 1 cup" },
    ]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.food_portions).toHaveLength(2);
  });

  it("applies on update too", () => {
    const result = ingredientUpdateInputSchema.safeParse({
      food_portions: [
        { gramWeight: 85, modifier: "cup" },
        { gramWeight: 90, modifier: "cup" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("leaves an absent list absent and a null list null", () => {
    const absent = ingredientCreateInputSchema.parse({ name: "test" });
    expect(absent).not.toHaveProperty("food_portions");
    const cleared = ingredientCreateInputSchema.parse({
      name: "test",
      food_portions: null,
    });
    expect(cleared.food_portions).toBeNull();
  });
});
