import { NextResponse } from "next/server";
import { getRecipeById, updateRecipeRow, RecipeRepoError } from "@/lib/recipes";
import type { SchemaRecipe } from "@/types/recipe";
import type { RecipeStatus } from "@/lib/recipes";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";

export const POST = requireSessionOrRecipeToken(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/update">) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      schema: SchemaRecipe;
      status: RecipeStatus;
      url?: string;
    };
    const effectiveUrl = body.url ?? recipe.url;

    // Persist directly through the repo layer — no n8n round-trip. The repo
    // recomputes the markdown `content` column and the search embedding from
    // the saved schema.
    let saved;
    try {
      saved = await updateRecipeRow(id, {
        url: effectiveUrl,
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
    });
  },
);
