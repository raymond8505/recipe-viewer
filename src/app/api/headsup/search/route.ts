import { NextResponse } from "next/server";
import { getIsLoggedIn } from "@/lib/auth";
import type { FlatRecipeRow } from "@/types/recipe";

export async function POST(req: Request) {
  const webhookUrl = process.env.HEADSUP_SEARCH_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Search webhook not configured" },
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

  const isLoggedIn = await getIsLoggedIn();

  let webhookRes: Response;
  try {
    webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: body.prompt,
        ...(!isLoggedIn && { status: "published" }),
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Search webhook unreachable" },
      { status: 502 },
    );
  }

  if (!webhookRes.ok) {
    return NextResponse.json(
      { error: "Search webhook failed" },
      { status: 502 },
    );
  }

  const data = await webhookRes.json().catch(() => null);

  if (
    !data?.recipes ||
    !Array.isArray(data.recipes) ||
    data.recipes.length < 2
  ) {
    return NextResponse.json(
      {
        error:
          data?.recipes?.length === 0 || data?.recipes?.length === 1
            ? "Not enough recipes found — try a broader search."
            : "Invalid response from search webhook",
      },
      { status: 502 },
    );
  }

  // Validate each recipe has required shape
  for (const r of data.recipes) {
    if (!r.id || !r.schema?.name) {
      return NextResponse.json(
        { error: "Invalid recipe data from search webhook" },
        { status: 502 },
      );
    }
  }

  const recipes = data.recipes.map(
    ({ schema, ...rest }: FlatRecipeRow) => ({
      ...rest,
      metadata: { schema },
    }),
  );

  return NextResponse.json({ recipes });
}
