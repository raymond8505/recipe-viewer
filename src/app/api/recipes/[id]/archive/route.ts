import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function POST(
  _req: Request,
  { params }: RouteContext<"/api/recipes/[id]/archive">
) {
  const { id } = await params;
  const supabase = getSupabaseClient();

  const { data: recipe, error: fetchError } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError || !recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("recipes")
    .update({ status: "archived" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to archive" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
