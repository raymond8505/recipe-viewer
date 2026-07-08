"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SegmentButton } from "@/components/buttons";

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
        <SegmentButton
          active={!current}
          onClick={() => handleChange(undefined)}
          count={allCount}
        >
          All
        </SegmentButton>
        {ALL_STATUSES.map((status) => (
          <SegmentButton
            key={status}
            active={current === status}
            onClick={() => handleChange(status)}
            count={counts[status] ?? 0}
          >
            {STATUS_LABELS[status]}
          </SegmentButton>
        ))}
      </div>
    </div>
  );
}
