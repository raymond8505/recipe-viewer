import { TriangleAlert, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

export function WarningIcon({ className, ...props }: LucideProps) {
  return (
    <TriangleAlert size={16} className={cn("shrink-0 text-amber-500", className)} {...props} />
  );
}
