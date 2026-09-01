import { Search, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The muted grey is the default because every search input in the app wants it,
 * but it merges rather than replaces — SearchBar overrides it to `text-brand`
 * while a query is in flight.
 */
export function SearchIcon({ className, ...props }: LucideProps) {
  return <Search size={16} className={cn("text-gray-400 shrink-0", className)} {...props} />;
}
