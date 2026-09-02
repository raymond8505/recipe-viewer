import { X, type LucideProps } from "lucide-react";

/** The 12px close used on cooking-mode meal tabs, where the tap target is the label itself. */
export function CloseSmallIcon(props: LucideProps) {
  return <X size={12} strokeWidth={2.5} {...props} />;
}
