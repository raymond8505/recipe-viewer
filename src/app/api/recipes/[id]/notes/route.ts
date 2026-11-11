import { NextResponse } from "next/server";
import { updateRecipeRow, RecipeRepoError } from "@/lib/recipes";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";

export const POST = requireSessionOrRecipeToken(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/notes">) => {
    const { id } = await params;

    const { cookingNotes } = (await req.json()) as { cookingNotes: string };

    try {
      // The wire keeps saying `cookingNotes` — cooking mode and the MCP tool
      // both speak it — and the column it lands in is `cooking_notes`. A blank
      // body is a CLEAR: emptying the notes box has to be able to empty the
      // column, which `undefined` ("leave it alone") could never do.
      await updateRecipeRow(id, { cookingNotes: cookingNotes || null });
    } catch (err) {
      if (err instanceof RecipeRepoError) {
        return err.kind === "not_found"
          ? NextResponse.json({ error: "Recipe not found" }, { status: 404 })
          : NextResponse.json({ error: "Failed to save" }, { status: 500 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true });
  },
);
