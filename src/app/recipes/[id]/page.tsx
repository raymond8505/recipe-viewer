import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRecipeById } from "@/lib/recipes";
import RecipeDetail from "@/components/RecipeDetail";

interface RecipePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: RecipePageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipeById(id);
  if (!recipe) return { title: "Recipe Not Found" };
  return { title: recipe.metadata.schema.name };
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { id } = await params;
  const recipe = await getRecipeById(id);

  if (!recipe) {
    notFound();
  }

  return <RecipeDetail recipe={recipe} />;
}
