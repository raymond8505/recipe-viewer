import { NextResponse } from "next/server";
import { getRecipeById } from "@/lib/recipes";
import { env } from "@/env";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";
import { composeRecipeSchema } from "@/lib/recipeSchema";

export const POST = requireSessionOrRecipeToken(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/regenerate-image">) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    // The webhook (n8n "Generate Recipe Image") puts the whole schema into the
    // image prompt and asks the model to read the recipe and draw its
    // ingredients, so it needs the composed recipe: since db/migrations/0016
    // `metadata.schema` carries no lines or steps — or, on a backfilled row, a
    // frozen pre-migration copy — and sending it illustrated a stale recipe.
    let webhookRes: Response;
    try {
      webhookRes = await fetch(env.REGEN_IMAGE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: composeRecipeSchema(recipe) }),
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
