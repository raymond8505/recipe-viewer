// @vitest-environment node
//
// Drift guards for the MCP tool descriptions and JSON schemas.
//
// The descriptions are the agent's entire instruction surface, and most of what
// they assert about the code is enforced by the compiler (see ./copy,
// ./toolNames, the exhaustiveKeys arrays). These cover what the type system
// cannot see: JSON-Schema property keys (the schemas are structurally
// `object`), the rendered prose strings, and the array/registry agreement that
// only exists at runtime.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    OAUTH_JWT_SECRET: "test-secret-must-be-at-least-32-characters-long!",
    MCP_PUBLIC_URL: "http://localhost:3000",
    MAX_IMAGE_BYTES: 4_000_000,
  },
}));
vi.mock("@/lib/recipes", () => ({
  getRecipes: vi.fn(),
  getRecipeById: vi.fn(),
  createRecipeRow: vi.fn(),
  updateRecipeRow: vi.fn(),
  archiveRecipe: vi.fn(),
  RecipeRepoError: class RecipeRepoError extends Error {},
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
  // ingredients.ts builds INGREDIENT_COLUMNS at module load via selectColumns.
  selectColumns: () => (cols: readonly string[]) => cols.join(", "),
}));

import { TOOLS } from "@/lib/mcp/server";
import { TOOL_SCHEMAS } from "@/lib/mcp/schemas";
import { TOOL_NAMES } from "@/lib/mcp/toolNames";
import {
  IMAGE_FORMAT_LIST,
  METRIC_UNIT_OR_LIST,
  METRIC_UNIT_SLASHES,
  orList,
  TBSP_ML_EXAMPLE,
} from "@/lib/mcp/copy";
import { NUTRITION_FIELDS } from "@/lib/nutritionFields";
import {
  DEFAULT_INGREDIENT_SOURCE,
  INGREDIENT_SOURCES,
} from "@/lib/schemas/ingredient";
import {
  ARCHIVED_RECIPE_STATUS,
  DEFAULT_RECIPE_STATUS,
} from "@/lib/schemas/recipe";
import { IMAGE_CONTENT_TYPES } from "@/lib/imageTypes";

const descriptionOf = (name: string) => {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return tool.description;
};

const ALL_DESCRIPTIONS = TOOLS.map((t) => t.description).join("\n");

describe("MCP tool registry", () => {
  it("implements exactly the tools TOOL_NAMES declares, in order", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([...TOOL_NAMES]);
  });

  it("has a JSON schema for every tool and no orphan schemas", () => {
    expect(Object.keys(TOOL_SCHEMAS).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("gives every tool the schema registered under its own name", () => {
    for (const tool of TOOLS) {
      expect(tool.inputSchema).toBe(TOOL_SCHEMAS[tool.name]);
    }
  });
});

describe("cross-tool citations", () => {
  // ${TOOL.x} makes a rename fail the build, but only where it was used. This
  // catches a tool name typed straight into a sentence and then left behind.
  it("only ever names tools that exist", () => {
    const cited = new Set(
      [ALL_DESCRIPTIONS, JSON.stringify(TOOL_SCHEMAS)]
        .join("\n")
        .match(/\b(?:search|get|create|update|delete|clear|upload)_[a-z_]+\b/g) ?? [],
    );
    expect([...cited].sort()).toEqual(
      [...cited].filter((name) => (TOOL_NAMES as readonly string[]).includes(name)).sort(),
    );
  });

  it("actually cites something (the scanner isn't matching an empty set)", () => {
    expect(ALL_DESCRIPTIONS).toContain("search_ingredients");
  });
});

describe("nutrition field list", () => {
  it("exposes every nutrient in the create_ingredient JSON schema", () => {
    const properties =
      TOOL_SCHEMAS.create_ingredient.properties.nutrition.properties;
    expect(Object.keys(properties)).toEqual([...NUTRITION_FIELDS]);
  });

  it("names every nutrient in the search_ingredients description", () => {
    const description = descriptionOf("search_ingredients");
    for (const field of NUTRITION_FIELDS) {
      expect(description).toContain(field);
    }
  });

  it("renders the nutrients as one parenthesised list, not scattered mentions", () => {
    expect(descriptionOf("search_ingredients")).toContain(
      `per-100g nutrition (${NUTRITION_FIELDS.join(", ")})`,
    );
  });
});

describe("rendered prose constants", () => {
  it("derives the tbsp example from the unit table", () => {
    expect(TBSP_ML_EXAMPLE).toBe("1 tbsp = 14.79 ml");
  });

  it("uses that one example in both the tool description and the schema", () => {
    expect(descriptionOf("search_ingredients")).toContain(TBSP_ML_EXAMPLE);
    expect(
      TOOL_SCHEMAS.create_ingredient.properties.density_g_per_ml.description,
    ).toContain(TBSP_ML_EXAMPLE);
  });

  it("keeps the similarity guidance free of stale numeric thresholds", () => {
    // The scores were recalibrated when catalog names became USDA descriptions;
    // pinned here (not just on the HTTP response) so an interpolated number
    // can't quietly reintroduce one.
    expect(descriptionOf("search_ingredients")).not.toMatch(/0\.85|0\.6\b/);
  });

  it("renders every accepted image format in the upload description", () => {
    expect(IMAGE_FORMAT_LIST).toBe("PNG, JPEG, or WebP");
    for (const { label } of Object.values(IMAGE_CONTENT_TYPES)) {
      expect(descriptionOf("upload_recipe_image")).toContain(label);
    }
  });

  it("renders the metric yield units in both forms", () => {
    expect(METRIC_UNIT_SLASHES).toBe("g/kg/ml/l");
    expect(METRIC_UNIT_OR_LIST).toBe('"g", "kg", "ml", or "l"');
    expect(descriptionOf("create_recipe")).toContain(METRIC_UNIT_SLASHES);
    expect(descriptionOf("update_recipe")).toContain(METRIC_UNIT_SLASHES);
  });

  it("joins lists deterministically regardless of length", () => {
    expect(orList([])).toBe("");
    expect(orList(["a"])).toBe("a");
    expect(orList(["a", "b"])).toBe("a or b");
    expect(orList(["a", "b", "c"])).toBe("a, b, or c");
  });
});

describe("enum defaults", () => {
  it("documents the source default the validator actually applies", () => {
    expect(TOOL_SCHEMAS.create_ingredient.properties.source.enum).toEqual(
      INGREDIENT_SOURCES,
    );
    expect(descriptionOf("create_ingredient")).toContain(
      `source defaults to '${DEFAULT_INGREDIENT_SOURCE}'`,
    );
  });

  it("documents the statuses the repo writes", () => {
    expect(descriptionOf("create_recipe")).toContain(
      `defaults status to '${DEFAULT_RECIPE_STATUS}'`,
    );
    expect(descriptionOf("delete_recipe")).toContain(
      `status to '${ARCHIVED_RECIPE_STATUS}'`,
    );
  });
});
