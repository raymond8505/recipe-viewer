"use client";

import { SmallPlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface AddRowButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** "+ label" button for adding an item or group. ≥44px tall. */
export default function AddRowButton({
  label,
  onClick,
  disabled,
}: AddRowButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className="h-auto min-h-[44px] w-full justify-start gap-2 rounded-lg px-3 py-2 text-muted-foreground hover:bg-transparent hover:text-brand"
    >
      <SmallPlusIcon />
      {label}
    </Button>
  );
}
