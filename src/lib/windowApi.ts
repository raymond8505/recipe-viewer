import { toSchemaOrgRecipe } from "./format";
import { documentFromSchemaOrg } from "./recipeDocument";
import type { RecipeDocument, SchemaOrgRecipe } from "@/types/recipe";

// The window.recipeTools API is an EXTERNAL edge: whatever drives it (a
// browser extension, an agent) speaks Schema.org. Recipes go out as
// SchemaOrgRecipe (the stored schema with the lines flattened to strings) and
// come in the same way, converted to the app's own document at the boundary —
// nothing past this module sees a `recipeIngredient` array.

export interface McpInputSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: McpInputSchema;
}

export interface ManifestResponse {
  tools: McpTool[];
}

export interface RecipeToolsApi {
  ping: () => "success";
  listTools: () => ManifestResponse;
  searchRecipes: (q: string) => Promise<SchemaOrgRecipe[]>;
  getRecipeViewerRecipe: () => SchemaOrgRecipe | null;
  setRecipeViewerRecipe: (recipe: SchemaOrgRecipe) => void;
}

export const API_TOOLS: McpTool[] = [
  {
    name: "ping",
    description: "Health check. Returns 'success' if the API is available.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "listTools",
    description:
      "Returns a manifest of all available API functions and their documentation in MCP tool schema format.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getRecipeViewerRecipe",
    description:
      "getRecipeViewerRecipe(): Recipe | null — Returns the current recipe displayed in cooking mode as a Schema.org Recipe (recipeIngredient as plain strings), or null if cooking mode is not active.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "setRecipeViewerRecipe",
    description:
      "setRecipeViewerRecipe(recipe: Recipe): void — Replaces the recipe displayed in cooking mode with a Schema.org Recipe (recipeIngredient as strings, or { name, group } objects). Only takes effect while cooking mode is active.",
    inputSchema: {
      type: "object",
      properties: {
        recipe: {
          type: "object",
          description: "A Schema.org Recipe object to display in cooking mode.",
        },
      },
      required: ["recipe"],
    },
  },
  {
    name: "searchRecipes",
    description:
      "searchRecipes(q: string): Promise<Recipe[]> — Sets the search bar to the given query, navigates the page to show matching recipes, and returns a JSON array of matching recipes as Schema.org Recipe objects.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "The search query to filter recipes by name.",
        },
      },
      required: ["q"],
    },
  },
];

let recipeUpdateResolver: ((recipes: SchemaOrgRecipe[]) => void) | null = null;

let currentCookingRecipe: RecipeDocument | null = null;
let cookingRecipeSetCallback: ((doc: RecipeDocument) => void) | null = null;

export function registerCookingModeRecipe(
  doc: RecipeDocument,
  setter: (doc: RecipeDocument) => void
): void {
  currentCookingRecipe = doc;
  cookingRecipeSetCallback = setter;
}

export function unregisterCookingModeRecipe(): void {
  currentCookingRecipe = null;
  cookingRecipeSetCallback = null;
}

export function notifyRecipeUpdate(recipes: SchemaOrgRecipe[]): void {
  recipeUpdateResolver?.(recipes);
  recipeUpdateResolver = null;
}

export function createRecipeToolsApi(
  navigate: (url: string) => void
): RecipeToolsApi {
  return {
    ping: () => "success",
    listTools: () => ({ tools: API_TOOLS }),
    searchRecipes: (q: string) => {
      const promise = new Promise<SchemaOrgRecipe[]>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("searchRecipes timed out waiting for page update")),
          10_000
        );
        recipeUpdateResolver = (recipes) => {
          clearTimeout(timeout);
          resolve(recipes);
        };
      });

      navigate(`/?q=${encodeURIComponent(q)}`);

      return promise;
    },
    getRecipeViewerRecipe: () =>
      currentCookingRecipe ? toSchemaOrgRecipe(currentCookingRecipe) : null,
    setRecipeViewerRecipe: (recipe: SchemaOrgRecipe) => {
      const doc = documentFromSchemaOrg(recipe);
      currentCookingRecipe = doc;
      cookingRecipeSetCallback?.(doc);
    },
  };
}
