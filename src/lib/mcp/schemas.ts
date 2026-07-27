// MCP-specific schemas: a hand-written JSON Schema mirror of the recipe input
// validators, used in the `tools/list` response so MCP clients can do client-
// side argument validation.
//
// The actual zod validators (recipeSearchInputSchema, recipeCreateInputSchema,
// etc.) live in `@/lib/schemas/recipe` so they're reusable by non-MCP callers
// (API route handlers, form validators). The JSON Schema map below is the
// only thing here that is genuinely MCP-protocol-specific — it describes the
// wire format that MCP `tools/list` emits.

import { RECIPE_STATUSES } from "@/lib/schemas/recipe";
import { METRIC_YIELD_UNITS } from "@/lib/units";

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
      description:
        'Recipe yield. PREFERRED: a QuantitativeValue object — value = serving count, unitText = its label (e.g. 4 / "kebabs"); optional valueReference = the recipe\'s raw weight/volume in METRIC units (value + unitText, e.g. 454 / "g"; unitText must be g/kg/ml/l), which drives the per-serving nutrition basis shown in the app. A plain string like "4 servings" is still accepted but DEPRECATED — prefer the structured object.',
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
                  description: 'Metric unit only: "g", "kg", "ml", or "l".',
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
      description:
        "App-internal cooking notes — READ-ONLY for agents. Ignored by create_recipe/update_recipe (the call still succeeds with a warning). Authored by users in cooking mode; clear it via the clear_cooking_notes tool.",
    },
  },
  additionalProperties: true,
} as const;

const statusEnum = { type: "string", enum: RECIPE_STATUSES } as const;

// Mirror of the ingredient zod validators (`@/lib/schemas/ingredient`).
// `embedding` is deliberately absent: it is server-derived from `name` and
// never client-settable (NOT NULL column, db/migrations/0006).
const ingredientNutritionJsonSchema = {
  type: "object",
  description:
    "Nutrition values AS MEASURED for the accompanying `portion` (which becomes required when this is passed). The server converts to its storage form deterministically. All fields optional non-negative numbers; omit what you don't know.",
  properties: {
    calories_kcal: { type: "number", minimum: 0 },
    protein_g: { type: "number", minimum: 0 },
    fat_g: { type: "number", minimum: 0 },
    saturated_fat_g: { type: "number", minimum: 0 },
    carbs_g: { type: "number", minimum: 0 },
    fiber_g: { type: "number", minimum: 0 },
    sugars_g: { type: "number", minimum: 0 },
    sodium_mg: { type: "number", minimum: 0 },
    cholesterol_mg: { type: "number", minimum: 0 },
    calcium_mg: { type: "number", minimum: 0 },
    iron_mg: { type: "number", minimum: 0 },
    potassium_mg: { type: "number", minimum: 0 },
  },
} as const;

const ingredientFieldsJsonSchema = {
  name: {
    type: "string",
    description:
      'Canonical recipe-language name (e.g. "unsalted butter"). Unique case-insensitively across the catalog; the matching embedding is derived from it server-side.',
  },
  aliases: {
    type: "array",
    items: { type: "string" },
    maxItems: 20,
    description: "Alternate names that should also keyword-match this ingredient.",
  },
  fdc_id: {
    type: ["integer", "null"],
    description: "USDA FoodData Central record id this row was sourced from, if any.",
  },
  fdc_data_type: {
    type: ["string", "null"],
    description: 'USDA data type of fdc_id (e.g. "Foundation", "SR Legacy").',
  },
  nutrition: ingredientNutritionJsonSchema,
  portion: {
    type: "object",
    required: ["gramWeight"],
    description:
      'The portion the nutrition values are measured for — REQUIRED whenever nutrition is passed (e.g. 1 tbsp: { gramWeight: 14, amount: 1, modifier: "tbsp" }). On create it is also saved as a named portion of the ingredient.',
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
    description:
      "Density in g/ml for volume↔weight conversion: grams = ml × density_g_per_ml (e.g. 1 tbsp = 14.79 ml).",
  },
  food_portions: {
    type: "array",
    maxItems: 50,
    description:
      "Named portions with gram weights (USDA foodPortions shape); drives serving-size rendering.",
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
    enum: ["usda", "manual"],
    description: 'Provenance of the row. Defaults to "manual" for agent-created rows.',
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
      id: { type: "string", description: "Ingredient UUID (from search_ingredients results)" },
    },
  },
  create_ingredient: {
    type: "object",
    required: ["name"],
    properties: ingredientFieldsJsonSchema,
  },
  update_ingredient: {
    type: "object",
    required: ["id"],
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
      id: { type: "string", description: "Recipe UUID — soft-deleted by setting status=archived" },
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
} as const;
