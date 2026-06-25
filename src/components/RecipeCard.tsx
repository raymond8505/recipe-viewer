"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { RecipeRow } from "@/types/recipe";
import { formatDuration, getFirstImage, toArray } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "@/components/ui/card";
import { RecipeStatusBadge } from "@/components/RecipeStatusBadge";
import { RecipeCategoryBadge } from "@/components/RecipeCategoryBadge";
import { ImagePlaceholder } from "@/components/ImagePlaceholder";
import { ClockIcon } from "@/components/icons";

interface RecipeCardProps {
  recipe: RecipeRow;
  showStatusBadge?: boolean;
}

export default function RecipeCard({
  recipe,
  showStatusBadge,
}: RecipeCardProps) {
  const {
    metadata: { schema },
    id,
  } = recipe;
  const image = getFirstImage(schema.image);
  const totalTime = formatDuration(schema.totalTime ?? schema.cookTime);
  const categories = toArray(schema.recipeCategory);
  const [imgError, setImgError] = useState(false);

  return (
    <Link href={`/recipes/${id}`} className="group block h-full">
      <Card className="h-full gap-0 py-0 rounded-2xl border border-border ring-0 bg-card hover:shadow-lg transition-shadow duration-200">
        <div className="relative w-full">
          {image && !imgError ? (
            <div className="relative w-full aspect-square overflow-hidden bg-muted">
              <Image
                src={image}
                alt={schema.name}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover group-hover:scale-105 transition-transform duration-200"
                onError={() => setImgError(true)}
              />
            </div>
          ) : (
            <ImagePlaceholder />
          )}
          {showStatusBadge && (
            <RecipeStatusBadge
              status={recipe.status}
              className="absolute top-2 right-2"
            />
          )}
        </div>

        <CardContent className="flex flex-col flex-1 p-4 gap-2">
          <CardTitle className="font-semibold text-card-foreground leading-snug line-clamp-2 group-hover:text-brand transition-colors">
            {schema.name}
          </CardTitle>

          {schema.description && (
            <CardDescription className="text-sm text-muted-foreground line-clamp-2">
              {schema.description}
            </CardDescription>
          )}

          <CardFooter className="mt-auto flex items-center gap-3 text-xs text-muted-foreground p-0 pt-2 border-t-0 bg-transparent">
            {totalTime && (
              <span className="flex items-center gap-1">
                <ClockIcon />
                {totalTime}
              </span>
            )}
            {categories[0] && <RecipeCategoryBadge category={categories[0]} />}
          </CardFooter>
        </CardContent>
      </Card>
    </Link>
  );
}
