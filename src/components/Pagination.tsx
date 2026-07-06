"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
}

export default function Pagination({ page, total, pageSize }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex items-center justify-center gap-2 py-8">
      <Button
        variant="outline"
        onClick={() => goToPage(page - 1)}
        disabled={page <= 1}
        className="disabled:opacity-40"
      >
        Previous
      </Button>

      <span className="text-sm text-gray-500">
        Page {page} of {totalPages}
      </span>

      <Button
        variant="outline"
        onClick={() => goToPage(page + 1)}
        disabled={page >= totalPages}
        className="disabled:opacity-40"
      >
        Next
      </Button>
    </div>
  );
}
