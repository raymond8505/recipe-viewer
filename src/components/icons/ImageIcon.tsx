import { Image as ImageGlyph, type LucideProps } from "lucide-react";

/**
 * The recipe-card image fallback. Sized for a placeholder rather than a control,
 * so it takes a lighter stroke than the rest of the set.
 */
export function ImageIcon(props: LucideProps) {
  return <ImageGlyph size={48} strokeWidth={1.5} {...props} />;
}
