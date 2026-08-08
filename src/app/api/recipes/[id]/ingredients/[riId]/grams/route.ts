import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guard";
import {
  IngredientRepoError,
  getRecipeIngredientById,
  setRecipeIngredientGrams,
} from "@/lib/ingredients";
import { estimateLineGrams } from "@/lib/normalization/estimateGrams";
import { recipeIngredientGramsPatchSchema } from "@/lib/schemas/ingredient";

// Per-line gram estimate for the NutritionDetail nutrition manager. Both verbs
// are scoped on riId AND the recipe id in the repo, so a valid session can't
// touch another recipe's row through this URL. The estimate is internal — it
// never surfaces in the public recipe view or the Schema.org JSON-LD.

// POST — run the Gemini estimator for this line and store the result (grams_source
// "llm"). 422 when the model declines (best-effort, so the client can surface a
// "couldn't estimate" message rather than a hard error).
export const POST = requireSession(
  async (
    _req: Request,
    { params }: RouteContext<"/api/recipes/[id]/ingredients/[riId]/grams">,
  ) => {
    const { id, riId } = await params;

    const row = await getRecipeIngredientById(id, riId);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const grams = await estimateLineGrams({
      rawText: row.raw_text,
      name: row.name_text,
      quantity: row.quantity,
      unit: row.unit,
    });
    if (grams == null) {
      return NextResponse.json(
        { error: "Could not estimate grams for this line" },
        { status: 422 },
      );
    }

    try {
      const updated = await setRecipeIngredientGrams(id, riId, grams, "llm");
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof IngredientRepoError) {
        return err.kind === "not_found"
          ? NextResponse.json({ error: "Not found" }, { status: 404 })
          : NextResponse.json({ error: "Failed to set grams" }, { status: 500 });
      }
      throw err;
    }
  },
);

// PATCH — set a user-typed gram value (grams_source "manual"), or clear it with
// null so the line reverts to the density-derived value.
export const PATCH = requireSession(
  async (
    req: Request,
    { params }: RouteContext<"/api/recipes/[id]/ingredients/[riId]/grams">,
  ) => {
    const { id, riId } = await params;

    const body = await req.json().catch(() => null);
    const parsed = recipeIngredientGramsPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid patch" }, { status: 400 });
    }

    try {
      const updated = await setRecipeIngredientGrams(
        id,
        riId,
        parsed.data.grams,
        parsed.data.grams == null ? null : "manual",
      );
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof IngredientRepoError) {
        return err.kind === "not_found"
          ? NextResponse.json({ error: "Not found" }, { status: 404 })
          : NextResponse.json({ error: "Failed to set grams" }, { status: 500 });
      }
      throw err;
    }
  },
);
