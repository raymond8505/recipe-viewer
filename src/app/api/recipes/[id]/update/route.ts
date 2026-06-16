import { NextResponse } from "next/server";
import { getRecipeById, updateRecipeRow, RecipeRepoError, type RecipeStatus } from "@/lib/recipes";
import type { SchemaRecipe } from "@/types/recipe";
import { env } from "@/env";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";

export const POST = requireSessionOrRecipeToken(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/update">) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const body = (await req.json()) as { schema: SchemaRecipe; status: string; url?: string };
    const effectiveUrl = body.url ?? recipe.url;

    let webhookRes: Response;
    try {
      webhookRes = await fetch(env.EDIT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: effectiveUrl, schema: body.schema, status: body.status }),
      });
    } catch {
      return NextResponse.json({ error: "Webhook unreachable" }, { status: 502 });
    }

    if (!webhookRes.ok) {
      return NextResponse.json({ error: "Webhook failed" }, { status: 502 });
    }

    const result = (await webhookRes.json()) as { schema: SchemaRecipe; status: RecipeStatus };

    try {
      await updateRecipeRow(id, {
        url: effectiveUrl,
        schema: result.schema,
        status: result.status,
      });
    } catch (err) {
      if (err instanceof RecipeRepoError) {
        return err.kind === "not_found"
          ? NextResponse.json({ error: "Recipe not found" }, { status: 404 })
          : NextResponse.json({ error: "Failed to save" }, { status: 500 });
      }
      throw err;
    }

    return NextResponse.json({ schema: result.schema, status: result.status });
  },
);
