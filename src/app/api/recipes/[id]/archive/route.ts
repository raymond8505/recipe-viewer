import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseClient();

  const { data: recipe, error: fetchError } = await supabase
    .from("recipes")
    .select("id, metadata")
    .eq("id", id)
    .single();

  if (fetchError || !recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const merged = { ...recipe.metadata, status: "archived" };

  const { error: updateError } = await supabase
    .from("recipes")
    .update({ metadata: merged })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to archive" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
