import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";

export const POST = requireSessionOrRecipeToken(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/notes">) => {
    const { id } = await params;

    const { cookingNotes } = (await req.json()) as { cookingNotes: string };

    const supabase = getSupabaseClient();

    const { data: recipe, error: fetchError } = await supabase
      .from("recipes")
      .select("id, metadata")
      .eq("id", id)
      .single();

    if (fetchError || !recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const updatedMetadata = {
      ...recipe.metadata,
      schema: {
        ...recipe.metadata.schema,
        cookingNotes: cookingNotes || undefined,
      },
    };

    const { error: updateError } = await supabase
      .from("recipes")
      .update({ metadata: updatedMetadata })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  },
);
