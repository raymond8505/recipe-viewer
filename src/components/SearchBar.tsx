"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  defaultValue?: string;
}

export default function SearchBar({ defaultValue }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [inputValue, setInputValue] = useState(defaultValue ?? "");

  useEffect(() => {
    setInputValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams(searchParams.toString());
      if (inputValue) {
        params.set("q", inputValue);
      } else {
        params.delete("q");
      }
      params.delete("page");

      startTransition(() => {
        router.push(`/?${params.toString()}`);
      });
    },
    [router, searchParams, inputValue]
  );

  return (
    <form onSubmit={handleSubmit} className="relative">
      <button
        type="submit"
        aria-label="Search"
        className="absolute inset-y-0 left-0 pl-4 flex items-center"
      >
        <SearchIcon
          className={cn("w-5 h-5", isPending && "text-brand animate-pulse")}
        />
      </button>
      <input
        type="search"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Search recipes…"
        className="w-full pl-12 pr-4 py-3 rounded-none border-0 border-b border-gray-200 bg-card text-gray-900 placeholder-gray-400 focus:outline-hidden focus:border-brand transition"
      />
    </form>
  );
}
