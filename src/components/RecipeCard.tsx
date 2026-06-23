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

interface RecipeCardProps {
  recipe: RecipeRow;
  showStatusBadge?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-amber-100 text-amber-700",
  archived: "bg-gray-100 text-gray-500",
};

function ImagePlaceholder() {
  return (
    <div className="flex items-center justify-center text-muted-foreground/40 w-full aspect-square bg-muted">
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

export default function RecipeCard({ recipe, showStatusBadge }: RecipeCardProps) {
  const { metadata: { schema }, id } = recipe;
  const image = getFirstImage(schema.image);
  const totalTime = formatDuration(schema.totalTime ?? schema.cookTime);
  const categories = toArray(schema.recipeCategory);
  const [imgError, setImgError] = useState(false);
  const status = recipe.status ?? "draft";

  return (
    <Link href={`/recipes/${id}`} className="group block h-full">
      <Card className="h-full gap-0 py-0 rounded-2xl border border-border ring-0 bg-card hover:shadow-lg transition-shadow duration-200">
        <div className="relative w-full">
          {showStatusBadge && (
            <span
              className={`absolute top-2 right-2 z-10 px-2 py-0.5 text-xs font-medium rounded-full capitalize ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-500"}`}
            >
              {status}
            </span>
          )}
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
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {totalTime}
              </span>
            )}
            {categories[0] && (
              <span className="px-2 py-0.5 bg-brand-subtle text-brand rounded-full font-medium">
                {categories[0]}
              </span>
            )}
          </CardFooter>
        </CardContent>
      </Card>
    </Link>
  );
}
