import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guard";
import { getIngredientsByIds, getRecipeIngredients } from "@/lib/ingredients";
import { RecipeRepoError, getRecipeById, updateRecipeRow } from "@/lib/recipes";
import { recipeLineTextPatchSchema } from "@/lib/schemas/ingredient";

// A recipe's normalized ingredient rows plus the catalog rows they point at,
// for the NutritionDetail screen. The page itself fetches repo-direct
// server-side; this route exists for client-side refresh (e.g. after a
// re-normalization run completes).
export const GET = requireSession(
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

// Edit one schema ingredient line's text in place (the NutritionDetail inline
// edit). This writes the RECIPE — updateRecipeRow merges the patched
// recipeIngredient array into metadata.schema, recomputes content/embedding,
// and auto-queues re-normalization because the ingredient-text fingerprint
// changed. Object lines keep their `group`; string lines stay strings.
export const PATCH = requireSession(
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

    const lines = [...(recipe.metadata.schema.recipeIngredient ?? [])];
    const { index, text } = parsed.data;
    if (index >= lines.length) {
      return NextResponse.json({ error: "No such line" }, { status: 400 });
    }
    const current = lines[index];
    lines[index] = typeof current === "string" ? text : { ...current, name: text };

    try {
      const saved = await updateRecipeRow(id, {
        schema: { recipeIngredient: lines },
      });
      return NextResponse.json({
        recipeIngredient: saved.metadata.schema.recipeIngredient ?? lines,
      });
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
