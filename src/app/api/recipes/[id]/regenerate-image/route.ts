import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { env } from "@/env";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";

export const POST = requireSessionOrRecipeToken(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/regenerate-image">) => {
    const { id } = await params;

    const supabase = getSupabaseClient();

    const { data: recipe, error } = await supabase
      .from("recipes")
      .select("id, metadata")
      .eq("id", id)
      .single();

    if (error || !recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    let webhookRes: Response;
    try {
      webhookRes = await fetch(env.REGEN_IMAGE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: recipe.metadata.schema }),
      });
    } catch {
      return NextResponse.json({ error: "Webhook unreachable" }, { status: 502 });
    }

    if (!webhookRes.ok) {
      return NextResponse.json({ error: "Webhook failed" }, { status: 502 });
    }

    const body = await webhookRes.json();
    if (!body?.image || typeof body.image !== "string") {
      return NextResponse.json({ error: "Invalid webhook response" }, { status: 502 });
    }

    return NextResponse.json({ image: body.image });
  },
);
