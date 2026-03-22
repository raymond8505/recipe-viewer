"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface SourceFilterProps {
  sources: string[];
  current: string | undefined;
}

export default function SourceFilter({ sources, current }: SourceFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("source", value);
    } else {
      params.delete("source");
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 shrink-0">Source</span>
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => handleChange(undefined)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !current
              ? "bg-orange-500 text-white"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          All
        </button>
        {sources.map((source) => (
          <button
            key={source}
            onClick={() => handleChange(source)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              current === source
                ? "bg-orange-500 text-white"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {source}
          </button>
        ))}
      </div>
    </div>
  );
}
