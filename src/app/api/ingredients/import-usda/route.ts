import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guard";
import { importUsdaIngredient } from "@/lib/ingredientImport";
import { IngredientRepoError } from "@/lib/ingredients";
import { UsdaError } from "@/lib/usda";
import { usdaImportInputSchema } from "@/lib/schemas/ingredient";

// Mint a catalog ingredient from a user-picked USDA food (the NutritionDetail
// manual-import flow). `name` is the recipe-language canonical name; the USDA
// description becomes an alias. Shares importUsdaIngredient with automated
// normalization so the two paths produce identical rows.
export const POST = requireSession(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = usdaImportInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import" }, { status: 400 });
  }

  try {
    const row = await importUsdaIngredient(parsed.data.name, parsed.data.fdcId);
    if (!row) {
      // Embedding generation failed — the column is NOT NULL, so no row can
      // exist without one. Transient; the client can retry.
      return NextResponse.json(
        { error: "Could not generate an embedding for this ingredient — try again shortly." },
        { status: 503 },
      );
    }
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof UsdaError) {
      return NextResponse.json({ error: "USDA is unavailable" }, { status: 502 });
    }
    if (err instanceof IngredientRepoError) {
      return NextResponse.json({ error: "Failed to import ingredient" }, { status: 500 });
    }
    throw err;
  }
});
