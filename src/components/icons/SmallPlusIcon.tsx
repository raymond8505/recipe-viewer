import { Plus, type LucideProps } from "lucide-react";

/** The compact add used by AddRowButton and AddTimerButton's compact variant. */
export function SmallPlusIcon(props: LucideProps) {
  return <Plus size={14} strokeWidth={2.5} {...props} />;
}
