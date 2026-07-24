import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guard";
import { UsdaError, searchFoodsMixed } from "@/lib/usda";
import { usdaSearchQuerySchema } from "@/lib/schemas/ingredient";

// USDA candidate search for the NutritionDetail manual-import flow — the
// fallback when the catalog has no match. Server-side so USDA_API_KEY never
// reaches the browser. searchFoodsMixed queries the analytical and Branded
// pools separately and interleaves them, so the high-value Foundation/SR Legacy
// foods surface instead of being buried under exact-name Branded matches
// (automated normalization stays analytical-only).
export const GET = requireSession(async (req: Request) => {
  const url = new URL(req.url);
  const parsed = usdaSearchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const data = await searchFoodsMixed(parsed.data.q, { pageSize: 10 });
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UsdaError) {
      return NextResponse.json({ error: "USDA search unavailable" }, { status: 502 });
    }
    throw err;
  }
});
