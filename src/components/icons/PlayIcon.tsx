import { Play, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Filled rather than lucide's default outline: at 14px inside a timer's
 * play/pause control the outline reads as a hollow smudge. `dimmed` is the
 * finished-timer state, where the control is still present but inert.
 */
export function PlayIcon({ dimmed, className, ...props }: LucideProps & { dimmed?: boolean }) {
  return (
    <Play
      size={14}
      fill="currentColor"
      className={cn("shrink-0", dimmed ? "text-gray-300" : "text-brand", className)}
      {...props}
    />
  );
}
