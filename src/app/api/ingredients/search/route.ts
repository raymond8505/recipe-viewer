import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guard";
import { IngredientRepoError, searchIngredientsKeyword } from "@/lib/ingredients";
import { ingredientKeywordSearchQuerySchema } from "@/lib/schemas/ingredient";

// Keyword-only trigram autocomplete for the NutritionDetail screen. No
// embedding call — cheap enough for per-keystroke (debounced) use.
export const GET = requireSession(async (req: Request) => {
  const url = new URL(req.url);
  const parsed = ingredientKeywordSearchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const data = await searchIngredientsKeyword(parsed.data.q, parsed.data.limit);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof IngredientRepoError && err.kind === "match_failed") {
      // A broken RPC must read as "search unavailable", never as an empty
      // result list — the autocomplete shows an error instead of "No matches".
      return NextResponse.json({ error: "Ingredient search unavailable" }, { status: 500 });
    }
    throw err;
  }
});
