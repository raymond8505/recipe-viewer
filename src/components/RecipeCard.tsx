"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { RecipeRow } from "@/types/recipe";
import { formatDuration, getFirstImage } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "@/components/ui/card";
import { ImagePlaceholder } from "@/components/ImagePlaceholder";
import { ClockIcon } from "@/components/icons";

interface RecipeCardProps {
  recipe: RecipeRow;
  /**
   * Badges overlaid on the image, top right. Which badges a card carries —
   * and what each of them says — is the caller's decision; the card only
   * finds them a place to sit. They pack towards the corner, so the LAST one
   * is the one in it: a status badge belongs at the end of this array.
   */
  topBadges?: ReactNode[];
  /** Badges in the footer, after the time. Same contract as `topBadges`. */
  badges?: ReactNode[];
}

export default function RecipeCard({
  recipe,
  topBadges,
  badges,
}: RecipeCardProps) {
  const {
    metadata: { schema },
    id,
  } = recipe;
  const image = getFirstImage(schema.image);
  const totalTime = formatDuration(schema.totalTime ?? schema.cookTime);
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
          {/* After the image in DOM order, which is what paints it on top —
              the overlay needs no z-index of its own. Right-aligned so a
              second badge grows leftwards, away from the corner. */}
          {topBadges?.length ? (
            <div className="absolute top-2 right-2 flex flex-wrap justify-end gap-1">
              {topBadges}
            </div>
          ) : null}
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

          {/* Wraps: time plus the caller's badges is three or more items at
              the ~320px width a card column renders at. */}
          <CardFooter className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground p-0 pt-2 border-t-0 bg-transparent">
            {totalTime && (
              <span className="flex items-center gap-1">
                <ClockIcon />
                {totalTime}
              </span>
            )}
            {badges}
          </CardFooter>
        </CardContent>
      </Card>
    </Link>
  );
}
