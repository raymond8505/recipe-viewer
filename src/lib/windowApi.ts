import type { SchemaRecipe } from "@/types/recipe";

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
  searchRecipes: (q: string) => Promise<SchemaRecipe[]>;
  getRecipeViewerRecipe: () => SchemaRecipe | null;
  setRecipeViewerRecipe: (recipe: SchemaRecipe) => void;
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
      "getRecipeViewerRecipe(): SchemaRecipe | null — Returns the current recipe schema displayed in cooking mode, or null if cooking mode is not active.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "setRecipeViewerRecipe",
    description:
      "setRecipeViewerRecipe(recipe: SchemaRecipe): void — Replaces the recipe schema displayed in cooking mode. Only takes effect while cooking mode is active.",
    inputSchema: {
      type: "object",
      properties: {
        recipe: {
          type: "object",
          description: "A SchemaRecipe object to display in cooking mode.",
        },
      },
      required: ["recipe"],
    },
  },
  {
    name: "searchRecipes",
    description:
      "searchRecipes(q: string): Promise<SchemaRecipe[]> — Sets the search bar to the given query, navigates the page to show matching recipes, and returns a JSON array of matching recipe schemas.",
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

let recipeUpdateResolver: ((schemas: SchemaRecipe[]) => void) | null = null;

let currentCookingRecipe: SchemaRecipe | null = null;
let cookingRecipeSetCallback: ((recipe: SchemaRecipe) => void) | null = null;

export function registerCookingModeRecipe(
  recipe: SchemaRecipe,
  setter: (recipe: SchemaRecipe) => void
): void {
  currentCookingRecipe = recipe;
  cookingRecipeSetCallback = setter;
}

export function unregisterCookingModeRecipe(): void {
  currentCookingRecipe = null;
  cookingRecipeSetCallback = null;
}

export function notifyRecipeUpdate(schemas: SchemaRecipe[]): void {
  recipeUpdateResolver?.(schemas);
  recipeUpdateResolver = null;
}

export function createRecipeToolsApi(
  navigate: (url: string) => void
): RecipeToolsApi {
  return {
    ping: () => "success",
    listTools: () => ({ tools: API_TOOLS }),
    searchRecipes: (q: string) => {
      const promise = new Promise<SchemaRecipe[]>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("searchRecipes timed out waiting for page update")),
          10_000
        );
        recipeUpdateResolver = (schemas) => {
          clearTimeout(timeout);
          resolve(schemas);
        };
      });

      navigate(`/?q=${encodeURIComponent(q)}`);

      return promise;
    },
    getRecipeViewerRecipe: () => currentCookingRecipe,
    setRecipeViewerRecipe: (recipe: SchemaRecipe) => {
      currentCookingRecipe = recipe;
      cookingRecipeSetCallback?.(recipe);
    },
  };
}
