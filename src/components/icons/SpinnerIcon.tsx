import { LoaderCircle, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * `animate-spin` is baked in because a static LoaderCircle is just a broken
 * circle — there is no non-spinning use of this icon. The class list merges, so
 * a caller adding its own spacing keeps the brand colour and the animation.
 */
export function SpinnerIcon({ size = 16, className, ...props }: LucideProps) {
  return (
    <LoaderCircle
      size={size}
      strokeWidth={2.5}
      className={cn("text-brand shrink-0 animate-spin", className)}
      {...props}
    />
  );
}
