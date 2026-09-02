import { Check, type LucideProps } from "lucide-react";

export function CheckIcon({ size = 18, ...props }: LucideProps) {
  return <Check size={size} strokeWidth={3} {...props} />;
}
