import { NextResponse } from "next/server";
import { getRecipeById } from "@/lib/recipes";
import { env } from "@/env";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";

export const POST = requireSessionOrRecipeToken(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/rescrape">) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    let webhookRes: Response;
    try {
      webhookRes = await fetch(env.RESCRAPE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: recipe.url }),
      });
    } catch {
      return NextResponse.json({ error: "Webhook unreachable" }, { status: 502 });
    }

    if (!webhookRes.ok) {
      return NextResponse.json({ error: "Webhook failed" }, { status: 502 });
    }

    const body = await webhookRes.json();
    const updatedSchema = body?.schema;
    if (!updatedSchema || typeof updatedSchema !== "object" || !updatedSchema.name) {
      return NextResponse.json({ error: "Invalid webhook response" }, { status: 502 });
    }

    return NextResponse.json({ schema: updatedSchema });
  },
);
