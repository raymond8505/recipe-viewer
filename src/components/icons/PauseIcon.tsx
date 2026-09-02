import { Pause, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** Filled to match {@link PlayIcon} — the two swap in place on the same control. */
export function PauseIcon({ className, ...props }: LucideProps) {
  return (
    <Pause
      size={14}
      fill="currentColor"
      className={cn("text-brand shrink-0", className)}
      {...props}
    />
  );
}
