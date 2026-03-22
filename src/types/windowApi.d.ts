import type { RecipeToolsApi } from "@/lib/windowApi";

declare global {
  interface Window {
    recipeTools: RecipeToolsApi;
    __agentApis__: Record<string, unknown>;
  }
}
