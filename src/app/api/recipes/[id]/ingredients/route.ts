import { NextResponse } from "next/server";
import { requireSessionOrDev } from "@/lib/api/guard";
import { getIngredientsByIds, getRecipeIngredients } from "@/lib/ingredients";
import { getRecipeById } from "@/lib/recipes";

// A recipe's normalized ingredient rows plus the catalog rows they point at,
// for the NutritionDetail screen. The page itself fetches repo-direct
// server-side; this route exists for client-side refresh (e.g. after a
// re-normalization run completes).
export const GET = requireSessionOrDev(
  async (_req: Request, { params }: RouteContext<"/api/recipes/[id]/ingredients">) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const rows = await getRecipeIngredients(id);
    const ingredientIds = [
      ...new Set(rows.map((r) => r.ingredient_id).filter((x): x is string => x != null)),
    ];
    const ingredients = await getIngredientsByIds(ingredientIds);

    return NextResponse.json({ rows, ingredients });
  },
);
