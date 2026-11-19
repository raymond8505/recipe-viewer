// MCP-specific schemas: a hand-written JSON Schema mirror of the recipe input
// validators, used in the `tools/list` response so MCP clients can do client-
// side argument validation.
//
// The actual zod validators (recipeSearchInputSchema, recipeCreateDetailedInputSchema,
// etc.) live in `@/lib/schemas/recipe` so they're reusable by non-MCP callers
// (API route handlers, form validators). The JSON Schema map below is the
// only thing here that is genuinely MCP-protocol-specific — it describes the
// wire format that MCP `tools/list` emits.

import {
  DEFAULT_INGREDIENT_SOURCE,
  INGREDIENT_SOURCES,
  NUTRITION_BASIS_REQUIRED,
} from "@/lib/schemas/ingredient";
import { FOOD_PORTION_UNIQUE_RULE } from "@/lib/foodPortions";
import { CUSTOM_RECIPE_SOURCE } from "@/lib/format";
import {
  ARCHIVED_RECIPE_STATUS,
  INGREDIENT_LINE_MAX_LENGTH,
  RECIPE_STATUSES,
} from "@/lib/schemas/recipe";
import { NUTRITION_FIELDS, type NutritionField } from "@/lib/nutritionFields";
import { METRIC_YIELD_UNITS } from "@/lib/units";
import {
  METRIC_UNIT_OR_LIST,
  METRIC_UNIT_SLASHES,
  RECIPE_INGREDIENT_ON_UPDATE_ERROR,
  RECIPE_INSTRUCTIONS_ON_UPDATE_ERROR,
  RECIPE_SCALARS_ON_UPDATE_ERROR,
  RECIPE_TIMES_ON_UPDATE_ERROR,
  RECIPE_YIELD_ON_UPDATE_ERROR,
  TIME_UPDATE_ARGS,
  TBSP_ML_EXAMPLE,
} from "./copy";
import { TOOL, type ToolName } from "./toolNames";

// The three times in their WIRE spelling. They are not on the stored shape
// below — they are seconds columns, and `update_recipe` sets them through its
// top-level `times` argument. This const exists because a CREATE is a genuine
// Schema.org edge: a scrape hands over `prepTime`, and the server reduces it to
// the column once. Spread into the create schema only.
const schemaOrgTimesJsonSchema = {
  cookTime: { type: "string", description: "ISO 8601 duration (e.g. PT30M)" },
  prepTime: { type: "string", description: "ISO 8601 duration" },
  totalTime: { type: "string", description: "ISO 8601 duration" },
} as const;

// The stored blob — what `update_recipe`'s `schema` still merges into. Down to
// the two fields the tagging system will replace; a recipe's name, image,
// description, notes and times are columns, reached through the top-level
// arguments of that tool, and its ingredients, instructions and servings
// through theirs.
const storedRecipeJsonSchema = {
  type: "object",
  required: [],
  properties: {
    recipeCuisine: { type: "string" },
    recipeCategory: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    // Not promoted and not dropped: `cooking_notes` is a column, but it is the
    // one the write tools ACCEPT AND IGNORE rather than reject, so it has to be
    // documented on the schema field both of them take — which is this one.
    cookingNotes: {
      type: "string",
      description: `App-internal cooking notes — READ-ONLY for agents. Ignored by ${TOOL.create_recipe_detailed}/${TOOL.update_recipe} (the call still succeeds with a warning). Authored by users in cooking mode; clear it via the ${TOOL.clear_cooking_notes} tool.`,
    },
  },
  additionalProperties: true,
} as const;

// The column-backed scalars in their Schema.org spelling. On create they ride
// inside `schema`, because a scrape hands over one Schema.org object and this
// is the edge that takes it apart; on update they are top-level arguments.
const promotedScalarsJsonSchema = {
  name: { type: "string" },
  description: { type: "string" },
  image: {
    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    description:
      "One image URL. An array is accepted (Schema.org allows one) and its first entry is kept.",
  },
  notes: { type: "string", description: "App-internal notes (not part of Schema.org/Recipe)" },
} as const;

// A Schema.org Recipe as a scraper produces it: the stored blob plus every
// column-backed field in its wire spelling — the scalars above, plus
// `recipeIngredient`, whose `group` objects are this app's extension, and
// `recipeInstructions`. Only create_recipe_detailed takes it; each is reduced
// to its column server-side.
const schemaOrgRecipeJsonSchema = {
  ...storedRecipeJsonSchema,
  required: ["name"],
  properties: {
    ...storedRecipeJsonSchema.properties,
    ...promotedScalarsJsonSchema,
    ...schemaOrgTimesJsonSchema,
    recipeYield: {
      description: `Recipe yield. PREFERRED: a QuantitativeValue object — value = serving count, unitText = its label (e.g. 4 / "kebabs"); optional valueReference = the recipe's raw weight/volume in METRIC units (value + unitText, e.g. 454 / "g"; unitText must be ${METRIC_UNIT_SLASHES}), which drives the per-serving nutrition basis shown in the app. A plain string like "4 servings" is still accepted but DEPRECATED — prefer the structured object. ACCEPTED ON CREATE ONLY: the server parses this once into the servings_amount / servings_unit / total_weight_amount / total_weight_unit columns, which is what ${TOOL.get_recipe} returns and what ${TOOL.update_recipe} edits through its "servings" / "total_weight" fields.`,
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
    recipeIngredient: {
      type: "array",
      description:
        "The ingredient lines as a scraper produces them: plain strings, or { name, group } to put a line under a named group. The server turns these into ingredient groups; read them back as `ingredients`.",
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
    recipeInstructions: {
      type: "array",
      description:
        "The steps as a scraper produces them: an array of HowToStep ({ text, name?, timeRequired? }) and HowToSection ({ name, itemListElement: HowToStep[] }) objects. The server turns these into instruction groups; read them back as `instructions`.",
      items: { type: "object" },
    },
  },
} as const;

// Schema.org/HowToStep, as a page publishes one. Named here because a
// HowToSection's itemListElement is an array of exactly this.
const howToStepJsonSchema = {
  type: "object",
  required: ["text"],
  description: "Schema.org/HowToStep.",
  properties: {
    "@type": {
      type: "string",
      description: 'Optional — "HowToStep" where the page spells it out.',
    },
    text: { type: "string", description: "The step as the recipe says it." },
    name: {
      type: "string",
      description: 'Short label, e.g. "Simmer" — also the label on its cook-mode timer.',
    },
    timeRequired: {
      type: "string",
      description:
        "ISO 8601 duration (e.g. PT10M). Becomes a cook-mode timer, which needs a name to label it.",
    },
  },
} as const;

// The base servings, as update_recipe takes them. Omitting the key leaves the
// count alone; `amount: null` clears it. `unit` is separately optional so an
// agent can correct a count without restating what it counts.
const servingsJsonSchema = {
  type: "object",
  required: ["amount"],
  description:
    'The recipe\'s base servings. Omit this key to leave them unchanged; send { "amount": null } to clear the count.',
  properties: {
    amount: {
      type: ["number", "null"],
      description: "How many servings the recipe makes at base scale; null clears it.",
    },
    unit: {
      type: ["string", "null"],
      description:
        'What the amount counts, PLURAL as a human would write it ("servings", "kebabs", "wraps"). Omit to leave it unchanged; null clears it and the app falls back to "servings".',
    },
  },
} as const;

// The three times, as update_recipe takes them. Each member is separately
// optional: omitting one leaves that column alone, null clears it. ISO 8601
// because that is the spelling an agent already speaks — the server reduces it
// to the column's seconds once, here.
const timesJsonSchema = {
  type: "object",
  required: [],
  description:
    "The recipe's prep, cook and total times. Omit a member to leave that time unchanged; send null to clear one. totalTime is NOT derived from prep + cook — a recipe may rest or marinate.",
  properties: Object.fromEntries(
    Object.values(TIME_UPDATE_ARGS).map((arg) => [
      arg,
      {
        type: ["string", "null"],
        description: `The recipe's ${arg} time as an ISO 8601 duration ("PT30M", "PT1H15M"); null clears it. A duration that is not hours/minutes/seconds fails the call.`,
      },
    ]),
  ),
} as const;

// The whole recipe's raw weight — what the app divides by the serving count to
// label nutrition "per 114 g serving".
const totalWeightJsonSchema = {
  type: "object",
  required: ["amount"],
  description:
    "Raw weight or volume of the WHOLE recipe at its base servings, which drives the per-serving nutrition basis. Omit to leave unchanged.",
  properties: {
    amount: {
      type: ["number", "null"],
      description: "Magnitude, e.g. 454; null clears it.",
    },
    unit: {
      type: ["string", "null"],
      enum: [...METRIC_YIELD_UNITS, null],
      description: `Metric unit only: ${METRIC_UNIT_OR_LIST}.`,
    },
  },
} as const;

// The recipe's ingredients as the app stores and serves them: ordered groups
// of lines. This is what get_recipe returns (each line is the recipe_ingredients
// row plus its catalog `ingredient`) and, reduced to { id?, raw_text }, what
// update_recipe takes.
const recipeIngredientsJsonSchema = {
  type: "array",
  description: `The whole ingredient list, replacing what is stored: ordered groups, each holding ordered lines. Omit a group's name for the ungrouped list (one nameless group). Every line you got from ${TOOL.get_recipe} carries an id — pass it back UNCHANGED, even when you reword the line, so the row and the catalog match curated on it survive; leave id off only for a genuinely new line.`,
  items: {
    type: "object",
    required: ["ingredients"],
    properties: {
      name: { type: "string", description: "Group heading; absent for the nameless group." },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          required: ["raw_text"],
          properties: {
            id: {
              type: "string",
              description: `The recipe_ingredients row this line IS, as returned by ${TOOL.get_recipe}. Keep it to keep the line's catalog match; omit it for a new line.`,
            },
            raw_text: { type: "string", description: 'The line as the recipe says it, e.g. "2 tsp cumin seed".' },
          },
        },
      },
    },
  },
} as const;

// The recipe's instructions as the app stores and serves them: ordered groups
// of steps. This is what get_recipe returns and, unchanged, what update_recipe
// takes — a step has no identity to preserve.
const recipeInstructionsJsonSchema = {
  type: "array",
  description:
    "The whole step list, replacing what is stored: ordered groups, each holding ordered steps. Omit a group's name for an unsectioned run of steps. A step's name is its cook-mode timer label; seconds (whole seconds) is that timer's duration and is only accepted alongside a name.",
  items: {
    type: "object",
    required: ["steps"],
    properties: {
      name: { type: "string", description: "Section heading; absent for an unsectioned run." },
      steps: {
        type: "array",
        items: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", description: "The step as the recipe says it." },
            name: { type: "string", description: 'Timer label, e.g. "Simmer". May stand alone.' },
            seconds: {
              type: "integer",
              minimum: 1,
              description: "Timer duration in whole seconds; requires name.",
            },
          },
        },
      },
    },
  },
} as const;

const statusEnum = { type: "string", enum: RECIPE_STATUSES } as const;

// Mirror of the ingredient zod validators (`@/lib/schemas/ingredient`).
// `embedding` is deliberately absent: it is server-derived from name + aliases
// and never client-settable (NOT NULL column, db/migrations/0006).
const ingredientNutritionJsonSchema = {
  type: "object",
  description:
    `Nutrition values AS MEASURED against \`nutrition_basis_g\` — read them straight off a label or a source without converting. ${NUTRITION_BASIS_REQUIRED} Passing nutrition therefore REQUIRES nutrition_basis_g and the call is rejected without it, the one exception being nutrition null on update, which clears the stored values. All fields optional non-negative numbers; omit what you don't know.`,
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
  nutrition_basis_g: {
    type: "number",
    exclusiveMinimum: 0,
    description: `${NUTRITION_BASIS_REQUIRED} Required whenever nutrition is passed, meaningless otherwise. It is a measurement basis only and stores nothing — to ALSO list that weight as a named serving, add it to food_portions.`,
  },
  density_g_per_ml: {
    type: ["number", "null"],
    description: `Density in g/ml for volume↔weight conversion: grams = ml × density_g_per_ml (e.g. ${TBSP_ML_EXAMPLE}).`,
  },
  food_portions: {
    type: "array",
    maxItems: 50,
    description: `The named weights this food is commonly measured in — "1/4 package" at 85 g, "1 cup" at 120 g (USDA foodPortions shape). Drives serving-size rendering only, and is the only field that writes them. ${FOOD_PORTION_UNIQUE_RULE} Replaces the whole list on update; omit it to leave the stored portions alone.`,
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
  last_checked: {
    type: ["string", "null"],
    format: "date-time",
    description:
      "ISO 8601 timestamp of when this row's values were last VERIFIED against a source — USDA, a package label, or a consensus check you just ran. Stamp it with the current time only when you actually checked the values in this same task: renaming the row, teaching it an alias, or writing a number you did not verify is NOT a check, and omitting the field leaves the stored date alone. This is deliberately not updated_at, which moves on every write — it is what tells a curator which rows have gone stale. Pass null to clear it back to never-checked.",
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
    // Machine-readable form of "nutrition needs nutrition_basis_g" for
    // clients that validate arguments against the schema.
    dependentRequired: { nutrition: ["nutrition_basis_g"] },
    properties: ingredientFieldsJsonSchema,
  },
  update_ingredient: {
    type: "object",
    required: ["id"],
    // No dependentRequired here: it keys on property PRESENCE, and
    // `nutrition: null` (clearing) is legal without a nutrition_basis_g.
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
  create_recipe_detailed: {
    type: "object",
    required: ["schema"],
    properties: {
      url: {
        type: "string",
        format: "uri",
        description:
          "Optional. Defaults to the recipe's own canonical page on this instance (<base-url>/recipes/<new-uuid>) when omitted.",
      },
      source: {
        type: "string",
        description: `Where the recipe came from — the origin domain (e.g. "seriouseats.com"). Required whenever url is given. Omit both to create a recipe that lives on this instance: source then defaults to "${CUSTOM_RECIPE_SOURCE}", marking it as the user's own recipe (no upstream page to re-scrape).`,
      },
      status: statusEnum,
      schema: schemaOrgRecipeJsonSchema,
    },
  },
  // The simplified twin: the properties ARE the recipe's, with no wrapper object
  // and no status. `additionalProperties` is open on purpose — a caller pastes a
  // page's whole JSON-LD, and the extra keys it carries are dropped by the
  // validator rather than rejected by the client.
  create_recipe_simple: {
    type: "object",
    required: ["name"],
    additionalProperties: true,
    properties: {
      name: { type: "string", description: "The recipe's title." },
      description: { type: "string" },
      author: {
        description:
          "The author's name — a plain string, Schema.org's { name } object, or an array of either (only the first is kept).",
        oneOf: [
          { type: "string" },
          { type: "object", required: ["name"], properties: { name: { type: "string" } } },
          {
            type: "array",
            items: {
              oneOf: [
                { type: "string" },
                { type: "object", required: ["name"], properties: { name: { type: "string" } } },
              ],
            },
          },
        ],
      },
      prepTime: { type: "string", description: "ISO 8601 duration (e.g. PT30M)" },
      cookTime: { type: "string", description: "ISO 8601 duration" },
      totalTime: {
        type: "string",
        description:
          "ISO 8601 duration. Not derived from prepTime + cookTime — a recipe can rest or marinate.",
      },
      recipeCuisine: { type: "string" },
      recipeCategory: {
        oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
      },
      keywords: { type: "string" },
      datePublished: { type: "string" },
      recipeYield: {
        description:
          'How many servings the recipe makes: 4, "4 servings", or "Makes 12 cookies". A yield stating a QUANTITY rather than a count ("300 ml", "1 lb") is not a serving count and is ignored.',
        oneOf: [{ type: "number" }, { type: "string" }],
      },
      recipeIngredient: {
        type: "array",
        description:
          'The ingredient lines, one entry per line, exactly as the recipe writes them ("2 tsp cumin seed"). A plain string is the whole of it for an ungrouped list; use { name, group } for a line the recipe files under a heading ("For the sauce"), and the server builds those groups in first-appearance order. Do not split off the quantity or the unit — the server parses each line and matches it to the catalog.',
        items: {
          oneOf: [
            { type: "string", maxLength: INGREDIENT_LINE_MAX_LENGTH },
            {
              type: "object",
              required: ["name"],
              properties: {
                name: {
                  type: "string",
                  maxLength: INGREDIENT_LINE_MAX_LENGTH,
                  description: "The line itself, as the recipe writes it.",
                },
                group: {
                  type: "string",
                  description: "The heading this line sits under; omit it for the ungrouped list.",
                },
              },
            },
          ],
        },
      },
      recipeInstructions: {
        type: "array",
        description:
          "The steps, in order, one entry per step. A plain string is enough for a step that is only its text; pass a page's HowToStep objects and HowToSections through as they stand when it publishes them, and the sections become the recipe's instruction sections and a timeRequired becomes a cook-mode timer.",
        items: {
          oneOf: [
            { type: "string", description: "A step that is only its text." },
            howToStepJsonSchema,
            {
              type: "object",
              required: ["@type", "name", "itemListElement"],
              description: "Schema.org/HowToSection — a named run of steps.",
              properties: {
                "@type": { type: "string", enum: ["HowToSection"] },
                name: { type: "string", description: "Section heading." },
                itemListElement: { type: "array", items: howToStepJsonSchema },
              },
            },
          ],
        },
      },
      url: {
        type: "string",
        format: "uri",
        description: `The page this recipe came from; its host becomes the recipe's source. Omit it for a recipe authored here — the recipe then gets its own page on this instance and a source of "${CUSTOM_RECIPE_SOURCE}".`,
      },
    },
  },
  update_recipe: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" },
      sourceUrl: {
        type: "string",
        format: "uri",
        description:
          "The page this recipe came from — what Re-scrape re-fetches. The recipe's own page here is derived from its id and reported as pageUrl, not set.",
      },
      source: { type: "string" },
      status: statusEnum,
      name: { type: "string", description: "The recipe's title. Cannot be cleared." },
      description: {
        type: ["string", "null"],
        description: "The recipe blurb; null clears it.",
      },
      notes: {
        type: ["string", "null"],
        description: `App-internal notes (not part of Schema.org/Recipe); null clears them. Distinct from cookingNotes, which is read-only for agents — clear that via ${TOOL.clear_cooking_notes}.`,
      },
      image: {
        type: ["string", "null"],
        description: `One image URL; null clears it. To upload an image file rather than point at one, use ${TOOL.upload_recipe_image}.`,
      },
      schema: {
        ...storedRecipeJsonSchema,
        description: `The remaining stored fields, merged into what is stored — only the keys you pass change. ${RECIPE_SCALARS_ON_UPDATE_ERROR} ${RECIPE_INGREDIENT_ON_UPDATE_ERROR} ${RECIPE_INSTRUCTIONS_ON_UPDATE_ERROR} ${RECIPE_YIELD_ON_UPDATE_ERROR} ${RECIPE_TIMES_ON_UPDATE_ERROR}`,
      },
      ingredients: recipeIngredientsJsonSchema,
      instructions: recipeInstructionsJsonSchema,
      servings: servingsJsonSchema,
      total_weight: totalWeightJsonSchema,
      times: timesJsonSchema,
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
