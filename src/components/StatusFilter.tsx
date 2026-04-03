"use client";

import { useRouter, useSearchParams } from "next/navigation";

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

const ALL_STATUSES = ["published", "draft", "archived"] as const;

interface StatusFilterProps {
  counts: Record<string, number>;
  current: string | undefined;
}

export default function StatusFilter({ counts, current }: StatusFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("status", value);
    } else {
      params.delete("status");
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  };

  // Sum everything except archived — includes null-status recipes (stored under "__null")
  const allCount = Object.entries(counts)
    .filter(([k]) => k !== "archived")
    .reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 shrink-0">Status</span>
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => handleChange(undefined)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !current
              ? "bg-orange-500 text-white"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          All ({allCount})
        </button>
        {ALL_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => handleChange(status)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              current === status
                ? "bg-orange-500 text-white"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {STATUS_LABELS[status]} ({counts[status] ?? 0})
          </button>
        ))}
      </div>
    </div>
  );
}
