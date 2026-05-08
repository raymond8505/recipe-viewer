import { NextResponse } from "next/server";
import { getIsLoggedIn } from "@/lib/auth";
import type { FlatRecipeRow } from "@/types/recipe";

export async function POST(req: Request) {
  const webhookUrl = process.env.WHATS_FOR_DINNER_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.prompt || typeof body.prompt !== "string") {
    return NextResponse.json(
      { error: "A prompt is required" },
      { status: 400 },
    );
  }

  const choices: FlatRecipeRow[] = Array.isArray(body.choices) ? body.choices : [];
  const isLoggedIn = await getIsLoggedIn();

  let webhookRes: Response;
  try {
    webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: body.prompt,
        choices,
        ...(!isLoggedIn && { status: "published" }),
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Webhook unreachable" },
      { status: 502 },
    );
  }

  // Read once as text so we can include raw body in any error response.
  const rawText = await webhookRes.text().catch(() => "");

  if (!webhookRes.ok) {
    return NextResponse.json(
      { error: "Webhook request failed", webhookResponse: rawText },
      { status: 502 },
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    return NextResponse.json(
      { error: "Webhook returned invalid JSON", webhookResponse: rawText },
      { status: 502 },
    );
  }

  // Response shape: { recipes: FlatRecipeRow[] } — also tolerates [{ recipes }] wrapping.
  const entry = Array.isArray(data) ? (data as unknown[])[0] : data;
  const rawRecipes: FlatRecipeRow[] | undefined = (
    entry as Record<string, unknown>
  )?.recipes as FlatRecipeRow[] | undefined;

  if (!Array.isArray(rawRecipes) || rawRecipes.length < 2) {
    return NextResponse.json(
      {
        error:
          Array.isArray(rawRecipes) && rawRecipes.length < 2
            ? "Not enough recipes found — try a broader search."
            : "Invalid response from webhook",
        webhookResponse: data,
      },
      { status: 502 },
    );
  }

  for (const r of rawRecipes) {
    if (!r.id || !r.schema?.name) {
      return NextResponse.json(
        { error: "Invalid recipe data from webhook", webhookResponse: data },
        { status: 502 },
      );
    }
  }

  // Transform FlatRecipeRow → RecipeRow for internal use.
  const recipes = rawRecipes.map(({ schema, ...rest }) => ({
    ...rest,
    metadata: { schema },
  }));

  return NextResponse.json({ recipes });
}
