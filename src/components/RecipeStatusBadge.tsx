import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RecipeRow } from "@/types/recipe";

// Per-status pill colors. These are semantic status indicators (not part of
// the neutral/brand theme), so they stay as explicit color classes.
const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-amber-100 text-amber-700",
  archived: "bg-gray-100 text-gray-500",
};

interface RecipeStatusBadgeProps {
  /** Recipe status; `null` is normalized to "draft". */
  status: RecipeRow["status"];
  /** Extra classes for the caller (e.g. absolute positioning). */
  className?: string;
}

/**
 * Purpose-built status pill wrapping shadcn `Badge` — owns status
 * normalization (`null` → "draft") and the per-status colors.
 */
export function RecipeStatusBadge({ status, className }: RecipeStatusBadgeProps) {
  const normalized = status ?? "draft";
  return (
    <Badge
      className={cn(
        "rounded-full capitalize",
        STATUS_STYLES[normalized] ?? "bg-gray-100 text-gray-500",
        className,
      )}
    >
      {normalized}
    </Badge>
  );
}
