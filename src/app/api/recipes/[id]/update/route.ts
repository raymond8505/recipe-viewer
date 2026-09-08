import { NextResponse } from "next/server";
import { getRecipeById, updateRecipeRow, RecipeRepoError } from "@/lib/recipes";
import type { RecipeIngredientGroupInput, SchemaRecipe } from "@/types/recipe";
import type { RecipeStatus } from "@/lib/recipes";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";
import { canonicalizeRecipeSource } from "@/lib/format";

export const POST = requireSessionOrRecipeToken(
  async (
    req: Request,
    { params }: RouteContext<"/api/recipes/[id]/update">,
  ) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      schema: SchemaRecipe;
      // The whole list; absent = leave the ingredients alone.
      ingredients?: RecipeIngredientGroupInput[];
      status: RecipeStatus;
      url?: string;
      source?: string;
    };
    const effectiveUrl = body.url ?? recipe.url;
    // A blank source degrades to "no change" rather than clearing the column —
    // isOwnRecipe and the browse filter both read it, and an empty string is
    // never a meaningful provenance. Mirrors how the editor treats an invalid
    // servings input: never blocks the save, just doesn't apply.
    //
    // Canonicalized on the way in so the stored own-recipe value is always the
    // lowercase literal: isOwnRecipe reads leniently, but the column also feeds
    // the ?source= browse filter and MCP search_recipes, which match exactly —
    // a stored "Custom" would silently split that bucket in two.
    const effectiveSource = canonicalizeRecipeSource(
      body.source?.trim() || recipe.source,
    );

    // recomputes the markdown `content` column and the search embedding from
    // the saved recipe.
    let saved;
    try {
      saved = await updateRecipeRow(id, {
        url: effectiveUrl,
        source: effectiveSource,
        schema: body.schema,
        ingredients: body.ingredients,
        status: body.status,
      });
    } catch (err) {
      if (err instanceof RecipeRepoError) {
        return err.kind === "not_found"
          ? NextResponse.json({ error: "Recipe not found" }, { status: 404 })
          : NextResponse.json({ error: "Failed to save" }, { status: 500 });
      }
      throw err;
    }

    // Every field the client's document holds is echoed back, so it can
    // re-seed from what was actually persisted rather than from its own draft
    // — the two differ whenever a value degrades (blank source), is
    // canonicalized server-side, gained a row id (a new ingredient), or was
    // parsed into a column (a time).
    return NextResponse.json({
      schema: saved.metadata.schema,
      ingredients: saved.ingredients,
      prep_time: saved.prep_time,
      cook_time: saved.cook_time,
      total_time: saved.total_time,
      status: saved.status,
      url: saved.url,
      source: saved.source,
    });
  },
);
