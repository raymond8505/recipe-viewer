import { NextResponse } from "next/server";
import { getRecipeById, updateRecipeRow, RecipeRepoError } from "@/lib/recipes";
import type { SchemaRecipe } from "@/types/recipe";
import type { RecipeStatus } from "@/lib/recipes";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";

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
      status: RecipeStatus;
      url?: string;
      source?: string;
    };
    const effectiveUrl = body.url ?? recipe.url;
    // A blank source degrades to "no change" rather than clearing the column —
    // isOwnRecipe and the browse filter both read it, and an empty string is
    // never a meaningful provenance. Mirrors how the editor treats an invalid
    // servings input: never blocks the save, just doesn't apply.
    const effectiveSource = body.source?.trim() || recipe.source;

    // recomputes the markdown `content` column and the search embedding from
    // the saved schema.
    let saved;
    try {
      saved = await updateRecipeRow(id, {
        url: effectiveUrl,
        source: effectiveSource,
        schema: body.schema,
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

    return NextResponse.json({
      schema: saved.metadata.schema,
      status: saved.status,
      source: saved.source,
    });
  },
);
