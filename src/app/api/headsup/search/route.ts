import { NextResponse } from "next/server";
import { getIsLoggedIn } from "@/lib/auth";
import { callRecipeWebhook } from "@/lib/webhook";

export async function POST(req: Request) {
  const webhookUrl = process.env.HEADSUP_SEARCH_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "Search webhook not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }

  const isLoggedIn = await getIsLoggedIn();

  const result = await callRecipeWebhook({
    url: webhookUrl,
    payload: { prompt: body.prompt, ...(!isLoggedIn && { status: "published" }) },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ recipes: result.recipes });
}
