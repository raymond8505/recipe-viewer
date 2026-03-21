"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { SortOption } from "@/lib/recipes";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest",    label: "Newest" },
  { value: "oldest",    label: "Oldest" },
  { value: "name-asc",  label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
];

interface SortBarProps {
  current: SortOption;
}

export default function SortBar({ current }: SortBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (value: SortOption) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "newest") {
      params.delete("sort");
    } else {
      params.set("sort", value);
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 shrink-0">Sort by</span>
      <div className="flex gap-1 flex-wrap">
        {SORT_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleChange(value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              current === value
                ? "bg-orange-500 text-white"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
