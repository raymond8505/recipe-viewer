import type { Metadata } from "next";
import { getIsLoggedIn } from "@/lib/auth";
import { canCurateNutrition } from "@/lib/devAccess";
import { getIngredients } from "@/lib/ingredients";
import IngredientsTable from "@/components/ingredients/IngredientsTable";

export const metadata: Metadata = {
  title: "Ingredients",
};

// Login-gated admin surface, except in local development where the whole
// nutrition layer is open (see src/lib/devAccess.ts). The data-plane routes
// under /api/ingredients enforce the same `session-or-dev` posture themselves
// (routePolicy), so this gate is UX, not the security boundary.
//
// `?q=` is a deep link into the catalog: the nutrition breakdown
// (NutritionDetailRow) links here per matched line so a bad catalog row can be
// fixed in this UI without re-typing the ingredient name. It filters the
// first page server-side and seeds the table's search box.
export default async function IngredientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!canCurateNutrition(await getIsLoggedIn())) {
    return (
      <section className="py-16 text-center">
        <h1 className="text-3xl mb-3">Ingredient Manager</h1>
        <p className="text-muted-foreground">
          Sign in to manage the ingredient catalog.
        </p>
      </section>
    );
  }

  const query = (await searchParams).q ?? "";
  const { data, count } = await getIngredients({ query: query || undefined });

  return (
    // Fills exactly what the shell leaves, so the table is the only thing that
    // scrolls — see the nutrition breakdown at /recipes/[id]/ingredients.
    <section className="flex min-h-0 flex-1 flex-col gap-6">
      <div>
        <h1 className="text-3xl">Ingredient Manager</h1>
        <p className="text-muted-foreground mt-1">
          The known-ingredient catalog behind recipe normalization — audit
          USDA-sourced rows and fill gaps by hand.
        </p>
      </div>
      <IngredientsTable
        className="flex min-h-0 flex-1 flex-col"
        initialIngredients={data}
        initialCount={count}
        initialQuery={query}
      />
    </section>
  );
}
