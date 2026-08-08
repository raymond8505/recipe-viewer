// MCP-specific schemas: a hand-written JSON Schema mirror of the recipe input
// validators, used in the `tools/list` response so MCP clients can do client-
// side argument validation.
//
// The actual zod validators (recipeSearchInputSchema, recipeCreateInputSchema,
// etc.) live in `@/lib/schemas/recipe` so they're reusable by non-MCP callers
// (API route handlers, form validators). The JSON Schema map below is the
// only thing here that is genuinely MCP-protocol-specific — it describes the
// wire format that MCP `tools/list` emits.

import {
  DEFAULT_INGREDIENT_SOURCE,
  INGREDIENT_SOURCES,
} from "@/lib/schemas/ingredient";
import { ARCHIVED_RECIPE_STATUS, RECIPE_STATUSES } from "@/lib/schemas/recipe";
import { NUTRITION_FIELDS, type NutritionField } from "@/lib/nutritionFields";
import { METRIC_YIELD_UNITS } from "@/lib/units";
import {
  METRIC_UNIT_OR_LIST,
  METRIC_UNIT_SLASHES,
  TBSP_ML_EXAMPLE,
} from "./copy";
import { TOOL, type ToolName } from "./toolNames";

const schemaRecipeJsonSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    image: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    author: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
    cookTime: { type: "string", description: "ISO 8601 duration (e.g. PT30M)" },
    prepTime: { type: "string", description: "ISO 8601 duration" },
    totalTime: { type: "string", description: "ISO 8601 duration" },
    recipeYield: {
      description: `Recipe yield. PREFERRED: a QuantitativeValue object — value = serving count, unitText = its label (e.g. 4 / "kebabs"); optional valueReference = the recipe's raw weight/volume in METRIC units (value + unitText, e.g. 454 / "g"; unitText must be ${METRIC_UNIT_SLASHES}), which drives the per-serving nutrition basis shown in the app. A plain string like "4 servings" is still accepted but DEPRECATED — prefer the structured object.`,
      oneOf: [
        {
          type: "object",
          description: "Preferred structured form (Schema.org/QuantitativeValue).",
          properties: {
            "@type": { type: "string", enum: ["QuantitativeValue"] },
            value: { type: "number", description: "Serving count (the SSoT)" },
            unitText: { type: "string", description: 'Serving label, e.g. "servings" or "kebabs"' },
            valueReference: {
              type: "object",
              description:
                "Raw weight/volume of the whole recipe (in METRIC units), used for per-serving nutrition.",
              properties: {
                "@type": { type: "string", enum: ["QuantitativeValue"] },
                value: { type: "number", description: "Magnitude, e.g. 454" },
                unitText: {
                  type: "string",
                  enum: [...METRIC_YIELD_UNITS],
                  description: `Metric unit only: ${METRIC_UNIT_OR_LIST}.`,
                },
              },
            },
          },
        },
        { type: "string", description: "Deprecated: prefer the QuantitativeValue object." },
        {
          type: "array",
          items: { type: "string" },
          description: "Deprecated: prefer the QuantitativeValue object.",
        },
      ],
    },
    recipeCuisine: { type: "string" },
    recipeCategory: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    recipeIngredient: {
      type: "array",
      items: {
        oneOf: [
          { type: "string" },
          {
            type: "object",
            required: ["name"],
            properties: { name: { type: "string" }, group: { type: "string" } },
          },
        ],
      },
    },
    recipeInstructions: { type: "array", description: "HowToStep[] or mixed with HowToSection[]" },
    keywords: { type: "string" },
    nutrition: { type: "object" },
    datePublished: { type: "string" },
    notes: { type: "string", description: "App-internal notes (not part of Schema.org/Recipe)" },
    cookingNotes: {
      type: "string",
      description: `App-internal cooking notes — READ-ONLY for agents. Ignored by ${TOOL.create_recipe}/${TOOL.update_recipe} (the call still succeeds with a warning). Authored by users in cooking mode; clear it via the ${TOOL.clear_cooking_notes} tool.`,
    },
  },
  additionalProperties: true,
} as const;

const statusEnum = { type: "string", enum: RECIPE_STATUSES } as const;

// Mirror of the ingredient zod validators (`@/lib/schemas/ingredient`).
// `embedding` is deliberately absent: it is server-derived from name + aliases
// and never client-settable (NOT NULL column, db/migrations/0006).
const ingredientNutritionJsonSchema = {
  type: "object",
  description:
    "Nutrition values AS MEASURED for the accompanying `nutrition_portion`. Passing this makes `nutrition_portion` REQUIRED — the call is rejected without it, and food_portions does NOT satisfy it (exception: nutrition null on update, which clears stored values and needs no nutrition_portion). The server converts to its storage form deterministically. All fields optional non-negative numbers; omit what you don't know.",
  // Derived from NUTRITION_FIELDS so the wire schema can't omit a nutrient the
  // zod validator accepts. (This object loses `as const` as a result — nothing
  // indexes these property names at the type level, so that's free.)
  properties: Object.fromEntries(
    NUTRITION_FIELDS.map(
      (field): [NutritionField, { type: "number"; minimum: 0 }] => [
        field,
        { type: "number", minimum: 0 },
      ],
    ),
  ) as Record<NutritionField, { type: "number"; minimum: 0 }>,
};

const ingredientFieldsJsonSchema = {
  name: {
    type: "string",
    description:
      'The row\'s canonical name, unique case-insensitively across the catalog. For a USDA-sourced row this is the food\'s own description (e.g. "Butter, without salt"); for a hand-entered row it is canonical as you give it. Recipe-language wording ("unsalted butter") belongs in aliases, not here.',
  },
  aliases: {
    type: "array",
    items: { type: "string" },
    maxItems: 20,
    description:
      'The recipe-language names this ingredient is written as ("unsalted butter", "sweet butter") — this is where recipe wording lives. Matching searches name AND aliases, so listing the phrasings recipes actually use is what makes the row findable. On update this REPLACES the whole array; pass the existing aliases alongside any you are adding.',
  },
  fdc_id: {
    type: ["integer", "null"],
    description:
      "USDA FoodData Central record id this row was sourced from, if any. Unique across the catalog — one row per USDA food — so reusing an fdc_id fails with 'conflict'.",
  },
  fdc_data_type: {
    type: ["string", "null"],
    description: 'USDA data type of fdc_id (e.g. "Foundation", "SR Legacy").',
  },
  nutrition: ingredientNutritionJsonSchema,
  nutrition_portion: {
    type: "object",
    required: ["gramWeight"],
    description:
      'The portion the nutrition values are measured for — REQUIRED whenever nutrition is passed, unnecessary otherwise (e.g. 1 tbsp: { gramWeight: 14, amount: 1, modifier: "tbsp" }). Distinct from food_portions, which never satisfies this. On create it is also saved as a named portion of the ingredient.',
    properties: {
      gramWeight: { type: "number", exclusiveMinimum: 0, description: "Total gram weight of the portion" },
      amount: { type: "number", exclusiveMinimum: 0 },
      modifier: { type: "string", description: 'Portion label/unit, e.g. "tbsp" or "cup, whole"' },
      measureUnit: {
        type: "object",
        properties: { name: { type: "string" } },
      },
    },
  },
  density_g_per_ml: {
    type: ["number", "null"],
    description: `Density in g/ml for volume↔weight conversion: grams = ml × density_g_per_ml (e.g. ${TBSP_ML_EXAMPLE}).`,
  },
  food_portions: {
    type: "array",
    maxItems: 50,
    description:
      "Named DISPLAY portions with gram weights (USDA foodPortions shape); drives serving-size rendering only. NOT the nutrition basis — nutrition values are measured against `nutrition_portion`, and this field does not satisfy that requirement.",
    items: {
      type: "object",
      required: ["gramWeight"],
      properties: {
        gramWeight: { type: "number", exclusiveMinimum: 0 },
        amount: { type: "number", exclusiveMinimum: 0 },
        modifier: { type: "string", description: 'Portion label/unit, e.g. "tsp, whole"' },
        measureUnit: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
    },
  },
  source: {
    type: "string",
    enum: INGREDIENT_SOURCES,
    description: `Provenance of the row. Defaults to "${DEFAULT_INGREDIENT_SOURCE}" for agent-created rows.`,
  },
} as const;

export const TOOL_SCHEMAS = {
  search_recipes: {
    type: "object",
    properties: {
      query: { type: "string", description: "Substring to match against recipe name" },
      source: { type: "string", description: "Filter by source (e.g. domain)" },
      status: statusEnum,
      limit: { type: "integer", minimum: 1, maximum: 100, default: 24 },
      page: { type: "integer", minimum: 1, default: 1 },
    },
  },
  search_ingredients: {
    type: "object",
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: 'Ingredient name to search for (e.g. "cumin seed")',
      },
      limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
    },
  },
  get_ingredient: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: `Ingredient UUID (from ${TOOL.search_ingredients} results)` },
    },
  },
  create_ingredient: {
    type: "object",
    required: ["name"],
    // Machine-readable form of "nutrition needs nutrition_portion" for
    // clients that validate arguments against the schema.
    dependentRequired: { nutrition: ["nutrition_portion"] },
    properties: ingredientFieldsJsonSchema,
  },
  update_ingredient: {
    type: "object",
    required: ["id"],
    // No dependentRequired here: it keys on property PRESENCE, and
    // `nutrition: null` (clearing) is legal without a nutrition_portion.
    properties: {
      id: { type: "string", description: "Ingredient UUID" },
      ...ingredientFieldsJsonSchema,
    },
  },
  delete_ingredient: {
    type: "object",
    required: ["id"],
    properties: {
      id: {
        type: "string",
        description: "Ingredient UUID — the row is deleted PERMANENTLY (no archive state)",
      },
    },
  },
  get_recipe: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "Recipe UUID" },
    },
  },
  get_token: {
    type: "object",
    required: ["id"],
    properties: {
      id: {
        type: "string",
        description: "Recipe UUID the token will be scoped to",
      },
    },
  },
  create_recipe: {
    type: "object",
    required: ["source", "schema"],
    properties: {
      url: {
        type: "string",
        format: "uri",
        description:
          "Optional. Defaults to the recipe's own canonical page on this instance (<base-url>/recipes/<new-uuid>) when omitted.",
      },
      source: { type: "string" },
      status: statusEnum,
      schema: schemaRecipeJsonSchema,
    },
  },
  update_recipe: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" },
      url: { type: "string", format: "uri" },
      source: { type: "string" },
      status: statusEnum,
      schema: {
        ...schemaRecipeJsonSchema,
        required: [],
        description: "Partial SchemaRecipe; merged into existing metadata.schema",
      },
    },
  },
  clear_cooking_notes: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "Recipe UUID whose cookingNotes will be cleared" },
    },
  },
  delete_recipe: {
    type: "object",
    required: ["id"],
    properties: {
      id: {
        type: "string",
        description: `Recipe UUID — soft-deleted by setting status=${ARCHIVED_RECIPE_STATUS}`,
      },
    },
  },
  upload_recipe_image: {
    type: "object",
    required: ["id", "imageUrl"],
    properties: {
      id: { type: "string", description: "Recipe UUID" },
      imageUrl: {
        type: "string",
        format: "uri",
        description:
          "Public http(s) URL to fetch the image from. The server downloads, validates, and uploads it. Use this whenever the user gives you an image URL — do not fetch it yourself. For a local file, use the multipart upload endpoint described in the tool description instead.",
      },
    },
  },
  // `satisfies Record<ToolName, …>` is bidirectional: a tool missing here fails
  // the Record, and one that isn't in TOOL_NAMES fails the freshness check.
  // `as const` still applies first, so each entry keeps its literal type.
} as const satisfies Record<ToolName, object>;
