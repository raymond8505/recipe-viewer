import { NextResponse } from "next/server";
import { requireSessionOrDev } from "@/lib/api/guard";
import { importUsdaIngredient } from "@/lib/ingredientImport";
import { IngredientRepoError } from "@/lib/ingredients";
import { UsdaError } from "@/lib/usda";
import { usdaImportInputSchema } from "@/lib/schemas/ingredient";

// Resolve a user-picked USDA food to its catalog ingredient (the
// NutritionDetail manual-import flow). `name` is the recipe line's parsed name
// and becomes an alias; the row's canonical name is the USDA description.
// Shares importUsdaIngredient with automated normalization so the two paths
// can't diverge.
//
// Idempotent on fdcId: picking a food that's already cataloged returns the
// existing row rather than minting a rival for the same USDA record. The
// caller then re-points the line at it, which is where the alias accretes.
export const POST = requireSessionOrDev(async (req: Request) => {
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
      // The generic client message hides which upstream failure this was —
      // keep the real status/detail in the server log or it's undiagnosable.
      console.error(
        `import-usda: UsdaError (status ${err.status ?? "network"}): ${err.message}`,
      );
      if (err.status === 404) {
        // USDA rejected the id itself (e.g. search advertises a record the
        // detail endpoint no longer serves) — not an availability problem.
        return NextResponse.json(
          { error: "USDA has no record for this food" },
          { status: 404 },
        );
      }
      return NextResponse.json({ error: "USDA is unavailable" }, { status: 502 });
    }
    if (err instanceof IngredientRepoError) {
      return NextResponse.json({ error: "Failed to import ingredient" }, { status: 500 });
    }
    throw err;
  }
});
