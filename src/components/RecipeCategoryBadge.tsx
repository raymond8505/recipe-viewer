import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RecipeCategoryBadgeProps {
  /** Category label, e.g. "Dessert". */
  category: string;
  /** Extra classes for the caller. */
  className?: string;
}

/**
 * Purpose-built category pill wrapping shadcn `Badge` — carries the brand
 * accent colors. (Badge's base already supplies the padding/size/weight.)
 */
export function RecipeCategoryBadge({ category, className }: RecipeCategoryBadgeProps) {
  return (
    <Badge className={cn("rounded-full bg-brand-subtle text-brand", className)}>
      {category}
    </Badge>
  );
}
