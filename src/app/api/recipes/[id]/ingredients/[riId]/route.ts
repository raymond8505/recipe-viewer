import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guard";
import {
  IngredientRepoError,
  updateRecipeIngredientAssociation,
} from "@/lib/ingredients";
import { recipeIngredientPatchSchema } from "@/lib/schemas/ingredient";

// Manually re-point one parsed ingredient line at a catalog ingredient (or
// clear it with null). The repo update is scoped on riId AND the recipe id,
// so a valid session can't move another recipe's row through this URL.
export const PATCH = requireSession(
  async (
    req: Request,
    { params }: RouteContext<"/api/recipes/[id]/ingredients/[riId]">,
  ) => {
    const { id, riId } = await params;

    const body = await req.json().catch(() => null);
    const parsed = recipeIngredientPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid patch" }, { status: 400 });
    }

    try {
      const row = await updateRecipeIngredientAssociation(
        id,
        riId,
        parsed.data.ingredient_id,
      );
      return NextResponse.json(row);
    } catch (err) {
      if (err instanceof IngredientRepoError) {
        return err.kind === "not_found"
          ? NextResponse.json({ error: "Not found" }, { status: 404 })
          : NextResponse.json({ error: "Failed to update association" }, { status: 500 });
      }
      throw err;
    }
  },
);
