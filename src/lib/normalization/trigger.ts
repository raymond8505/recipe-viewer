import { after } from "next/server";

/**
 * Schedule a normalization run for a recipe, post-response via Next's
 * `after()` so recipe writes return immediately and a Gemini/USDA outage can
 * never fail a save.
 *
 * `rematchIds` names rows whose association the run may replace — the lines a
 * save reworded, whose stored match answers for wording the line has since
 * moved away from. Omitting it (the manual re-run endpoint, a create) leaves
 * the run filling gaps only.
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
export function scheduleNormalization(
  recipeId: string,
  rematchIds: readonly string[] = [],
): void {
  const run = async () => {
    const { runNormalization } = await import("./graph");
    await runNormalization(recipeId, rematchIds);
  };

  try {
    after(run);
  } catch {
    void run().catch((err) => {
      console.error(`Detached normalization run failed for ${recipeId}:`, err);
    });
  }
}
