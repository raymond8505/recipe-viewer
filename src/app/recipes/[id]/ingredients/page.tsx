import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRecipeById } from "@/lib/recipes";
import { getIsLoggedIn } from "@/lib/auth";
import { canCurateNutrition } from "@/lib/devAccess";
import NutritionDetail from "@/components/ingredients/NutritionDetail";

interface RecipeIngredientsPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: RecipeIngredientsPageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipeById(id);
  if (!recipe) return { title: "Recipe Not Found" };
  return { title: `${recipe.metadata.schema.name} — Nutrition Breakdown` };
}

// Login-gated curation surface for a recipe's normalized ingredient layer,
// except in local development where the whole nutrition layer is open (see
// src/lib/devAccess.ts). The data-plane routes enforce the same `session-or-dev`
// posture themselves (routePolicy), so this gate is UX, not the security
// boundary.
export default async function RecipeIngredientsPage({
  params,
}: RecipeIngredientsPageProps) {
  const { id } = await params;
  const [recipe, isLoggedIn] = await Promise.all([getRecipeById(id), getIsLoggedIn()]);

  if (!recipe) {
    notFound();
  }

  if (!canCurateNutrition(isLoggedIn)) {
    return (
      <section className="py-16 text-center">
        <h1 className="text-3xl mb-3">Nutrition Breakdown</h1>
        <p className="text-muted-foreground">
          Sign in to manage this recipe&apos;s normalized ingredients.
        </p>
      </section>
    );
  }

  const { schema } = recipe.metadata;

  return (
    // The screen is one viewport tall, so the table is the only thing that
    // scrolls: a page scrollbar beside the table's own leaves no way to tell
    // which one a wheel gesture will move. 7.5rem is the chrome around this
    // section in layout.tsx — the header's `h-14` plus `main`'s `py-8`; change
    // it there and this follows. The height is a cap, not a fixed size, so a
    // recipe short enough to fit keeps its natural height.
    <section className="flex max-h-[calc(100dvh-7.5rem)] flex-col gap-6">
      <div>
        <p className="text-sm">
          <Link href={`/recipes/${id}`} className="text-brand hover:underline">
            ← {schema.name}
          </Link>
        </p>
        <h1 className="text-3xl mt-1">Nutrition Breakdown</h1>
      </div>
      <NutritionDetail
        className="flex min-h-0 flex-1 flex-col"
        recipeId={id}
        ingredients={recipe.ingredients}
        recipeYield={schema.recipeYield}
      />
    </section>
  );
}
