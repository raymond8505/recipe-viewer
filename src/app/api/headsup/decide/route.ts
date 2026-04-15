import { NextResponse } from "next/server";

interface RoundOption {
  id: string;
  label: string;
}

interface CompletedRound {
  label: string;
  options: RoundOption[];
  winnerId: string;
  loserIds: string[];
}

interface DecideRequestBody {
  prompt: string;
  allIds: string[];
  rounds: CompletedRound[];
}

export async function POST(req: Request) {
  const webhookUrl = process.env.HEADSUP_DECIDE_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Decide webhook not configured" },
      { status: 503 },
    );
  }

  const body: DecideRequestBody | null = await req.json().catch(() => null);
  if (
    !body?.prompt ||
    !Array.isArray(body.allIds) ||
    !Array.isArray(body.rounds)
  ) {
    return NextResponse.json(
      { error: "Invalid request — prompt, allIds, and rounds are required" },
      { status: 400 },
    );
  }

  let webhookRes: Response;
  try {
    webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: body.prompt,
        allIds: body.allIds,
        rounds: body.rounds,
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Decide webhook unreachable" },
      { status: 502 },
    );
  }

  if (!webhookRes.ok) {
    return NextResponse.json(
      { error: "Decide webhook failed" },
      { status: 502 },
    );
  }

  const data = await webhookRes.json().catch(() => null);
  if (!data || typeof data.done !== "boolean") {
    return NextResponse.json(
      { error: "Invalid response from decide webhook" },
      { status: 502 },
    );
  }

  if (data.done) {
    if (!data.winnerId || typeof data.winnerId !== "string") {
      return NextResponse.json(
        { error: "Winner declared but no winnerId provided" },
        { status: 502 },
      );
    }
    return NextResponse.json({ done: true, winnerId: data.winnerId });
  }

  // Validate next round shape
  if (
    !data.round?.label ||
    !Array.isArray(data.round?.options) ||
    data.round.options.length < 2
  ) {
    return NextResponse.json(
      { error: "Invalid round data from decide webhook" },
      { status: 502 },
    );
  }

  for (const opt of data.round.options) {
    if (!opt.id || !opt.label) {
      return NextResponse.json(
        { error: "Round options must have id and label" },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    done: false,
    round: {
      label: data.round.label,
      options: data.round.options,
    },
  });
}
