import { NextResponse } from "next/server";
import { callRecipeWebhook } from "@/lib/webhook";
import { env } from "@/env";
import { requireSession } from "@/lib/api/guard";

// Logged-in-only: proxies a paid LLM search webhook. See routePolicy.ts.
export const POST = requireSession(async (req: Request) => {
  const body = await req.json().catch(() => null);
  if (!body?.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }

  const result = await callRecipeWebhook({
    url: env.HEADSUP_SEARCH_WEBHOOK_URL,
    payload: { prompt: body.prompt },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ recipes: result.recipes });
});
