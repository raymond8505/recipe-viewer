import { NextResponse } from "next/server";
import { getRecipeById } from "@/lib/recipes";
import { setRecipeNormalization } from "@/lib/ingredients";
import { scheduleNormalization } from "@/lib/normalization/trigger";
import { requireSessionOrRecipeTokenOrDev } from "@/lib/api/guard";

// Manual re-run of ingredient normalization — the recovery path when a run
// failed (USDA/Gemini outage) or thresholds were tuned. The write paths
// trigger normalization automatically on ingredient changes; this endpoint
// re-runs it for the CURRENT schema.
export const POST = requireSessionOrRecipeTokenOrDev(
  async (
    _req: Request,
    { params }: RouteContext<"/api/recipes/[id]/normalize">,
  ) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    // "pending" gives the UI immediate feedback; the run flips it to
    // "running" → "completed"/"failed" post-response.
    await setRecipeNormalization(id, { status: "pending", error: null });
    scheduleNormalization(id);

    return NextResponse.json({ status: "queued" });
  },
);
