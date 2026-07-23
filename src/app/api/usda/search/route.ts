import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guard";
import { UsdaError, searchFoods } from "@/lib/usda";
import { usdaSearchQuerySchema } from "@/lib/schemas/ingredient";

// USDA candidate search for the NutritionDetail manual-import flow — the
// fallback when the catalog has no match. Server-side so USDA_API_KEY never
// reaches the browser. Branded is included here (human in the loop picks),
// unlike automated normalization which stays analytical-only.
export const GET = requireSession(async (req: Request) => {
  const url = new URL(req.url);
  const parsed = usdaSearchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const data = await searchFoods(parsed.data.q, {
      includeBranded: true,
      pageSize: 8,
    });
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UsdaError) {
      return NextResponse.json({ error: "USDA search unavailable" }, { status: 502 });
    }
    throw err;
  }
});
