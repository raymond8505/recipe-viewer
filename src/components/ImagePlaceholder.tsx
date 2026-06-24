import { ImageIcon } from "@/components/icons";

/** Square fallback shown in a recipe card when there is no (loadable) image. */
export function ImagePlaceholder() {
  return (
    <div className="flex items-center justify-center text-muted-foreground/40 w-full aspect-square bg-muted">
      <ImageIcon />
    </div>
  );
}
