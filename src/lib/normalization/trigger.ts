import { after } from "next/server";

/**
 * Schedule a normalization run for a recipe, post-response via Next's
 * `after()` so recipe writes return immediately and a Gemini/USDA outage can
 * never fail a save.
 *
 * Never throws. Outside a request scope (vitest, the backfill script) `after()`
 * itself throws synchronously — the catch runs the work as a detached promise
 * instead.
 *
 * The graph module is loaded DYNAMICALLY inside the callback: everything that
 * imports @/lib/recipes (every route + the MCP server graph, all cold-loaded
 * by the route-auth-policy gate test) must not pull @langchain/langgraph
 * statically.
 */
export function scheduleNormalization(recipeId: string): void {
  const run = async () => {
    const { runNormalization } = await import("./graph");
    await runNormalization(recipeId);
  };

  try {
    after(run);
  } catch {
    void run().catch((err) => {
      console.error(`Detached normalization run failed for ${recipeId}:`, err);
    });
  }
}
