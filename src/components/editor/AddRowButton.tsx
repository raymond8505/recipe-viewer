"use client";

import { SmallPlusIcon } from "@/components/icons";

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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 w-full min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50 transition-colors"
    >
      <SmallPlusIcon />
      {label}
    </button>
  );
}
