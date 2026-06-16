import { NextResponse } from "next/server";
import { archiveRecipe, RecipeRepoError } from "@/lib/recipes";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";

export const POST = requireSessionOrRecipeToken(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/archive">) => {
    const { id } = await params;

    try {
      await archiveRecipe(id);
    } catch (err) {
      if (err instanceof RecipeRepoError) {
        return err.kind === "not_found"
          ? NextResponse.json({ error: "Recipe not found" }, { status: 404 })
          : NextResponse.json({ error: "Failed to archive" }, { status: 500 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true });
  },
);
