"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SegmentButton } from "@/components/buttons";
import { defaultSortFor, isSortAvailable, SORT_OPTIONS } from "@/lib/format";
import type { SortOption } from "@/types/recipe";

const SORT_LABELS: Record<SortOption, string> = {
  relevance:   "Relevance",
  newest:      "Newest",
  oldest:      "Oldest",
  "name-asc":  "Name A–Z",
  "name-desc": "Name Z–A",
};

interface SortBarProps {
  current: SortOption;
}

export default function SortBar({ current }: SortBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const query = searchParams.get("q");
  // Relevance ranks a match by how much of the recipe it is, so it has nothing
  // to rank without a query and is not offered then.
  const options = SORT_OPTIONS.filter((value) => isSortAvailable(value, query));

  const handleChange = (value: SortOption) => {
    const params = new URLSearchParams(searchParams.toString());
    // The default needs no parameter — and which sort IS the default depends on
    // whether this is a search, so both halves read it from one function.
    if (value === defaultSortFor(query)) {
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
        {options.map((value) => (
          <SegmentButton
            key={value}
            active={current === value}
            onClick={() => handleChange(value)}
          >
            {SORT_LABELS[value]}
          </SegmentButton>
        ))}
      </div>
    </div>
  );
}
