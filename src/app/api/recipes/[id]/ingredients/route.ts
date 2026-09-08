import { NextResponse } from "next/server";
import { requireSessionOrDev } from "@/lib/api/guard";
import { RecipeRepoError, getRecipeById, updateRecipeRow } from "@/lib/recipes";
import { flattenIngredients, toIngredientInput } from "@/lib/recipeIngredients";
import { recipeLineTextPatchSchema } from "@/lib/schemas/ingredient";

// A recipe's ingredient groups — every line with its catalog ingredient — for
// the NutritionDetail screen. The page itself reads repo-direct server-side;
// this route exists for client-side refresh (e.g. after a re-normalization run
// completes).
export const GET = requireSessionOrDev(
  async (_req: Request, { params }: RouteContext<"/api/recipes/[id]/ingredients">) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    return NextResponse.json({ ingredients: recipe.ingredients });
  },
);

// Edit one ingredient's text in place (the NutritionDetail inline edit). This
// writes the RECIPE — updateRecipeRow re-parses the row deterministically and
// recomputes content/embedding — and the line is addressed by its row id, so
// its group, its position and its catalog match are all untouched.
//
// Rewording does NOT re-normalize: the row keeps its association and the new
// parse lands in-band, so the groups that come back are already current.
export const PATCH = requireSessionOrDev(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/ingredients">) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = recipeLineTextPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid patch" }, { status: 400 });
    }

    const { id: lineId, text } = parsed.data;
    if (!flattenIngredients(recipe.ingredients).some((line) => line.id === lineId)) {
      return NextResponse.json({ error: "No such line" }, { status: 400 });
    }
    const ingredients = toIngredientInput(recipe.ingredients).map((group) => ({
      ...group,
      ingredients: group.ingredients.map((line) =>
        line.id === lineId ? { ...line, raw_text: text } : line,
      ),
    }));

    try {
      const saved = await updateRecipeRow(id, { ingredients });
      return NextResponse.json({ ingredients: saved.ingredients });
    } catch (err) {
      if (err instanceof RecipeRepoError) {
        return err.kind === "not_found"
          ? NextResponse.json({ error: "Recipe not found" }, { status: 404 })
          : NextResponse.json({ error: "Failed to save" }, { status: 500 });
      }
      throw err;
    }
  },
);
