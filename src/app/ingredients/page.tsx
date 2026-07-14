import type { Metadata } from "next";
import { getIsLoggedIn } from "@/lib/auth";
import { getIngredients } from "@/lib/ingredients";
import IngredientsTable from "@/components/ingredients/IngredientsTable";

export const metadata: Metadata = {
  title: "Ingredients",
};

// Login-gated admin surface: the data-plane routes under /api/ingredients are
// session-only regardless (routePolicy), so this gate is UX, not the security
// boundary.
export default async function IngredientsPage() {
  const isLoggedIn = await getIsLoggedIn();

  if (!isLoggedIn) {
    return (
      <section className="py-16 text-center">
        <h1 className="text-3xl mb-3">Ingredient Manager</h1>
        <p className="text-muted-foreground">
          Sign in to manage the ingredient catalog.
        </p>
      </section>
    );
  }

  const { data, count } = await getIngredients();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl">Ingredient Manager</h1>
        <p className="text-muted-foreground mt-1">
          The known-ingredient catalog behind recipe normalization — audit
          USDA-sourced rows and fill gaps by hand.
        </p>
      </div>
      <IngredientsTable initialIngredients={data} initialCount={count} />
    </section>
  );
}
